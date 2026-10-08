/**
 * 内存 + 文件持久化的数据层。
 * 数据文件：server/data.json（删除该文件即可重置全部数据）
 */
const fs = require('fs');
const path = require('path');
const City = require('../shared/city');

const DATA_FILE = path.join(__dirname, 'data.json');

let seq = 1;
function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + (seq++).toString(36);
}

/* ---------------- 种子数据 ---------------- */

const SHOPS = [
  {
    id: 's1', name: '蜜雪冰城（阳光城店）', emoji: '🧋', category: '奶茶饮品',
    rating: 4.8, monthSales: 8421, deliveryFee: 2, minPrice: 12, deliveryTime: 22,
    pos: { x: 700, y: 610 }, address: '阳光路 128 号 1 层 07 铺',
    tags: ['品质联盟', '准时宝', '蜂鸟专送'],
    promos: ['满 20 减 5', '新客立减 3', '下单送柠檬水'],
    notice: '本店所有饮品现做现卖，高峰期请耐心等待～',
    brand: '#ff5b6e'
  },
  {
    id: 's2', name: '华莱士·全鸡汉堡', emoji: '🍔', category: '汉堡炸鸡',
    rating: 4.6, monthSales: 5320, deliveryFee: 3, minPrice: 15, deliveryTime: 26,
    pos: { x: 1400, y: 360 }, address: '建设大道 66 号',
    tags: ['准时宝', '开发票'],
    promos: ['满 30 减 8', '第二份半价'],
    notice: '炸鸡现炸，出餐约 8 分钟',
    brand: '#ff8000'
  },
  {
    id: 's3', name: '兰州牛肉拉面', emoji: '🍜', category: '面食粉馆',
    rating: 4.9, monthSales: 12035, deliveryFee: 2, minPrice: 14, deliveryTime: 20,
    pos: { x: 420, y: 1110 }, address: '西城巷 9 号',
    tags: ['品质联盟', '蜂鸟专送'],
    promos: ['满 25 减 6', '免费加面'],
    notice: '汤底每日现熬，可备注面条粗细',
    brand: '#f5a623'
  },
  {
    id: 's4', name: '蜀香源麻辣香锅', emoji: '🌶️', category: '川湘菜',
    rating: 4.7, monthSales: 3612, deliveryFee: 4, minPrice: 30, deliveryTime: 32,
    pos: { x: 1820, y: 860 }, address: '望江路 501 号 2F',
    tags: ['准时宝', '开发票'],
    promos: ['满 60 减 12', '满 100 减 25'],
    notice: '辣度可选：微辣/中辣/特辣',
    brand: '#e02020'
  },
  {
    id: 's5', name: '沙县小吃（老字号）', emoji: '🥟', category: '小吃快餐',
    rating: 4.5, monthSales: 6890, deliveryFee: 2, minPrice: 10, deliveryTime: 18,
    pos: { x: 980, y: 1360 }, address: '城南市场北门',
    tags: ['蜂鸟专送'],
    promos: ['满 15 减 3'],
    notice: '蒸饺每日限量，售完为止',
    brand: '#7c5cff'
  },
  {
    id: 's6', name: '杨国福麻辣烫', emoji: '🍲', category: '麻辣烫',
    rating: 4.6, monthSales: 4210, deliveryFee: 3, minPrice: 20, deliveryTime: 25,
    pos: { x: 2100, y: 1110 }, address: '滨江东路 88 号',
    tags: ['品质联盟'],
    promos: ['满 35 减 7'],
    notice: '称重计价，可备注忌口',
    brand: '#ff5722'
  },
  {
    id: 's7', name: '肯德基宅急送', emoji: '🍗', category: '汉堡炸鸡',
    rating: 4.9, monthSales: 15800, deliveryFee: 5, minPrice: 25, deliveryTime: 28,
    pos: { x: 1540, y: 610 }, address: '中山广场 1 层',
    tags: ['品质联盟', '准时宝', '蜂鸟专送'],
    promos: ['满 50 减 10', '疯狂星期四'],
    notice: '宅急送专属包装，保温配送',
    brand: '#d0021b'
  },
  {
    id: 's8', name: '柳州螺蛳粉', emoji: '🍝', category: '面食粉馆',
    rating: 4.4, monthSales: 2980, deliveryFee: 2, minPrice: 15, deliveryTime: 21,
    pos: { x: 700, y: 1360 }, address: '老城区南街 22 号',
    tags: ['蜂鸟专送'],
    promos: ['满 20 减 4'],
    notice: '臭味正宗，介意者慎拍',
    brand: '#8b572a'
  },
  {
    id: 's9', name: '一膳寿司·日料', emoji: '🍣', category: '日本料理',
    rating: 4.8, monthSales: 1860, deliveryFee: 6, minPrice: 40, deliveryTime: 35,
    pos: { x: 2380, y: 610 }, address: '滨江商业中心 4F',
    tags: ['品质联盟', '开发票'],
    promos: ['满 80 减 15'],
    notice: '冷链配送，刺身类请尽快食用',
    brand: '#2f7ed8'
  },
  {
    id: 's10', name: '粥面故事·养生粥', emoji: '🥣', category: '粥店',
    rating: 4.7, monthSales: 3305, deliveryFee: 2, minPrice: 16, deliveryTime: 19,
    pos: { x: 1260, y: 1610 }, address: '城南新区 12 号',
    tags: ['蜂鸟专送'],
    promos: ['满 25 减 5'],
    notice: '现熬 3 小时，可备注少糖',
    brand: '#00a86b'
  }
];

