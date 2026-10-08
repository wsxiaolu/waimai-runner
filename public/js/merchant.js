/* ============ 商家端（外卖管家风格） ============ */
(function () {
  'use strict';
  const U = window.U, App = window.App, Nav = window.Nav;
  const { $, esc, money, hhmm, hhmmss, toast, delegate, distCN, agoCN } = U;

  let tab = 'pending';
  let chatOrderId = null;
  let chatTarget = 'user';
  let keepChat = false;
  let knownIds = {};
  let tipTimer = null;

  const TABS = [
    { k: 'pending', label: '待接单', test: (o) => o.status === 'created' },
    { k: 'cooking', label: '备餐中', test: (o) => o.status === 'accepted' },
    { k: 'waiting', label: '待取餐', test: (o) => ['cooked', 'assigned', 'picking'].includes(o.status) },
    { k: 'sending', label: '配送中', test: (o) => ['delivering', 'arrived'].includes(o.status) },
    { k: 'done', label: '已完成', test: (o) => ['completed', 'cancelled'].includes(o.status) }
  ];

  const QUICK = ['您好，订单已收到，正在备餐', '抱歉今天单多，稍等几分钟', '餐品已出餐，等骑手来取', '已为您加急处理', '请问需要调整口味吗？', '祝您用餐愉快 🍽️'];

  function st(o) {
    return {
      created: '待接单', accepted: '备餐中', cooked: '待骑手取餐', assigned: '骑手赶来中',
      picking: '骑手取餐中', delivering: '配送中', arrived: '已送达', completed: '已完成', cancelled: '已取消'
    }[o.status] || o.status;
  }

  function setSB(mode) {
    const sb = $('#phone .status-bar');
    if (!sb) return;
    sb.classList.toggle('dark', mode === 'orange');
    sb.style.background = mode === 'orange' ? '#ff5000' : '#fff';
  }
  function afterNav() {
    const t = Nav.top();
    if (!t) return;
    setSB(pages[t.name].sb || 'light');
    updateTabActive();
  }
  function go(name, params) { Nav.go(name, params); afterNav(); }
  function back() { if (Nav.back()) afterNav(); else go('orders'); }
  function reset(name, params) { Nav.reset(name, params); afterNav(); }

  window.updateTabActive = function () {
    const t = Nav.stack[0];
    const name = t ? t.name : 'orders';
    const map = { orders: 'orders', chat: 'chat', mine: 'mine' };
    const active = map[name] || '';
    const n = App.state.orders.filter((o) => o.status === 'created').length;
    $('#tabbar').innerHTML = [
      ['orders', '📋', '订单'], ['chat', '💬', '消息'], ['mine', '🏪', '我的']
    ].map(([k, ico, label]) =>
      '<div class="tab ' + (active === k ? 'on' : '') + '" data-tab="' + k + '">' +
      '<span class="ico">' + ico + '</span><span>' + label + '</span>' +
      (k === 'orders' && n ? '<span class="dot">' + n + '</span>' : '') + '</div>').join('');
  };

  /* ---------- 订单管理 ---------- */
  const pageOrders = {
    sb: 'orange',
    render(el) {
      const m = App.state.merchant || {};
      const orders = App.state.orders;
      const today = orders.filter((o) => !['cancelled'].includes(o.status));
      const income = today.reduce((s, o) => s + o.total, 0);
      const list = orders.filter((TABS.find((t) => t.k === tab) || TABS[0]).test);

      el.innerHTML =
        '<div class="m-top">' +
          '<div class="row">' +
            '<div><div class="money">¥' + money(income + (m.income || 0) * 0) + '</div>' +
              '<div class="sub" style="font-size:11px;opacity:.9">今日营业额 · ' + (today.length + (m.todayOrders || 0) * 0) + ' 单</div></div>' +
            '<div class="switch" style="margin-left:auto" data-act="toggleOnline">' +
              (m.online ? '营业中' : '已打烊') + ' <span class="toggle ' + (m.online ? 'on' : '') + '"><i></i></span></div>' +
          '</div>' +
          '<div class="stats">' +
            '<div>待接单 <b>' + orders.filter((o) => o.status === 'created').length + '</b></div>' +
            '<div>备餐中 <b>' + orders.filter((o) => o.status === 'accepted').length + '</b></div>' +
            '<div>配送中 <b>' + orders.filter((o) => ['assigned', 'picking', 'delivering', 'arrived'].includes(o.status)).length + '</b></div>' +
          '</div>' +
        '</div>' +
        '<div class="m-tabs">' + TABS.map((t) => {
          const n = orders.filter(t.test).length;
          return '<div class="t ' + (tab === t.k ? 'on' : '') + '" data-act="tab" data-k="' + t.k + '">' + t.label +
            (n ? '<span class="n">' + n + '</span>' : '') + '</div>';
        }).join('') + '</div>' +
        '<div style="padding:10px">' +
          (list.length ? list.map(orderCard).join('') :
            '<div class="empty"><span class="ico">🍽️</span><div>暂无订单</div>' +
            '<div class="t-sm" style="margin-top:6px">用户在 App 下单后会实时出现在这里</div></div>') +
          '<div style="height:10px"></div>' +
        '</div>';
    }
  };

  function orderCard(o) {
    const shop = App.shop(o.shopId);
    const rider = App.rider(o.riderId);
    const acts =
      o.status === 'created' ?
        '<span class="btn sm ghost" data-act="reject" data-id="' + o.id + '">拒单</span>' +
        '<span class="btn sm deep" data-act="accept" data-id="' + o.id + '">立即接单</span>' :
        o.status === 'accepted' ?
          '<span class="btn sm ghost" data-act="chatUser" data-id="' + o.id + '">联系用户</span>' +
          '<span class="btn sm deep" data-act="cooked" data-id="' + o.id + '">出餐完成</span>' :
          ['cooked', 'assigned', 'picking'].includes(o.status) ?
            '<span class="btn sm ghost" data-act="openChat" data-id="' + o.id + '">联系骑手</span>' +
            '<span class="btn sm gray">' + st(o) + '</span>' :
            '<span class="btn sm ghost" data-act="openChat" data-id="' + o.id + '">联系</span>';
    return '<div class="m-order">' +
      '<div class="mo-head">' +
        '<span>' + (shop ? shop.emoji : '🍱') + '</span>' +
        '<span class="code" style="margin-left:6px">' + esc(o.code) + '</span>' +
        '<span class="st">' + st(o) + '</span>' +
      '</div>' +
      '<div class="mo-time">' + hhmmss(o.createdAt) + ' 下单 · ' + agoCN(o.createdAt) + ' · ' + esc(o.shopName) + '</div>' +
      '<div class="mo-items">' +
        o.items.map((i) => '<div class="mo-item"><span>' + i.emoji + ' ' + esc(i.name) + '</span>' +
          '<span><span class="n">x' + i.qty + '</span>  ¥' + money(i.price * i.qty) + '</span></div>').join('') +
        (o.remark ? '<div class="t-sm" style="margin-top:6px;color:#ff5000">📝 备注：' + esc(o.remark) + '</div>' : '') +
      '</div>' +
      '<div class="t-sm c-2" style="margin-top:8px">👤 ' + esc(o.address.name) + ' ' + esc(o.address.phone) + '</div>' +
      '<div class="t-sm c-2" style="margin-top:4px">📍 ' + esc(o.address.detail) + '</div>' +
      (rider ? '<div class="t-sm c-2" style="margin-top:4px">🛵 骑手 ' + esc(o.riderName) + ' ' + esc(o.riderPhone) + '</div>' :
        ['cooked', 'assigned', 'picking', 'delivering'].includes(o.status) ? '<div class="t-sm c-3" style="margin-top:4px">🛵 正在分配骑手…</div>' : '') +
      '<div class="mo-foot"><span class="total">实付 <span class="price">' + money(o.total) + '</span></span>' +
        '<span class="mo-acts">' + acts + '</span></div>' +
      '</div>';
  }

  /* ---------- 消息 ---------- */
  const pageChat = {
    sb: 'light',
    render(el, params, pageEl) {
      const list = App.state.orders;
      if (!chatOrderId || !list.some((o) => o.id === chatOrderId)) chatOrderId = (params.id || (list[0] || {}).id || null);
      el.innerHTML =
        (list.length ? '<div class="chat-targets" style="overflow-x:auto">' + list.slice(0, 8).map((o) =>
          '<span class="t" style="flex:none" data-act="selOrder" data-id="' + o.id + '">' +
          esc(o.code) + '</span>').join('') + '</div>' : '') +
        '<div class="chat-targets" style="border-top:1px solid var(--line)">' +
          '<span class="t ' + (chatTarget === 'user' ? 'on' : '') + '" data-act="target" data-t="user">🙂 用户</span>' +
          '<span class="t ' + (chatTarget === 'rider' ? 'on' : '') + '" data-act="target" data-t="rider">🛵 骑手</span>' +
        '</div>' +
        '<div class="chat-body" id="chatBody"><div style="text-align:center;color:#bbb;padding:20px">加载中…</div></div>' +
        '<div class="quick-bar">' + QUICK.map((q) => '<span class="quick-chip" data-act="quick" data-q="' + esc(q) + '">' + esc(q) + '</span>').join('') + '</div>' +
        '<div class="chat-input"><input id="chatInput" placeholder="发消息…" />' +
        '<span class="chat-send" data-act="send">发送</span></div>';
      if (!chatOrderId) { $('#chatBody', el).innerHTML = '<div class="empty"><span class="ico">💬</span><div>暂无会话</div></div>'; return; }
      loadMessages(chatOrderId).then(() => this.update(pageEl, {}, el));
    },
    update(pageEl) {
      const body = $('#chatBody', pageEl);
      if (!body || !chatOrderId) return;
      const msgs = window.__messages__.filter((m) => m.orderId === chatOrderId);
      const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60 || keepChat;
      body.innerHTML = msgs.length ? msgs.map((m) => {
        if (m.kind === 'system') return '<div class="sys-msg"><span>' + esc(m.text) + '</span></div>';
        const mine = m.from === 'merchant';
        const other = chatTarget;
        if (!mine && m.from !== other) return '';
        if (mine && m.to !== 'all' && m.to !== other) return '';
        return '<div class="msg-row ' + (mine ? 'me' : '') + '">' +
          '<div class="avatar sm">' + (mine ? '🏪' : (m.from === 'user' ? '🙂' : '🛵')) + '</div>' +
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

  /* ---------- 我的 / 店铺 ---------- */
  const pageMine = {
    sb: 'orange',
    render(el) {
      const m = App.state.merchant || {};
      const orders = App.state.orders;
      const shops = App.state.shops;
      const done = orders.filter((o) => o.status === 'completed');
      el.innerHTML =
        '<div class="m-top">' +
          '<div class="row"><div class="avatar" style="width:52px;height:52px;font-size:30px;background:rgba(255,255,255,.25)">🏪</div>' +
            '<div style="margin-left:12px"><div class="t-lg b">外卖管家 · 商家版</div>' +
              '<div class="sub" style="font-size:11px;opacity:.9">' + shops.length + ' 家门店 · ' + (m.online ? '营业中' : '已打烊') + '</div></div></div>' +
          '<div class="stats">' +
            '<div>今日订单 <b>' + (done.length + (m.todayOrders || 0)) + '</b></div>' +
            '<div>营业额 <b>¥' + money(done.reduce((s, o) => s + o.total, 0) + (m.income || 0)) + '</b></div>' +
            '<div>好评率 <b>98%</b></div>' +
          '</div>' +
        '</div>' +
        '<div style="padding:10px">' +
          '<div class="card"><div class="pad">' +
            '<div class="row" style="padding:11px 0;border-bottom:1px solid var(--line)">' +
              '<span class="grow t-md">🏪 营业状态</span>' +
              '<span class="toggle ' + (m.online ? 'on' : '') + '" data-act="toggleOnline"><i></i></span></div>' +
            '<div class="row" style="padding:11px 0;border-bottom:1px solid var(--line)">' +
              '<span class="grow t-md">⚡ 自动接单</span>' +
              '<span class="toggle ' + (m.autoAccept ? 'on' : '') + '" data-act="toggleAuto"><i></i></span></div>' +
            '<div class="row" style="padding:11px 0">' +
              '<span class="grow t-md">⏱️ 自动出餐时长</span>' +
              '<span style="display:flex;gap:6px">' + [5, 10, 15, 30].map((s) =>
                '<span class="tag ' + (m.cookSeconds === s ? '' : 'gray') + '" style="cursor:pointer;padding:5px 9px" data-act="cook" data-s="' + s + '">' + s + '秒</span>').join('') + '</span></div>' +
          '</div></div>' +
          '<div class="card"><div class="pad">' +
            '<div class="b t-md" style="margin-bottom:8px">我的门店</div>' +
            shops.map((s) =>
              '<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)">' +
                '<span style="font-size:22px;margin-right:10px">' + s.emoji + '</span>' +
                '<span class="grow"><div class="t-md ellipsis">' + esc(s.name) + '</div>' +
                '<div class="t-xs c-3">★ ' + s.rating + ' · 月售 ' + s.monthSales + '</div></span>' +
                '<span class="tag green">营业中</span></div>').join('') +
          '</div></div>' +
          '<div class="card"><div class="pad">' +
            [['📊', '经营数据'], ['🎟️', '优惠活动'], ['📦', '商品管理'], ['💰', '财务结算'], ['⚙️', '店铺设置']].map(([e, t], i, arr) =>
              '<div class="row" style="padding:12px 0;' + (i < arr.length - 1 ? 'border-bottom:1px solid var(--line)' : '') + '">' +
                '<span style="font-size:18px;margin-right:10px">' + e + '</span>' +
                '<span class="grow t-md">' + t + '</span><span class="c-3">›</span></div>').join('') +
          '</div></div>' +
          '<div style="padding:6px 0 20px;text-align:center"><span class="btn sm ghost" data-act="reset">重置演示数据</span></div>' +
        '</div>';
    }
  };

  const pages = { orders: pageOrders, chat: pageChat, mine: pageMine };

  /* ---------- 新订单提醒 ---------- */
  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 990;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
      o.start(); o.stop(ctx.currentTime + 0.26);
    } catch (e) { /* 忽略 */ }
  }

  function showNewTip(n) {
    const host = $('#phone');
    if (!host) return;
    let tip = $('.new-tip', host);
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'new-tip';
      tip.dataset.act = 'goNew';
      host.appendChild(tip);
    }
    tip.innerHTML = '🔔 您有 ' + n + ' 个新订单待处理 · 点击查看 ›';
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { if (tip.parentNode) tip.remove(); }, 6000);
  }

  function checkNew(orders) {
    const fresh = orders.filter((o) => o.status === 'created' && !knownIds[o.id]);
    orders.forEach((o) => { knownIds[o.id] = true; });
    if (fresh.length && Object.keys(knownIds).length > 0) {
      beep();
      showNewTip(orders.filter((o) => o.status === 'created').length);
      toast('🔔 新订单来啦！');
    }
  }

  /* ---------- 事件 ---------- */
  function bind() {
    delegate($('#phone'), (act, ds) => {
      const pageEl = Nav.top() ? Nav.top().el : null;
      switch (act) {
        case 'tab': tab = ds.k; Nav.refresh(); break;
        case 'accept':
          U.post('/api/orders/' + ds.id + '/action', { act: 'merchant_accept', actor: 'merchant' }).then(() => toast('已接单，开始备餐 👨‍🍳'));
          break;
        case 'cooked':
          U.post('/api/orders/' + ds.id + '/action', { act: 'merchant_cooked', actor: 'merchant' }).then(() => toast('已出餐，等待骑手取餐'));
          break;
        case 'reject':
          U.post('/api/orders/' + ds.id + '/action', { act: 'user_cancel', actor: 'merchant' }).then(() => toast('已拒单'));
          break;
        case 'chatUser': chatTarget = 'user'; go('chat', { id: ds.id }); break;
        case 'openChat': go('chat', { id: ds.id }); break;
        case 'selOrder': chatOrderId = ds.id; Nav.refresh(); break;
        case 'target': chatTarget = ds.t; Nav.refresh(); break;
        case 'quick': {
          const input = $('#chatInput', pageEl);
          if (input) { input.value = ds.q; send(pageEl); }
          break;
        }
        case 'send': send(pageEl); break;
        case 'toggleOnline':
          U.post('/api/merchant/toggle', { field: 'online' }).then((r) => toast(r.merchant.online ? '已开始营业' : '已打烊'));
          break;
        case 'toggleAuto':
          U.post('/api/merchant/toggle', { field: 'auto' }).then((r) => toast(r.merchant.autoAccept ? '已开启自动接单' : '已关闭自动接单'));
          break;
        case 'cook':
          U.post('/api/merchant/toggle', { field: 'cookSeconds', value: +ds.s }).then(() => toast('出餐时长已设为 ' + ds.s + ' 秒'));
          break;
        case 'goNew':
          tab = 'pending';
          reset('orders');
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
    U.post('/api/orders/' + chatOrderId + '/messages', { from: 'merchant', to: chatTarget, text }).then(() => Nav.refresh());
  }

  function init() {
    U.startClock();
    Nav.init($('#screen'), pages);
    bind();
    setSB('orange');
    Nav.reset('orders', {}, true);
    updateTabActive();
    App.connect('merchant');

    App.on((s, reason) => {
      if (reason === 'hello') {
        (s.orders || []).forEach((o) => { knownIds[o.id] = true; });
        Nav.refresh(); updateTabActive(); return;
      }
      if (reason === 'orders') { checkNew(s.orders); Nav.refresh(); updateTabActive(); }
      if (reason === 'message') Nav.refresh();
      if (reason === 'merchant') Nav.refresh();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
