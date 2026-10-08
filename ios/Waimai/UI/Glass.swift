import SwiftUI

/// 液态玻璃（Liquid Glass）封装。
/// iOS 26+ 使用 SwiftUI 原生 .glassEffect；老系统自动降级为毛玻璃材质，同一份代码两种观感。
extension View {

    @ViewBuilder
    func glassCard(radius: CGFloat = 18) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: .rect(cornerRadius: radius))
        } else {
            self.background(.regularMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        }
    }

    @ViewBuilder
    func glassPill(radius: CGFloat = 999) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: .rect(cornerRadius: radius))
        } else {
            self.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        }
    }

    /// 强调色的玻璃（用于主按钮）
    @ViewBuilder
    func glassAccent(radius: CGFloat = 14) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: .rect(cornerRadius: radius))
        } else {
            self.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        }
    }
}

/// 玻璃容器：iOS 26 下让内部多个玻璃元素融合折射，老系统直接透传
struct GlassContainer<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer { content }
        } else {
            content
        }
    }
}
