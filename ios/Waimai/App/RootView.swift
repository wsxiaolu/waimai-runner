import SwiftUI

/// 导航栏右上角的「切换身份」入口：选择后必须输入密码
struct RoleSwitchToolbar: ToolbarContent {
    @EnvironmentObject var state: AppState

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                ForEach(AppState.Role.allCases) { r in
                    Button {
                        state.requestRole(r)
                    } label: {
                        Label("\(r.icon) \(r.title)", systemImage: r == state.role ? "checkmark" : "arrow.right.circle")
                    }
                }
                Divider()
                Button(role: .destructive) {
                    state.logout()
                } label: {
                    Label("退出登录", systemImage: "rectangle.portrait.and.arrow.right")
                }
            } label: {
                Image(systemName: "person.2.badge.gearshape")
            }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Group {
            if state.isLoggedIn {
                TabView {
                    mainTab
                        .tabItem { Label(state.role.title, systemImage: tabIcon(state.role)) }
                    ProfileView()
                        .tabItem { Label("我的", systemImage: "person.crop.circle") }
                }
            } else {
                AuthView()
            }
        }
        .sheet(item: $state.pendingRole) { r in
            RoleSwitchView(target: r).environmentObject(state)
        }
        .overlay(alignment: .top) {
            if let n = state.notice {
                ToastView(text: n).padding(.top, state.isLoggedIn ? 16 : 60)
            }
        }
        .animation(.easeInOut, value: state.notice)
    }

    @ViewBuilder
    private var mainTab: some View {
        switch state.role {
        case .user: UserHomeView()
        case .rider: RiderHomeView()
        case .merchant: MerchantHomeView()
        }
    }

    private func tabIcon(_ r: AppState.Role) -> String {
        switch r {
        case .user: return "house.fill"
        case .rider: return "bicycle"
        case .merchant: return "storefront.fill"
        }
    }
}

struct ProfileView: View {
    @EnvironmentObject var state: AppState
    @State private var server = ""
    @State private var showReset = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        Text(state.me?.avatar ?? "🙂").font(.system(size: 44))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(state.me?.nickname ?? "").font(.headline)
                            Text("@\(state.me?.username ?? "")").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    HStack {
                        Text("当前身份")
                        Spacer()
                        StatusPill(text: "\(state.role.icon) \(state.role.title)")
                    }
                }

                Section("切换身份（需输入密码）") {
                    ForEach(AppState.Role.allCases) { r in
                        Button {
                            state.requestRole(r)
                        } label: {
                            HStack {
                                Text("\(r.icon) \(r.title)")
                                Spacer()
                                if r == state.role { Image(systemName: "checkmark").foregroundStyle(.orange) }
                                else { Image(systemName: "lock.fill").font(.caption2).foregroundStyle(.secondary) }
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                }

                Section("服务器") {
                    TextField("https://your-app.onrender.com", text: $server)
                        .font(.caption)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("保存并重连") { state.applyServer(server) }
                    Text("本机调试填 http://电脑局域网IP:3000")
                        .font(.caption2).foregroundStyle(.secondary)
                }

                Section("订单") {
                    NavigationLink("我的订单") { OrdersView() }
                }

                Section {
                    Button("重置演示数据") { showReset = true }
                        .foregroundStyle(.orange)
                    Button("退出登录") { state.logout() }
                        .foregroundStyle(.red)
                } footer: {
                    Text("退出登录不会删除订单，重新登录同一个账号后订单照旧；切换身份同理，只换视角不换数据。")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("我的")
            .onAppear { server = state.serverText }
            .alert("重置演示数据？", isPresented: $showReset) {
                Button("重置", role: .destructive) {
                    Task {
                        let _: OKResp? = try? await API.shared.post("/api/reset", body: [:])
                        await state.refresh()
                        state.say("已重置")
                    }
                }
                Button("取消", role: .cancel) {}
            } message: {
                Text("会清空订单与聊天记录，账号保留")
            }
        }
    }
}
