import SwiftUI
import MapKit

struct MapPin: Identifiable {
    let id: String
    let title: String
    let emoji: String
    let coord: CLLocationCoordinate2D
}

/// 导航地图：真实底图 + 规划路线 + 骑手实时位置
struct NavMapView: View {
    var pins: [MapPin] = []
    var route: [CLLocationCoordinate2D] = []
    var rider: CLLocationCoordinate2D?
    var showsUser = true

    @State private var position: MapCameraPosition = .automatic
    @State private var didFit = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Map(position: $position) {
                ForEach(pins) { p in
                    Annotation(p.title, coordinate: p.coord) {
                        VStack(spacing: 2) {
                            Text(p.emoji).font(.title2)
                            Text(p.title)
                                .font(.caption2)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(.thinMaterial, in: Capsule())
                        }
                    }
                }
                if route.count > 1 {
                    MapPolyline(coordinates: route)
                        .stroke(.orange, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                }
                if let rider {
                    Annotation("骑手", coordinate: rider) {
                        ZStack {
                            Circle().fill(Color.blue).frame(width: 34, height: 34)
                                .shadow(radius: 3)
                            Text("🛵").font(.system(size: 18))
                        }
                    }
                }
                if showsUser { UserAnnotation() }
            }
            .mapControls { MapCompass(); MapScaleView() }

            Button { fit() } label: {
                Image(systemName: "location.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .padding(10)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .padding(10)
        }
        .onAppear { if !didFit { fit(); didFit = true } }
        .onChange(of: route.count) { fit() }
    }

    private func fit() {
        var coords = route + pins.map { $0.coord }
        if let rider { coords.append(rider) }
        guard let first = coords.first else { return }
        var minLat = first.latitude, maxLat = first.latitude
        var minLon = first.longitude, maxLon = first.longitude
        for c in coords {
            minLat = min(minLat, c.latitude); maxLat = max(maxLat, c.latitude)
            minLon = min(minLon, c.longitude); maxLon = max(maxLon, c.longitude)
        }
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2)
        let span = MKCoordinateSpan(latitudeDelta: max((maxLat - minLat) * 1.7, 0.006),
                                    longitudeDelta: max((maxLon - minLon) * 1.7, 0.006))
        position = .region(MKCoordinateRegion(center: center, span: span))
    }
}

/// 把订单里的虚拟坐标路线转成地图坐标
func routeCoords(_ order: Order) -> [CLLocationCoordinate2D] {
    Geo.coords(order.route)
}
