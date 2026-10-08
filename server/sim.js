/**
 * 配送模拟引擎：订单状态机 + 骑手移动 + 自动派单 + 聊天自动回复
 */
const { get, save, uid } = require('./store');
const City = require('../shared/city');

const TICK = 500;             // 心跳间隔 ms
const SPEED = 12;             // 模拟倍速（骑手 5m/s * 12）
const RIDER_SPEED = 5;        // 真实车速 m/s（约 18km/h）

// 状态文案（各端共用）
const STATUS_TEXT = {
  created: '等待商家接单',
  accepted: '商家备餐中',
  cooked: '餐品已备好，等待骑手',
  assigned: '骑手正在赶往商家',
  picking: '骑手取餐中',
  delivering: '骑手正在配送',
  arrived: '已送达，待确认',
  completed: '订单已完成',
  cancelled: '订单已取消'
};

const AUTO_REPLY = {
  rider: [
    '好的，我马上就到！🛵',
    '正在赶来，请稍等几分钟～',
    '我已在店里取餐，马上出发！',
    '快到楼下了，麻烦准备下楼取餐 🙏',
    '路上有点堵，稍等一小会儿哈'
  ],
  merchant: [
    '好的，正在为您加急备餐！👨‍🍳',
    '订单已收到，马上安排～',
    '抱歉今天单子多，稍等 5 分钟',
    '已出餐啦，等骑手来取 📦'
  ]
};

