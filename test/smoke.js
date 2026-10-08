/* 冒烟测试：下单 → 商家接单 → 骑手取餐 → 送达 → 聊天，全链路验证 */
// 用 127.0.0.1 而非 localhost：环境里配置了 HTTP 代理，会劫持 localhost 请求
const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3000);

async function get(p) { const r = await fetch(BASE + p); return r.json(); }
async function post(p, b) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  return r.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('== 1. bootstrap ==');
  const boot = await get('/api/bootstrap?role=user');
  console.log('   商家', boot.shops.length, '| 菜品', boot.dishes.length, '| 骑手', boot.riders.length, '| 地址', boot.user.addresses.length);
  if (!boot.shops.length || !boot.dishes.length) throw new Error('种子数据为空');

  console.log('== 2. 下单 ==');
  const shop = boot.shops[2];
  const dishes = boot.dishes.filter((d) => d.shopId === shop.id).slice(0, 2);
  const res = await post('/api/orders', {
    shopId: shop.id,
    items: dishes.map((d) => ({ dishId: d.id, qty: 1 })),
    addressId: boot.user.addresses[0].id,
    remark: '不要香菜', tableware: 1, payMethod: '微信支付'
  });
  if (!res.order) throw new Error('下单失败：' + JSON.stringify(res));
  const oid = res.order.id;
  console.log('   订单', res.order.code, '金额 ¥' + res.order.total, '状态', res.order.status);

  console.log('== 3. 状态机推进（最多 90 秒）==');
  const seen = [];
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < 90000) {
    const orders = await get('/api/orders');
    const o = orders.find((x) => x.id === oid);
    if (!o) throw new Error('订单丢失');
    if (o.status !== last) {
      seen.push(o.status);
      console.log('   [' + ((Date.now() - t0) / 1000).toFixed(1) + 's] ' + o.status +
        (o.riderName ? ' · 骑手 ' + o.riderName : '') +
        (o.traveled != null && o.legTotal ? ' · 行程 ' + Math.round(o.traveled) + '/' + Math.round(o.legTotal) : ''));
      last = o.status;
    }
    if (o.status === 'completed') break;
    await sleep(700);
  }
  if (last !== 'completed') throw new Error('订单未能在 90 秒内完成，最后状态：' + last);
  console.log('   状态序列:', seen.join(' → '));

  console.log('== 4. 聊天 ==');
  const m1 = await post('/api/orders/' + oid + '/messages', { from: 'user', to: 'rider', text: '骑手到哪了？' });
  console.log('   用户发送:', m1.message && m1.message.text);
  await sleep(4200);
  const msgs = await get('/api/orders/' + oid + '/messages');
  console.log('   消息总数:', msgs.length);
  msgs.filter((m) => m.kind === 'chat').forEach((m) => console.log('     -', m.fromName + ':', m.text));
  if (!msgs.some((m) => m.from === 'rider')) throw new Error('骑手未自动回复');

  console.log('== 5. 骑手 / 商家数据 ==');
  const riders = await get('/api/bootstrap?role=rider');
  console.log('   骑手收入:', riders.riders.map((r) => r.name + ' ¥' + r.income + '(' + r.status + ')').join(', '));
  const m = await get('/api/bootstrap?role=merchant');
  console.log('   商家营收: ¥' + m.merchant.income, '| 今日订单', m.merchant.todayOrders);

  console.log('\n✅ 全链路冒烟测试通过');
})().catch((e) => { console.error('\n❌ 测试失败：', e.message); process.exit(1); });
