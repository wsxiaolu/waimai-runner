import SwiftUI

struct RiderHomeView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        NavigationStack {
            List {
                Section {
                    riderHeader
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }

                let pool = state.orders.filter { $0.status == "cooked" && ($0.riderId ?? "").isEmpty }
                if !pool.isEmpty {
                    Section("🔥 待抢订单 (\(pool.count))") {
                        ForEach(pool) { o in TaskRow(order: o, canGrab: true) }
                    }
                }
                Section("📦 我的任务 (\(mine.count))") {
                    if mine.isEmpty {
                        Text("暂无进行中的任务").foregroundStyle(.secondary)
                    } else {
                        ForEach(mine) { o in TaskRow(order: o, canGrab: false) }
                    }
                }
                let done = state.orders.filter { $0.riderId == state.currentRiderId && $0.status == "completed" }
                if !done.isEmpty {
                    Section("✅ 已完成 (\(done.count))") {
                        ForEach(done) { o in
                            HStack {
                                Text("\(o.shopEmoji ?? "🍱") \(o.shopName ?? "")").font(.subheadline).lineLimit(1)
                                Spacer()
                                Text("+¥" + String(format: "%.1f", (o.deliveryFee ?? 0) * 0.8 + 3))
                                    .font(.caption.bold()).foregroundStyle(.green)
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("骑手端")
            .toolbar { RoleSwitchToolbar() }
            .refreshable { await state.refresh() }
        }
    }

    private var mine: [Order] {
        state.orders.filter { $0.riderId == state.currentRiderId && $0.isActive }
    }

    private var riderHeader: some View {
        let r = state.riders.first(where: { $0.id == state.currentRiderId })
        return VStack(spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("¥" + String(format: "%.2f", r?.income ?? 0)).font(.title.bold())
                    Text("今日收入 · 已完成 \(r?.orderCount ?? 0) 单").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text("\(r?.emoji ?? "🛵") \(r?.name ?? "骑手")").font(.subheadline.weight(.semibold))
                    Text(r?.plate ?? "").font(.caption2).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 10) {
                ToggleRow(title: "接单中", on: r?.online ?? true) {
                    Task { await state.toggleRider(field: "online") }
                }
                ToggleRow(title: "自动取餐/送达", on: r?.autoMode ?? true) {
                    Task { await state.toggleRider(field: "auto") }
                }
            }
            Picker("骑手账号", selection: Binding(
                get: { state.currentRiderId },
                set: { state.currentRiderId = $0 }
            )) {
                ForEach(state.riders) { r in Text("\(r.emoji ?? "🛵") \(r.name)").tag(r.id) }
            }
            .pickerStyle(.segmented)
            .font(.caption)
        }
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
    }
}

struct ToggleRow: View {
    let title: String
    let on: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Circle().fill(on ? Color.green : Color.gray.opacity(0.4)).frame(width: 8, height: 8)
                Text(title).font(.caption)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Color(.tertiarySystemBackground), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct TaskRow: View {
    @EnvironmentObject var state: AppState
    let order: Order
    let canGrab: Bool

    var body: some View {
        NavigationLink {
            TaskNavView(orderId: order.id)
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    StatusPill(text: canGrab ? "待抢" : order.statusText, active: true)
                    Text(order.code ?? "").font(.caption2).foregroundStyle(.tertiary)
                    Spacer()
                    Text("+¥" + String(format: "%.1f", fee)).font(.subheadline.bold()).foregroundStyle(.red)
                }
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Label("取", systemImage: "storefront").font(.caption2).foregroundStyle(.orange)
                        Text(order.shopName ?? "").font(.caption).lineLimit(1)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Label("送", systemImage: "house.fill").font(.caption2).foregroundStyle(.green)
                        Text(order.address?.detail ?? "").font(.caption).lineLimit(1)
                    }
                }
                Text(order.items?.map { "\($0.emoji ?? "")\($0.name)x\($0.qty)" }.joined(separator: "，") ?? "")
                    .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            .padding(.vertical, 4)
        }
    }

    private var fee: Double { (order.deliveryFee ?? 0) * 0.8 + 3 }
}

// MARK: - 任务导航

struct TaskNavView: View {
    @EnvironmentObject var state: AppState
    let orderId: String

    var body: some View {
        Group {
            if let o = state.orders.first(where: { $0.id == orderId }) { content(o) }
            else { Text("任务不存在").foregroundStyle(.secondary) }
        }
        .navigationTitle("配送导航")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func content(_ o: Order) -> some View {
        let fetching = ["assigned", "picking"].contains(o.status)
        VStack(spacing: 0) {
            NavMapView(
                pins: [
                    MapPin(id: "shop", title: "商家", emoji: o.shopEmoji ?? "🏪",
                           coord: Geo.coord(x: o.shopPos?.x ?? 0, y: o.shopPos?.y ?? 0)),
                    MapPin(id: "home", title: "用户", emoji: "🏠",
                           coord: Geo.coord(x: o.address?.pos?.x ?? 0, y: o.address?.pos?.y ?? 0))
                ],
                route: Geo.coords(o.route),
                rider: o.riderPos.map { Geo.coord(x: $0.x, y: $0.y) }
            )
            .frame(maxHeight: .infinity)

            VStack(spacing: 12) {
                HStack {
                    Text(fetching ? "🏪 前往商家取餐" : "🏠 送往用户").font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(Geo.distanceText(o.remainMeters)).font(.title3.bold())
                    Text("约 \(Geo.etaText(o.remainMeters))").font(.caption).foregroundStyle(.secondary)
                }
                HStack(spacing: 10) {
                    NavigationLink { ChatView(orderId: o.id, role: "rider") } label: {
                        Text("💬 联系").font(.subheadline)
                            .frame(maxWidth: .infinity).frame(height: 42)
                            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    BigButton(
                        title: buttonTitle(o),
                        icon: "checkmark.circle.fill",
                        disabled: !["picking", "arrived"].contains(o.status)
                    ) {
                        Task {
                            if o.status == "picking" { await state.orderAction(o.id, act: "rider_pick") }
                            else if o.status == "arrived" { await state.orderAction(o.id, act: "rider_deliver") }
                        }
                    }
                }
            }
            .padding(14)
            .background(.bar)
        }
        .ignoresSafeArea(edges: .bottom)
    }

    private func buttonTitle(_ o: Order) -> String {
        switch o.status {
        case "picking": return "确认取餐"
        case "arrived": return "确认送达"
        case "assigned": return "赶往商家中…"
        case "delivering": return "配送中…"
        case "completed": return "已完成"
        default: return o.statusText
        }
    }
}
