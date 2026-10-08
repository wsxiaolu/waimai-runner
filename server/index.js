/**
 * 外卖跑腿 Demo 服务端：Express(REST) + WebSocket(实时推送) + 配送模拟引擎
 */
const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');

const store = require('./store');
const auth = require('./auth');
const { createEngine, STATUS_TEXT } = require('./sim');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '2mb' }));

/* ---------- 账号鉴权：Authorization: Bearer <token> 或 ?token= ---------- */
app.use((req, res, next) => {
  const h = req.headers.authorization || '';
  const token = (h.replace(/^Bearer\s+/i, '').trim()) || req.query.token || (req.body && req.body.token);
  req.user = auth.userByToken(token);
  next();
});

/* ---------- 实时广播总线 ---------- */
const clients = new Set();
function emit(msg) {
  const data = JSON.stringify(msg);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); } catch (e) { /* ignore */ }
    }
  });
}

const engine = createEngine(emit);

/* ---------- 静态资源 ---------- */
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

/* ---------- 数据视图 ---------- */
function bootstrap(role, user) {
  const db = store.get();
  return {
    role: role || 'user',
    me: user ? auth.publicUser(user) : null,
    statusText: STATUS_TEXT,
    user: db.user,
    shops: db.shops,
    dishes: db.dishes,
    riders: db.riders.map(engine.shortRider),
    orders: db.orders,
    merchant: db.merchant,
    categories: db.categories,
    serverTime: Date.now(),
    speed: 12
  };
}

app.get('/api/bootstrap', (req, res) => {
  res.json(bootstrap(req.query.role, req.user));
});

/* ---------- 账号 ---------- */
app.post('/api/auth/register', (req, res) => {
  try {
    const r = auth.register(req.body.username, req.body.password, req.body.nickname);
    res.json({ ok: true, user: r.user, token: r.token });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const r = auth.login(req.body.username, req.body.password);
    res.json({ ok: true, user: r.user, token: r.token });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  res.json({ ok: true, user: auth.publicUser(req.user) });
});

app.post('/api/auth/logout', (req, res) => {
  const h = req.headers.authorization || '';
  auth.logout((h.replace(/^Bearer\s+/i, '').trim()) || req.body.token);
  res.json({ ok: true });
});

/** 切换商家 / 骑手 / 用户身份前，校验密码 */
app.post('/api/auth/verify', (req, res) => {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  try {
    auth.verifyPassword(req.user.id, req.body.password);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/shops', (req, res) => {
  const db = store.get();
  res.json(db.shops);
});

app.get('/api/shops/:id', (req, res) => {
  const db = store.get();
  const shop = db.shops.find((s) => s.id === req.params.id);
  if (!shop) return res.status(404).json({ error: '商家不存在' });
  res.json({ shop, dishes: db.dishes.filter((d) => d.shopId === shop.id) });
});

app.get('/api/orders', (req, res) => {
  const db = store.get();
  res.json(db.orders);
});

app.post('/api/orders', (req, res) => {
  try {
    const body = Object.assign({}, req.body || {}, { userId: (req.user && req.user.id) || 'u1' });
    const order = engine.createOrder(body);
    res.json({ ok: true, order });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/orders/:id/action', (req, res) => {
  try {
    const order = engine.action(req.params.id, req.body.act, req.body.actor, req.body);
    res.json({ ok: true, order });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/orders/:id/messages', (req, res) => {
  const db = store.get();
  res.json(db.messages.filter((m) => m.orderId === req.params.id));
});

app.post('/api/orders/:id/messages', (req, res) => {
  const { from, to, text } = req.body || {};
  if (from === 'rider' || from === 'merchant') engine.cancelAutoReply(req.params.id, from);
  const msg = engine.sendMessage(req.params.id, from || 'user', to || 'all', text);
  res.json({ ok: true, message: msg });
});

app.post('/api/riders/:id/toggle', (req, res) => {
  const db = store.get();
  const rider = db.riders.find((r) => r.id === req.params.id);
  if (!rider) return res.status(404).json({ error: '骑手不存在' });
  if (req.body.field === 'online') rider.online = !rider.online;
  if (req.body.field === 'auto') rider.autoMode = !rider.autoMode;
  store.save();
  emit({ type: 'riders', payload: db.riders.map(engine.shortRider) });
  res.json({ ok: true, rider: engine.shortRider(rider) });
});

app.post('/api/merchant/toggle', (req, res) => {
  const db = store.get();
  if (req.body.field === 'auto') db.merchant.autoAccept = !db.merchant.autoAccept;
  if (req.body.field === 'online') db.merchant.online = !db.merchant.online;
  if (req.body.field === 'cookSeconds') db.merchant.cookSeconds = Math.max(3, Math.min(120, +req.body.value || 15));
  store.save();
  emit({ type: 'merchant', payload: db.merchant });
  res.json({ ok: true, merchant: db.merchant });
});

app.post('/api/reset', (req, res) => {
  store.reset();
  emit({ type: 'orders', payload: [] });
  emit({ type: 'riders', payload: store.get().riders.map(engine.shortRider) });
  res.json({ ok: true });
});

/* ---------- WebSocket ---------- */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  clients.add(ws);
  const url = new URL(req.url, 'http://localhost');
  const role = url.searchParams.get('role') || 'user';
  const token = url.searchParams.get('token');
  ws.send(JSON.stringify({ type: 'hello', payload: bootstrap(role, auth.userByToken(token)) }));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

(async function main() {
  await store.init();
  auth.ensureDemo();
  engine.start();

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  🛵  外卖跑腿服务已启动' + (store.usingPG() ? '（Postgres 持久化）' : '（本地文件持久化）'));
    console.log('  ------------------------------------------');
    console.log('  用户端    http://localhost:' + PORT + '/user.html');
    console.log('  骑手端    http://localhost:' + PORT + '/rider.html');
    console.log('  商家端    http://localhost:' + PORT + '/merchant.html');
    console.log('  入口页    http://localhost:' + PORT + '/');
    console.log('  演示账号  demo / 123456');
    console.log('  ------------------------------------------');
    console.log('');
  });
})();
