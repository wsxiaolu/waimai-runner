import SwiftUI

struct OrdersView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        NavigationStack {
            Group {
                if state.orders.isEmpty {
                    VStack(spacing: 10) {
                        Text("🍱").font(.system(size: 54))
                        Text("还没有订单").foregroundStyle(.secondary)
                        Text("去首页挑一家喜欢的店吧").font(.caption).foregroundStyle(.tertiary)
                    }
                    .padding(.top, 80)
                    .frame(maxWidth: .infinity)
                } else {
                    List {
                        ForEach(state.orders) { o in
                            NavigationLink { OrderTrackView(orderId: o.id) } label: { OrderRow(order: o) }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("订单")
            .toolbar { RoleSwitchToolbar() }
            .refreshable { await state.refresh() }
        }
    }
}

struct OrderRow: View {
    let order: Order
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("\(order.shopEmoji ?? "🍱") \(order.shopName ?? "")").font(.subheadline.weight(.semibold)).lineLimit(1)
                Spacer()
                StatusPill(text: order.statusText, active: order.isActive)
            }
            Text(order.items?.map { "\($0.emoji ?? "")\($0.name)x\($0.qty)" }.joined(separator: "，") ?? "")
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            HStack {
                Text(Geo.timeText(order.createdAt)).font(.caption2).foregroundStyle(.tertiary)
                Spacer()
                PriceText(value: order.total ?? 0, size: 14)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - 订单跟踪

struct OrderTrackView: View {
    @EnvironmentObject var state: AppState
    let orderId: String

    var body: some View {
        Group {
            if let order = state.orders.first(where: { $0.id == orderId }) {
                content(order)
            } else {
                Text("订单不存在").foregroundStyle(.secondary)
            }
        }
        .navigationTitle("订单跟踪")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func content(_ o: Order) -> some View {
        ScrollView {
            VStack(spacing: 14) {
                // 地图
                NavMapView(
                    pins: [
                        MapPin(id: "shop", title: "商家", emoji: o.shopEmoji ?? "🏪",
                               coord: Geo.coord(x: o.shopPos?.x ?? 0, y: o.shopPos?.y ?? 0)),
                        MapPin(id: "home", title: "我的位置", emoji: "🏠",
                               coord: Geo.coord(x: o.address?.pos?.x ?? 0, y: o.address?.pos?.y ?? 0))
                    ],
                    route: Geo.coords(o.route),
                    rider: o.riderPos.map { Geo.coord(x: $0.x, y: $0.y) }
                )
                .frame(height: 260)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(alignment: .bottomLeading) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(o.statusText).font(.headline)
                        if o.isActive {
                            Text("距您还有 \(Geo.distanceText(o.remainMeters)) · 约 \(Geo.etaText(o.remainMeters))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(10)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(10)
                }

                // 骑手
                CardView {
                    HStack(spacing: 12) {
                        Text(o.riderEmoji ?? "⏳").font(.system(size: 30))
                        VStack(alignment: .leading, spacing: 3) {
                            if let n = o.riderName {
                                Text(n).font(.subheadline.weight(.semibold))
                                Text("\(o.riderPhone ?? "") · 正在为您配送")
                                    .font(.caption2).foregroundStyle(.secondary)
                            } else {
                                Text("正在为您分配骑手").font(.subheadline.weight(.semibold))
                                Text("请稍候，系统正在派单…").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        if o.riderId != nil {
                            NavigationLink("💬 消息") { ChatView(orderId: o.id, role: "user") }
                                .font(.caption)
                        }
                    }
                }

                // 进度
                CardView {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("配送进度").font(.subheadline.weight(.semibold))
                        ForEach(o.timeline ?? []) { t in
                            HStack(alignment: .top, spacing: 10) {
                                Circle().fill(Color.orange).frame(width: 8, height: 8).padding(.top, 5)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(t.label).font(.caption)
                                    Text(Geo.timeText(t.time)).font(.caption2).foregroundStyle(.tertiary)
                                }
                            }
                        }
                    }
                }

                // 明细
                CardView {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(o.shopEmoji ?? "🍱") \(o.shopName ?? "")").font(.subheadline.weight(.semibold))
                        ForEach(o.items ?? []) { i in
                            HStack {
                                Text("\(i.emoji ?? "") \(i.name) x\(i.qty)").font(.caption)
                                Spacer()
                                PriceText(value: i.price * Double(i.qty), size: 13)
                            }
                        }
                        Divider()
                        HStack { Text("实付").fontWeight(.semibold); Spacer(); PriceText(value: o.total ?? 0, size: 16) }
                        Text("📍 \(o.address?.detail ?? "")").font(.caption2).foregroundStyle(.secondary)
                        Text("订单号 \(o.code ?? "")").font(.caption2).foregroundStyle(.tertiary)
                    }
                }

                // 操作
                if o.status == "arrived" {
                    BigButton(title: "确认送达", icon: "checkmark.seal.fill") {
                        Task { await state.orderAction(o.id, act: "user_confirm") }
                    }
                } else if o.status == "created" {
                    BigButton(title: "取消订单", icon: "xmark.circle", color: .gray) {
                        Task { await state.orderAction(o.id, act: "user_cancel") }
                    }
                }
                if o.riderId != nil {
                    NavigationLink("联系骑手 / 商家") { ChatView(orderId: o.id, role: "user") }
                        .font(.subheadline)
                }
            }
            .padding(14)
        }
        .background(Color(.systemGroupedBackground))
    }
}
