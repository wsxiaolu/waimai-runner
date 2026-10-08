/* ============ 骑手端（蜂鸟跑腿风格） ============ */
(function () {
  'use strict';
  const U = window.U, App = window.App, Nav = window.Nav, City = window.City;
  const { $, esc, money, hhmm, hhmmss, toast, delegate, distCN, durCN, agoCN } = U;

  let RIDER_ID = localStorage.getItem('waimai_rider') || 'r1';
  let mapView = null;
  let chatOrderId = null;
  let chatTarget = 'user';
  let keepChat = false;

  const QUICK = ['您好，我是骑手，正在赶来', '马上到楼下，请准备取餐', '已到店取餐，马上出发', '麻烦下楼取一下外卖', '路上有点堵，稍等几分钟', '餐品已送达，请及时取用'];

  function me() { return App.rider(RIDER_ID); }
  function st(o) {
    return {
      created: '商家备餐中', accepted: '商家备餐中', cooked: '待取餐', assigned: '前往商家',
      picking: '待取餐（已到店）', delivering: '配送中', arrived: '已到达', completed: '已完成', cancelled: '已取消'
    }[o.status] || o.status;
  }
  function feeOf(o) { return money(o.deliveryFee * 0.8 + 3); }
  function myOrders() {
    return App.state.orders.filter((o) => o.riderId === RIDER_ID && !['completed', 'cancelled'].includes(o.status));
  }
  function poolOrders() {
    return App.state.orders.filter((o) => o.status === 'cooked' && !o.riderId);
  }

  function setSB(mode) {
    const sb = $('#phone .status-bar');
    if (!sb) return;
    sb.classList.toggle('dark', mode === 'blue');
    sb.style.background = mode === 'blue' ? '#1579f3' : '#fff';
  }
  function afterNav() {
    const t = Nav.top();
    if (!t) return;
    if (t.el._mv) mapView = t.el._mv;
    setSB(pages[t.name].sb || 'light');
    updateTabActive();
  }
  function go(name, params) { Nav.go(name, params); afterNav(); }
  function back() { if (Nav.back()) afterNav(); else go('home'); }
  function reset(name, params) { Nav.reset(name, params); afterNav(); }

  window.updateTabActive = function () {
    const t = Nav.stack[0];
    const name = t ? t.name : 'home';
    const map = { home: 'home', chat: 'chat', mine: 'mine' };
    const active = map[name] || '';
    const n = myOrders().length + poolOrders().length;
    $('#tabbar').innerHTML = [
      ['home', '🛵', '接单'], ['chat', '💬', '消息'], ['mine', '🙂', '我的']
    ].map(([k, ico, label]) =>
      '<div class="tab ' + (active === k ? 'on' : '') + '" data-tab="' + k + '">' +
      '<span class="ico">' + ico + '</span><span>' + label + '</span>' +
      (k === 'home' && n ? '<span class="dot">' + n + '</span>' : '') + '</div>').join('');
  };

  /* ---------- 接单大厅 ---------- */
  const pageHome = {
    sb: 'blue',
    render(el) {
      const r = me() || {};
      const mine = myOrders();
      const pool = poolOrders();
      const done = App.state.orders.filter((o) => o.riderId === RIDER_ID && o.status === 'completed');
      const income = done.reduce((s, o) => s + (o.deliveryFee * 0.8 + 3), 0) + (r.income || 0);

      el.innerHTML =
        '<div class="rider-top">' +
          '<div class="row">' +
            '<div><div class="money">¥' + money(income) + '</div>' +
              '<div class="sub">今日收入 · 已完成 ' + (done.length + (r.orderCount ? 0 : 0)) + ' 单</div></div>' +
            '<div class="switch" data-act="toggleOnline">接单中 ' +
              '<span class="toggle ' + (r.online ? 'on' : '') + '"><i></i></span></div>' +
          '</div>' +
          '<div class="row" style="margin-top:12px">' +
            '<div class="switch" data-act="toggleAuto">自动取餐/送达 ' +
              '<span class="toggle ' + (r.autoMode ? 'on' : '') + '"><i></i></span></div>' +
            '<div style="margin-left:auto;font-size:12px;opacity:.9">' + r.emoji + ' ' + esc(r.name) + ' · ' + esc(r.plate) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="padding:10px">' +
          (pool.length ? '<div class="t-md b" style="padding:4px 2px 8px">🔥 待抢订单（' + pool.length + '）</div>' +
            pool.map((o) => taskCard(o, true)).join('') : '') +
          '<div class="t-md b" style="padding:4px 2px 8px">📦 我的任务（' + mine.length + '）</div>' +
          (mine.length ? mine.map((o) => taskCard(o, false)).join('') :
            '<div class="empty" style="padding:40px 20px"><span class="ico">🛵</span>' +
            '<div>暂无进行中的任务</div><div class="t-sm" style="margin-top:6px">' +
            (r.online ? '保持在线，系统会自动派单' : '当前已停止接单') + '</div></div>') +
          (done.length ? '<div class="t-md b" style="padding:12px 2px 8px">✅ 今日已完成（' + done.length + '）</div>' +
            done.slice(0, 6).map((o) =>
              '<div class="card" style="margin-bottom:8px;padding:10px 12px">' +
                '<div class="row between"><span class="b t-md ellipsis">' + esc(o.shopName) + '</span>' +
                '<span class="c-green b">+¥' + feeOf(o) + '</span></div>' +
                '<div class="t-xs c-3" style="margin-top:4px">' + hhmm(o.createdAt) + ' 送达 · ' + esc(o.address.detail) + '</div>' +
              '</div>').join('') : '') +
          '<div style="height:10px"></div>' +
        '</div>';
    }
  };

  function taskCard(o, canGrab) {
    const shop = App.shop(o.shopId);
    const toShop = Math.round(Math.hypot((me() || { pos: o.shopPos }).pos.x - o.shopPos.x, (me() || { pos: o.shopPos }).pos.y - o.shopPos.y));
    const goods = o.items.map((i) => i.emoji + i.name + '×' + i.qty).join('，');
    const btn = canGrab
      ? '<span class="btn deep" data-act="grab" data-id="' + o.id + '">抢单</span>'
      : o.status === 'picking' ? '<span class="btn deep" data-act="pick" data-id="' + o.id + '">确认取餐</span>'
        : o.status === 'arrived' ? '<span class="btn deep" data-act="deliver" data-id="' + o.id + '">确认送达</span>'
          : '<span class="btn gray">' + st(o) + '</span>';
    return '<div class="task-card" data-act="openTask" data-id="' + o.id + '">' +
      '<div class="tc-head">' +
        '<span class="tag ' + (canGrab ? '' : 'blue') + '">' + (canGrab ? '待抢' : st(o)) + '</span>' +
        '<span class="no">' + esc(o.code) + ' · ' + agoCN(o.createdAt) + '</span>' +
        '<span class="fee">+¥' + feeOf(o) + '</span>' +
      '</div>' +
      '<div class="tc-route">' +
        '<div class="link"></div>' +
        '<div class="pt"><span class="dot a"></span><div class="grow">' +
          '<div class="p-main">' + (shop ? shop.emoji : '🏪') + ' ' + esc(o.shopName) + '</div>' +
          '<div class="p-sub">' + esc(shop ? shop.address : '') + ' · ' + distCN(toShop) + '</div></div></div>' +
        '<div class="pt"><span class="dot b"></span><div class="grow">' +
          '<div class="p-main">' + esc(o.address.detail) + '</div>' +
          '<div class="p-sub">' + esc(o.address.name) + ' ' + esc(o.address.phone) + ' · ' + distCN(o.shopToUserDist) + '</div></div></div>' +
      '</div>' +
      '<div class="tc-goods">📝 ' + esc(goods) + (o.remark ? ' ｜ 备注：' + esc(o.remark) : '') + '</div>' +
      '<div class="tc-acts">' +
        '<span class="btn ghost" data-act="openTask" data-id="' + o.id + '">🧭 导航</span>' +
        '<span class="btn ghost" data-act="openChat" data-id="' + o.id + '">💬 联系</span>' +
        btn +
      '</div></div>';
  }

  /* ---------- 任务详情 / 导航 ---------- */
  const pageTask = {
    sb: 'light',
    render(el, params, pageEl) {
      const o = App.order(params.id);
      if (!o) { el.innerHTML = '<div class="empty">任务不存在</div>'; return; }
      const shop = App.shop(o.shopId);
      const isFetch = ['assigned', 'picking'].includes(o.status);
      el.innerHTML =
        '<div class="map-wrap" style="flex:1;min-height:0"><canvas id="taskCanvas"></canvas>' +
          '<div class="map-btns">' +
            '<div class="map-btn" data-act="refit">◎</div>' +
            '<div class="map-btn" data-act="zoomIn">＋</div>' +
            '<div class="map-btn" data-act="zoomOut">－</div>' +
          '</div>' +
        '</div>';

      const canvas = $('#taskCanvas', pageEl);
      if (canvas) {
        pageEl._mv = window.MapView.create(canvas, {});
        pageEl._mv.start();
        mapView = pageEl._mv;
        setTimeout(() => { if (pageEl._mv) pageEl._mv.resize(); }, 30);
      }

      const panel = document.createElement('div');
      panel.className = 'nav-panel';
      panel.innerHTML =
        '<div class="turn"><span class="ico">' + (isFetch ? '🏪' : '🏠') + '</span>' +
          '<div class="grow"><div class="d" id="tkDist">--</div><div class="s" id="tkSub">正在计算路线…</div></div>' +
          '<div class="btn sm" style="background:#fff;color:#1579f3" data-act="back">返回</div></div>' +
        '<div class="row" style="font-size:12px;color:#666;margin-bottom:10px">' +
          '<span class="grow ellipsis">' + (isFetch ? '🏪 ' + esc(o.shopName) : '🏠 ' + esc(o.address.detail)) + '</span>' +
          '<span class="tag ' + (o.status === 'picking' || o.status === 'arrived' ? '' : 'blue') + '">' + st(o) + '</span>' +
        '</div>' +
        '<div class="row" style="gap:8px">' +
          '<span class="btn ghost" style="flex:none" data-act="openChat" data-id="' + o.id + '">💬 ' + (isFetch ? '商家' : '用户') + '</span>' +
          '<span class="btn ghost" style="flex:none" data-act="call" data-name="' + esc(isFetch ? o.shopName : o.address.name) + '">📞 电话</span>' +
          '<span class="btn deep grow" id="tkMain">' + mainBtnText(o) + '</span>' +
        '</div>';
      pageEl.appendChild(panel);
      this.update(pageEl, params, el);
    },
    update(pageEl, params) {
      const o = App.order(params.id);
      if (!o) return;
      const shop = App.shop(o.shopId);
      const r = me();
      const riderPos = o.riderPos || (r ? r.pos : null);
      const isFetch = ['assigned', 'picking'].includes(o.status);
      const markers = [
        { x: o.shopPos.x, y: o.shopPos.y, emoji: shop ? shop.emoji : '🏪', label: '商家' },
        { x: o.address.pos.x, y: o.address.pos.y, emoji: '🏠', label: '用户' }
      ];
      if (!isFetch && o.status !== 'completed') markers[1].big = true;
      const mv = pageEl._mv;
      if (mv) {
        mv.setData({
          rider: riderPos ? { x: riderPos.x, y: riderPos.y, heading: riderPos.heading || (o.riderPos || {}).heading || 0 } : null,
          path: o.route || [], traveled: o.traveled || 0, markers, pathColor: '#0089ff'
        });
      }
      const d = $('#tkDist', pageEl), s = $('#tkSub', pageEl), mb = $('#tkMain', pageEl);
      const remain = Math.max(0, (o.legTotal || 0) - (o.traveled || 0));
      if (d) d.textContent = distCN(remain);
      if (s) {
        s.textContent = o.status === 'completed' ? '任务已完成' :
          (isFetch ? '前往商家取餐 · ' : '送往用户 · ') + '预计 ' + durCN(remain / 5) + ' 后到达';
      }
      if (mb) {
        mb.textContent = mainBtnText(o);
        mb.className = 'btn grow ' + (['picking', 'arrived'].includes(o.status) ? 'deep' : 'gray');
        mb.dataset.act = o.status === 'picking' ? 'pick' : o.status === 'arrived' ? 'deliver' : '';
        mb.dataset.id = o.id;
        if (!mb.dataset.act) mb.removeAttribute('data-act');
      }
    }
  };

  function mainBtnText(o) {
    return o.status === 'picking' ? '确认取餐' :
      o.status === 'arrived' ? '确认送达' :
        o.status === 'assigned' ? '正在赶往商家…' :
          o.status === 'delivering' ? '正在配送中…' :
            o.status === 'completed' ? '已完成' : st(o);
  }

  /* ---------- 消息 ---------- */
  const pageChat = {
    sb: 'light',
    render(el, params, pageEl) {
      const list = App.state.orders.filter((o) => o.riderId === RIDER_ID);
      if (!chatOrderId || !list.some((o) => o.id === chatOrderId)) chatOrderId = (params.id || (list[0] || {}).id || null);
      el.innerHTML =
        (list.length ? '<div class="chat-targets">' + list.map((o) =>
          '<span class="t ' + (o.id === chatOrderId ? 'on' : '') + '" data-act="selOrder" data-id="' + o.id + '">' +
          (App.shop(o.shopId) || {}).emoji + ' ' + esc(o.code) + '</span>').join('') + '</div>' : '') +
        '<div class="chat-targets" style="border-top:1px solid var(--line)">' +
          '<span class="t ' + (chatTarget === 'user' ? 'on' : '') + '" data-act="target" data-t="user">🙂 用户</span>' +
          '<span class="t ' + (chatTarget === 'merchant' ? 'on' : '') + '" data-act="target" data-t="merchant">🏪 商家</span>' +
        '</div>' +
        '<div class="chat-body" id="chatBody"><div style="text-align:center;color:#bbb;padding:20px">加载中…</div></div>' +
        '<div class="quick-bar">' + QUICK.map((q) => '<span class="quick-chip" data-act="quick" data-q="' + esc(q) + '">' + esc(q) + '</span>').join('') + '</div>' +
        '<div class="chat-input"><input id="chatInput" placeholder="发消息…" />' +
        '<span class="chat-send" data-act="send">发送</span></div>';
      if (!chatOrderId) {
        $('#chatBody', el).innerHTML = '<div class="empty"><span class="ico">💬</span><div>暂无会话</div></div>';
        return;
      }
      loadMessages(chatOrderId).then(() => this.update(pageEl, { id: chatOrderId }, el));
    },
    update(pageEl, params) {
      const body = $('#chatBody', pageEl);
      if (!body || !chatOrderId) return;
      const msgs = window.__messages__.filter((m) => m.orderId === chatOrderId);
      const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60 || keepChat;
      body.innerHTML = msgs.length ? msgs.map((m) => {
        if (m.kind === 'system') return '<div class="sys-msg"><span>' + esc(m.text) + '</span></div>';
        const mine = m.from === 'rider';
        const other = chatTarget === 'user' ? 'user' : 'merchant';
        if (!mine && m.from !== other) return '';
        if (mine && m.to !== 'all' && m.to !== other && m.to !== 'user') return '';
        return '<div class="msg-row ' + (mine ? 'me' : '') + '">' +
          '<div class="avatar sm">' + (mine ? '🛵' : (m.from === 'user' ? '🙂' : '🏪')) + '</div>' +
          '<div><div class="bubble">' + esc(m.text) + '</div>' +
          '<div class="t-xs c-3" style="margin-top:4px;text-align:' + (mine ? 'right' : 'left') + '">' +
          esc(m.fromName) + ' ' + hhmm(m.ts) + '</div></div></div>';
      }).join('') : '<div style="text-align:center;color:#bbb;padding:20px">还没有消息</div>';
      if (atBottom) body.scrollTop = body.scrollHeight;
      keepChat = false;
    }
  };

  function loadMessages(orderId) {
    return U.get('/api/orders/' + orderId + '/messages').then((list) => {
      const cur = window.__messages__;
      list.forEach((m) => { if (!cur.some((x) => x.id === m.id)) cur.push(m); });
      return list;
    }).catch(() => []);
  }

  /* ---------- 我的 ---------- */
  const pageMine = {
    sb: 'blue',
    render(el) {
      const r = me() || {};
      const done = App.state.orders.filter((o) => o.riderId === RIDER_ID && o.status === 'completed');
      el.innerHTML =
        '<div class="rider-top">' +
          '<div class="row">' +
            '<div class="avatar" style="width:52px;height:52px;font-size:30px;background:rgba(255,255,255,.25)">' + r.emoji + '</div>' +
            '<div style="margin-left:12px"><div class="t-lg b">' + esc(r.name) + '</div>' +
              '<div class="sub">★ ' + r.rating + ' · 累计 ' + r.orderCount + ' 单 · ' + esc(r.plate) + '</div></div>' +
          '</div>' +
          '<div class="stats" style="display:flex;margin-top:14px;text-align:center">' +
            [['今日收入', '¥' + money((r.income || 0) + done.length * 6)], ['今日完成', done.length + ' 单'], ['好评率', '98%'], ['准时率', '96%']]
              .map(([k, v]) => '<div class="grow"><div class="b" style="font-size:16px">' + v + '</div><div class="t-xs" style="opacity:.85">' + k + '</div></div>').join('') +
          '</div>' +
        '</div>' +
        '<div style="padding:10px">' +
          '<div class="card"><div class="pad">' +
            [['📡', '接单状态', r.online ? '接单中' : '已停止'], ['⚡', '自动取餐/送达', r.autoMode ? '已开启' : '已关闭']]
              .map(([e, t, v]) => '<div class="row" style="padding:11px 0;border-bottom:1px solid var(--line)">' +
                '<span style="font-size:18px;margin-right:10px">' + e + '</span><span class="grow t-md">' + t + '</span>' +
                '<span class="t-sm ' + (v.indexOf('已开启') >= 0 || v.indexOf('接单中') >= 0 ? 'c-green' : 'c-3') + '">' + v + '</span></div>').join('') +
            '<div class="row" style="padding:11px 0"><span style="font-size:18px;margin-right:10px">🔔</span>' +
              '<span class="grow t-md">新单提醒</span><span class="toggle on"><i></i></span></div>' +
          '</div></div>' +
          '<div class="card"><div class="pad">' +
            '<div class="b t-md" style="margin-bottom:8px">切换骑手账号（演示）</div>' +
            App.state.riders.map((x) =>
              '<div class="row" style="padding:11px 0;border-bottom:1px solid var(--line)" data-act="switchRider" data-id="' + x.id + '">' +
                '<span style="font-size:20px;margin-right:10px">' + x.emoji + '</span>' +
                '<span class="grow"><div class="t-md">' + esc(x.name) + '</div>' +
                '<div class="t-xs c-3">' + esc(x.plate) + ' · ' + (x.status === 'idle' ? '空闲' : '配送中') + '</div></span>' +
                (x.id === RIDER_ID ? '<span class="c-brand t-sm b">当前</span>' : '<span class="c-3">›</span>') +
              '</div>').join('') +
          '</div></div>' +
          '<div style="padding:6px 0 20px;text-align:center">' +
            '<span class="btn sm ghost" data-act="reset">重置演示数据</span></div>' +
        '</div>';
    }
  };

  const pages = { home: pageHome, task: pageTask, chat: pageChat, mine: pageMine };

  /* ---------- 事件 ---------- */
  function bind() {
    delegate($('#screen'), (act, ds) => {
      const pageEl = Nav.top() ? Nav.top().el : null;
      switch (act) {
        case 'toggleOnline':
          U.post('/api/riders/' + RIDER_ID + '/toggle', { field: 'online' }).then((r) => toast(r.rider.online ? '已开始接单' : '已停止接单'));
          break;
        case 'toggleAuto':
          U.post('/api/riders/' + RIDER_ID + '/toggle', { field: 'auto' }).then((r) => toast(r.rider.autoMode ? '已开启自动取餐/送达' : '已关闭自动模式'));
          break;
        case 'grab':
          U.post('/api/orders/' + ds.id + '/action', { act: 'rider_accept', actor: 'rider', riderId: RIDER_ID })
            .then(() => { toast('抢单成功！'); go('task', { id: ds.id }); });
          break;
        case 'pick':
          U.post('/api/orders/' + ds.id + '/action', { act: 'rider_pick', actor: 'rider' }).then(() => toast('已取餐，开始配送 🛵'));
          break;
        case 'deliver':
          U.post('/api/orders/' + ds.id + '/action', { act: 'rider_deliver', actor: 'rider' }).then(() => toast('已送达，收入 +¥' + '已入账 🎉'));
          break;
        case 'openTask': go('task', { id: ds.id }); break;
        case 'openChat': go('chat', { id: ds.id }); break;
        case 'selOrder': chatOrderId = ds.id; Nav.refresh(); break;
        case 'target': chatTarget = ds.t; Nav.refresh(); break;
        case 'quick': {
          const input = $('#chatInput', pageEl);
          if (input) { input.value = ds.q; send(pageEl); }
          break;
        }
        case 'send': send(pageEl); break;
        case 'call': toast('正在呼叫 ' + ds.name + '…（演示）'); break;
        case 'refit': if (mapView) mapView.refit(); break;
        case 'zoomIn': if (mapView) mapView.zoom(1.3); break;
        case 'zoomOut': if (mapView) mapView.zoom(1 / 1.3); break;
        case 'back': back(); break;
        case 'switchRider':
          RIDER_ID = ds.id;
          localStorage.setItem('waimai_rider', RIDER_ID);
          toast('已切换为 ' + (App.rider(RIDER_ID) || {}).name);
          reset('home');
          break;
        case 'reset':
          U.post('/api/reset', {}).then(() => { toast('演示数据已重置'); setTimeout(() => location.reload(), 600); });
          break;
        default: break;
      }
    });

    $('#screen').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'chatInput') { e.preventDefault(); send(Nav.top().el); }
    });

    $('#tabbar').addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) reset(t.dataset.tab);
    });
  }

  function send(pageEl) {
    const input = $('#chatInput', pageEl);
    if (!input || !chatOrderId) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    keepChat = true;
    U.post('/api/orders/' + chatOrderId + '/messages', { from: 'rider', to: chatTarget, text }).then(() => Nav.refresh());
  }

  function init() {
    U.startClock();
    Nav.init($('#screen'), pages);
    bind();
    setSB('blue');
    Nav.reset('home', {}, true);
    updateTabActive();
    App.connect('rider');

    App.on((s, reason) => {
      if (reason === 'hello') { Nav.refresh(); updateTabActive(); return; }
      if (reason === 'message') { Nav.refresh(); return; }
      if (reason === 'orders') {
        const top = Nav.top();
        if (top && ['home', 'task', 'chat', 'mine'].includes(top.name)) Nav.refresh();
        updateTabActive();
      }
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') back(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
