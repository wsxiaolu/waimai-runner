/* ============ 用户端（美团风格） ============ */
(function () {
  'use strict';
  const U = window.U, App = window.App, Nav = window.Nav, City = window.City;
  const { $, esc, money, hhmm, hhmmss, toast, delegate, distCN, durCN, agoCN } = U;

  const FALLBACK_STATUS = {
    created: '等待商家接单', accepted: '商家备餐中', cooked: '餐品已备好',
    assigned: '骑手赶往商家', picking: '骑手取餐中', delivering: '骑手配送中',
    arrived: '已送达待确认', completed: '已完成', cancelled: '已取消'
  };

  let cart = { shopId: null, items: {} };
  let sortMode = 'smart';
  let draft = { remark: '', tableware: 1, pay: '微信支付', addressId: null };
  let chatTarget = 'rider';
  let activeCat = null;
  let mapView = null;
  let chatScrollKeep = false;

  const QUICK = ['骑手到哪了？', '大概还要多久？', '麻烦放在门口', '放前台就好', '麻烦快一点，谢谢！', '辛苦了 🙏'];

  /* ---------- 工具 ---------- */
  function st(order) { return (App.state.statusText && App.state.statusText[order.status]) || FALLBACK_STATUS[order.status] || order.status; }
  function cartCount() { return Object.keys(cart.items).reduce((s, k) => s + cart.items[k], 0); }
  function cartSum() {
    const dishes = App.state.dishes;
    return Object.keys(cart.items).reduce((s, id) => {
      const d = dishes.find((x) => x.id === id);
      return s + (d ? d.price * cart.items[id] : 0);
    }, 0);
  }
  function curAddr() {
    const list = App.state.user && App.state.user.addresses || [];
    return list.find((a) => a.id === draft.addressId) || list[0] ||
      { id: '', detail: '阳光小区 3 栋 502 室', name: '小林', phone: '137****8866', pos: { x: 1180, y: 1240 } };
  }
  function setSB(mode) {
    const sb = $('#phone .status-bar');
    if (!sb) return;
    sb.classList.toggle('dark', mode === 'blue');
    if (mode === 'brand') sb.style.background = 'linear-gradient(180deg,#ffd100 0%,#ffe066 100%)';
    else if (mode === 'blue') sb.style.background = '#1579f3';
    else sb.style.background = '#fff';
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
    const map = { home: 'home', orders: 'orders', profile: 'profile' };
    const active = map[name] || '';
    const doing = App.state.orders.filter((o) => !['completed', 'cancelled'].includes(o.status)).length;
    $('#tabbar').innerHTML = ['home:🏠:首页', 'orders:📋:订单', 'profile:🙂:我的']
      .map((s) => {
        const [k, ico, label] = s.split(':');
        return '<div class="tab ' + (active === k ? 'on' : '') + '" data-tab="' + k + '">' +
          '<span class="ico">' + ico + '</span><span>' + label + '</span>' +
          (k === 'orders' && doing ? '<span class="dot">' + doing + '</span>' : '') + '</div>';
      }).join('');
  };

  /* ---------- 页面：首页 ---------- */
  const pageHome = {
    sb: 'brand',
    render(el) {
      const addr = curAddr();
      let shops = App.state.shops.slice();
      if (sortMode === 'distance') shops.sort((a, b) => a.distance - b.distance);
      else if (sortMode === 'sales') shops.sort((a, b) => b.monthSales - a.monthSales);
      else if (sortMode === 'rating') shops.sort((a, b) => b.rating - a.rating);
      else shops.sort((a, b) => (b.rating * 1000 + b.monthSales / 10) - (a.rating * 1000 + a.monthSales / 10));

      const kong = (App.state.categories || []).map((c) =>
        '<div class="kong-item" data-act="kong" data-name="' + esc(c.name) + '">' +
        '<span class="ico">' + c.emoji + '</span><span>' + esc(c.name) + '</span></div>').join('');

      el.innerHTML =
        '<div class="home-head">' +
          '<div class="loc-line"><span>📍</span><span class="ellipsis">' + esc(addr.detail) + '</span>' +
            '<span class="arrow">▼</span><span class="right" data-act="switchAddr">切换地址 ›</span></div>' +
          '<div class="search-box"><span>🔍</span><span class="grow">搜索「螺蛳粉」</span><span class="s-btn">搜索</span></div>' +
        '</div>' +
        '<div style="background:#fff;padding-bottom:6px">' +
          '<div class="kong-grid">' + kong + '</div>' +
        '</div>' +
        '<div class="banner" style="margin-top:0">' +
          '<div class="t1">新客立减 3 元 🎉</div>' +
          '<div class="t2">首次下单专享优惠 · 全场饮品第二杯半价</div>' +
        '</div>' +
        '<div class="filter-bar">' +
          [['smart', '综合排序'], ['sales', '销量优先'], ['distance', '距离最近'], ['rating', '评分最高']]
            .map(([k, t]) => '<span class="' + (sortMode === k ? 'on' : '') + '" data-act="sort" data-k="' + k + '">' + t + '</span>').join('') +
        '</div>' +
        '<div style="padding:0 12px 12px">' +
          shops.map((s) => {
            const home = curAddr();
            const d = Math.round(Math.hypot(s.pos.x - home.pos.x, s.pos.y - home.pos.y));
            return '<div class="card" style="margin-top:10px" data-act="openShop" data-id="' + s.id + '">' +
              '<div class="shop-card" style="border-bottom:none">' +
                '<div class="shop-logo" style="background:' + s.brand + '22">' + s.emoji + '<span class="badge-b">品牌</span></div>' +
                '<div class="shop-main">' +
                  '<div class="shop-name ellipsis">' + esc(s.name) + '</div>' +
                  '<div class="shop-meta"><span class="star">★ ' + s.rating + '</span>' +
                    '<span>月售 ' + (s.monthSales > 9999 ? '9999+' : s.monthSales) + '</span>' +
                    '<span>' + distCN(d) + '</span><span>' + s.deliveryTime + ' 分钟</span></div>' +
                  '<div class="shop-meta" style="margin-top:3px">起送 ¥' + s.minPrice + ' · 配送 ¥' + s.deliveryFee + '</div>' +
                  '<div class="shop-tags">' + (s.tags || []).slice(0, 3).map((t) => '<span class="tag gray">' + esc(t) + '</span>').join('') + '</div>' +
                  '<div class="shop-foot">🔔 ' + esc((s.promos || [])[0] || '本店暂无优惠') + '</div>' +
                '</div>' +
              '</div></div>';
          }).join('') +
        '</div>';
    }
  };

  /* ---------- 页面：商家详情 ---------- */
  const pageShop = {
    sb: 'brand',
    render(el, params, pageEl) {
      const shop = App.shop(params.id);
      if (!shop) { el.innerHTML = '<div class="empty">商家不存在</div>'; return; }
      const dishes = App.dishes(shop.id);
      const cats = [];
      dishes.forEach((d) => { if (!cats.includes(d.cat)) cats.push(d.cat); });
      if (!activeCat || !cats.includes(activeCat)) activeCat = cats[0];
      const home = curAddr();
      const d = Math.round(Math.hypot(shop.pos.x - home.pos.x, shop.pos.y - home.pos.y));

      el.innerHTML =
        '<div class="shop-hero" style="background:linear-gradient(135deg,' + shop.brand + ',' + shop.brand + 'cc)">' +
          '<div class="hero-in">' +
            '<div class="logo">' + shop.emoji + '</div>' +
            '<div class="grow">' +
              '<div class="h-name">' + esc(shop.name) + '</div>' +
              '<div class="h-sub">★ ' + shop.rating + ' · 月售 ' + shop.monthSales + ' · ' + distCN(d) + ' · ' + shop.deliveryTime + ' 分钟送达</div>' +
              '<div class="h-tags">' + (shop.tags || []).map((t) => '<span class="h-tag">' + esc(t) + '</span>').join('') + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="position:relative;margin-top:10px;font-size:11px;opacity:.95">📢 ' + esc(shop.notice) + '</div>' +
        '</div>' +
        '<div style="background:#fff;padding:10px 12px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--line)">' +
          (shop.promos || []).map((p) => '<span class="tag">🎫 ' + esc(p) + '</span>').join('') +
        '</div>' +
        '<div class="menu-body">' +
          '<div class="menu-cats">' + cats.map((c) =>
            '<div class="cat ' + (c === activeCat ? 'on' : '') + '" data-act="cat" data-cat="' + esc(c) + '">' + esc(c) + '</div>').join('') +
          '</div>' +
          '<div class="menu-list" id="menuList">' +
            cats.map((c) =>
              '<div class="cat-title" data-cat-title="' + esc(c) + '">' + esc(c) + '</div>' +
              dishes.filter((x) => x.cat === c).map((x) => dishRow(x)).join('')
            ).join('') +
          '</div>' +
        '</div>';

      // 购物车条（挂在 page 层）
      const n = cartCount();
      const sum = cartSum();
      const bar = document.createElement('div');
      bar.className = 'cart-bar';
      bar.innerHTML =
        '<div class="cart-icon" data-act="toggleCart">🛒' + (n ? '<span class="n">' + n + '</span>' : '') + '</div>' +
        '<div class="cart-price">' + (n ? '¥' + money(sum) : '未选购商品') +
          '<small>' + (n ? '另需配送费 ¥' + shop.deliveryFee : '起送 ¥' + shop.minPrice) + '</small></div>' +
        '<div class="cart-go ' + (n && sum >= shop.minPrice ? '' : 'off') + '" data-act="toCheckout">' +
          (n ? (sum >= shop.minPrice ? '去结算' : '差 ¥' + money(shop.minPrice - sum) + ' 起送') : '去结算') + '</div>';
      pageEl.appendChild(bar);
    },
    onEnter(pageEl) {
      const list = $('#menuList', pageEl);
      if (!list) return;
      list.addEventListener('scroll', () => {
        const titles = list.querySelectorAll('[data-cat-title]');
        let cur = null;
        titles.forEach((t) => { if (t.offsetTop - list.scrollTop < 40) cur = t.dataset.catTitle; });
        if (cur) {
          activeCat = cur;
          pageEl.querySelectorAll('.menu-cats .cat').forEach((c) => c.classList.toggle('on', c.dataset.cat === cur));
        }
      });
    }
  };

  function dishRow(d) {
    const qty = cart.items[d.id] || 0;
    return '<div class="dish-row">' +
      '<div class="dish-pic">' + d.emoji + '</div>' +
      '<div class="dish-info">' +
        '<div class="dish-name">' + esc(d.name) + '</div>' +
        '<div class="dish-desc">' + esc(d.desc) + '</div>' +
        '<div class="dish-sale">月售 ' + d.sales + ' · 好评 ' + d.praise + '</div>' +
        '<div class="dish-bottom">' +
          '<div><span class="price">' + money(d.price) + '</span> <span class="price-old">' + money(d.oldPrice) + '</span></div>' +
          '<div class="stepper">' +
            (qty ? '<span class="minus" data-act="sub" data-id="' + d.id + '">−</span><span class="n">' + qty + '</span>' : '') +
            '<span class="plus" data-act="add" data-id="' + d.id + '">+</span>' +
          '</div>' +
        '</div>' +
      '</div></div>';
  }

  function renderCartPop(pageEl, shop) {
    const old = $('.cart-pop', pageEl); const mask = $('.mask', pageEl);
    if (old) { old.remove(); if (mask) mask.remove(); return; }
    if (!cartCount()) return;
    const dishes = App.state.dishes;
    const pop = document.createElement('div');
    pop.className = 'cart-pop';
    pop.innerHTML =
      '<div class="head"><span class="grow b">已选商品</span><span class="c-3" data-act="clearCart">清空 🗑</span></div>' +
      '<div class="list">' + Object.keys(cart.items).filter((id) => cart.items[id] > 0).map((id) => {
        const d = dishes.find((x) => x.id === id);
        return '<div class="ci"><span class="grow ellipsis">' + d.emoji + ' ' + esc(d.name) + '</span>' +
          '<span class="price" style="margin-right:10px">' + money(d.price * cart.items[id]) + '</span>' +
          '<span class="stepper"><span class="minus" data-act="sub" data-id="' + id + '">−</span>' +
          '<span class="n">' + cart.items[id] + '</span>' +
          '<span class="plus" data-act="add" data-id="' + id + '">+</span></span></div>';
      }).join('') +
      '</div>' +
      '<div style="height:8px;background:#f4f5f7"></div>';
    const m = document.createElement('div');
    m.className = 'mask';
    m.addEventListener('click', () => { renderCartPop(pageEl, shop); });
    pageEl.insertBefore(m, pageEl.firstChild);
    pageEl.appendChild(pop);
  }

  /* ---------- 页面：确认订单 ---------- */
  const pageCheckout = {
    sb: 'light',
    render(el, params) {
      const shop = App.shop(params.shopId) || App.shop(cart.shopId);
      const dishes = App.state.dishes;
      const items = Object.keys(cart.items).filter((id) => cart.items[id] > 0);
      const subtotal = cartSum();
      const packFee = items.reduce((s, id) => s + cart.items[id], 0) * 1;
      let discount = 0;
      (shop.promos || []).forEach((p) => {
        const m = /满\s*(\d+)\s*减\s*(\d+)/.exec(p);
        if (m && subtotal >= +m[1]) discount = Math.max(discount, +m[2]);
      });
      const total = Math.max(0, subtotal + packFee + shop.deliveryFee - discount);
      const addr = curAddr();
      const etaMin = shop.deliveryTime;

      el.innerHTML =
        '<div style="padding:10px">' +
          '<div class="card">' +
            '<div class="cell" data-act="pickAddr">' +
              '<span class="addr-ico">📍</span>' +
              '<span class="v">' +
                '<div class="b">' + esc(addr.detail) + '</div>' +
                '<div class="t-sm c-3" style="margin-top:4px">' + esc(addr.name) + ' ' + esc(addr.phone) + '</div>' +
              '</span>' +
              '<span class="arrow">›</span>' +
            '</div>' +
            '<div class="cell"><span class="k">配送方式</span><span class="v">🚴 平台专送 · 预计 ' + etaMin + ' 分钟送达</span></div>' +
            '<div class="cell"><span class="k">送达时间</span><span class="v c-brand">尽快送达（约 ' + hhmm(Date.now() + etaMin * 60000) + '）</span></div>' +
          '</div>' +
          '<div class="card">' +
            '<div style="padding:10px 14px 4px;display:flex;align-items:center">' +
              '<span style="font-size:22px">' + shop.emoji + '</span>' +
              '<span class="b" style="margin-left:8px">' + esc(shop.name) + '</span></div>' +
            '<div style="padding:6px 14px 10px">' + items.map((id) => {
              const d = dishes.find((x) => x.id === id);
              return '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px">' +
                '<span class="ellipsis">' + d.emoji + ' ' + esc(d.name) + ' <span class="c-3">x' + cart.items[id] + '</span></span>' +
                '<span class="price">' + money(d.price * cart.items[id]) + '</span></div>';
            }).join('') +
              '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:#999">' +
                '<span>打包费</span><span>¥' + money(packFee) + '</span></div>' +
              '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:#999">' +
                '<span>配送费</span><span>¥' + money(shop.deliveryFee) + '</span></div>' +
              (discount ? '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:#ff5000">' +
                '<span>店铺满减</span><span>-¥' + money(discount) + '</span></div>' : '') +
              '<div style="display:flex;justify-content:flex-end;padding:8px 0 2px;font-size:14px">' +
                '<span class="c-3">小计 </span><span class="price" style="margin-left:6px">' + money(total) + '</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="cell"><span class="k">餐具份数</span><span class="v">' +
              ['无需餐具', '1 份', '2 份', '3 份'].map((t, i) =>
                '<span class="tag ' + (draft.tableware === i ? '' : 'gray') + '" data-act="tableware" data-n="' + i + '" style="cursor:pointer">' + t + '</span>').join('') +
            '</span></div>' +
            '<div class="cell"><span class="k">订单备注</span><span class="v">' +
              '<input id="remarkInput" placeholder="口味、偏好等（选填）" value="' + esc(draft.remark) + '" ' +
              'style="border:none;outline:none;width:100%;font-size:14px;font-family:inherit">' +
            '</span></div>' +
            '<div class="cell" style="border-bottom:none"><span class="k">支付方式</span><span class="v">' +
              ['微信支付', '支付宝', '美团余额'].map((p) =>
                '<span style="margin-right:10px;cursor:pointer;color:' + (draft.pay === p ? 'var(--brand-deep)' : '#999') + '" data-act="pay" data-p="' + p + '">' +
                (draft.pay === p ? '● ' : '○ ') + p + '</span>').join('') +
            '</span></div>' +
          '</div>' +
          '<div style="height:76px"></div>' +
        '</div>';

      const bar = document.createElement('div');
      bar.className = 'cart-bar';
      bar.innerHTML = '<div class="cart-price" style="margin-left:4px">待支付 ¥' + money(total) +
        '<small>已优惠 ¥' + money(discount) + '</small></div>' +
        '<div class="cart-go" data-act="submitOrder" data-shop="' + shop.id + '">提交订单</div>';
      el.parentNode.appendChild(bar);

      const ri = $('#remarkInput', el);
      if (ri) ri.addEventListener('input', () => { draft.remark = ri.value; });
    }
  };

  /* ---------- 页面：订单列表 ---------- */
  const pageOrders = {
    sb: 'light',
    render(el) {
      const orders = App.state.orders;
      el.innerHTML =
        '<div style="padding:10px">' +
          (orders.length ? orders.map((o) => {
            const shop = App.shop(o.shopId);
            const goods = o.items.map((i) => i.emoji + i.name + '×' + i.qty).join('，');
            const doing = !['completed', 'cancelled'].includes(o.status);
            return '<div class="order-card" data-act="openTrack" data-id="' + o.id + '">' +
              '<div class="oc-top">' +
                '<span style="font-size:20px">' + (shop ? shop.emoji : '🍱') + '</span>' +
                '<span class="name ellipsis">' + esc(o.shopName) + '</span>' +
                '<span class="oc-status ' + (doing ? '' : 'done') + '">' + st(o) + '</span>' +
              '</div>' +
              '<div class="oc-goods">' +
                '<div class="pic">' + (o.items[0] ? o.items[0].emoji : '🍱') + '</div>' +
                '<div class="txt"><div class="ellipsis">' + esc(goods) + '</div>' +
                  '<div style="margin-top:3px">' + hhmm(o.createdAt) + ' · ¥' + money(o.total) + '</div></div>' +
                (doing ? '<span class="tag brand">进行中</span>' : '') +
              '</div>' +
              '<div class="oc-acts">' +
                (o.status === 'arrived' ? '<span class="btn sm deep" data-act="confirm" data-id="' + o.id + '">确认送达</span>' : '') +
                (o.status === 'created' ? '<span class="btn sm ghost" data-act="cancel" data-id="' + o.id + '">取消订单</span>' : '') +
                '<span class="btn sm ghost" data-act="openChat" data-id="' + o.id + '">联系骑手</span>' +
                '<span class="btn sm" data-act="openTrack" data-id="' + o.id + '">查看详情</span>' +
              '</div>' +
            '</div>';
          }).join('') :
            '<div class="empty"><span class="ico">🍱</span><div>还没有订单</div>' +
            '<div class="t-sm" style="margin-top:6px">去首页挑一家喜欢的店吧</div>' +
            '<div class="btn sm" style="margin-top:14px" data-act="goHome">去逛逛</div></div>') +
        '</div>';
    }
  };

  /* ---------- 页面：订单跟踪 ---------- */
  const pageTrack = {
    sb: 'light',
    render(el, params, pageEl) {
      const o = App.order(params.id);
      if (!o) { el.innerHTML = '<div class="empty">订单不存在</div>'; return; }
      const shop = App.shop(o.shopId);
      const rider = App.riderOf(o);
      const doing = !['completed', 'cancelled'].includes(o.status);

      el.innerHTML =
        '<div class="map-wrap" id="trackMap" style="height:34%;flex:none">' +
          '<canvas id="trackCanvas"></canvas>' +
          '<div class="map-btns">' +
            '<div class="map-btn" data-act="fullNav" title="全屏导航">⛶</div>' +
            '<div class="map-btn" data-act="refit">◎</div>' +
            '<div class="map-btn" data-act="zoomIn">＋</div>' +
            '<div class="map-btn" data-act="zoomOut">－</div>' +
          '</div>' +
          '<div class="map-info" id="mapInfo"></div>' +
        '</div>' +
        '<div style="padding:10px">' +
          '<div class="card">' +
            '<div style="padding:14px">' +
              '<div class="t-xl b" id="tkStatus">' + st(o) + '</div>' +
              '<div class="t-sm c-2" style="margin-top:6px" id="tkEta"></div>' +
            '</div>' +
            '<div id="riderBox"></div>' +
          '</div>' +
          '<div class="card"><div class="pad">' +
            '<div class="b t-md" style="margin-bottom:10px">配送进度</div>' +
            '<div class="timeline" id="tkTimeline"></div>' +
          '</div></div>' +
          '<div class="card"><div class="pad">' +
            '<div class="b t-md" style="margin-bottom:8px">' + (shop ? shop.emoji : '🍱') + ' ' + esc(o.shopName) + '</div>' +
            o.items.map((i) =>
              '<div class="row between" style="padding:4px 0;font-size:13px">' +
                '<span class="grow ellipsis">' + i.emoji + ' ' + esc(i.name) + ' <span class="c-3">x' + i.qty + '</span></span>' +
                '<span class="price">' + money(i.price * i.qty) + '</span></div>').join('') +
            '<div style="border-top:1px dashed var(--line);margin-top:8px;padding-top:8px;font-size:12px" class="c-2">' +
              '<div class="row between"><span>商品小计</span><span>¥' + money(o.subtotal) + '</span></div>' +
              '<div class="row between"><span>打包费</span><span>¥' + money(o.packFee) + '</span></div>' +
              '<div class="row between"><span>配送费</span><span>¥' + money(o.deliveryFee) + '</span></div>' +
              (o.discount ? '<div class="row between c-red"><span>优惠</span><span>-¥' + money(o.discount) + '</span></div>' : '') +
              '<div class="row between" style="margin-top:6px"><span class="b">实付</span><span class="price">' + money(o.total) + '</span></div>' +
            '</div>' +
          '</div></div>' +
          '<div class="card"><div class="pad" style="font-size:13px">' +
            '<div class="row" style="align-items:flex-start"><span style="margin-right:8px">📍</span>' +
              '<span class="grow"><div class="b">' + esc(o.address.detail) + '</div>' +
              '<div class="t-sm c-3" style="margin-top:3px">' + esc(o.address.name) + ' ' + esc(o.address.phone) + '</div></span></div>' +
            '<div style="margin-top:8px" class="t-sm c-2">备注：' + esc(o.remark || '无') + ' · 餐具 ' + (o.tableware === 0 ? '无需' : o.tableware + ' 份') + '</div>' +
            '<div style="margin-top:6px" class="t-sm c-3">订单号 ' + esc(o.code) + ' · ' + hhmmss(o.createdAt) + ' · ' + esc(o.payMethod) + '</div>' +
          '</div></div>' +
          '<div style="height:80px"></div>' +
        '</div>';

      const bar = document.createElement('div');
      bar.className = 'cart-bar';
      bar.innerHTML =
        '<div class="cart-icon" style="background:#fff" data-act="openChat" data-id="' + o.id + '">💬</div>' +
        '<div class="cart-price" style="font-size:14px">' + (doing ? '配送中' : '已完成') +
          '<small>有问题可随时联系骑手</small></div>' +
        (o.status === 'arrived' ? '<div class="cart-go" data-act="confirm" data-id="' + o.id + '">确认送达</div>' :
          o.status === 'created' ? '<div class="cart-go" data-act="cancel" data-id="' + o.id + '">取消订单</div>' :
          '<div class="cart-go" data-act="openChat" data-id="' + o.id + '">联系骑手</div>');
      pageEl.appendChild(bar);

      // 地图
      const canvas = $('#trackCanvas', pageEl);
      if (canvas) {
        pageEl._mv = window.MapView.create(canvas, {});
        pageEl._mv.start();
        mapView = pageEl._mv;
        setTimeout(() => { if (pageEl._mv) pageEl._mv.resize(); }, 30);
      }
      this.update(pageEl, params, el);
    },
    update(pageEl, params) {
      const o = App.order(params.id);
      if (!o) return;
      const shop = App.shop(o.shopId);
      const tl = (o.timeline || []);
      const last = tl[tl.length - 1];

      // 状态与 ETA
      const sEl = $('#tkStatus', pageEl); if (sEl) sEl.textContent = st(o);
      const eEl = $('#tkEta', pageEl);
      if (eEl) {
        if (o.status === 'completed') eEl.innerHTML = '已于 ' + hhmm(o.completedAt || Date.now()) + ' 送达 · 感谢您的信任';
        else if (o.status === 'cancelled') eEl.textContent = '订单已取消';
        else if (o.eta) eEl.innerHTML = '预计 <b class="c-brand">' + hhmm(o.eta.at) + '</b> 送达 · 还剩约 ' + durCN(o.eta.seconds);
        else eEl.textContent = '正在为您安排配送…';
      }

      // 骑手卡片
      const box = $('#riderBox', pageEl);
      if (box) {
        if (o.riderId) {
          const r = App.rider(o.riderId);
          box.innerHTML = '<div class="rider-card" style="border-top:1px solid var(--line)">' +
            '<div class="avatar">' + (o.riderEmoji || '🛵') + '</div>' +
            '<div class="grow"><div class="b">' + esc(o.riderName) + ' <span class="t-sm c-3">★ ' + (r ? r.rating : '4.9') + '</span></div>' +
              '<div class="t-sm c-3" style="margin-top:3px">' + esc(o.riderPhone) + ' · 已送 ' + (r ? r.orderCount : 0) + ' 单</div></div>' +
            '<div class="btn sm ghost" data-act="openChat" data-id="' + o.id + '">💬 消息</div>' +
            '<div class="btn sm ghost" data-act="call" data-name="' + esc(o.riderName) + '">📞</div>' +
          '</div>';
        } else {
          box.innerHTML = '<div class="rider-card" style="border-top:1px solid var(--line)">' +
            '<div class="avatar">⏳</div><div class="grow"><div class="b">正在为您分配骑手</div>' +
            '<div class="t-sm c-3" style="margin-top:3px">请稍候，系统正在派单…</div></div></div>';
        }
      }

      // 时间轴
      const tEl = $('#tkTimeline', pageEl);
      if (tEl) {
        tEl.innerHTML = tl.map((t, i) =>
          '<div class="tl-item ' + (i === tl.length - 1 ? 'on' : '') + '">' +
            '<div class="tl-dot"></div>' +
            '<div><div class="tl-text">' + esc(t.label) + '</div>' +
            '<div class="tl-time">' + hhmmss(t.time) + '</div></div></div>').join('') +
          (['completed', 'cancelled'].includes(o.status) ? '' :
            '<div class="tl-item"><div class="tl-dot"></div><div><div class="tl-text">' + esc(nextHint(o)) + '</div></div></div>');
      }

      // 地图数据
      const mv = pageEl._mv;
      if (mv) {
        const riderPos = o.riderPos || (App.rider(o.riderId) || {}).pos;
        const showRiderToShop = ['assigned', 'picking'].includes(o.status);
        const markers = [
          { x: o.shopPos.x, y: o.shopPos.y, emoji: shop ? shop.emoji : '🏪', label: '商家' },
          { x: o.address.pos.x, y: o.address.pos.y, emoji: '🏠', label: '我的位置' }
        ];
        mv.setData({
          rider: riderPos ? { x: riderPos.x, y: riderPos.y, heading: riderPos.heading || 0 } : null,
          path: o.route || [],
          traveled: showRiderToShop || ['delivering', 'arrived'].includes(o.status) ? (o.traveled || 0) : 0,
          markers: markers,
          pathColor: '#ffd100'
        });
      }


      const mi = $('#mapInfo', pageEl);
      if (mi) {
        if (o.status === 'assigned' || o.status === 'picking') {
          mi.innerHTML = '<div class="big">骑手正在赶往商家 🏪</div>' +
            '<div class="sub">剩余 ' + distCN(Math.max(0, (o.legTotal || 0) - (o.traveled || 0))) + ' · 约 ' + durCN(Math.max(0, ((o.legTotal || 0) - (o.traveled || 0)) / 5)) + '</div>';
        } else if (o.status === 'delivering' || o.status === 'arrived') {
          mi.innerHTML = '<div class="big">' + (o.status === 'arrived' ? '已到达目的地 🎉' : '骑手正在为您配送 🛵') + '</div>' +
            '<div class="sub">距您还有 ' + distCN(Math.max(0, (o.legTotal || 0) - (o.traveled || 0))) + ' · 约 ' + durCN(Math.max(0, ((o.legTotal || 0) - (o.traveled || 0)) / 5)) + '</div>';
        } else if (o.status === 'completed') {
          mi.innerHTML = '<div class="big">订单已完成 ✅</div><div class="sub">祝您用餐愉快</div>';
        } else {
          mi.innerHTML = '<div class="big">' + st(o) + '</div><div class="sub">' + esc(o.shopName) + ' · ' + esc(o.address.detail) + '</div>';
        }
      }
    }
  };

  function nextHint(o) {
    return {
      created: '等待商家接单', accepted: '商家出餐后自动派单', cooked: '正在分配骑手',
      assigned: '骑手到达商家后取餐', picking: '骑手取餐后开始配送',
      delivering: '骑手到达后请及时取餐', arrived: '请确认送达'
    }[o.status] || '';
  }

  /* ---------- 页面：全屏导航 ---------- */
  const pageNavFull = {
    sb: 'light',
    render(el, params, pageEl) {
      const o = App.order(params.id);
      if (!o) { el.innerHTML = '<div class="empty">订单不存在</div>'; return; }
      const shop = App.shop(o.shopId);
      el.innerHTML = '<div class="map-wrap" style="flex:1"><canvas id="fullCanvas"></canvas></div>';
      const canvas = $('#fullCanvas', pageEl);
      if (canvas) {
        pageEl._mv = window.MapView.create(canvas, {});
        pageEl._mv.start();
        mapView = pageEl._mv;
        setTimeout(() => { if (pageEl._mv) pageEl._mv.resize(); }, 30);
      }

      const panel = document.createElement('div');
      panel.className = 'nav-panel';
      panel.id = 'navPanel';
      panel.innerHTML = '<div class="turn"><span class="ico">🛵</span><div class="grow">' +
        '<div class="d" id="navDist">--</div><div class="s" id="navSub">正在计算路线…</div></div>' +
        '<div class="btn sm" style="background:#fff;color:#1579f3" data-act="back">收起</div></div>' +
        '<div class="row between" style="font-size:13px">' +
          '<span class="c-2">' + (o.status === 'delivering' ? '🏠 ' + esc(o.address.detail) : '🏪 ' + esc(o.shopName)) + '</span>' +
          '<span class="btn sm ghost" data-act="openChat" data-id="' + o.id + '">💬 联系</span>' +
        '</div>';
      pageEl.appendChild(panel);
      this.update(pageEl, params, el);
    },
    update(pageEl, params) {
      const o = App.order(params.id);
      const mv = pageEl._mv;
      if (!o || !mv) return;
      const shop = App.shop(o.shopId);
      const riderPos = o.riderPos || (App.rider(o.riderId) || {}).pos;
      mv.setData({
        rider: riderPos ? { x: riderPos.x, y: riderPos.y, heading: riderPos.heading || 0 } : null,
        path: o.route || [], traveled: o.traveled || 0,
        markers: [
          { x: o.shopPos.x, y: o.shopPos.y, emoji: shop ? shop.emoji : '🏪', label: '商家' },
          { x: o.address.pos.x, y: o.address.pos.y, emoji: '🏠', label: '目的地' }
        ],
        pathColor: '#ffd100'
      });
      const d = $('#navDist', pageEl), s = $('#navSub', pageEl);
      const remain = Math.max(0, (o.legTotal || 0) - (o.traveled || 0));
      if (d) d.textContent = distCN(remain);
      if (s) {
        s.textContent = (o.status === 'assigned' || o.status === 'picking' ? '前往商家取餐 · ' : '正在配送 · ') +
          '预计 ' + durCN(remain / 5) + ' 后到达';
      }
    }
  };

  /* ---------- 页面：聊天 ---------- */
  const pageChat = {
    sb: 'light',
    render(el, params, pageEl) {
      const o = App.order(params.id);
      if (!o) { el.innerHTML = '<div class="empty">订单不存在</div>'; return; }
      el.innerHTML =
        '<div class="chat-targets">' +
          '<span class="t ' + (chatTarget === 'rider' ? 'on' : '') + '" data-act="target" data-t="rider">🛵 骑手</span>' +
          '<span class="t ' + (chatTarget === 'merchant' ? 'on' : '') + '" data-act="target" data-t="merchant">🏪 商家</span>' +
        '</div>' +
        '<div class="chat-body" id="chatBody"><div style="text-align:center;color:#bbb;padding:20px">加载中…</div></div>' +
        '<div class="quick-bar">' + QUICK.map((q) => '<span class="quick-chip" data-act="quick" data-q="' + esc(q) + '">' + esc(q) + '</span>').join('') + '</div>' +
        '<div class="chat-input">' +
          '<input id="chatInput" placeholder="发消息…" />' +
          '<span class="chat-send" data-act="send">发送</span>' +
        '</div>';
      loadMessages(params.id).then(() => this.update(pageEl, params, el));
    },
    update(pageEl, params) {
      const o = App.order(params.id);
      if (!o) return;
      const body = $('#chatBody', pageEl);
      if (!body) return;
      const msgs = window.__messages__.filter((m) => m.orderId === params.id);
      const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60 || chatScrollKeep;
      body.innerHTML = msgs.length ? msgs.map((m) => {
        if (m.kind === 'system') return '<div class="sys-msg"><span>' + esc(m.text) + '</span></div>';
        const mine = m.from === 'user';
        if (!mine && ((m.from === 'rider' && chatTarget !== 'rider') || (m.from === 'merchant' && chatTarget !== 'merchant'))) return '';
        if (mine && m.to !== 'all' && m.to !== chatTarget) return '';
        return '<div class="msg-row ' + (mine ? 'me' : '') + '">' +
          '<div class="avatar sm">' + (mine ? '🙂' : (m.from === 'rider' ? '🛵' : '🏪')) + '</div>' +
          '<div><div class="bubble">' + esc(m.text) + '</div>' +
          '<div class="t-xs c-3" style="margin-top:4px;text-align:' + (mine ? 'right' : 'left') + '">' +
          esc(m.fromName) + ' ' + hhmm(m.ts) + '</div></div></div>';
      }).join('') : '<div style="text-align:center;color:#bbb;padding:20px">还没有消息，打个招呼吧 👋</div>';
      if (atBottom) body.scrollTop = body.scrollHeight;
      chatScrollKeep = false;
    }
  };

  function loadMessages(orderId) {
    return U.get('/api/orders/' + orderId + '/messages').then((list) => {
      const cur = window.__messages__;
      list.forEach((m) => { if (!cur.some((x) => x.id === m.id)) cur.push(m); });
      return list;
    }).catch(() => []);
  }

  /* ---------- 页面：我的 ---------- */
  const pageProfile = {
    sb: 'light',
    render(el) {
      const u = App.state.user || {};
      const orders = App.state.orders;
      el.innerHTML =
        '<div style="background:linear-gradient(135deg,#ffd100,#ffb300);padding:16px 14px 18px">' +
          '<div class="row">' +
            '<div class="avatar" style="width:56px;height:56px;font-size:32px;background:#fff">' + (u.avatar || '🙂') + '</div>' +
            '<div style="margin-left:12px;color:#3d2b00">' +
              '<div class="t-lg b">' + esc(u.name || '用户') + ' <span class="tag brand" style="background:#fff;color:#b8860b">黄金会员</span></div>' +
              '<div class="t-sm" style="margin-top:4px;opacity:.75">' + esc(u.phone || '') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="row" style="margin-top:14px;color:#3d2b00;text-align:center">' +
            ['红包/券:🎫:12', '收藏:⭐:8', '足迹:👣:36', '余额:💰:56.8'].map((s) => {
              const [t, e, n] = s.split(':');
              return '<div class="grow"><div class="b">' + n + '</div><div class="t-xs" style="opacity:.75">' + t + '</div></div>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div style="padding:10px">' +
          '<div class="card"><div class="pad">' +
            '<div class="b t-md" style="margin-bottom:10px">我的订单</div>' +
            '<div class="row" style="text-align:center">' +
              [['⏳', '待接单', orders.filter((o) => o.status === 'created').length],
               ['🍳', '备餐中', orders.filter((o) => ['accepted', 'cooked'].includes(o.status)).length],
               ['🛵', '配送中', orders.filter((o) => ['assigned', 'picking', 'delivering'].includes(o.status)).length],
               ['✅', '已完成', orders.filter((o) => o.status === 'completed').length]].map(([e, t, n]) =>
                '<div class="grow"><div style="font-size:22px">' + e + '</div><div class="t-xs c-2">' + t + '</div>' +
                '<div class="b">' + n + '</div></div>').join('') +
            '</div>' +
          '</div></div>' +
          '<div class="card"><div class="pad">' +
            '<div class="b t-md" style="margin-bottom:6px">我的地址</div>' +
            (u.addresses || []).map((a) =>
              '<div class="row" style="padding:9px 0;border-bottom:1px solid var(--line)">' +
                '<span class="tag ' + (a.tag === '家' ? '' : 'gray') + '">' + esc(a.tag) + '</span>' +
                '<span class="grow ellipsis t-md">' + esc(a.detail) + '</span>' +
                (a.id === (draft.addressId || (u.addresses[0] || {}).id) ? '<span class="t-xs c-brand">当前</span>' : '') +
              '</div>').join('') +
          '</div></div>' +
          '<div class="card"><div class="pad">' +
            [['🔔', '消息通知'], ['🎟️', '优惠券'], ['🛡️', '账号与安全'], ['📞', '客服中心'], ['⚙️', '设置']].map(([e, t], i, arr) =>
              '<div class="row" style="padding:12px 0;' + (i < arr.length - 1 ? 'border-bottom:1px solid var(--line)' : '') + '">' +
                '<span style="font-size:18px;margin-right:10px">' + e + '</span>' +
                '<span class="grow t-md">' + t + '</span><span class="c-3">›</span></div>').join('') +
          '</div></div>' +
          '<div style="padding:6px 0 20px;text-align:center">' +
            '<span class="btn sm ghost" data-act="reset">重置演示数据</span>' +
          '</div>' +
        '</div>';
    }
  };

  const pages = { home: pageHome, shop: pageShop, checkout: pageCheckout, orders: pageOrders, track: pageTrack, navFull: pageNavFull, chat: pageChat, profile: pageProfile };

  /* ---------- 地址选择弹层 ---------- */
  function pickAddr(pageEl) {
    const list = (App.state.user && App.state.user.addresses) || [];
    const mask = document.createElement('div');
    mask.className = 'mask';
    const pop = document.createElement('div');
    pop.className = 'cart-pop';
    pop.innerHTML = '<div class="head"><span class="grow b">选择收货地址</span><span class="c-3" data-act="closePop">关闭</span></div>' +
      '<div class="list">' + list.map((a) =>
        '<div class="ci" data-act="chooseAddr" data-id="' + a.id + '">' +
          '<span class="tag ' + (a.id === curAddr().id ? '' : 'gray') + '">' + esc(a.tag) + '</span>' +
          '<span class="grow"><div>' + esc(a.detail) + '</div>' +
          '<div class="t-xs c-3" style="margin-top:3px">' + esc(a.name) + ' ' + esc(a.phone) + '</div></span>' +
          (a.id === curAddr().id ? '<span class="c-brand t-sm">✓</span>' : '') +
        '</div>').join('') + '</div>';
    mask.addEventListener('click', () => { mask.remove(); pop.remove(); });
    pageEl.appendChild(mask);
    pageEl.appendChild(pop);
  }

  /* ---------- 事件 ---------- */
  function bind() {
    delegate($('#screen'), (act, ds, el, e) => {
      const pageEl = Nav.top() ? Nav.top().el : null;
      switch (act) {
        case 'kong': toast('「' + ds.name + '」频道开发中'); break;
        case 'sort': sortMode = ds.k; Nav.refresh(); break;
        case 'openShop':
          if (cart.shopId && cart.shopId !== ds.id && cartCount()) { cart = { shopId: ds.id, items: {} }; toast('已切换店铺，购物车已清空'); }
          else cart.shopId = ds.id;
          activeCat = null;
          go('shop', { id: ds.id });
          break;
        case 'cat': {
          activeCat = ds.cat;
          const list = $('#menuList', pageEl);
          const t = list && list.querySelector('[data-cat-title="' + ds.cat + '"]');
          if (t && list) list.scrollTop = t.offsetTop - 4;
          pageEl.querySelectorAll('.menu-cats .cat').forEach((c) => c.classList.toggle('on', c.dataset.cat === ds.cat));
          break;
        }
        case 'add':
          if (!cart.shopId) cart.shopId = App.state.dishes.find((d) => d.id === ds.id).shopId;
          cart.items[ds.id] = (cart.items[ds.id] || 0) + 1;
          Nav.refresh();
          break;
        case 'sub':
          if (cart.items[ds.id]) { cart.items[ds.id] -= 1; if (cart.items[ds.id] <= 0) delete cart.items[ds.id]; }
          Nav.refresh();
          break;
        case 'toggleCart': renderCartPop(pageEl); break;
        case 'clearCart': cart.items = {}; Nav.refresh(); break;
        case 'toCheckout':
          if (!cartCount()) { toast('请先选择商品'); break; }
          go('checkout', { shopId: cart.shopId });
          break;
        case 'pickAddr': pickAddr(pageEl); break;
        case 'chooseAddr': draft.addressId = ds.id; Nav.refresh(); break;
        case 'closePop': pageEl.querySelectorAll('.mask,.cart-pop').forEach((x) => x.remove()); break;
        case 'tableware': draft.tableware = +ds.n; Nav.refresh(); break;
        case 'pay': draft.pay = ds.p; Nav.refresh(); break;
        case 'submitOrder': submitOrder(ds.shop); break;
        case 'openTrack': go('track', { id: ds.id }); break;
        case 'fullNav': go('navFull', { id: Nav.top().params.id }); break;
        case 'back': back(); break;
        case 'refit': if (mapView) mapView.refit(); break;
        case 'zoomIn': if (mapView) mapView.zoom(1.3); break;
        case 'zoomOut': if (mapView) mapView.zoom(1 / 1.3); break;
        case 'openChat': go('chat', { id: ds.id }); break;
        case 'call': toast('正在呼叫 ' + ds.name + '…（演示）'); break;
        case 'confirm':
          U.post('/api/orders/' + ds.id + '/action', { act: 'user_confirm', actor: 'user' }).then(() => toast('已确认送达，感谢您的信任 🎉'));
          break;
        case 'cancel':
          U.post('/api/orders/' + ds.id + '/action', { act: 'user_cancel', actor: 'user' }).then(() => toast('订单已取消'));
          break;
        case 'target': chatTarget = ds.t; Nav.refresh(); break;
        case 'quick': {
          const input = $('#chatInput', pageEl);
          if (input) { input.value = ds.q; sendMsg(pageEl, Nav.top().params.id); }
          break;
        }
        case 'send': sendMsg(pageEl, Nav.top().params.id); break;
        case 'goHome': reset('home'); break;
        case 'reset':
          U.post('/api/reset', {}).then(() => { cart = { shopId: null, items: {} }; toast('演示数据已重置'); setTimeout(() => location.reload(), 600); });
          break;
        default: break;
      }
    });

    // 输入框回车发送
    $('#screen').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'chatInput') {
        e.preventDefault();
        sendMsg(Nav.top().el, Nav.top().params.id);
      }
    });

    $('#tabbar').addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) reset(t.dataset.tab);
    });
  }

  function sendMsg(pageEl, orderId) {
    const input = $('#chatInput', pageEl);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    chatScrollKeep = true;
    U.post('/api/orders/' + orderId + '/messages', { from: 'user', to: chatTarget, text }).then(() => {
      Nav.refresh();
    });
  }

  function submitOrder(shopId) {
    const items = Object.keys(cart.items).filter((id) => cart.items[id] > 0)
      .map((id) => ({ dishId: id, qty: cart.items[id] }));
    if (!items.length) { toast('购物车为空'); return; }
    const addr = curAddr();
    U.post('/api/orders', {
      shopId, items, addressId: addr.id,
      remark: draft.remark, tableware: draft.tableware, payMethod: draft.pay
    }).then((r) => {
      if (r.error) { toast(r.error); return; }
      cart = { shopId: null, items: {} };
      draft.remark = '';
      toast('下单成功，等待商家接单 🎉');
      reset('orders');
      go('track', { id: r.order.id });
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    U.startClock();
    Nav.init($('#screen'), pages);
    bind();
    setSB('brand');
    Nav.reset('home', {}, true);
    updateTabActive();
    App.connect('user');

    App.on((s, reason) => {
      if (reason === 'hello') { Nav.refresh(); updateTabActive(); return; }
      if (reason === 'message') { Nav.refresh(); return; }
      if (reason === 'orders') {
        const top = Nav.top();
        if (top && ['track', 'navFull', 'orders', 'chat'].includes(top.name)) Nav.refresh();
        updateTabActive();
      }
    });

    // 物理返回
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') back(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
