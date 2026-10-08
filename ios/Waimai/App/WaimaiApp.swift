import SwiftUI

@main
struct WaimaiApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .task {
                    await state.refresh()
                    state.connect()
                }
        }
    }
}
