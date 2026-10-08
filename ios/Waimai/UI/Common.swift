import SwiftUI

struct CardView<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemBackground),
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct PriceText: View {
    let value: Double
    var size: CGFloat = 15
    var body: some View {
        Text(String(format: "¥%.2f", value))
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(.red)
    }
}

struct StatusPill: View {
    let text: String
    var active: Bool = true
    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background((active ? Color.orange : Color.gray).opacity(active ? 0.18 : 0.14), in: Capsule())
            .foregroundStyle(active ? Color.orange : Color.secondary)
    }
}

struct EmojiBox: View {
    let emoji: String
    var size: CGFloat = 48
    var tint: Color = .orange
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(tint.opacity(0.14))
            Text(emoji).font(.system(size: size * 0.55))
        }
        .frame(width: size, height: size)
    }
}

struct BigButton: View {
    let title: String
    var icon: String? = nil
    var disabled: Bool = false
    var color: Color = .orange
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon { Image(systemName: icon) }
                Text(title).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(disabled ? Color.gray.opacity(0.25) : color, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            // 三元表达式两边必须同类型：这里显式写 Color，
            // 否则 Swift 会把 .secondary 推断成 HierarchicalShapeStyle 而报错
            .foregroundStyle(disabled ? Color.secondary : Color.white)
        }
        .disabled(disabled)
    }
}

struct Stepper2: View {
    var count: Int
    var onAdd: () -> Void
    var onSub: () -> Void
    var body: some View {
        HStack(spacing: 10) {
            if count > 0 {
                Button(action: onSub) {
                    Image(systemName: "minus.circle.fill").font(.title3).foregroundStyle(.secondary)
                }
                Text("\(count)").fontWeight(.semibold).frame(minWidth: 16)
            }
            Button(action: onAdd) {
                Image(systemName: "plus.circle.fill").font(.title2).foregroundStyle(.orange)
            }
        }
        .buttonStyle(.plain)
    }
}

struct ToastView: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.subheadline)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.black.opacity(0.78), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .foregroundStyle(.white)
            .transition(.opacity)
    }
}
