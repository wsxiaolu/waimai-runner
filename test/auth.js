/* 账号链路测试：注册 → 登录 → 切换身份密码验证 → 带 token 下单 */
// 用 127.0.0.1 而非 localhost：环境里配置了 HTTP 代理，会劫持 localhost 请求
const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3000);

async function get(p, token) {
  const r = await fetch(BASE + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  return r.json();
}
async function post(p, b, token) {
  const r = await fetch(BASE + p, {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(b || {})
  });
  return { status: r.status, body: await r.json() };
}
function assert(c, m) { if (!c) throw new Error('断言失败：' + m); console.log('   ✓ ' + m); }

(async () => {
  const uname = 'tester' + Math.floor(Math.random() * 100000);

  console.log('== 1. 注册 ==');
  let r = await post('/api/auth/register', { username: uname, password: 'secret123', nickname: '测试员' });
  assert(r.body.ok && r.body.token, '注册成功，返回 token');
  const token = r.body.token;

  r = await post('/api/auth/register', { username: uname, password: 'secret123' });
  assert(!r.body.ok && r.body.error.includes('已被注册'), '重复用户名被拒绝：' + r.body.error);

  r = await post('/api/auth/register', { username: 'ab', password: '123' });
  assert(!r.body.ok, '弱用户名/短密码被拒绝：' + r.body.error);

  console.log('== 2. 登录 ==');
  r = await post('/api/auth/login', { username: uname, password: 'wrongpwd' });
  assert(!r.body.ok && r.body.error === '密码错误', '错误密码被拒绝');

  r = await post('/api/auth/login', { username: uname, password: 'secret123' });
  assert(r.body.ok && r.body.token, '正确密码登录成功');
  assert(r.body.user && r.body.user.roles.length === 3, '账号具备三种身份：' + r.body.user.roles.join('/'));

  console.log('== 3. 演示账号 ==');
  let d = await post('/api/auth/login', { username: 'demo', password: '123456' });
  assert(d.body.ok, '内置演示账号 demo/123456 可登录');

  console.log('== 4. 切换身份需输密码 ==');
  r = await post('/api/auth/verify', { password: 'wrong' }, token);
  assert(!r.body.ok && r.body.error.includes('密码错误'), '错误密码无法切换身份');
  r = await post('/api/auth/verify', { password: 'secret123' }, token);
  assert(r.body.ok, '正确密码允许切换身份');

  r = await post('/api/auth/verify', { password: 'secret123' });
  assert(r.status === 401, '未登录时切换身份返回 401');

  console.log('== 5. token 鉴权 ==');
  const me = await get('/api/auth/me', token);
  assert(me.user && me.user.username === uname, '/api/auth/me 返回当前账号');
  const noMe = await get('/api/auth/me');
  assert(noMe.error === '未登录', '无 token 访问 /api/auth/me 被拒绝');

  console.log('== 6. 带 token 下单 ==');
  const boot = await get('/api/bootstrap?role=user', token);
  assert(boot.me && boot.me.username === uname, 'bootstrap 返回登录态 me');
  const shop = boot.shops[1];
  const dishes = boot.dishes.filter((x) => x.shopId === shop.id).slice(0, 2);
  const ord = await post('/api/orders', {
    shopId: shop.id, items: dishes.map((x) => ({ dishId: x.id, qty: 1 })),
    addressId: boot.user.addresses[0].id
  }, token);
  assert(ord.body.order && ord.body.order.userId === boot.me.id, '订单归属登录账号：' + ord.body.order.userId);

  console.log('== 7. 登出 ==');
  await post('/api/auth/logout', {}, token);
  const after = await get('/api/auth/me', token);
  assert(after.error === '未登录', '登出后 token 失效');

  console.log('\n✅ 账号链路测试通过');
  process.exit(0);
})().catch((e) => { console.error('\n❌ 失败：' + e.message); process.exit(1); });