function createEngine(emit) {
  const pendingReplies = new Map(); // key: orderId+role -> timeout

  /* ---------- 工具 ---------- */

  function now() { return Date.now(); }

  function getShop(id) { return get().shops.find((s) => s.id === id); }
  function getRider(id) { return get().riders.find((r) => r.id === id); }
  function getOrder(id) { return get().orders.find((o) => o.id === id); }

  function pushTimeline(order, status, label) {
    order.timeline = order.timeline || [];
    if (!order.timeline.some((t) => t.status === status)) {
      order.timeline.push({ status, label, time: now() });
    }
  }

  /** 系统播报消息（出现在聊天里） */
  function systemMessage(order, text) {
    const msg = {
      id: uid('m'), orderId: order.id, from: 'system', fromName: '系统',
      to: 'all', text, ts: now(), kind: 'system'
    };
    get().messages.push(msg);
    emit({ type: 'message', payload: msg });
  }

  function calcDiscount(shop, subtotal) {
    let cut = 0;
    shop.promos.forEach((p) => {
      const m = /满\s*(\d+)\s*减\s*(\d+)/.exec(p);
      if (m && subtotal >= +m[1]) cut = Math.max(cut, +m[2]);
    });
    return cut;
  }

  function etaOf(order) {
    // 尚未派出骑手时，按商家承诺时长估算
    if (['created', 'accepted', 'cooked'].includes(order.status)) {
      const shop = get().shops.find((s) => s.id === order.shopId);
      const base = (shop ? shop.deliveryTime : 30) * 60;
      return { seconds: base, at: now() + base * 1000 };
    }
    // 剩余骑行距离 / 真实速度
    let remain = 0;
    const r = order.riderId ? getRider(order.riderId) : null;
    if (r && order.route) remain += Math.max(0, (order.legTotal || 0) - (order.traveled || 0));
    if (order.status === 'assigned' || order.status === 'cooked') {
      remain += order.shopToUserDist || 0;
    }
    if (order.status === 'delivering') remain = Math.max(0, (order.legTotal || 0) - (order.traveled || 0));
    const seconds = remain / RIDER_SPEED;
    return { seconds: Math.round(seconds), at: now() + seconds * 1000 };
  }

  /* ---------- 下单 ---------- */

  function createOrder({ shopId, items, addressId, remark, tableware, payMethod, userId }) {
    const db = get();
    const shop = getShop(shopId);
    if (!shop) throw new Error('商家不存在');
    const addr = db.user.addresses.find((a) => a.id === addressId) || db.user.addresses[0];

    const detail = items.map((it) => {
      const dish = db.dishes.find((d) => d.id === it.dishId);
      if (!dish) throw new Error('菜品不存在：' + it.dishId);
      return { dishId: dish.id, name: dish.name, emoji: dish.emoji, price: dish.price, qty: it.qty };
    });
    if (!detail.length) throw new Error('购物车为空');

    const subtotal = detail.reduce((s, d) => s + d.price * d.qty, 0);
    const packFee = detail.reduce((s, d) => s + d.qty, 0) * 1;
    const deliveryFee = shop.deliveryFee;
    const discount = calcDiscount(shop, subtotal);
    const total = Math.max(0, subtotal + packFee + deliveryFee - discount);

    const homeRoute = City.planRoute(shop.pos, addr.pos, shop.pos.x);
    const homeDist = City.pathLength(homeRoute);

    const order = {
      id: uid('o'),
      code: 'MT' + String(Math.floor(Math.random() * 900000) + 100000),
      userId: userId || db.user.id,
      shopId: shop.id, shopName: shop.name, shopEmoji: shop.emoji,
      shopPos: { x: shop.pos.x, y: shop.pos.y },
      items: detail,
      subtotal, packFee, deliveryFee, discount, total,
      status: 'created',
      createdAt: now(),
      address: JSON.parse(JSON.stringify(addr)),
      remark: remark || '',
      tableware: tableware == null ? 1 : tableware,
      payMethod: payMethod || '微信支付',
      riderId: null,
      shopToUserDist: Math.round(homeDist),
      shopToUserRoute: homeRoute,
      timeline: [{ status: 'created', label: '订单提交成功', time: now() }],
      rating: null,
      unread: { user: 0, rider: 0, merchant: 0 }
    };

    db.orders.unshift(order);
    db.messages.push({
      id: uid('m'), orderId: order.id, from: 'system', fromName: '系统', to: 'all',
      text: '订单已提交，等待商家接单', ts: now(), kind: 'system'
    });
    save();
    emit({ type: 'orders', payload: db.orders });
    return order;
  }

  /* ---------- 派单 ---------- */

  function findRider(shopPos) {
    const db = get();
    const free = db.riders.filter((r) => r.online && r.status === 'idle');
    if (!free.length) return null;
    free.sort((a, b) => Math.hypot(a.pos.x - shopPos.x, a.pos.y - shopPos.y) - Math.hypot(b.pos.x - shopPos.x, b.pos.y - shopPos.y));
    return free[0];
  }

  function startLeg(order, fromPos, toPos) {
    const route = City.planRoute(fromPos, toPos, fromPos.x + toPos.y);
    order.route = route;
    order.legTotal = City.pathLength(route);
    order.traveled = 0;
    const rider = getRider(order.riderId);
    if (rider) {
      rider.pos = { x: fromPos.x, y: fromPos.y };
      rider.route = route; rider.traveled = 0; rider.legTotal = order.legTotal;
    }
  }

  function assignRider(order, riderId) {
    const db = get();
    let rider;
    if (riderId) {
      rider = db.riders.find((r) => r.id === riderId);
      if (!rider || !rider.online || rider.status !== 'idle') return false;
    } else {
      rider = findRider(order.shopPos);
    }
    if (!rider) return false;
    order.riderId = rider.id;
    order.riderName = rider.name;
    order.riderPhone = rider.phone;
    order.riderEmoji = rider.emoji;
    order.assignedAt = now();
    order.status = 'assigned';
    rider.status = 'fetching';
    rider.orderId = order.id;
    startLeg(order, rider.pos, order.shopPos);
    pushTimeline(order, 'assigned', '骑手已接单，正在赶往商家');
    systemMessage(order, `骑手 ${rider.name}（${rider.plate}）已接单，正在赶往商家取餐`);
    return true;
  }

  /* ---------- 状态动作 ---------- */

  function action(orderId, act, actor, extra) {
    const db = get();
    const order = getOrder(orderId);
    if (!order) throw new Error('订单不存在');
    const rider = order.riderId ? getRider(order.riderId) : null;
    const shop = getShop(order.shopId);

    switch (act) {
      case 'merchant_accept':
        if (order.status !== 'created') break;
        order.status = 'accepted';
        order.acceptedAt = now();
        pushTimeline(order, 'accepted', '商家已接单，正在备餐');
        systemMessage(order, '商家已接单，正在为您备餐 👨‍🍳');
        break;

      case 'merchant_cooked':
        if (order.status !== 'accepted') break;
        order.status = 'cooked';
        order.cookedAt = now();
        pushTimeline(order, 'cooked', '餐品已出餐，等待骑手取餐');
        systemMessage(order, '餐品已备好，正在为您分配骑手…');
        if (!assignRider(order)) {
          systemMessage(order, '暂无空闲骑手，正在为您加急派单…');
        }
        break;

      case 'rider_pick':   // 骑手取餐
        if (order.status !== 'picking' && order.status !== 'assigned') break;
        order.status = 'delivering';
        order.pickedAt = now();
        startLeg(order, order.shopPos, order.address.pos);
        if (rider) rider.status = 'delivering';
        pushTimeline(order, 'delivering', '骑手已取餐，正在为您配送');
        systemMessage(order, `骑手已取餐，正在送往「${order.address.detail}」`);
        break;

      case 'rider_deliver':  // 骑手送达
        if (order.status !== 'arrived' && order.status !== 'delivering') break;
        order.status = 'completed';
        order.completedAt = now();
        if (rider) {
          rider.status = 'idle'; rider.orderId = null;
          rider.orderCount += 1;
          rider.income += Math.round((order.deliveryFee * 0.8 + 3) * 100) / 100;
        }
        db.merchant.income += order.total;
        db.merchant.todayOrders += 1;
        pushTimeline(order, 'completed', '订单已送达，感谢您的信任');
        systemMessage(order, '订单已送达，请及时取餐，祝您用餐愉快 🎉');
        break;

      case 'rider_accept': {  // 骑手抢单
        if (order.status !== 'cooked') break;
        if (!assignRider(order, extra && extra.riderId)) break;
        break;
      }

      case 'user_cancel':
        if (['completed', 'cancelled', 'delivering'].includes(order.status)) break;
        order.status = 'cancelled';
        if (rider) { rider.status = 'idle'; rider.orderId = null; }
        pushTimeline(order, 'cancelled', '订单已取消');
        systemMessage(order, '订单已取消');
        break;

      case 'user_confirm':
        if (order.status === 'arrived') {
          order.status = 'completed'; order.completedAt = now();
          if (rider) { rider.status = 'idle'; rider.orderId = null; rider.orderCount += 1; rider.income += 4; }
          db.merchant.income += order.total;
          db.merchant.todayOrders += 1;
          pushTimeline(order, 'completed', '已确认送达');
        }
        break;

      case 'rate':
        break;

      default:
        break;
    }

    // 商家端自动配置
    if (act === 'toggle_auto') {
      db.merchant.autoAccept = !db.merchant.autoAccept;
    }

    order.eta = etaOf(order);
    save();
    emit({ type: 'orders', payload: db.orders });
    emit({ type: 'riders', payload: db.riders.map(shortRider) });
    return order;
  }

  function shortRider(r) {
    return {
      id: r.id, name: r.name, emoji: r.emoji, phone: r.phone, pos: r.pos,
      heading: r.heading || 0, status: r.status, online: r.online,
      rating: r.rating, orderCount: r.orderCount, income: r.income, plate: r.plate
    };
  }

  /* ---------- 聊天 ---------- */

  function sendMessage(orderId, from, to, text) {
    const db = get();
    const order = getOrder(orderId);
    if (!order || !text) return null;
    const nameMap = {
      user: db.user.name,
      merchant: getShop(order.shopId).name,
      rider: order.riderName || '骑手'
    };
    const msg = {
      id: uid('m'), orderId, from, to,
      fromName: nameMap[from] || from,
      text: String(text).slice(0, 200), ts: now(), kind: 'chat'
    };
    db.messages.push(msg);
    if (order.unread) {
      if (from === 'user') { order.unread.rider++; order.unread.merchant++; }
      if (from === 'rider') order.unread.user++;
      if (from === 'merchant') order.unread.user++;
    }
    save();
    emit({ type: 'message', payload: msg });

    // 安排一次对方自动回复（若对方不在线/未操作）
    if (from === 'user' && (to === 'rider' || to === 'all' || to === 'merchant')) {
      const target = to === 'merchant' ? 'merchant' : 'rider';
      scheduleAutoReply(orderId, target);
    }
    return msg;
  }

  function scheduleAutoReply(orderId, role) {
    const key = orderId + '|' + role;
    if (pendingReplies.has(key)) clearTimeout(pendingReplies.get(key));
    const t = setTimeout(() => {
      pendingReplies.delete(key);
      const pool = AUTO_REPLY[role] || [];
      const text = pool[Math.floor(Math.random() * pool.length)];
      if (text) sendMessage(orderId, role, 'user', text);
    }, 1500 + Math.random() * 2000);
    pendingReplies.set(key, t);
  }

  function cancelAutoReply(orderId, role) {
    const key = orderId + '|' + role;
    if (pendingReplies.has(key)) { clearTimeout(pendingReplies.get(key)); pendingReplies.delete(key); }
  }

  /* ---------- 心跳推进 ---------- */

  function tick() {
    const db = get();
    // dirty   = 需要向前端推送 orders
    // persist = 需要落库。骑手坐标每 500ms 变一次，若一起落库会把免费数据库写爆，
    //           所以只有订单状态真正推进时才写库（坐标重启后回退一点无所谓）
    let dirty = false;
    let persist = false;

    db.orders.forEach((order) => {
      if (['completed', 'cancelled'].includes(order.status)) return;
      const rider = order.riderId ? getRider(order.riderId) : null;
      const t = now();

      // 商家自动接单
      if (order.status === 'created' && db.merchant.autoAccept && t - order.createdAt > 4000) {
        dirty = true; persist = true;
        action(order.id, 'merchant_accept', 'merchant');
      }
      // 自动出餐
      if (order.status === 'accepted' && t - (order.acceptedAt || order.createdAt) > db.merchant.cookSeconds * 1000) {
        dirty = true; persist = true;
        action(order.id, 'merchant_cooked', 'merchant');
      }
      // 出餐后持续尝试派单
      if (order.status === 'cooked') {
        if (assignRider(order)) { dirty = true; persist = true; }
      }

      // 骑手移动
      if ((order.status === 'assigned' || order.status === 'delivering') && rider) {
        const step = RIDER_SPEED * SPEED * (TICK / 1000);
        order.traveled = (order.traveled || 0) + step;
        const pos = City.advanceAlong(order.route, order.traveled);
        if (pos) {
          rider.pos = { x: pos.x, y: pos.y };
          rider.heading = pos.heading;
          rider.traveled = order.traveled;
          order.riderPos = { x: pos.x, y: pos.y, heading: pos.heading };
        }
        dirty = true; // 只推送，不落库

        if (order.traveled >= (order.legTotal || 0)) {
          if (order.status === 'assigned') {
            order.status = 'picking';
            pushTimeline(order, 'picking', '骑手已到店，正在取餐');
            systemMessage(order, '骑手已到达商家，正在取餐 🏪');
            dirty = true; persist = true;
          } else if (order.status === 'delivering') {
            order.status = 'arrived';
            pushTimeline(order, 'arrived', '骑手已送达，请及时取餐');
            systemMessage(order, '骑手已到达您的位置，请及时取餐 🏠');
            dirty = true; persist = true;
          }
        }
      }

      // 自动取餐
      if (order.status === 'picking' && rider && rider.autoMode) {
        const wait = t - ((order.timeline.find((x) => x.status === 'picking') || {}).time || t);
        if (wait > 4000) { dirty = true; persist = true; action(order.id, 'rider_pick', 'rider'); }
      }
      // 自动送达
      if (order.status === 'arrived' && rider && rider.autoMode) {
        const wait = t - ((order.timeline.find((x) => x.status === 'arrived') || {}).time || t);
        if (wait > 4000) { dirty = true; persist = true; action(order.id, 'rider_deliver', 'rider'); }
      }

      order.eta = etaOf(order);
    });

    if (persist) save();
    return dirty;
  }

  function start() {
    setInterval(() => {
      const dirty = tick();
      const db = get();
      emit({ type: 'riders', payload: db.riders.map(shortRider) });
      if (dirty) emit({ type: 'orders', payload: db.orders });
    }, TICK);
  }

  return {
    start, tick, createOrder, action, sendMessage, cancelAutoReply,
    assignRider, STATUS_TEXT, shortRider, etaOf, getOrder, getShop, getRider
  };
}

module.exports = { createEngine, STATUS_TEXT };
