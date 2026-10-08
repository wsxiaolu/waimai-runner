import Foundation

// MARK: - 基础

struct Pos: Codable, Hashable {
    let x: Double
    let y: Double
}

struct UserAccount: Codable, Equatable {
    let id: String
    let username: String
    let nickname: String
    let avatar: String?
    let roles: [String]?
}

struct Address: Codable, Identifiable {
    let id: String
    let label: String?
    let name: String?
    let phone: String?
    let detail: String
    let pos: Pos?
    let tag: String?
}

// MARK: - 商家与菜品

struct Shop: Codable, Identifiable {
    let id: String
    let name: String
    let emoji: String?
    let category: String?
    let rating: Double?
    let monthSales: Int?
    let deliveryFee: Double?
    let minPrice: Double?
    let deliveryTime: Int?
    let pos: Pos?
    let address: String?
    let tags: [String]?
    let promos: [String]?
    let notice: String?
    let brand: String?
    let distance: Double?
}

struct Dish: Codable, Identifiable {
    let id: String
    let shopId: String
    let name: String
    let emoji: String?
    let price: Double
    let oldPrice: Double?
    let sales: Int?
    let cat: String?
    let desc: String?
}

struct Rider: Codable, Identifiable {
    let id: String
    let name: String
    let emoji: String?
    let phone: String?
    let pos: Pos?
    let heading: Double?
    let status: String?
    let online: Bool?
    let rating: Double?
    let orderCount: Int?
    let income: Double?
    let plate: String?
    let autoMode: Bool?
}

// MARK: - 订单

struct OrderItem: Codable, Identifiable {
    var id: String { dishId }
    let dishId: String
    let name: String
    let emoji: String?
    let price: Double
    let qty: Int
}

struct TimelineItem: Codable, Identifiable {
    var id: String { status }
    let status: String
    let label: String
    let time: Double
}

struct Eta: Codable {
    let seconds: Double?
    let at: Double?
}

struct RiderPos: Codable {
    let x: Double
    let y: Double
    let heading: Double?
}

struct Order: Codable, Identifiable {
    let id: String
    let code: String?
    let shopId: String?
    let shopName: String?
    let shopEmoji: String?
    let shopPos: Pos?
    let items: [OrderItem]?
    let subtotal: Double?
    let packFee: Double?
    let deliveryFee: Double?
    let discount: Double?
    let total: Double?
    let status: String
    let createdAt: Double?
    let address: Address?
    let remark: String?
    let riderId: String?
    let riderName: String?
    let riderPhone: String?
    let riderEmoji: String?
    let route: [Pos]?
    let traveled: Double?
    let legTotal: Double?
    let riderPos: RiderPos?
    let timeline: [TimelineItem]?
    let eta: Eta?

    var statusText: String {
        switch status {
        case "created": return "等待商家接单"
        case "accepted": return "商家备餐中"
        case "cooked": return "餐品已备好"
        case "assigned": return "骑手赶往商家"
        case "picking": return "骑手取餐中"
        case "delivering": return "骑手配送中"
        case "arrived": return "已送达待确认"
        case "completed": return "已完成"
        case "cancelled": return "已取消"
        default: return status
        }
    }
    var isActive: Bool { !["completed", "cancelled"].contains(status) }
    var remainMeters: Double { max(0, (legTotal ?? 0) - (traveled ?? 0)) }
}

// MARK: - 消息

struct ChatMessage: Codable, Identifiable {
    let id: String
    let orderId: String
    let from: String
    let fromName: String?
    let to: String?
    let text: String
    let ts: Double?
    let kind: String?

    var isSystem: Bool { kind == "system" }
}

// MARK: - 启动数据

struct Bootstrap: Codable {
    let role: String?
    let me: UserAccount?
    let shops: [Shop]?
    let dishes: [Dish]?
    let riders: [Rider]?
    let orders: [Order]?
    let user: BootstrapUser?
    let merchant: MerchantState?
}

struct BootstrapUser: Codable {
    let id: String?
    let name: String?
    let addresses: [Address]?
}

struct MerchantState: Codable {
    let autoAccept: Bool?
    let cookSeconds: Int?
    let online: Bool?
    let income: Double?
    let todayOrders: Int?
}
