/**
 * 虚拟城市路网 —— 前端渲染与后端路径规划共用同一套地理数据。
 * 坐标单位：米。世界尺寸 2600 x 1900。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.City = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WORLD = { w: 2600, h: 1900 };

  // 纵向主干道 / 横向街道（路网骨架）
  var AVENUES = [140, 420, 700, 980, 1260, 1540, 1820, 2100, 2380]; // 纵向道路 x
  var STREETS = [110, 360, 610, 860, 1110, 1360, 1610, 1790];       // 横向道路 y

  // 景观：公园 / 水域（占一个街区）
  var PARKS = [
    { x0: 420, y0: 610, x1: 700, y1: 860, type: 'park' },
    { x0: 1540, y0: 1110, x1: 1820, y1: 1360, type: 'park' },
    { x0: 980, y0: 1360, x1: 1260, y1: 1610, type: 'water' }
  ];

  // ---- 确定性伪随机（保证前后端建筑外观一致） ----
  function srand(seed) {
    var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ---- 生成街区建筑（用于地图底图绘制） ----
  function buildBlocks() {
    var blocks = [];
    var xs = [0].concat(AVENUES, [WORLD.w]);
    var ys = [0].concat(STREETS, [WORLD.h]);
    var i = 0;
    for (var a = 0; a < xs.length - 1; a++) {
      for (var b = 0; b < ys.length - 1; b++) {
        var bx0 = xs[a] + 26, bx1 = xs[a + 1] - 26;
        var by0 = ys[b] + 24, by1 = ys[b + 1] - 24;
        if (bx1 - bx0 < 30 || by1 - by0 < 30) continue;
        // 跳过公园/水域所在街区
        var isSpecial = PARKS.some(function (p) {
          return p.x0 === xs[a] && p.y0 === ys[b];
        });
        blocks.push({
          x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0,
          kind: isSpecial ? 'special' : 'normal',
          tone: srand(++i),
          seed: i
        });
      }
    }
    return blocks;
  }

  var BLOCKS = buildBlocks();

  function nearestAvenue(x) {
    var best = AVENUES[0], d = Infinity;
    for (var i = 0; i < AVENUES.length; i++) {
      var t = Math.abs(AVENUES[i] - x);
      if (t < d) { d = t; best = AVENUES[i]; }
    }
    return best;
  }
  function nearestStreet(y) {
    var best = STREETS[0], d = Infinity;
    for (var i = 0; i < STREETS.length; i++) {
      var t = Math.abs(STREETS[i] - y);
      if (t < d) { d = t; best = STREETS[i]; }
    }
    return best;
  }

  function pickBetween(list, a, b) {
    var lo = Math.min(a, b), hi = Math.max(a, b);
    var cand = list.filter(function (v) { return v > lo + 20 && v < hi - 20; });
    if (!cand.length) return null;
    return cand[Math.floor(srand(lo + hi) * cand.length)];
  }

  /**
   * 规划路径：起点/终点先接到最近路口，再沿路网（L 形或 Z 形）行驶，最后接到终点。
   * @returns {Array<{x:number,y:number}>} 路径点
   */
  function planRoute(from, to, seed) {
    var s = seed || (from.x + to.y) / 7;
    var ax = nearestAvenue(from.x), ay = nearestStreet(from.y);
    var bx = nearestAvenue(to.x), by = nearestStreet(to.y);
    var pts = [];
    pts.push({ x: from.x, y: from.y });
    pts.push({ x: ax, y: from.y });
    pts.push({ x: ax, y: ay });

    if (ay !== by && ax !== bx) {
      // Z 形：走一段纵向 -> 横向 -> 纵向
      var ym = pickBetween(STREETS, ay, by);
      if (ym != null) {
        pts.push({ x: ax, y: ym });
        pts.push({ x: bx, y: ym });
      } else {
        pts.push({ x: ax, y: by });
      }
    } else if (ay !== by) {
      pts.push({ x: ax, y: by });
    }
    if (bx !== ax) pts.push({ x: bx, y: by });

    pts.push({ x: bx, y: to.y });
    pts.push({ x: to.x, y: to.y });

    // 去重相邻点
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (i === 0 || Math.abs(p.x - pts[i - 1].x) > 0.5 || Math.abs(p.y - pts[i - 1].y) > 0.5) out.push(p);
    }
    return out;
  }

  function pathLength(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return L;
  }

  // 沿路径前进 distance 米，返回 {x,y,heading,done}
  function advanceAlong(pts, dist) {
    if (!pts || !pts.length) return null;
    var remain = dist, heading = 0;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      var seg = Math.hypot(b.x - a.x, b.y - a.y);
      heading = Math.atan2(b.y - a.y, b.x - a.x);
      if (remain <= seg) {
        var t = seg === 0 ? 0 : remain / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: heading, done: false, index: i };
      }
      remain -= seg;
    }
    var last = pts[pts.length - 1];
    return { x: last.x, y: last.y, heading: heading, done: true, index: pts.length - 1 };
  }

  // 已走过 dist 之后的剩余路径（用于绘制"剩余路线"）
  function remainingPath(pts, dist) {
    if (!pts || pts.length < 2) return pts || [];
    var remain = dist;
    var out = [];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      var seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (remain < seg) {
        var t = remain / seg;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        for (var j = i; j < pts.length; j++) out.push(pts[j]);
        return out;
      }
      remain -= seg;
      out = [];
      out.push(b);
    }
    var last = pts[pts.length - 1];
    return [last];
  }

  return {
    WORLD: WORLD, AVENUES: AVENUES, STREETS: STREETS,
    PARKS: PARKS, BLOCKS: BLOCKS,
    planRoute: planRoute, pathLength: pathLength,
    advanceAlong: advanceAlong, remainingPath: remainingPath,
    nearestAvenue: nearestAvenue, nearestStreet: nearestStreet,
    srand: srand
  };
});
