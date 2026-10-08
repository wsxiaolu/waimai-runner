/* 前端 DOM 冒烟：用 jsdom 真实执行三个端的 JS，验证渲染与交互无报错 */
const { JSDOM, VirtualConsole } = require('jsdom');
// 用 127.0.0.1 而非 localhost：环境里配置了 HTTP 代理，会劫持 localhost 请求
const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3000);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function mockCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 24 });
      if (k === 'canvas') return null;
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

async function open(path, role) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.message || e)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = await JSDOM.fromURL(BASE + path, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = () => mockCtx();
      // 浏览器会基于 baseURI 解析相对路径，jsdom 注入的 node fetch 不会，这里补齐
      window.fetch = (u, o) => fetch(new URL(u, BASE).href, o);
      window.Headers = Headers; window.Request = Request; window.Response = Response;
      window.WebSocket = WebSocket;
      window.AudioContext = undefined;
    }
  });
  dom.window.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || e.error)));
  dom.window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + (e.reason && e.reason.message || e.reason)));
  // 等待 WS hello 完成首屏渲染
  for (let i = 0; i < 40; i++) {
    await wait(150);
    if (dom.window.document.querySelector('.page')) {
      const has = dom.window.document.querySelector('.shop-card, .task-card, .m-order, .empty');
      if (has) break;
    }
  }
  return { dom, doc: dom.window.document, win: dom.window, errors };
}

function click(doc, sel, root) {
  const el = (root || doc).querySelector(sel);
  if (!el) throw new Error('找不到元素：' + sel);
  el.dispatchEvent(new (doc.defaultView.MouseEvent)('click', { bubbles: true, cancelable: true }));
  return el;
}
function count(doc, sel) { return doc.querySelectorAll(sel).length; }
function assert(cond, msg) { if (!cond) throw new Error('断言失败：' + msg); console.log('   ✓ ' + msg); }

