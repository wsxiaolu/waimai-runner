/**
 * 账号系统：注册 / 登录 / token 鉴权 / 切换身份时的密码二次验证
 * 密码用 Node 内置 crypto.scrypt 加盐哈希，不引入第三方依赖。
 */
const crypto = require('crypto');
const { get, save, uid } = require('./store');

const TOKEN_TTL = 30 * 24 * 3600 * 1000; // 30 天

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}
function newSalt() { return crypto.randomBytes(12).toString('hex'); }

function publicUser(u) {
  return {
    id: u.id, username: u.username, nickname: u.nickname,
    avatar: u.avatar, roles: u.roles, createdAt: u.createdAt
  };
}

function register(username, password, nickname) {
  const db = get();
  username = String(username || '').trim();
  password = String(password || '');
  if (username.length < 3) throw new Error('用户名至少 3 个字符');
  if (password.length < 6) throw new Error('密码至少 6 位');
  if (!/^[a-zA-Z0-9_.@-]+$/.test(username)) throw new Error('用户名只能包含字母、数字、._-@');
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error('该用户名已被注册');

  const salt = newSalt();
  const user = {
    id: uid('u'),
    username,
    nickname: String(nickname || '').trim() || username,
    avatar: '🙂',
    salt,
    hash: hashPassword(password, salt),
    roles: ['user', 'rider', 'merchant'],
    createdAt: Date.now()
  };
  db.users.push(user);
  save();
  return { user: publicUser(user), token: issueToken(user.id) };
}

function login(username, password) {
  const db = get();
  const user = db.users.find((u) => u.username.toLowerCase() === String(username || '').trim().toLowerCase());
  if (!user) throw new Error('账号不存在，请先注册');
  if (hashPassword(password, user.salt) !== user.hash) throw new Error('密码错误');
  return { user: publicUser(user), token: issueToken(user.id) };
}

function issueToken(userId) {
  const db = get();
  const token = crypto.randomBytes(24).toString('hex');
  db.tokens[token] = { userId, at: Date.now() };
  save();
  return token;
}

function userByToken(token) {
  if (!token) return null;
  const db = get();
  const t = db.tokens[token];
  if (!t) return null;
  if (Date.now() - t.at > TOKEN_TTL) { delete db.tokens[token]; save(); return null; }
  return db.users.find((u) => u.id === t.userId) || null;
}

function logout(token) {
  const db = get();
  if (token && db.tokens[token]) { delete db.tokens[token]; save(); }
  return true;
}

/** 切换商家 / 骑手 / 用户身份前的密码二次验证 */
function verifyPassword(userId, password) {
  const db = get();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('账号不存在');
  if (hashPassword(password, user.salt) !== user.hash) throw new Error('密码错误，无法切换身份');
  return true;
}

/** 首次启动时内置一个演示账号，方便直接体验 */
function ensureDemo() {
  const db = get();
  if (db.users.some((u) => u.username === 'demo')) return;
  const salt = newSalt();
  db.users.push({
    id: 'u_demo', username: 'demo', nickname: '演示账号', avatar: '🙂',
    salt, hash: hashPassword('123456', salt),
    roles: ['user', 'rider', 'merchant'], createdAt: Date.now()
  });
  save();
}

module.exports = {
  register, login, logout, userByToken, verifyPassword, ensureDemo, publicUser, hashPassword
};
