/* 切换身份测试：可反复切换、随时退出再登录，切换过程中订单与聊天始终保留 */
const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3000);

async function get(p, token) {
  const r = await fetch(BASE + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  return r.json();
}
async function post(p, b, token) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(b || {})
  });
  return { status: r.status, body: await r.json() };
}
function assert(c, m) { if (!c) throw new Error('断言失败：' + m); console.log('   ✓ ' + m); }

(async () => {
  const uname = 'switch' + Math.floor(Math.random() * 100000);
  const pwd = 'secret123';

  console.log('== 1. 注册并下单 ==');
  let r = await post('/api/auth/register', { username: uname, password: pwd, nickname: '切换测试' });
  const token = r.body.token;
  const boot = await get('/api/bootstrap?role=user', token);
  const shop = boot.shops[3];
  const dishes = boot.dishes.filter((d) => d.shopId === shop.id).slice(0, 2);
  const ord = await post('/api/orders', {
    shopId: shop.id, items: dishes.map((d) => ({ dishId: d.id, qty: 1 })),
    addressId: boot.user.addresses[0].id, remark: '切换测试订单'
  }, token);
  const oid = ord.body.order.id;
  assert(!!oid, '下单成功：' + ord.body.order.code);

  // 发一条消息，验证聊天也保留
  await post('/api/orders/' + oid + '/messages', { from: 'user', to: 'rider', text: '切换测试消息' }, token);

  console.log('== 2. 反复切换身份，订单始终保留 ==');
  for (const role of ['rider', 'merchant', 'user', 'rider', 'user']) {
    const v = await post('/api/auth/verify', { password: pwd }, token);
    assert(v.body.ok, `切换到 ${role} 端：密码验证通过`);
    const b = await get('/api/bootstrap?role=' + role, token);
    const found = (b.orders || []).find((o) => o.id === oid);
    assert(!!found, `切到 ${role} 端后订单仍在（状态 ${found ? found.status : '丢失'}）`);
    if (role === 'rider') {
      const msgs = await get('/api/orders/' + oid + '/messages');
      assert(msgs.some((m) => m.text === '切换测试消息'), '骑手端仍能看到订单里的聊天记录');
    }
  }

  console.log('== 3. 错误密码不允许切换 ==');
  r = await post('/api/auth/verify', { password: 'wrong' }, token);
  assert(!r.body.ok, '错误密码被拒绝：' + r.body.error);
  const still = await get('/api/auth/me', token);
  assert(still.user && still.user.username === uname, '验证失败后登录态不受影响');

  console.log('== 4. 退出登录后重新登录，订单照旧 ==');
  await post('/api/auth/logout', {}, token);
  const afterOut = await get('/api/auth/me', token);
  assert(afterOut.error === '未登录', '退出后 token 失效');

  const relogin = await post('/api/auth/login', { username: uname, password: pwd });
  const token2 = relogin.body.token;
  assert(!!token2, '重新登录成功');
  const b2 = await get('/api/bootstrap?role=user', token2);
  const found2 = (b2.orders || []).find((o) => o.id === oid);
  assert(!!found2, '重新登录后原订单仍在（' + (found2 ? found2.status : '丢失') + '）');
  const msgs2 = await get('/api/orders/' + oid + '/messages');
  assert(msgs2.some((m) => m.text === '切换测试消息'), '重新登录后聊天记录仍在');

  console.log('== 5. 切换期间配送状态机不中断 ==');
  await new Promise((r2) => setTimeout(r2, 6000));
  const b3 = await get('/api/bootstrap?role=user', token2);
  const now = (b3.orders || []).find((o) => o.id === oid);
  assert(now && (now.timeline || []).length >= 2, '订单进度持续推进，已产生 ' + (now ? now.timeline.length : 0) + ' 条时间轴');

  console.log('\n✅ 切换身份测试通过');
  process.exit(0);
})().catch((e) => { console.error('\n❌ 失败：' + e.message); process.exit(1); });
