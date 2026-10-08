import Foundation

enum APIError: LocalizedError {
    case badURL
    case http(Int)
    case server(String)

    var errorDescription: String? {
        switch self {
        case .badURL: return "服务器地址无效"
        case .http(let code): return "服务器返回 \(code)"
        case .server(let msg): return msg
        }
    }
}

struct ErrResp: Decodable { let error: String }
struct OKResp: Decodable { let ok: Bool? }

struct AuthResp: Decodable {
    let ok: Bool?
    let user: UserAccount?
    let token: String?
}

final class API: @unchecked Sendable {
    static let shared = API()
    private let decoder = JSONDecoder()
    private init() {}

    // MARK: 配置持久化
    var baseURL: String {
        get {
            let v = UserDefaults.standard.string(forKey: "waimai.server")
            return (v?.isEmpty == false) ? v! : "https://waimai-api.onrender.com"
        }
        set { UserDefaults.standard.set(newValue, forKey: "waimai.server") }
    }

    var token: String? {
        get { UserDefaults.standard.string(forKey: "waimai.token") }
        set { UserDefaults.standard.set(newValue, forKey: "waimai.token") }
    }

    private var wsBase: String {
        let s = baseURL
        if s.hasPrefix("https://") { return "wss://" + s.dropFirst(8) }
        if s.hasPrefix("http://") { return "ws://" + s.dropFirst(7) }
        return s
    }

    func wsURL(role: String) -> URL? {
        var str = wsBase + "/ws?role=" + role
        if let t = token { str += "&token=" + t }
        return URL(string: str)
    }

    // MARK: 请求
    func get<T: Decodable>(_ path: String) async throws -> T {
        try await request(path, method: "GET", body: nil)
    }

    @discardableResult
    func post<T: Decodable>(_ path: String, body: [String: Any]? = nil) async throws -> T {
        try await request(path, method: "POST", body: body)
    }

    private func request<T: Decodable>(_ path: String, method: String, body: [String: Any]?) async throws -> T {
        let base = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: base + path) else { throw APIError.badURL }
        var req = URLRequest(url: url, timeoutInterval: 20)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let t = token { req.setValue("Bearer " + t, forHTTPHeaderField: "Authorization") }
        if let body { req.httpBody = try? JSONSerialization.data(withJSONObject: body) }

        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            if let e = try? decoder.decode(ErrResp.self, from: data) { throw APIError.server(e.error) }
            throw APIError.http(http.statusCode)
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            // 有些接口只回 {"ok":true}，兼容处理
            if let ok = try? decoder.decode(OKResp.self, from: data), T.self == OKResp.self {
                return ok as! T
            }
            throw error
        }
    }
}

// MARK: - WebSocket 实时通道

final class Realtime: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
    static let shared = Realtime()

    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var retry = 0

    var onText: ((String) -> Void)?
    var onClosed: (() -> Void)?

    func connect(url: URL) {
        disconnect()
        let s = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
        session = s
        let t = s.webSocketTask(with: url)
        task = t
        t.resume()
        retry = 0
        receive()
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        session?.invalidateAndCancel()
        session = nil
    }

    private func receive() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let msg):
                if case .string(let text) = msg { self.onText?(text) }
                self.receive()
            case .failure:
                self.onClosed?()
            }
        }
    }

}