(async () => {
  /* ---------- 用户端 ---------- */
  console.log('== 用户端 /user.html ==');
  let { dom, doc, win, errors } = await open('/user.html', 'user');
  assert(count(doc, '.shop-card') >= 10, '首页渲染出 ' + count(doc, '.shop-card') + ' 家商家');
  assert(count(doc, '.kong-item') >= 8, '金刚区分类 ' + count(doc, '.kong-item') + ' 个');
  assert(doc.querySelector('.tab.on'), '底部 TabBar 高亮正常');

  click(doc, '.shop-card');
  await wait(300);
  assert(doc.querySelector('.menu-list'), '已进入商家详情页（菜单容器存在）');
  assert(count(doc, '.dish-row') > 0, '菜单渲染 ' + count(doc, '.dish-row') + ' 个菜品');
  assert(count(doc, '.menu-cats .cat') > 0, '左侧分类 ' + count(doc, '.menu-cats .cat') + ' 个');

  click(doc, '.dish-row .plus');
  await wait(250);
  assert(doc.querySelector('.cart-icon .n'), '加入购物车后角标出现：' + (doc.querySelector('.cart-icon .n') || {}).textContent);
  click(doc, '.dish-row .plus');
  await wait(250);
  click(doc, '.cart-go');
  await wait(350);
  assert(doc.querySelector('#remarkInput'), '进入确认订单页');

  const input = doc.querySelector('#remarkInput');
  input.value = '不要香菜';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  click(doc, '[data-act="submitOrder"]');
  await wait(1200);
  assert(count(doc, '.order-card') >= 1 || doc.querySelector('.tl-item'), '下单成功，进入订单跟踪页');
  assert(doc.querySelector('#trackCanvas'), '订单跟踪页地图 canvas 已渲染');
  assert(count(doc, '.tl-item') >= 1, '配送时间轴 ' + count(doc, '.tl-item') + ' 条');

  // 聊天页
  const chatBtn = doc.querySelector('[data-act="openChat"]');
  if (chatBtn) {
    chatBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(600);
    assert(doc.querySelector('#chatInput'), '聊天页输入框存在');
    const ci = doc.querySelector('#chatInput');
    ci.value = '骑手到哪了？';
    click(doc, '[data-act="send"]');
    await wait(800);
    assert(count(doc, '.bubble') >= 1, '消息气泡已渲染：' + count(doc, '.bubble') + ' 条');
  }
  // 悬浮「切换端」按钮
  assert(count(doc, '.switch-fab') === 1, '右下角「切换端」悬浮按钮已渲染');
  click(doc, '.switch-fab');
  await wait(200);
  assert(!!doc.querySelector('.switch-menu.show'), '点击后弹出切换菜单');
  assert(count(doc, '.sm-item') === 4, '菜单含 4 个入口：' + Array.from(doc.querySelectorAll('.sm-n')).map((e) => e.textContent).join('/'));
  assert(!!doc.querySelector('.sm-item.on'), '菜单标出了当前所在端');

  assert(errors.length === 0, '用户端无 JS 报错' + (errors.length ? '：' + errors.join(' | ') : ''));
  dom.window.close();

  /* ---------- 准备一个「已出餐待配送」订单，供骑手端/商家端验证 ---------- */
  await fetch(BASE + '/api/reset', { method: 'POST' });
  await wait(300);
  const boot = await (await fetch(BASE + '/api/bootstrap?role=user')).json();
  const shop0 = boot.shops[0];
  const dishes0 = boot.dishes.filter((d) => d.shopId === shop0.id).slice(0, 2);
  const created = await (await fetch(BASE + '/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shopId: shop0.id, items: dishes0.map((d) => ({ dishId: d.id, qty: 1 })),
      addressId: boot.user.addresses[0].id, remark: '测试订单'
    })
  })).json();
  const oid = created.order.id;
  const act = (a) => fetch(BASE + '/api/orders/' + oid + '/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ act: a, actor: 'merchant', riderId: 'r1' })
  });
  await act('merchant_accept');
  await act('merchant_cooked');   // 出餐后系统派单给最近骑手
  await wait(600);

  /* ---------- 骑手端 ---------- */
  console.log('\n== 骑手端 /rider.html ==');
  ({ dom, doc, win, errors } = await open('/rider.html', 'rider'));
  assert(doc.querySelector('.rider-top'), '骑手端顶部收入卡渲染');
  await wait(1200);
  const tasks = count(doc, '.task-card');
  console.log('   当前任务卡片：' + tasks + ' 个');
  assert(tasks >= 1, '骑手端收到派单任务');
  const openBtn = doc.querySelector('[data-act="openTask"]');
  openBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(600);
  assert(doc.querySelector('#taskCanvas'), '任务导航地图 canvas 已渲染');
  assert(doc.querySelector('.nav-panel'), '导航面板存在，剩余：' + (doc.querySelector('#tkDist') || {}).textContent);
  // 骑手聊天页
  const rChat = doc.querySelector('[data-act="openChat"]');
  if (rChat) {
    rChat.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(600);
    assert(doc.querySelector('#chatInput'), '骑手端聊天页渲染');
    const ci = doc.querySelector('#chatInput');
    ci.value = '您好，我是骑手，正在赶来';
    click(doc, '[data-act="send"]');
    await wait(700);
    assert(count(doc, '.bubble') >= 1, '骑手消息气泡：' + count(doc, '.bubble') + ' 条');
  }
  assert(errors.length === 0, '骑手端无 JS 报错' + (errors.length ? '：' + errors.join(' | ') : ''));
  dom.window.close();

  /* ---------- 商家端 ---------- */
  console.log('\n== 商家端 /merchant.html ==');
  ({ dom, doc, win, errors } = await open('/merchant.html', 'merchant'));
  assert(doc.querySelector('.m-top'), '商家端顶部营收卡渲染');
  assert(count(doc, '.m-tabs .t') === 5, '订单 Tab ' + count(doc, '.m-tabs .t') + ' 个');
  for (const k of ['pending', 'cooking', 'waiting', 'sending', 'done']) {
    click(doc, '[data-act="tab"][data-k="' + k + '"]');
    await wait(250);
    const n = count(doc, '.m-order') + count(doc, '.empty');
    assert(n >= 1, 'Tab[' + k + '] 渲染正常（' + count(doc, '.m-order') + ' 单）');
  }
  click(doc, '[data-act="tab"][data-k="waiting"]');
  await wait(300);
  assert(count(doc, '.m-order') >= 1, '待取餐 Tab 有订单');
  const mChat = doc.querySelector('[data-act="openChat"]');
  if (mChat) {
    mChat.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(600);
    assert(doc.querySelector('#chatInput'), '商家端聊天页渲染');
  }
  assert(errors.length === 0, '商家端无 JS 报错' + (errors.length ? '：' + errors.join(' | ') : ''));
  dom.window.close();

  console.log('\n✅ 三端 DOM 冒烟测试通过');
  process.exit(0);
})().catch(async (e) => {
  console.error('\n❌ 失败：' + e.message);
  process.exit(1);
});
