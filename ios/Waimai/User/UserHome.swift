import SwiftUI

// MARK: - 首页：商家列表

struct UserHomeView: View {
    @EnvironmentObject var state: AppState
    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 4) {
                            Image(systemName: "location.fill").foregroundStyle(.orange)
                            Text(state.addresses.first?.detail ?? "选择收货地址")
                                .font(.subheadline.weight(.semibold))
                                .lineLimit(1)
                            Image(systemName: "chevron.down").font(.caption2).foregroundStyle(.secondary)
                        }
                        HStack(spacing: 6) {
                            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                            Text("搜索「螺蛳粉」").foregroundStyle(.secondary)
                            Spacer()
                            Text("搜索").font(.caption.weight(.semibold))
                                .padding(.horizontal, 12).padding(.vertical, 5)
                                .background(Color.orange, in: Capsule()).foregroundStyle(.white)
                        }
                        .font(.subheadline)
                        .padding(10)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .padding(.vertical, 4)
                    .listRowInsets(EdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 14))
                    .listRowBackground(Color.clear)
                }

                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 14) {
                            ForEach(["🍜", "🛒", "💊", "🍉", "🧋", "🍢", "🛵", "💐"], id: \.self) { e in
                                VStack(spacing: 6) {
                                    Text(e).font(.system(size: 26))
                                        .frame(width: 46, height: 46)
                                        .background(Color(.secondarySystemBackground), in: Circle())
                                    Text("频道").font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
                    .listRowBackground(Color.clear)
                }

                Section("附近商家") {
                    ForEach(state.shops) { shop in
                        NavigationLink(value: "shop:" + shop.id) { ShopRow(shop: shop) }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("外卖")
            .navigationDestination(for: String.self) { value in
                if value.hasPrefix("shop:"),
                   let shop = state.shops.first(where: { $0.id == String(value.dropFirst(5)) }) {
                    ShopDetailView(shop: shop, path: $path)
                } else if value.hasPrefix("checkout:"),
                          let shop = state.shops.first(where: { $0.id == String(value.dropFirst(9)) }) {
                    CheckoutView(shop: shop, path: $path)
                }
            }
            .toolbar { RoleSwitchToolbar() }
            .refreshable { await state.refresh() }
        }
    }
}

struct ShopRow: View {
    let shop: Shop
    var body: some View {
        HStack(spacing: 12) {
            EmojiBox(emoji: shop.emoji ?? "🍱", size: 56)
            VStack(alignment: .leading, spacing: 4) {
                Text(shop.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                HStack(spacing: 6) {
                    Text(String(format: "★ %.1f", shop.rating ?? 0)).foregroundStyle(.orange).font(.caption.bold())
                    Text("月售 \(shop.monthSales ?? 0)").font(.caption).foregroundStyle(.secondary)
                    if let d = shop.distance { Text(Geo.distanceText(d)).font(.caption).foregroundStyle(.secondary) }
                }
                HStack(spacing: 6) {
                    Text("起送 ¥\(Int(shop.minPrice ?? 0))").font(.caption2).foregroundStyle(.secondary)
                    Text("配送 ¥\(Int(shop.deliveryFee ?? 0))").font(.caption2).foregroundStyle(.secondary)
                    Text("\(shop.deliveryTime ?? 30) 分钟").font(.caption2).foregroundStyle(.secondary)
                }
                if let p = shop.promos?.first {
                    Text("🔔 \(p)").font(.caption2).foregroundStyle(.orange)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - 商家详情

struct ShopDetailView: View {
    @EnvironmentObject var state: AppState
    let shop: Shop
    @Binding var path: [String]

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 12) {
                        Text(shop.emoji ?? "🍱").font(.system(size: 44))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(shop.name).font(.headline)
                            Text(String(format: "★ %.1f · 月售 %d · %d 分钟送达",
                                        shop.rating ?? 0, shop.monthSales ?? 0, shop.deliveryTime ?? 30))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if let notice = shop.notice { Text("📢 \(notice)").font(.caption).foregroundStyle(.secondary) }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(shop.promos ?? [], id: \.self) { p in StatusPill(text: "🎫 \(p)") }
                        }
                    }
                }
                .padding(.vertical, 4)
            }

            ForEach(cats, id: \.self) { cat in
                Section(cat) {
                    ForEach(dishes.filter { ($0.cat ?? "招牌") == cat }) { dish in
                        DishRow(dish: dish)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(shop.name)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) { CartBar(shop: shop, path: $path) }
    }

    private var dishes: [Dish] { state.dishes.filter { $0.shopId == shop.id } }
    private var cats: [String] {
        var out: [String] = []
        for d in dishes { let c = d.cat ?? "招牌"; if !out.contains(c) { out.append(c) } }
        return out
    }
}

struct DishRow: View {
    @EnvironmentObject var state: AppState
    let dish: Dish

    var body: some View {
        HStack(spacing: 12) {
            EmojiBox(emoji: dish.emoji ?? "🍽️", size: 62)
            VStack(alignment: .leading, spacing: 3) {
                Text(dish.name).font(.subheadline.weight(.medium))
                if let d = dish.desc { Text(d).font(.caption2).foregroundStyle(.secondary).lineLimit(2) }
                Text("月售 \(dish.sales ?? 0)").font(.caption2).foregroundStyle(.tertiary)
                HStack {
                    PriceText(value: dish.price)
                    if let old = dish.oldPrice {
                        Text(String(format: "¥%.0f", old))
                            .font(.caption2).strikethrough().foregroundStyle(.tertiary)
                    }
                    Spacer()
                    Stepper2(count: state.cart[dish.id] ?? 0,
                             onAdd: { state.addToCart(dish) },
                             onSub: { state.removeFromCart(dish.id) })
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct CartBar: View {
    @EnvironmentObject var state: AppState
    let shop: Shop
    @Binding var path: [String]

    var body: some View {
        let count = state.cartCount(shop.id)
        let total = state.cartTotal()
        let min = shop.minPrice ?? 0
        HStack(spacing: 12) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "cart.fill").font(.title2).foregroundStyle(.orange)
                if count > 0 {
                    Text("\(count)").font(.caption2.bold()).foregroundStyle(.white)
                        .padding(5).background(Color.red, in: Circle()).offset(x: 8, y: -8)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                if count > 0 {
                    PriceText(value: total, size: 17)
                    Text("另需配送费 ¥\(Int(shop.deliveryFee ?? 0))").font(.caption2).foregroundStyle(.secondary)
                } else {
                    Text("未选购商品").font(.subheadline)
                    Text("起送 ¥\(Int(min))").font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button {
                path.append("checkout:" + shop.id)
            } label: {
                Text(count > 0 && total >= min ? "去结算" : (count > 0 ? "差 ¥\(Int(min - total)) 起送" : "去结算"))
                    .font(.subheadline.bold())
                    .padding(.horizontal, 22).padding(.vertical, 12)
                    .background(count > 0 && total >= min ? Color.orange : Color.gray.opacity(0.3),
                                in: Capsule())
                    .foregroundStyle(count > 0 && total >= min ? .white : .secondary)
            }
            .disabled(count == 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }
}

// MARK: - 确认订单

struct CheckoutView: View {
    @EnvironmentObject var state: AppState
    let shop: Shop
    @Binding var path: [String]

    @State private var addressIndex = 0
    @State private var remark = ""
    @State private var tableware = 1
    @State private var pay = "微信支付"

    var body: some View {
        List {
            Section("收货地址") {
                ForEach(Array(state.addresses.enumerated()), id: \.element.id) { item in
                    Button {
                        addressIndex = item.offset
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.element.detail).font(.subheadline.weight(.medium))
                                Text("\(item.element.name ?? "") \(item.element.phone ?? "")")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if item.offset == addressIndex {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(.orange)
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                }
            }

            Section("\(shop.emoji ?? "🍱") \(shop.name)") {
                ForEach(state.cart.filter({ $0.value > 0 }).sorted(by: { $0.key < $1.key }), id: \.0) { item in
                    let dishId = item.0
                    let qty = item.1
                    if let dish = state.dishes.first(where: { $0.id == dishId }) {
                        HStack {
                            Text("\(dish.emoji ?? "") \(dish.name) x\(qty)").font(.subheadline)
                            Spacer()
                            PriceText(value: dish.price * Double(qty), size: 14)
                        }
                    }
                }
                HStack { Text("打包费").foregroundStyle(.secondary); Spacer(); PriceText(value: Double(cartCount), size: 14) }
                HStack { Text("配送费").foregroundStyle(.secondary); Spacer(); PriceText(value: shop.deliveryFee ?? 0, size: 14) }
                HStack {
                    Text("实付").fontWeight(.semibold)
                    Spacer()
                    PriceText(value: total, size: 17)
                }
            }

            Section("其他") {
                Picker("餐具份数", selection: $tableware) {
                    Text("无需餐具").tag(0); Text("1 份").tag(1); Text("2 份").tag(2); Text("3 份").tag(3)
                }
                Picker("支付方式", selection: $pay) {
                    Text("微信支付").tag("微信支付"); Text("支付宝").tag("支付宝"); Text("美团余额").tag("美团余额")
                }
                TextField("口味、偏好等备注", text: $remark)
            }

            Section {
                BigButton(title: "提交订单", icon: "checkmark.circle.fill") { submit() }
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("确认订单")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var cartCount: Int { state.cartCount(shop.id) }
    private var subtotal: Double { state.cartTotal() }
    private var discount: Double {
        var cut = 0.0
        for p in shop.promos ?? [] {
            let pattern = "满 ?([0-9]+) ?减 ?([0-9]+)"
            if let r = try? NSRegularExpression(pattern: pattern),
               let m = r.firstMatch(in: p, range: NSRange(p.startIndex..., in: p)),
               let fRange = Range(m.range(at: 1), in: p), let sRange = Range(m.range(at: 2), in: p),
               let f = Double(p[fRange]), let s = Double(p[sRange]), subtotal >= f {
                cut = max(cut, s)
            }
        }
        return cut
    }
    private var total: Double { max(0, subtotal + Double(cartCount) + (shop.deliveryFee ?? 0) - discount) }

    private func submit() {
        let addr = state.addresses.indices.contains(addressIndex) ? state.addresses[addressIndex] : state.addresses.first
        Task {
            let o = await state.placeOrder(shopId: shop.id, addressId: addr?.id ?? "a1",
                                           remark: remark, tableware: tableware, pay: pay)
            if o != nil { path.removeAll() }
        }
    }
}
