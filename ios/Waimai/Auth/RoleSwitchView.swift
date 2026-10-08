import SwiftUI

/// 切换商家 / 骑手 / 用户身份前，必须输入账号密码验证
struct RoleSwitchView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss

    let target: AppState.Role

    @State private var password = ""
    @State private var errorText: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Text(target.icon).font(.system(size: 56))
                Text("切换到 \(target.title)").font(.title2.bold())

                Text("需要验证账号「\(state.me?.username ?? "")」的登录密码")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                SecureField("请输入登录密码", text: $password)
                    .textContentType(.password)
                    .padding(14)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(.horizontal, 24)

                if let errorText {
                    Text(errorText).font(.footnote).foregroundStyle(.red)
                }

                BigButton(title: busy ? "验证中…" : "验证并切换",
                          icon: "lock.open.rotation",
                          disabled: password.isEmpty || busy) {
                    verify()
                }
                .padding(.horizontal, 24)

                Text("演示账号密码：123456")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                Spacer()
            }
            .padding(.top, 40)
            .navigationTitle("身份验证")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
            }
        }
    }

    private func verify() {
        busy = true
        errorText = nil
        Task {
            do {
                try await state.switchRole(to: target, password: password)
                dismiss()
            } catch {
                errorText = error.localizedDescription
                busy = false
            }
        }
    }
}