// [名称, emoji, 价格, 原价, 月售, 分类, 描述]
const DISH_DEF = {
  s1: [
    ['招牌柠檬水', '🍋', 4, 6, 9821, '招牌推荐', '超大杯 700ml，清爽解腻'],
    ['珍珠奶茶', '🧋', 8, 12, 7612, '招牌推荐', '现煮黑糖珍珠，甜度可调'],
    ['摇摇奶昔', '🥛', 9, 13, 4320, '招牌推荐', '冰爽奶香，夏日必点'],
    ['摩天脆脆冰', '🍦', 6, 8, 5510, '冰淇淋', '脆筒现做，2 分钟出品'],
    ['杨枝甘露', '🥭', 13, 18, 2210, '鲜果茶', '芒果+西柚+椰浆'],
    ['满杯百香果', '🍹', 11, 15, 1876, '鲜果茶', '整颗百香果，酸甜开胃'],
    ['四季春茶', '🍵', 5, 7, 3098, '纯茶', '零糖零卡，茶香浓郁'],
    ['芋圆波波奶茶', '🍡', 12, 16, 2654, '招牌推荐', '手作芋圆 Q 弹有嚼劲']
  ],
  s2: [
    ['全鸡腿堡', '🍔', 15, 22, 4210, '汉堡', '整块鸡腿肉，鲜嫩多汁'],
    ['香辣鸡腿堡', '🌶️', 12, 18, 3876, '汉堡', '经典辣味，销量冠军'],
    ['蜜汁烤翅（4只）', '🍗', 18, 24, 2980, '小食', '现烤蜜汁，4 只装'],
    ['黄金鸡块（8块）', '🍟', 13, 19, 2543, '小食', '外酥里嫩，配番茄酱'],
    ['薯条（大）', '🍟', 9, 12, 5120, '小食', '现炸薯条，酥脆'],
    ['可乐（中杯）', '🥤', 5, 7, 6120, '饮料', '冰镇碳酸'],
    ['奥尔良烤鸡腿堡', '🍗', 16, 23, 1876, '汉堡', '奥尔良风味腌制'],
    ['1+1 随心配套餐', '🍱', 25, 38, 3302, '套餐', '汉堡+小食+饮料']
  ],
  s3: [
    ['招牌牛肉拉面', '🍜', 18, 24, 11203, '招牌面', '一清二白三红四绿'],
    ['毛细牛肉面', '🍜', 18, 24, 5432, '招牌面', '面条细如发丝'],
    ['加牛肉（一份）', '🥩', 12, 15, 4321, '加料', '秘制卤牛肉'],
    ['凉拌牛肉', '🥗', 22, 28, 2109, '凉菜', '麻辣鲜香'],
    ['卤蛋', '🥚', 2, 3, 8765, '加料', '入味卤蛋'],
    ['牛肉小炒', '🍲', 32, 42, 1543, '热菜', '现炒锅气足'],
    ['兰州酿皮', '🥣', 12, 16, 2876, '凉菜', '酸辣爽口'],
    ['冰峰汽水', '🥤', 4, 6, 3320, '饮料', '西安经典']
  ],
  s4: [
    ['麻辣香锅（小份）', '🌶️', 38, 52, 2310, '香锅', '荤素搭配，可选辣度'],
    ['麻辣香锅（大份）', '🌶️', 68, 88, 1876, '香锅', '2-3 人份'],
    ['虾滑', '🦐', 12, 16, 3201, '加菜', '手工虾滑'],
    ['宽粉', '🍝', 6, 8, 4012, '加菜', '吸汁入味'],
    ['金针菇', '🍄', 5, 7, 2876, '加菜', '新鲜脆嫩'],
    ['午餐肉', '🥓', 8, 10, 2543, '加菜', '香煎午餐肉'],
    ['冰粉', '🍧', 8, 12, 1643, '甜品', '解辣神器'],
    ['酸梅汤', '🧃', 6, 9, 1902, '饮料', '自熬酸梅汤']
  ],
  s5: [
    ['蒸饺（10只）', '🥟', 12, 16, 5201, '招牌', '皮薄馅大，现蒸'],
    ['花生酱拌面', '🍜', 10, 14, 4320, '面食', '沙县经典'],
    ['炖罐（土鸡）', '🍲', 18, 24, 2109, '炖罐', '文火慢炖 3 小时'],
    ['扁肉', '🥟', 9, 12, 3876, '招牌', '手工捶打肉馅'],
    ['炒饭', '🍚', 13, 17, 2654, '饭类', '粒粒分明'],
    ['拌青菜', '🥬', 7, 9, 1543, '小菜', '清爽解腻'],
    ['桂圆莲子汤', '🥣', 8, 11, 1203, '甜品', '温热滋补']
  ],
  s6: [
    ['麻辣烫（招牌）', '🍲', 26, 35, 3120, '麻辣烫', '自选称重，骨汤底'],
    ['番茄麻辣烫', '🍅', 26, 35, 1876, '麻辣烫', '酸甜开胃'],
    ['麻酱麻辣烫', '🥜', 28, 36, 2103, '麻辣烫', '浓香麻酱'],
    ['宽粉', '🍝', 5, 7, 4302, '加菜', 'Q 弹'],
    ['鹌鹑蛋', '🥚', 5, 7, 2876, '加菜', '入味'],
    ['娃娃菜', '🥬', 4, 6, 3102, '加菜', '新鲜'],
    ['豆奶', '🥛', 6, 8, 1976, '饮料', '解辣']
  ],
  s7: [
    ['香辣鸡腿堡', '🍔', 21, 25, 8210, '汉堡', '经典永不过时'],
    ['新奥尔良烤鸡腿堡', '🍗', 22, 26, 6432, '汉堡', '烤制非油炸'],
    ['吮指原味鸡（4块）', '🍗', 39, 45, 5210, '炸鸡', '整鸡现炸'],
    ['薯条（大）', '🍟', 12, 15, 9876, '小食', '现炸'],
    ['上校鸡块', '🍗', 15, 18, 4321, '小食', '配蜂蜜芥末'],
    ['葡式蛋挞（4只）', '🥧', 24, 30, 3876, '甜品', '现烤酥皮'],
    ['九珍果汁', '🧃', 9, 12, 5432, '饮料', '橙汁现调'],
    ['全家桶', '🍗', 109, 139, 2109, '套餐', '8 件套，聚会必备']
  ],
  s8: [
    ['原味螺蛳粉', '🍝', 16, 22, 2876, '招牌', '酸笋足量，汤浓'],
    ['加腐竹螺蛳粉', '🍝', 20, 26, 1876, '招牌', '腐竹吸汁'],
    ['加鸭脚', '🦆', 8, 11, 1543, '加料', '卤香鸭脚'],
    ['加卤蛋', '🥚', 3, 4, 2654, '加料', '入味'],
    ['炸蛋', '🍳', 4, 6, 2109, '加料', '吸汤神器'],
    ['豆奶', '🥛', 5, 7, 1432, '饮料', '解辣解腻']
  ],
  s9: [
    ['三文鱼刺身（8片）', '🍣', 68, 88, 1203, '刺身', '挪威空运'],
    ['加州卷', '🍙', 38, 48, 1876, '寿司', '经典美式'],
    ['鳗鱼饭', '🍱', 58, 72, 987, '主食', '蒲烧鳗鱼'],
    ['天妇罗拼盘', '🍤', 42, 55, 876, '炸物', '现炸酥脆'],
    ['味增汤', '🥣', 12, 16, 1543, '汤品', '地道味增'],
    ['茶碗蒸', '🍮', 18, 24, 765, '蒸物', '滑嫩'],
    ['抹茶千层', '🍰', 32, 42, 654, '甜品', '手作千层']
  ],
  s10: [
    ['皮蛋瘦肉粥', '🥣', 12, 16, 3201, '招牌粥', '现熬 3 小时'],
    ['南瓜小米粥', '🎃', 10, 14, 2109, '养生粥', '养胃'],
    ['虾仁蒸饺', '🥟', 16, 21, 1876, '点心', '整颗虾仁'],
    ['肠粉', '🍝', 13, 17, 2543, '点心', '广式布拉肠'],
    ['小笼包（6只）', '🥟', 14, 18, 2321, '点心', '现蒸'],
    ['凉拌木耳', '🥗', 8, 11, 1203, '小菜', '爽脆'],
    ['豆浆', '🥛', 4, 6, 2876, '饮料', '现磨']
  ]
};

