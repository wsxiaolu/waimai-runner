import SwiftUI

struct MerchantHomeView: View {
    @EnvironmentObject var state: AppState
    @State private var tab = "pending"

    private let tabs: [(String, String, (Order) -> Bool)] = [
        ("pending", "待接单", { $0.status == "created" }),
        ("cooking", "备餐中", { $0.status == "accepted" }),
        ("waiting", "待取餐", { ["cooked", "assigned", "picking"].contains($0.status) }),
        ("sending", "配送中", { ["delivering", "arrived"].contains($0.status) }),
        ("done", "已完成", { ["completed", "cancelled"].contains($0.status) })
    ]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    header
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }

                Section {
                    Picker("", selection: $tab) {
                        ForEach(tabs, id: \.0) { t in
                            let n = state.orders.filter(t.2).count
                            Text(n > 0 ? "\(t.1) \(n)" : t.1).tag(t.0)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                }

                let list = state.orders.filter(tabs.first(where: { $0.0 == tab })?.2 ?? { _ in true })
                if list.isEmpty {
                    Text("暂无订单").foregroundStyle(.secondary)
                } else {
                    ForEach(list) { o in MerchantOrderRow(order: o) }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("商家端")
            .toolbar { RoleSwitchToolbar() }
            .refreshable { await state.refresh() }
        }
    }

    private var header: some View {
        let m = state.merchant
        let done = state.orders.filter { $0.status == "completed" }
        return VStack(spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("¥" + String(format: "%.2f", (m?.income ?? 0) + done.reduce(0) { $0 + ($1.total ?? 0) }))
                        .font(.title.bold())
                    Text("今日营业额 · \(done.count) 单").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text((m?.online ?? true) ? "营业中" : "已打烊")
                    .font(.caption.bold())
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background((m?.online ?? true) ? Color.green.opacity(0.16) : Color.gray.opacity(0.16), in: Capsule())
                    .foregroundStyle((m?.online ?? true) ? .green : .secondary)
            }
            HStack(spacing: 10) {
                ToggleRow(title: "营业中", on: m?.online ?? true) { Task { await state.toggleMerchant(field: "online") } }
                ToggleRow(title: "自动接单", on: m?.autoAccept ?? true) { Task { await state.toggleMerchant(field: "auto") } }
                ToggleRow(title: "出餐 \((m?.cookSeconds ?? 15))s", on: true) {
                    let next = ((m?.cookSeconds ?? 15) == 15) ? 5 : 15
                    Task { await state.toggleMerchant(field: "cookSeconds", value: next) }
                }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
    }
}

struct MerchantOrderRow: View {
    @EnvironmentObject var state: AppState
    let order: Order

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(order.shopEmoji ?? "🍱") \(order.code ?? "")").font(.subheadline.weight(.semibold))
                Spacer()
                StatusPill(text: merchantStatus(order.status), active: order.isActive)
            }
            Text(Geo.timeText(order.createdAt) + " 下单 · " + (order.shopName ?? ""))
                .font(.caption2).foregroundStyle(.tertiary)

            VStack(alignment: .leading, spacing: 3) {
                ForEach(order.items ?? []) { i in
                    HStack {
                        Text("\(i.emoji ?? "") \(i.name)").font(.caption)
                        Spacer()
                        Text("x\(i.qty)").font(.caption2).foregroundStyle(.secondary)
                        PriceText(value: i.price * Double(i.qty), size: 13)
                    }
                }
            }
            .padding(10)
            .background(Color(.tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

            if let r = order.remark, !r.isEmpty {
                Text("📝 \(r)").font(.caption2).foregroundStyle(.orange)
            }
            Text("👤 \(order.address?.name ?? "") \(order.address?.phone ?? "")").font(.caption2)
            Text("📍 \(order.address?.detail ?? "")").font(.caption2).foregroundStyle(.secondary)
            if let rn = order.riderName {
                Text("🛵 骑手 \(rn) \(order.riderPhone ?? "")").font(.caption2).foregroundStyle(.secondary)
            }

            HStack {
                PriceText(value: order.total ?? 0, size: 16)
                Spacer()
                if order.status == "created" {
                    Button("接单") { Task { await state.orderAction(order.id, act: "merchant_accept") } }
                        .buttonStyle(.borderedProminent).tint(.orange)
                    Button("拒单") { Task { await state.orderAction(order.id, act: "user_cancel") } }
                        .buttonStyle(.bordered)
                } else if order.status == "accepted" {
                    Button("出餐完成") { Task { await state.orderAction(order.id, act: "merchant_cooked") } }
                        .buttonStyle(.borderedProminent).tint(.orange)
                }
                NavigationLink("💬 聊天") { ChatView(orderId: order.id, role: "merchant") }
                    .buttonStyle(.bordered)
            }
            .font(.caption)
        }
        .padding(.vertical, 6)
    }
}

private func merchantStatus(_ s: String) -> String {
    switch s {
    case "created": return "待接单"
    case "accepted": return "备餐中"
    case "cooked": return "待骑手取餐"
    case "assigned": return "骑手赶来中"
    case "picking": return "骑手取餐中"
    case "delivering": return "配送中"
    case "arrived": return "已送达"
    case "completed": return "已完成"
    case "cancelled": return "已取消"
    default: return s
    }
}
