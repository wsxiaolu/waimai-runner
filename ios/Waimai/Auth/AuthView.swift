import SwiftUI

struct AuthView: View {
    @EnvironmentObject var state: AppState

    @State private var isRegister = false
    @State private var username = ""
    @State private var password = ""
    @State private var nickname = ""
    @State private var showServer = false
    @State private var serverDraft = ""
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color.orange, Color.yellow.opacity(0.85)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    // 头部
                    VStack(spacing: 8) {
                        Text("🛵").font(.system(size: 64))
                        Text("外卖跑腿").font(.largeTitle.bold())
                        Text("用户端 · 骑手端 · 商家端 三合一")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    .padding(.top, 40)

                    GlassContainer {
                        VStack(spacing: 14) {
                            Picker("", selection: $isRegister) {
                                Text("登录").tag(false)
                                Text("注册").tag(true)
                            }
                            .pickerStyle(.segmented)

                            field(icon: "person.fill", placeholder: "用户名（至少 3 位）", text: $username)
                            field(icon: "lock.fill", placeholder: "密码（至少 6 位）", text: $password, secure: true)
                            if isRegister {
                                field(icon: "person.crop.circle", placeholder: "昵称（选填）", text: $nickname)
                            }

                            BigButton(
                                title: isRegister ? "注册并进入" : "登录",
                                icon: isRegister ? "person.badge.plus" : "arrow.right.circle.fill",
                                disabled: username.count < 3 || password.count < 6 || state.busy
                            ) {
                                focused = false
                                Task {
                                    if isRegister {
                                        await state.register(username: username, password: password, nickname: nickname)
                                    } else {
                                        await state.login(username: username, password: password)
                                    }
                                }
                            }

                            if !isRegister {
                                Button("没有账号？去注册") { isRegister = true }
                                    .font(.footnote)
                            }
                        }
                        .padding(18)
                        .glassCard(radius: 22)
                    }
                    .padding(.horizontal, 20)

                    // 服务器设置
                    VStack(spacing: 8) {
                        Button {
                            serverDraft = state.serverText
                            withAnimation { showServer.toggle() }
                        } label: {
                            Label("服务器地址：\(state.serverText)", systemImage: "server.rack")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        if showServer {
                            VStack(spacing: 8) {
                                TextField("https://your-app.onrender.com", text: $serverDraft)
                                    .textFieldStyle(.roundedBorder)
                                    .font(.footnote)
                                Text("本机调试填 http://电脑局域网IP:3000，云端填 Render 地址")
                                    .font(.caption2).foregroundStyle(.secondary)
                                Button("保存并重连") { state.applyServer(serverDraft); showServer = false }
                                    .font(.footnote.bold())
                            }
                            .padding(12)
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                    }
                    .padding(.horizontal, 20)

                    Text("演示账号 demo / 123456")
                        .font(.caption2).foregroundStyle(.secondary)

                    Spacer(minLength: 40)
                }
            }
            .scrollDismissesKeyboard(.interactively)

            if state.busy { ProgressView().scaleEffect(1.4).tint(.orange) }
        }
        .overlay(alignment: .top) {
            if let n = state.notice {
                ToastView(text: n).padding(.top, 60)
            }
        }
        .onAppear { serverDraft = state.serverText }
    }

    private func field(icon: String, placeholder: String, text: Binding<String>, secure: Bool = false) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(.secondary).frame(width: 20)
            if secure {
                SecureField(placeholder, text: text)
                    .textContentType(.password)
                    .focused($focused)
            } else {
                TextField(placeholder, text: text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused)
            }
        }
        .padding(12)
        .background(Color(.systemBackground).opacity(0.9), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