const RIDERS = [
  { id: 'r1', name: '王建国', emoji: '🛵', phone: '138****4021', rating: 4.9, orderCount: 3821, plate: '鄂A·8J27', pos: { x: 980, y: 860 } },
  { id: 'r2', name: '李思远', emoji: '🏍️', phone: '159****7734', rating: 4.8, orderCount: 2560, plate: '鄂A·5K19', pos: { x: 1540, y: 1110 } },
  { id: 'r3', name: '赵铁柱', emoji: '🚴', phone: '186****2210', rating: 4.95, orderCount: 5120, plate: '鄂A·2M08', pos: { x: 420, y: 1360 } }
];

const USER = {
  id: 'u1', name: '小林', avatar: '🙂', phone: '137****8866',
  addresses: [
    { id: 'a1', label: '家', name: '小林 先生', phone: '137****8866', detail: '阳光小区 3 栋 502 室', pos: { x: 1180, y: 1240 }, tag: '家' },
    { id: 'a2', label: '公司', name: '小林', phone: '137****8866', detail: '中环国际大厦 A 座 1806', pos: { x: 1820, y: 360 }, tag: '公司' },
    { id: 'a3', label: '学校', name: '小林', phone: '137****8866', detail: '城南大学 6 号宿舍楼', pos: { x: 420, y: 1610 }, tag: '学校' }
  ]
};

