/* ============ Canvas 地图引擎（路网 / 路线 / 骑手实时动画） ============ */
(function () {
  'use strict';
  const City = window.City;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function create(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);

    const view = { cx: City.WORLD.w / 2, cy: City.WORLD.h / 2, scale: 0.3, follow: true, px: 0, py: 0 };
    let data = { rider: null, path: [], traveled: 0, markers: [], pathColor: '#ffd100' };
    let raf = null, t0 = performance.now();

    function resize() {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function sx(x) { return (x - view.cx) * view.scale + W / 2 + view.px; }
    function sy(y) { return (y - view.cy) * view.scale + H / 2 + view.py; }

    /** 自动取景：把所有关注点纳入视野 */
    function fit() {
      const pts = [];
      (data.markers || []).forEach((m) => pts.push({ x: m.x, y: m.y }));
      (data.path || []).forEach((p) => pts.push(p));
      if (data.rider) pts.push(data.rider);
      if (!pts.length) { view.cx = City.WORLD.w / 2; view.cy = City.WORLD.h / 2; view.scale = 0.3; return; }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach((p) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
      const bw = Math.max(240, x1 - x0), bh = Math.max(240, y1 - y0);
      const pad = 52;
      const s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
      view.scale = clamp(s, 0.04, 1.6);
      view.cx = (x0 + x1) / 2;
      view.cy = (y0 + y1) / 2;
      view.px = 0; view.py = 0;
    }

    /* ---------- 绘制 ---------- */
    function drawBase() {
      // 底色
      ctx.fillStyle = '#f3f0e9';
      ctx.fillRect(0, 0, W, H);

      // 街区建筑
      City.BLOCKS.forEach((b) => {
        const x = sx(b.x), y = sy(b.y), w = b.w * view.scale, h = b.h * view.scale;
        if (x > W || y > H || x + w < 0 || y + h < 0) return;
        if (b.kind === 'special') {
          const p = City.PARKS.find((pk) => pk.x0 < b.x && pk.y0 < b.y && pk.x1 > b.x && pk.y1 > b.y);
          ctx.fillStyle = p && p.type === 'water' ? '#c9e2f2' : '#cfe6c6';
        } else {
          const g = 226 + Math.round(b.tone * 12);
          ctx.fillStyle = 'rgb(' + g + ',' + (g - 4) + ',' + (g - 12) + ')';
        }
        ctx.fillRect(x, y, w, h);
        // 建筑内部小楼块，增加质感
        if (b.kind === 'normal' && view.scale > 0.22) {
          ctx.fillStyle = 'rgba(255,255,255,.5)';
          const cols = Math.max(1, Math.floor(b.w / 120));
          const rows = Math.max(1, Math.floor(b.h / 110));
          for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
              const r = City.srand(b.seed * 13 + i * 7 + j);
              if (r < 0.42) continue;
              const bx = b.x + 14 + i * (b.w - 28) / cols;
              const by = b.y + 12 + j * (b.h - 24) / rows;
              const bw = (b.w - 28) / cols - 10, bh = (b.h - 24) / rows - 10;
              ctx.fillRect(sx(bx), sy(by), bw * view.scale, bh * view.scale);
            }
          }
        }
      });

      // 道路
      const rw = clamp(view.scale * 26, 3.5, 15);
      ctx.lineCap = 'round';
      // 道路外描边
      ctx.strokeStyle = '#e3ded3';
      ctx.lineWidth = rw + 2.5;
      drawGrid();
      // 路面
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = rw;
      drawGrid();
      // 主干道中心虚线
      if (view.scale > 0.18) {
        ctx.strokeStyle = 'rgba(250,200,60,.5)';
        ctx.lineWidth = Math.max(1, rw * 0.1);
        ctx.setLineDash([rw * 1.4, rw * 2.2]);
        drawGrid();
        ctx.setLineDash([]);
      }
    }

    function drawGrid() {
      ctx.beginPath();
      City.AVENUES.forEach((x) => { ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(City.WORLD.h)); });
      City.STREETS.forEach((y) => { ctx.moveTo(sx(0), sy(y)); ctx.lineTo(sx(City.WORLD.w), sy(y)); });
      ctx.stroke();
    }

    function strokePath(pts, color, width, dashOffset) {
      if (!pts || pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(sx(pts[0].x), sy(pts[0].y));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i].x), sy(pts[i].y));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (dashOffset != null) {
        ctx.setLineDash([width * 1.7, width * 1.5]);
        ctx.lineDashOffset = -dashOffset;
      } else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawRoute(now) {
      const full = data.path || [];
      if (full.length < 2) return;
      const remain = City.remainingPath(full, data.traveled || 0);
      strokePath(full, 'rgba(150,160,175,.5)', clamp(view.scale * 16, 4, 11));
      strokePath(remain, data.pathColor || '#ffd100', clamp(view.scale * 14, 3.5, 10));
      // 流动虚线
      strokePath(remain, 'rgba(255,255,255,.85)', clamp(view.scale * 5, 1.6, 4), ((now - t0) / 22) % 1000);

      // 终点
      const end = full[full.length - 1];
      ctx.beginPath();
      ctx.arc(sx(end.x), sy(end.y), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = data.pathColor || '#ffd100'; ctx.stroke();
    }

    function pin(x, y, emoji, opts) {
      opts = opts || {};
      const px = sx(x), py = sy(y);
      const r = opts.r || 15;
      const color = opts.color || '#ffffff';
      // 阴影
      ctx.beginPath();
      ctx.ellipse(px, py + r * 0.92, r * 0.6, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fill();
      // 尖角
      ctx.beginPath();
      ctx.moveTo(px - 5, py + r * 0.78);
      ctx.lineTo(px + 5, py + r * 0.78);
      ctx.lineTo(px, py + r * 1.42);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      // 圆
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      if (opts.border) { ctx.lineWidth = 3; ctx.strokeStyle = opts.border; ctx.stroke(); }
      ctx.font = (r * 1.28) + 'px system-ui, "Segoe UI Emoji", "Apple Color Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(emoji, px, py + 1);

      if (opts.label) {
        ctx.font = '600 11px -apple-system, "PingFang SC", sans-serif';
        const w = ctx.measureText(opts.label).width + 12;
        const ly = py - r - 15;
        ctx.fillStyle = 'rgba(255,255,255,.96)';
        roundRect(px - w / 2, ly, w, 18, 9); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.fillText(opts.label, px, ly + 9.5);
      }
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawRider(now) {
      const r = data.rider;
      if (!r) return;
      const px = sx(r.x), py = sy(r.y);
      // 脉冲
      const pulse = (Math.sin((now - t0) / 320) + 1) / 2;
      ctx.beginPath();
      ctx.arc(px, py, 18 + pulse * 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,137,255,' + (0.16 - pulse * 0.1).toFixed(3) + ')';
      ctx.fill();
      // 朝向箭头
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(r.heading || 0);
      ctx.beginPath();
      ctx.moveTo(24, 0); ctx.lineTo(15, -6); ctx.lineTo(15, 6);
      ctx.closePath();
      ctx.fillStyle = '#0089ff'; ctx.fill();
      ctx.restore();
      pin(r.x, r.y, '🛵', { r: 16, color: '#fff', border: '#0089ff', label: null });
    }

    function drawMarkers() {
      (data.markers || []).forEach((m) => {
        pin(m.x, m.y, m.emoji || '📍', {
          r: m.big ? 16 : 14,
          color: m.color || '#fff',
          border: m.border || null,
          label: m.label
        });
      });
    }

    function drawScale() {
      // 比例尺：选一个接近 90px 的整数米数
      const target = [50, 100, 200, 300, 500, 800, 1000, 2000];
      let meters = target[0];
      for (const t of target) { meters = t; if (t * view.scale > 110) break; }
      const w = meters * view.scale;
      const x = 14, y = H - 16;
      ctx.strokeStyle = 'rgba(60,60,60,.65)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 5);
      ctx.stroke();
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(50,50,50,.8)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(meters >= 1000 ? (meters / 1000) + 'km' : meters + 'm', x + w + 6, y + 2);
    }

    function drawCompass() {
      const x = W - 24, y = 24;
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#e0433a';
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x - 4, y + 2); ctx.lineTo(x + 4, y + 2); ctx.closePath(); ctx.fill();
      ctx.font = '700 8px sans-serif'; ctx.fillStyle = '#888'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('N', x, y + 7);
    }

    function frame(now) {
      if (!W || !H) resize();
      ctx.clearRect(0, 0, W, H);
      drawBase();
      drawRoute(now);
      drawMarkers();
      drawRider(now);
      drawScale();
      drawCompass();
      raf = requestAnimationFrame(frame);
    }

    /* ---------- 手势 ---------- */
    let drag = null;
    function onDown(e) {
      const p = e.touches ? e.touches[0] : e;
      drag = { x: p.clientX, y: p.clientY, px: view.px, py: view.py };
    }
    function onMove(e) {
      if (!drag) return;
      const p = e.touches ? e.touches[0] : e;
      view.px = drag.px + (p.clientX - drag.x);
      view.py = drag.py + (p.clientY - drag.y);
      if (Math.abs(view.px) + Math.abs(view.py) > 6) view.follow = false;
      if (e.cancelable) e.preventDefault();
    }
    function onUp() { drag = null; }
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: true });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      view.scale = clamp(view.scale * k, 0.04, 2.4);
    }, { passive: false });

    window.addEventListener('resize', resize);
    resize();

    return {
      start() { if (!raf) raf = requestAnimationFrame(frame); },
      stop() { if (raf) cancelAnimationFrame(raf); raf = null; },
      setData(d) {
        data = Object.assign({ path: [], markers: [], traveled: 0 }, d);
        if (view.follow) fit();
      },
      refit() { view.follow = true; fit(); },
      zoom(k) { view.scale = clamp(view.scale * k, 0.04, 2.4); },
      view: view,
      resize
    };
  }

  window.MapView = { create };
})();
