import CoreLocation
import Foundation

/// 虚拟城市坐标（米）→ 真实经纬度，这样 iOS 端可以用 MapKit 的真实底图显示路线。
/// 原点取武汉某处，与 Web 端 Canvas 地图用同一套 (x, y) 米制坐标。
enum Geo {
    static let originLat = 30.5931
    static let originLon = 114.3055

    static func coord(x: Double, y: Double) -> CLLocationCoordinate2D {
        let lat = originLat + y / 111_320.0
        let lon = originLon + x / (111_320.0 * cos(originLat * .pi / 180.0))
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    static func coord(_ p: Pos) -> CLLocationCoordinate2D { coord(x: p.x, y: p.y) }

    static func coords(_ list: [Pos]?) -> [CLLocationCoordinate2D] {
        (list ?? []).map { coord($0) }
    }

    static func distanceText(_ m: Double) -> String {
        if m >= 1000 { return String(format: "%.1f km", m / 1000) }
        return String(format: "%.0f m", m)
    }

    /// 骑行 5 m/s（约 18km/h）估算剩余时间
    static func etaText(_ m: Double) -> String {
        let s = Int(max(1, m / 5))
        if s < 60 { return "\(s) 秒" }
        let min = s / 60
        if min < 60 { return "\(min) 分钟" }
        return "\(min / 60) 小时 \(min % 60) 分"
    }

    static func timeText(_ ts: Double?) -> String {
        guard let ts else { return "" }
        let d = Date(timeIntervalSince1970: ts / 1000)
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: d)
    }
}