const CATEGORIES = [
  { name: '美食', emoji: '🍜' }, { name: '超市便利', emoji: '🛒' }, { name: '买药', emoji: '💊' },
  { name: '水果', emoji: '🍉' }, { name: '甜品饮品', emoji: '🧋' }, { name: '烧烤', emoji: '🍢' },
  { name: '跑腿代购', emoji: '🛵' }, { name: '鲜花', emoji: '💐' }, { name: '夜宵', emoji: '🌙' },
  { name: '地方菜', emoji: '🥘' }
];

function buildSeed() {
  const dishes = [];
  SHOPS.forEach((shop) => {
    (DISH_DEF[shop.id] || []).forEach((d, i) => {
      dishes.push({
        id: shop.id + '_d' + (i + 1), shopId: shop.id,
        name: d[0], emoji: d[1], price: d[2], oldPrice: d[3],
        sales: d[4], cat: d[5], desc: d[6],
        praise: Math.round(d[4] * (0.7 + City.srand(i + shop.id.length) * 0.25)),
        stock: 99
      });
    });
  });

  return {
    version: 4,
    users: [],           // 注册账号（scrypt 哈希）
    tokens: {},          // token -> {userId, at}
    user: JSON.parse(JSON.stringify(USER)),
    shops: SHOPS.map((s) => {
      const route = City.planRoute(s.pos, USER.addresses[0].pos, s.pos.x);
      const dist = City.pathLength(route);
      return Object.assign({}, s, {
        distance: Math.round(dist),
        routeToHome: route
      });
    }),
    dishes,
    riders: RIDERS.map((r) => Object.assign({}, r, {
      status: 'idle',      // idle | fetching | delivering
      orderId: null,
      heading: 0,
      online: true,
      income: 0,
      autoMode: true      // 自动取餐 / 自动送达
    })),
    categories: CATEGORIES,
    orders: [],
    messages: [],        // {id, orderId, from, fromName, to, text, ts}
    merchant: { id: 'm1', autoAccept: true, cookSeconds: 15, online: true, income: 0, todayOrders: 0 },
    resetAt: Date.now()
  };
}

