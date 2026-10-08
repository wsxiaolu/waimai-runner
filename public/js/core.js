/* ============ 前端公共核心：API / WebSocket / 导航 / 工具 ============ */
(function () {
  'use strict';

  /* ---------- 工具 ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function money(n) { return (Math.round((+n || 0) * 100) / 100).toFixed(2); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function hhmm(ts) { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function hhmmss(ts) { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
  function durCN(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + ' 秒';
    const m = Math.floor(sec / 60);
    if (m < 60) return m + ' 分钟';
    return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
  }
  function agoCN(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  }
  function distCN(m) {
    m = Math.round(m || 0);
    return m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm';
  }

  async function get(url) { const r = await fetch(url); return r.json(); }
  async function post(url, body) {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return r.json();
  }

  /* ---------- 全局状态 & 实时通道 ---------- */
  const App = {
    role: 'user',
    state: { user: null, shops: [], dishes: [], riders: [], orders: [], merchant: {}, categories: [] },
    _subs: [], _ticks: [], _msgSubs: [],
    ws: null,

    on(fn) { this._subs.push(fn); return fn; },
    onTick(fn) { this._ticks.push(fn); return fn; },
    onMessage(fn) { this._msgSubs.push(fn); return fn; },
    fire(reason) { this._subs.forEach((f) => { try { f(this.state, reason); } catch (e) { console.error(e); } }); },
    fireTick() { this._ticks.forEach((f) => { try { f(this.state); } catch (e) { console.error(e); } }); },

    connect(role) {
      this.role = role || 'user';
      document.body.classList.add('role-' + this.role);
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(proto + '://' + location.host + '/ws?role=' + this.role);
      this.ws = ws;
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        const p = msg.payload;
        switch (msg.type) {
          case 'hello':
            this.state = Object.assign(this.state, p);
            this.fire('hello');
            break;
          case 'orders':
            this.state.orders = p;
            this.fire('orders');
            break;
          case 'riders':
            this.state.riders = p;
            this.fireTick();
            break;
          case 'merchant':
            this.state.merchant = p;
            this.fire('merchant');
            break;
          case 'message':
            this._msgSubs.forEach((f) => f(p));
            this.fire('message');
            break;
          default: break;
        }
      };
      ws.onclose = () => {
        setTimeout(() => this.connect(this.role), 1500);
      };
      return ws;
    },

    /* 数据查询 */
    shop(id) { return this.state.shops.find((s) => s.id === id); },
    dishes(shopId) { return this.state.dishes.filter((d) => d.shopId === shopId); },
    order(id) { return this.state.orders.find((o) => o.id === id); },
    rider(id) { return this.state.riders.find((r) => r.id === id); },
    riderOf(order) { return order && order.riderId ? this.rider(order.riderId) : null; },
    messages(orderId) { return window.__messages__ ? window.__messages__.filter((m) => m.orderId === orderId) : []; }
  };

  /* 消息缓存：进入聊天页时拉取，WS 推送时追加 */
  window.__messages__ = [];
  App.onMessage((m) => {
    window.__messages__.push(m);
  });

  /* ---------- Toast ---------- */
  function toast(text, ms) {
    const host = $('#phone') || document.body;
    let t = $('.toast', host);
    if (t) t.remove();
    t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    host.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, ms || 1800);
  }

  /* ---------- 页面导航栈 ---------- */
  const Nav = {
    stack: [],
    host: null,
    pages: {},
    init(host, pages) { this.host = host; this.pages = pages; },
    go(name, params, opts) {
      const def = this.pages[name];
      if (!def) return;
      const el = document.createElement('div');
      el.className = 'page' + ((opts && opts.silent) ? '' : ' enter');
      el.dataset.page = name;
      el.innerHTML = '<div class="page-scroll" style="flex:1;display:flex;flex-direction:column;overflow-y:auto"></div>';
      const scroll = el.firstChild;
      // 必须先入 DOM 再渲染：地图 canvas 需要真实的容器尺寸
      this.host.appendChild(el);
      def.render(scroll, params || {}, el);
      this.stack.push({ name, el, params, render: def.render, scroll });
      if (def.onEnter) def.onEnter(el, params || {});
      this._sync();
    },
    replace(name, params) {
      this.reset(name, params, true);
    },
    /** 回到指定页面（若栈中不存在则重置栈） */
    reset(name, params, silent) {
      this.stack.forEach((s) => s.el.remove());
      this.stack = [];
      this.go(name, params, { silent: !!silent });
    },
    back() {
      if (this.stack.length <= 1) return false;
      const cur = this.stack.pop();
      cur.el.remove();
      this._sync();
      return true;
    },
    top() { return this.stack[this.stack.length - 1]; },
    /** 重新渲染栈顶页面（保留滚动位置与已输入的草稿） */
    refresh() {
      const t = this.top();
      if (!t) return;
      const def = this.pages[t.name];
      if (def && def.update) { def.update(t.el, t.params || {}, t.scroll); return; }
      const st = t.scroll.scrollTop;
      Array.prototype.slice.call(t.el.children).forEach((c) => { if (c !== t.scroll) c.remove(); });
      t.render(t.scroll, t.params || {}, t.el);
      t.scroll.scrollTop = st;
      if (def && def.onEnter) def.onEnter(t.el, t.params || {});
    },
    _sync() {
      // 只有栈顶可交互
      this.stack.forEach((s, i) => { s.el.style.pointerEvents = i === this.stack.length - 1 ? 'auto' : 'none'; });
      if (typeof updateTabActive === 'function') updateTabActive();
    }
  };

  /* ---------- 状态栏时钟 ---------- */
  function startClock() {
    function paint() {
      const d = new Date();
      $$('#phone .status-bar .sb-time').forEach((el) => { el.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()); });
    }
    paint();
    setInterval(paint, 10000);
  }

  /* ---------- 事件委托 ---------- */
  function delegate(root, handler) {
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      e.preventDefault();
      handler(el.dataset.act, el.dataset, el, e);
    });
  }

  /** 订单状态 → 用户端文案 */
  function statusText(st, statusMap) {
    const map = statusMap || {
      created: '等待商家接单', accepted: '商家备餐中', cooked: '餐品已备好',
      assigned: '骑手赶往商家', picking: '骑手取餐中', delivering: '骑手配送中',
      arrived: '已送达待确认', completed: '已完成', cancelled: '已取消'
    };
    return map[st] || st;
  }

  window.App = App;
  window.Nav = Nav;
  window.U = { $, $$, esc, money, hhmm, hhmmss, durCN, agoCN, distCN, get, post, toast, delegate, startClock, statusText, pad2 };
})();
