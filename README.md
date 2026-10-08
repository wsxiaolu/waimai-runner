# 外卖跑腿 · 三端全链路 + iOS App

一个可直接运行的外卖/跑腿系统：**Web 三端**（用户 / 骑手 / 商家）+ **原生 iOS App**（SwiftUI 液态玻璃），
含实时地图导航、三方即时聊天、账号注册登录、切换身份密码验证。
后端 Node.js，状态与位置通过 WebSocket 实时同步；云端部署全部使用免费额度，不需要信用卡。

---

## 一、本地跑起来（Web 端）

```bash
cd C:/Users/15826/Desktop/waimai
npm install
npm start
```

服务默认 `http://localhost:3000`（已绑 0.0.0.0，同局域网手机可直接访问）。

| 端 | 地址 |
|---|---|
| 入口页 | http://localhost:3000/ |
| 用户端 | http://localhost:3000/user.html |
| 骑手端 | http://localhost:3000/rider.html |
| 商家端 | http://localhost:3000/merchant.html |

内置演示账号 **demo / 123456**（首次进入也可用它登录，或自己注册）。

每个页面右下角都有「切换端」悬浮按钮，可随时在三个端之间跳来跳去，跳过去订单和聊天都在
（Web 端是游客模式不输密码；App 端切换身份必须输密码，见下方 iOS 章节）。

链路：下单 → 商家接单 → 备餐 → 出餐 → 系统派单 → 骑手赶往商家（地图实时移动）→ 到店取餐 → 送往用户 → 送达。
全程约 54 秒自动跑完，每个环节都能手动接管。

---

## 二、iOS App（SwiftUI + 液态玻璃）

### 功能

- **注册 / 登录**：用户名 + 密码（密码用 scrypt 加盐哈希，不明文存储），token 持久化在钥匙串之外的 UserDefaults
- **任意切换、随时退出**：导航栏右上角 ⚙︎ 或「我的」页可反复切到用户端 / 骑手端 / 商家端（每次都输密码），菜单底部有「退出登录」。退出后再登录同一账号，订单和聊天一条不少
- **液态玻璃**：iOS 26+ 使用 SwiftUI 原生 `.glassEffect` / `GlassEffectContainer`；iOS 17–25 自动降级为毛玻璃材质，同一份代码两种观感
- **真实地图导航**：MapKit 底图 + 服务端规划的路线折线 + 骑手实时标注（虚拟城市坐标映射到真实经纬度）
- **三端合一**：用户端（商家列表 / 菜单 / 购物车 / 结算 / 订单跟踪）、骑手端（抢单 / 导航 / 取餐 / 送达）、商家端（接单 / 出餐 / 订单 Tab）
- **聊天**：用户 ↔ 骑手、用户 ↔ 商家，WebSocket 实时收发，带快捷短语

### 用 GitHub Actions 构建 IPA

仓库推到 GitHub 后，`.github/workflows/ios.yml` 会在 `macos-26` runner 上自动：

1. `brew install xcodegen` → `xcodegen` 生成 `Waimai.xcodeproj`（工程不入库，CI 生成，避免 pbxproj 冲突）
2. `xcodebuild archive`（Xcode 26 + iOS 26 SDK，不签名）
3. 打包成 `Waimai-iOS-unsigned.ipa` 上传为 Actions 产物（保留 30 天）
4. 打 `v*` tag 时自动附加到 Release

```bash
git push origin main          # 触发构建
# 或 Actions 页面手动 Run workflow
git tag v1.0 && git push --tags   # 构建并发布到 Release
```

> ⚠️ 两个前提：
> 1. **仓库必须是 Public**。GitHub 的 macOS runner 只对公开仓库免费，私有仓库会消耗付费额度（10 倍分钟数）。
> 2. 首次构建可能因为 Xcode 26 的 API 差异报错，把 Actions 日志里的报错发我，我改完再推一次即可。

### 身份切换：任意切、可退出、订单不丢

- 切换入口：导航栏右上角 ⚙︎（三个身份 + 退出登录），「我的」页也有完整列表
- 每次切换弹密码框；密码错误**不会**改变当前身份，也不影响登录态
- 切换只是换一个视角看同一份数据：订单、聊天、骑手位置原样保留，配送状态机不中断
- 代码层面双保险：`switchRole` 先把订单 / 聊天 / 骑手 / 购物车留快照，只有新数据拉取成功才覆盖；网络异常拉空时回滚到快照，不会出现「切完订单空了」
- 退出登录只让 token 失效，服务端数据保留，重新登录同一账号照旧可见

`npm run test:switch` 覆盖：连续切换 5 次订单都在 → 错误密码被拒且登录态不变 → 退出再登录订单与聊天都在 → 切换期间配送进度持续推进。

### 安装到 iPhone（免费 Apple ID）

CI 产出的是**未签名 IPA**，需要用免费的 Apple ID 在自己电脑上签名：

| 方式 | 说明 |
|---|---|
| **AltStore / SideStore**（推荐） | 电脑装 AltServer，用免费 Apple ID 签名，Wi-Fi 自动续签，最稳 |
| **Xcode** | iPhone 连 Mac，选设备直接 Run。免费账号证书 7 天过期，重跑一次即可 |
| Sideloadly | 你之前遇到 `-22406`：这是 Apple 签名服务端拒绝该 Apple ID 的会话，不是 IPA 的问题。优先换 AltServer；若坚持用 Sideloadly，先在 appleid.apple.com 确认能登录并开启双重认证，用「应用专用密码」而非登录密码 |

免费账号的限制：证书 7 天有效、7 天内最多 10 个 App ID、最多注册 100 台设备。

### App 里填服务器地址

登录页底部「服务器地址」：