/* ---------------- 持久化：文件 或 Postgres（Supabase 免费层） ----------------
 * 免费云实例（如 Render）休眠后本地磁盘会被清空，
 * 因此设置 DATABASE_URL 后，整库作为一个 JSON 文档存进 Postgres，账号/订单都不会丢。
 */
let db = null;
let saveTimer = null;
const DATABASE_URL = process.env.DATABASE_URL;
const TABLE = (process.env.DB_TABLE || 'waimai_state').replace(/[^a-zA-Z0-9_]/g, '');
let pgPool = null;

async function pgWrite(data) {
  await pgPool.query(
    'INSERT INTO ' + TABLE + ' (id, data, updated_at) VALUES ($1, $2, now()) ' +
    'ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()',
    ['main', JSON.stringify(data)]
  );
}

/** 启动初始化：优先 Postgres，失败自动回退文件 */
async function init() {
  if (DATABASE_URL) {
    try {
      const { Pool } = require('pg');
      pgPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
      await pgPool.query('CREATE TABLE IF NOT EXISTS ' + TABLE +
        ' (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())');
      const r = await pgPool.query('SELECT data FROM ' + TABLE + ' WHERE id = $1', ['main']);
      if (r.rows.length && r.rows[0].data && r.rows[0].data.version === 4) {
        db = r.rows[0].data;
        console.log('[store] 已从 Postgres 载入数据（订单 ' + db.orders.length + ' 条）');
        return db;
      }
      db = buildSeed();
      await pgWrite(db);
      console.log('[store] Postgres 已初始化种子数据');
      return db;
    } catch (e) {
      console.warn('[store] Postgres 不可用，回退到本地文件：' + e.message);
      pgPool = null;
    }
  }
  db = loadFile();
  return db;
}

function loadFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (raw && raw.version === 4) return raw;
    }
  } catch (e) {
    console.warn('[store] 读取数据失败，将重建：' + e.message);
  }
  const fresh = buildSeed();
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2)); } catch (e) { /* ignore */ }
  return fresh;
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch (e) { /* ignore */ }
    if (pgPool) pgWrite(db).catch((e) => console.warn('[store] Postgres 写入失败：' + e.message));
  }, 400);
}

/** 重置演示数据，但保留已注册的账号 */
function reset() {
  const keepUsers = db ? db.users : [];
  const keepTokens = db ? db.tokens : {};
  db = buildSeed();
  db.users = keepUsers;
  db.tokens = keepTokens;
  save();
  return db;
}

function get() { return db || buildSeed(); }
function usingPG() { return !!pgPool; }

module.exports = { init, get, save, reset, uid, City, usingPG };
