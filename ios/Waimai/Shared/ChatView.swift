import SwiftUI

struct ChatView: View {
    @EnvironmentObject var state: AppState
    let orderId: String
    let role: String

    @State private var target: String = ""
    @State private var text = ""

    private var options: [(String, String)] {
        switch role {
        case "user": return [("rider", "🛵 骑手"), ("merchant", "🏪 商家")]
        case "rider": return [("user", "🙂 用户"), ("merchant", "🏪 商家")]
        default: return [("user", "🙂 用户"), ("rider", "🛵 骑手")]
        }
    }

    private var quicks: [String] {
        switch role {
        case "user": return ["骑手到哪了？", "大概还要多久？", "麻烦放在门口", "放前台就好", "辛苦了 🙏"]
        case "rider": return ["您好，我是骑手，正在赶来", "马上到楼下，请准备取餐", "已到店取餐，马上出发", "餐品已送达，请及时取用"]
        default: return ["订单已收到，正在备餐", "抱歉今天单多，稍等几分钟", "餐品已出餐，等骑手来取", "祝您用餐愉快 🍽️"]
        }
    }

    private var list: [ChatMessage] {
        let all = (state.messages[orderId] ?? []).sorted { ($0.ts ?? 0) < ($1.ts ?? 0) }
        return all.filter { m in
            if m.isSystem { return true }
            if m.from == role { return (m.to ?? "all") == "all" || m.to == target }
            return m.from == target
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // 会话对象切换
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(options, id: \.0) { item in
                        Button {
                            target = item.0
                        } label: {
                            Text(item.1)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 14).padding(.vertical, 7)
                                .background(target == item.0 ? Color.orange : Color(.secondarySystemBackground),
                                            in: Capsule())
                                .foregroundStyle(target == item.0 ? .white : .primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .background(Color(.systemGroupedBackground))

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(list) { m in
                            bubble(m).id(m.id)
                        }
                    }
                    .padding(14)
                }
                .background(Color(.systemGroupedBackground))
                .onChange(of: list.count) {
                    if let last = list.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }

            // 快捷短语
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(quicks, id: \.self) { q in
                        Button { send(q) } label: {
                            Text(q).font(.caption)
                                .padding(.horizontal, 12).padding(.vertical, 6)
                                .background(Color(.secondarySystemBackground), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }

            // 输入
            HStack(spacing: 10) {
                TextField("发消息…", text: $text)
                    .textFieldStyle(.roundedBorder)
                Button("发送") { send(text); text = "" }
                    .font(.subheadline.bold())
                    .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(12)
            .background(.bar)
        }
        .navigationTitle("聊天")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if target.isEmpty { target = options.first?.0 ?? "user" }
            Task { await state.loadMessages(orderId) }
        }
    }

    @ViewBuilder
    private func bubble(_ m: ChatMessage) -> some View {
        if m.isSystem {
            Text(m.text)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12).padding(.vertical, 5)
                .background(Color(.secondarySystemBackground), in: Capsule())
        } else {
            let mine = m.from == role
            HStack(alignment: .bottom, spacing: 8) {
                if mine { Spacer(minLength: 40) }
                VStack(alignment: mine ? .trailing : .leading, spacing: 3) {
                    Text(m.text)
                        .font(.subheadline)
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .background(mine ? Color.orange : Color(.secondarySystemBackground),
                                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(mine ? .white : .primary)
                    Text("\(m.fromName ?? "") \(Geo.timeText(m.ts))")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
                if !mine { Spacer(minLength: 40) }
            }
        }
    }

    private func send(_ t: String) {
        let s = t.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return }
        Task { await state.sendMessage(orderId, from: role, to: target, text: s) }
    }
}