- 本机调试：`http://电脑局域网IP:3000`（如 `http://192.168.1.23:3000`，App 已放开 ATS 允许 http）
- 云端：Render 地址 `https://waimai-api.onrender.com`

---

## 三、免费云部署（Render + Supabase）

| 用途 | 选择 | 为什么 |
|---|---|---|
| 跑 Node 服务 | **Render 免费 Web Service** | 免信用卡、750 小时/月、支持 WebSocket 长连接 |
| 存账号和订单 | **Supabase 免费 Postgres** | 免信用卡、500MB、永久免费 |

为什么不用别的：Fly.io 已于 2024-10 取消免费计算；Koyeb 只剩免费 Postgres；Railway 只是 $5 试用额度。
Oracle Always Free 更强（4 核 ARM）但要信用卡 + 自己运维，作为进阶备选。

> Render 免费实例 15 分钟无流量会休眠，且**休眠后本地磁盘清空**。
> 所以本项目检测到 `DATABASE_URL` 时，会把整库作为一个 JSON 文档存进 Postgres，账号和订单不会丢；
> 没配置时自动退回本地 `server/data.json`。

### 步骤

1. **Supabase**：新建项目（免费）→ Project Settings → Database → Connection string（URI，端口 6543 的 Session pooler）
   复制出来，把密码填进去，得到 `postgresql://postgres.xxx:[密码]@aws-0-xxx.pooler.supabase.com:6543/postgres`

2. **Render**：Dashboard → New → Blueprint → 选本仓库，会自动读 `render.yaml`
   - 计划选 **Free**，区域选 Singapore（离国内近）
   - 环境变量 `DATABASE_URL` 填上面那串（render.yaml 里标了 `sync: false`，需要手动填一次）
   - 部署完成后得到 `https://waimai-api.onrender.com`

3. **App 里填这个地址**，注册账号即可三端联动。

冷启动提示：免费实例休眠后首次访问要约 30–60 秒唤醒，App 首次打开如果转圈就等一下再刷新。

---

## 四、账号与接口

```
POST /api/auth/register  {username, password, nickname}   → {user, token}
POST /api/auth/login     {username, password}             → {user, token}
GET  /api/auth/me                                          → {user}
POST /api/auth/logout
POST /api/auth/verify    {password}   ← 切换商家/骑手/用户身份前调用，密码错误则拒绝切换
```

其余业务接口见下方「接口一览」。未登录时也能浏览（游客身份 `u1`），登录后订单归属自己的账号。

---

## 五、目录结构

```
server/
  index.js      Express + WebSocket + 账号路由
  sim.js        订单状态机、骑手移动模拟、自动派单、聊天自动回复
  store.js      种子数据 + 持久化（Postgres / 文件双后端）
  auth.js       scrypt 密码哈希、token 签发与校验
shared/city.js  前后端共用的虚拟城市路网与路径规划
public/         Web 三端（index / user / rider / merchant）+ js/core.js、js/map.js（Canvas 地图）
ios/
  project.yml   XcodeGen 工程定义
  Waimai/
    App/        WaimaiApp.swift、RootView.swift
    Core/       Models、API（REST+WebSocket）、AppState、Geo（坐标映射）
    UI/         Glass.swift（液态玻璃）、Common.swift
    Auth/       AuthView（注册/登录）、RoleSwitchView（切换身份输密码）
    User/ Rider/ Merchant/ Shared/   三端界面 + 聊天 + 地图导航
.github/workflows/  ios.yml（构建 IPA）、server.yml（后端测试）
render.yaml     Render Blueprint
scripts/swiftcheck.py  Swift 静态自检（本机没 Xcode 时的兜底检查）
test/           smoke（全链路）、auth（账号）、dom（三端渲染）
```

---

## 六、接口一览

```
GET  /api/bootstrap?role=user|rider|merchant   全量初始数据（含 me）
GET  /api/shops · /api/shops/:id · /api/orders
POST /api/orders                               下单
POST /api/orders/:id/action                    状态动作
     merchant_accept | merchant_cooked | rider_accept | rider_pick
     | rider_deliver | user_confirm | user_cancel
GET  /api/orders/:id/messages · POST /api/orders/:id/messages
POST /api/riders/:id/toggle                    {field:'online'|'auto'}
POST /api/merchant/toggle                      {field:'auto'|'online'|'cookSeconds'}
POST /api/reset                                重置演示数据（保留账号）
WS   /ws?role=...&token=...                    推送 hello / orders / riders / message
```

---

## 七、测试

```bash
npm start            # 另开一个终端保持运行
npm test             # 后端全链路：下单 → 送达 → 聊天
npm run test:auth    # 账号：注册/登录/切换身份密码验证/token 鉴权
npm run test:switch  # 反复切换身份 + 退出再登录，订单与聊天是否保留
npm run test:dom     # 三端 DOM 渲染（jsdom 真实执行，js 报错会被捕获）
python scripts/swiftcheck.py   # Swift 静态自检（括号/元组解构/全角符号）
```

## 八、常见问题

**液态玻璃没效果？** 需要 iPhone 装 iOS 26+。低于 iOS 26 会自动降级成毛玻璃，功能不受影响。

**CI 报 `glassEffect` 相关错误？** 说明该 Xcode 版本的 API 名有变化。打开 `ios/Waimai/UI/Glass.swift`，
把 `#available(iOS 26.0, *)` 分支里的 `.glassEffect(...)` 换成 `else` 分支的 `.background(.regularMaterial, ...)` 即可全局降级。

**App 连不上服务器？** 本机调试确认手机和电脑在同一局域网、防火墙放行 3000 端口；地址用 `http://` 不要 `https://`。
云端确认 Render 实例已唤醒。
