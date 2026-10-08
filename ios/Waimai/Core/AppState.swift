import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {

    enum Role: String, CaseIterable, Identifiable {
        case user, rider, merchant
        var id: String { rawValue }
        var title: String {
            switch self { case .user: return "用户端"; case .rider: return "骑手端"; case .merchant: return "商家端" }
        }
        var icon: String {
            switch self { case .user: return "🍜"; case .rider: return "🛵"; case .merchant: return "🏪" }
        }
    }

    @Published var me: UserAccount?
    @Published var role: Role = .user
    @Published var shops: [Shop] = []
    @Published var dishes: [Dish] = []
    @Published var orders: [Order] = []
    @Published var riders: [Rider] = []
    @Published var addresses: [Address] = []
    @Published var merchant: MerchantState?
    @Published var messages: [String: [ChatMessage]] = [:]

    @Published var cart: [String: Int] = [:]
    @Published var cartShopId: String?

    /// 骑手端当前使用的骑手账号（演示用，可在骑手端切换）
    @Published var currentRiderId: String = "r1"

    /// 待验证密码后切换的目标身份（nil 表示不弹窗）
    @Published var pendingRole: Role?

    @Published var serverText: String = API.shared.baseURL
    @Published var busy = false
    @Published var notice: String?

    var isLoggedIn: Bool { me != nil && API.shared.token != nil }

    init() {
        role = Role(rawValue: UserDefaults.standard.string(forKey: "waimai.role") ?? "user") ?? .user
    }

    func say(_ text: String) {
        notice = text
        Task { try? await Task.sleep(nanoseconds: 2_200_000_000); self.notice = nil }
    }

    // MARK: - 账号

    func register(username: String, password: String, nickname: String) async {
        busy = true
        defer { busy = false }
        do {
            let r: AuthResp = try await API.shared.post("/api/auth/register",
                                                        body: ["username": username, "password": password, "nickname": nickname])
            guard let t = r.token else { say("注册失败"); return }
            API.shared.token = t
            me = r.user
            say("注册成功，欢迎 \(r.user?.nickname ?? "")")
            await refresh(); connect()
        } catch { say(error.localizedDescription) }
    }

    func login(username: String, password: String) async {
        busy = true
        defer { busy = false }
        do {
            let r: AuthResp = try await API.shared.post("/api/auth/login",
                                                        body: ["username": username, "password": password])
            guard let t = r.token else { say("登录失败"); return }
            API.shared.token = t
            me = r.user
            say("欢迎回来，\(r.user?.nickname ?? "")")
            await refresh(); connect()
        } catch { say(error.localizedDescription) }
    }

    func logout() {
        Realtime.shared.disconnect()
        API.shared.token = nil
        me = nil
        orders = []
        messages = [:]
    }

    /// 切换商家 / 骑手 / 用户身份：必须先输入密码验证
    func switchRole(to: Role, password: String) async throws {
        let _: OKResp = try await API.shared.post("/api/auth/verify", body: ["password": password])
        role = to
        UserDefaults.standard.set(to.rawValue, forKey: "waimai.role")
        await refresh()
        connect()
    }

    /// 点击「切换身份」按钮：弹出密码验证
    func requestRole(_ r: Role) {
        if r == role { say("当前已在\(r.title)"); return }
        pendingRole = r
    }

    func toggleRider(field: String) async {
        do {
            let _: OKResp = try await API.shared.post("/api/riders/\(currentRiderId)/toggle", body: ["field": field])
            await refresh()
        } catch { say(error.localizedDescription) }
    }

    func toggleMerchant(field: String, value: Int? = nil) async {
        var body: [String: Any] = ["field": field]
        if let value { body["value"] = value }
        do {
            let _: OKResp = try await API.shared.post("/api/merchant/toggle", body: body)
            await refresh()
        } catch { say(error.localizedDescription) }
    }

    func applyServer(_ url: String) {
        let t = url.trimmingCharacters(in: .whitespacesAndNewlines)
        API.shared.baseURL = t
        serverText = t
        Realtime.shared.disconnect()
        Task { await refresh(); connect() }
    }

    // MARK: - 数据

    func refresh() async {
        do {
            let b: Bootstrap = try await API.shared.get("/api/bootstrap?role=" + role.rawValue)
            shops = b.shops ?? []
            dishes = b.dishes ?? []
            riders = b.riders ?? []
            orders = b.orders ?? []
            addresses = b.user?.addresses ?? []
            merchant = b.merchant
            if let m = b.me { me = m }
        } catch {
            say("连接服务器失败：\(error.localizedDescription)")
        }
    }

    func connect() {
        guard let url = API.shared.wsURL(role: role.rawValue) else { return }
        Realtime.shared.onText = { [weak self] text in
            Task { @MainActor in self?.handleWS(text) }
        }
        Realtime.shared.onClosed = { [weak self] in
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                self?.connect()
            }
        }
        Realtime.shared.connect(url: url)
    }

    private func handleWS(_ text: String) {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String else { return }
        let payload = obj["payload"]
        switch type {
        case "hello":
            if let d = payload as? [String: Any], let b = decode(Bootstrap.self, d) {
                shops = b.shops ?? shops
                dishes = b.dishes ?? dishes
                riders = b.riders ?? riders
                orders = b.orders ?? orders
                addresses = b.user?.addresses ?? addresses
                merchant = b.merchant
                if let m = b.me { me = m }
            }
        case "orders":
            if let arr = payload as? [Any], let list = decode([Order].self, arr) { orders = list }
        case "riders":
            if let arr = payload as? [Any], let list = decode([Rider].self, arr) { riders = list }
        case "merchant":
            if let d = payload as? [String: Any], let m = decode(MerchantState.self, d) { merchant = m }
        case "message":
            if let d = payload as? [String: Any], let m = decode(ChatMessage.self, d) {
                var arr = messages[m.orderId] ?? []
                if !arr.contains(where: { $0.id == m.id }) { arr.append(m) }
                messages[m.orderId] = arr
            }
        default: break
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, _ value: Any) -> T? {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - 业务

    func placeOrder(shopId: String, addressId: String, remark: String, tableware: Int, pay: String) async -> Order? {
        let items = cart.filter { $0.value > 0 }.map { ["dishId": $0.key, "qty": $0.value] }
        guard !items.isEmpty else { say("购物车是空的"); return nil }
        struct Resp: Decodable { let order: Order? }
        do {
            let r: Resp = try await API.shared.post("/api/orders", body: [
                "shopId": shopId, "items": items, "addressId": addressId,
                "remark": remark, "tableware": tableware, "payMethod": pay
            ])
            cart = [:]
            cartShopId = nil
            say("下单成功 🎉")
            await refresh()
            return r.order
        } catch { say(error.localizedDescription); return nil }
    }

    func orderAction(_ id: String, act: String, riderId: String? = nil) async {
        var body: [String: Any] = ["act": act, "actor": role.rawValue]
        if let riderId { body["riderId"] = riderId }
        do {
            let _: OKResp = try await API.shared.post("/api/orders/\(id)/action", body: body)
            await refresh()
        } catch { say(error.localizedDescription) }
    }

    func loadMessages(_ orderId: String) async {
        do {
            let list: [ChatMessage] = try await API.shared.get("/api/orders/\(orderId)/messages")
            messages[orderId] = list
        } catch { /* ignore */ }
    }

    func sendMessage(_ orderId: String, from: String, to: String, text: String) async {
        do {
            let _: OKResp = try await API.shared.post("/api/orders/\(orderId)/messages",
                                                     body: ["from": from, "to": to, "text": text])
            await loadMessages(orderId)
        } catch { say(error.localizedDescription) }
    }

    // MARK: - 购物车

    func addToCart(_ dish: Dish) {
        if cartShopId != nil && cartShopId != dish.shopId {
            cart = [:]
            say("已切换店铺，购物车清空")
        }
        cartShopId = dish.shopId
        cart[dish.id] = (cart[dish.id] ?? 0) + 1
    }

    func removeFromCart(_ dishId: String) {
        guard let n = cart[dishId] else { return }
        if n <= 1 { cart[dishId] = nil } else { cart[dishId] = n - 1 }
        if cart.values.allSatisfy({ $0 == 0 }) { cartShopId = nil }
    }

    func cartCount(_ shopId: String? = nil) -> Int {
        cart.filter { $0.value > 0 && (shopId == nil || dishShop($0.key) == shopId) }.reduce(0) { $0 + $1.value }
    }

    func cartTotal() -> Double {
        cart.reduce(0) { sum, kv in
            sum + (dishes.first(where: { $0.id == kv.key })?.price ?? 0) * Double(kv.value)
        }
    }

    private func dishShop(_ dishId: String) -> String? {
        dishes.first(where: { $0.id == dishId })?.shopId
    }
}
