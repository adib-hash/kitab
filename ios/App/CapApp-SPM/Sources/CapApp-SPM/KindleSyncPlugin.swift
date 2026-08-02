import Foundation
import Capacitor
import WebKit
import UIKit
import BackgroundTasks

// MARK: - Shared storage
//
// The background task runs with no JS context, so everything it needs — whether
// auto-sync is on, which books to skip — is mirrored into the App Group by
// configureBackgroundSync() while the app is open. Results go back the same way:
// scraped highlights are parked in a file for the app to drain on next launch,
// which keeps Supabase auth entirely on the JS side.

enum KindleSyncStore {
    static let appGroupId = "group.com.adibchoudhury.kitab"
    static let taskId = "com.adibchoudhury.kitab.kindlesync"

    // Highlights accumulate in a file rather than UserDefaults — a full sweep of
    // a large library is megabytes, well past what UserDefaults is meant for.
    static let pendingFile = "kindle-pending.json"

    // Guards against unbounded growth if the app is not opened for a long time.
    static let maxPendingHighlights = 5000

    enum Key {
        static let enabled = "kindleSyncEnabled"
        static let config = "kindleSyncConfig"
        static let lastRunAt = "kindleSyncLastRunAt"
        static let lastStatus = "kindleSyncLastStatus"
    }

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroupId) }

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
    }

    static var pendingURL: URL? { containerURL?.appendingPathComponent(pendingFile) }

    static func readPending() -> [String: Any]? {
        guard let url = pendingURL,
              let data = try? Data(contentsOf: url),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return nil }
        return json
    }

    /// The pending payload as raw JSON text. Everything crossing the bridge does
    /// so as a string: Capacitor's resolve() takes [String: JSValue], and a list
    /// of highlight dictionaries has no JSValue conformance, so handing it over
    /// structured would not compile. JSON.parse on the JS side is simpler than
    /// hand-converting nested collections.
    static func readPendingRaw() -> String? {
        guard let url = pendingURL,
              let data = try? Data(contentsOf: url)
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clearPending() {
        guard let url = pendingURL else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// Merge a finished scrape into whatever is already waiting to be drained.
    /// Duplicate highlights are harmless — the Supabase upsert dedupes on
    /// clipping_hash — so appending is safe and avoids losing a run.
    static func appendPending(result: [String: Any]) {
        let existing = readPending()
        var highlights = (existing?["highlights"] as? [[String: Any]]) ?? []
        var bookCounts = (existing?["bookCounts"] as? [String: Any]) ?? [:]
        var seenTitles = (existing?["seenTitles"] as? [String]) ?? []
        var fullSweep = (existing?["fullSweep"] as? Bool) ?? false

        highlights.append(contentsOf: (result["highlights"] as? [[String: Any]]) ?? [])
        if highlights.count > maxPendingHighlights {
            highlights = Array(highlights.suffix(maxPendingHighlights))
        }
        for (k, v) in (result["bookCounts"] as? [String: Any]) ?? [:] { bookCounts[k] = v }
        if let latest = result["seenTitles"] as? [String], !latest.isEmpty { seenTitles = latest }
        if (result["fullSweep"] as? Bool) == true { fullSweep = true }

        let merged: [String: Any] = [
            "highlights": highlights,
            "bookCounts": bookCounts,
            "seenTitles": seenTitles,
            "fullSweep": fullSweep,
            "status": result["status"] as? String ?? "ok",
            "syncedAt": ISO8601DateFormatter().string(from: Date()),
        ]

        guard let url = pendingURL,
              let data = try? JSONSerialization.data(withJSONObject: merged)
        else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func recordRun(status: String) {
        defaults?.set(ISO8601DateFormatter().string(from: Date()), forKey: Key.lastRunAt)
        defaults?.set(status, forKey: Key.lastStatus)
    }
}

// MARK: - KindleScraper
//
// Runs public/kindle-scraper.js in an offscreen WKWebView. The webview is built
// with a plain WKWebViewConfiguration, so it uses WKWebsiteDataStore.default() —
// the same persistent cookie jar @capgo/inappbrowser uses. That is what lets
// this run without a second Amazon login: whatever session the visible browser
// established is already here.
final class KindleScraper: NSObject, WKScriptMessageHandler, WKNavigationDelegate {

    private var webView: WKWebView?
    private var completion: (([String: Any]) -> Void)?
    private var timeoutItem: DispatchWorkItem?
    private var didFinish = false
    private var didInject = false
    private let configJSON: String
    private var injectedScript: String = ""

    /// Held for the lifetime of a run so ARC does not release the scraper while
    /// the webview is still loading.
    private static var active: KindleScraper?

    init(configJSON: String) {
        self.configJSON = configJSON
        super.init()
    }

    /// Capacitor copies dist/ into the bundle under `public/`, so the scraper the
    /// native side runs is byte-identical to the one the web app injects.
    static func loadSource() -> String? {
        let url = Bundle.main.url(forResource: "kindle-scraper", withExtension: "js", subdirectory: "public")
            ?? Bundle.main.url(forResource: "kindle-scraper", withExtension: "js")
        guard let url else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    /// - Parameter timeout: hard ceiling on the whole run. A full sweep of a big
    ///   library legitimately takes minutes; anything past this is a hang.
    static func run(configJSON: String, timeout: TimeInterval, completion: @escaping ([String: Any]) -> Void) {
        DispatchQueue.main.async {
            // One at a time — two scrapers would fight over the same Amazon session.
            if active != nil {
                completion(["status": "busy", "highlights": [], "bookCounts": [:], "seenTitles": [], "visited": 0])
                return
            }
            let scraper = KindleScraper(configJSON: configJSON)
            active = scraper
            scraper.start(timeout: timeout) { result in
                active = nil
                completion(result)
            }
        }
    }

    private func start(timeout: TimeInterval, completion: @escaping ([String: Any]) -> Void) {
        self.completion = completion

        guard let source = KindleScraper.loadSource() else {
            finish(["status": "error", "error": "scraper asset missing"])
            return
        }

        // Force the headless transport regardless of what the caller passed —
        // window.mobileApp only exists inside @capgo/inappbrowser.
        var cfg = ((try? JSONSerialization.jsonObject(with: Data(configJSON.utf8))) as? [String: Any]) ?? [:]
        cfg["transport"] = "headless"
        let resolvedConfig = (try? JSONSerialization.data(withJSONObject: cfg))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{\"transport\":\"headless\"}"
        self.injectedScript = "window.__KITAB_SYNC_CONFIG = \(resolvedConfig);\n\(source)"

        let webConfiguration = WKWebViewConfiguration()
        webConfiguration.userContentController.add(self, name: "kitabSync")
        // Amazon serves a different notebook layout to desktop user agents; the
        // selectors in the scraper were written against what the in-app browser
        // sees, so keep the default mobile UA and a phone-sized viewport.
        let frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let webView = WKWebView(frame: frame, configuration: webConfiguration)
        webView.navigationDelegate = self
        self.webView = webView

        attachOffscreen(webView)

        let timeoutItem = DispatchWorkItem { [weak self] in
            self?.finish(["status": "timeout", "highlights": [], "bookCounts": [:], "seenTitles": [], "visited": 0])
        }
        self.timeoutItem = timeoutItem
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: timeoutItem)

        webView.load(URLRequest(url: URL(string: "https://read.amazon.com/notebook")!))
    }

    /// WebKit heavily throttles timers in a webview it considers offscreen, and
    /// the scraper is almost entirely setTimeout-driven. Parking it in the window
    /// at near-zero alpha behind the opaque Capacitor webview keeps it "visible"
    /// to WebKit while showing the user nothing.
    private func attachOffscreen(_ webView: WKWebView) {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        guard let window = windows.first(where: { $0.isKeyWindow }) ?? windows.first else { return }
        if window.bounds.width > 0 && window.bounds.height > 0 {
            webView.frame = window.bounds
        }
        webView.alpha = 0.01
        webView.isUserInteractionEnabled = false
        window.insertSubview(webView, at: 0)
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !didFinish, let url = webView.url?.absoluteString else { return }

        if url.contains("/notebook") {
            // Amazon's notebook is a SPA behind several redirects; only inject
            // once we have actually landed on it.
            guard !didInject else { return }
            didInject = true
            webView.evaluateJavaScript(injectedScript, completionHandler: nil)
        } else if url.contains("/ap/signin") || url.contains("/ap/oa") {
            // Session lapsed. Nothing a headless webview can do — the app will
            // surface a prompt to sign in via the visible browser.
            finish(["status": "needs_login", "highlights": [], "bookCounts": [:], "seenTitles": [], "visited": 0])
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(["status": "error", "error": error.localizedDescription, "highlights": [], "bookCounts": [:], "seenTitles": [], "visited": 0])
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(["status": "error", "error": error.localizedDescription, "highlights": [], "bookCounts": [:], "seenTitles": [], "visited": 0])
    }

    // MARK: WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        guard (body["type"] as? String) == "kitabDone" else { return } // progress events are ignored here
        finish(body)
    }

    // MARK: Teardown

    /// Stop whatever run is in flight — used by the background task's expiration
    /// handler, so a webview session does not outlive the window iOS granted it.
    static func cancelActive() {
        DispatchQueue.main.async {
            active?.finish(["status": "expired", "highlights": [], "bookCounts": [:], "seenTitles": [], "visited": 0])
        }
    }

    private func finish(_ result: [String: Any]) {
        guard !didFinish else { return }
        didFinish = true

        timeoutItem?.cancel()
        timeoutItem = nil

        let done = completion
        completion = nil

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            // The content controller retains the message handler — leaving it
            // attached leaks the scraper and its webview.
            self.webView?.configuration.userContentController.removeScriptMessageHandler(forName: "kitabSync")
            self.webView?.navigationDelegate = nil
            self.webView?.stopLoading()
            self.webView?.removeFromSuperview()
            self.webView = nil
            done?(result)
        }
    }
}

// MARK: - Background scheduling
//
// BGProcessingTask rather than BGAppRefreshTask: app refresh caps out around 30
// seconds, which is not enough to load Amazon and walk even a couple of books.
// Processing tasks get minutes, at the cost of only running when iOS decides the
// device is idle — in practice, overnight on a charger.

public enum KindleBackgroundSync {

    public static func register() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: KindleSyncStore.taskId,
            using: nil
        ) { task in
            guard let task = task as? BGProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(task)
        }
    }

    public static func schedule() {
        guard KindleSyncStore.defaults?.bool(forKey: KindleSyncStore.Key.enabled) == true else { return }

        let request = BGProcessingTaskRequest(identifier: KindleSyncStore.taskId)
        request.requiresNetworkConnectivity = true
        // Scraping a whole notebook is a heavy, multi-minute webview session.
        // Gating on power keeps it off the battery and lines it up with the
        // overnight window this feature was designed around.
        request.requiresExternalPower = true
        request.earliestBeginDate = nextRunDate()

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            NSLog("[KindleSync] Could not schedule background sync: %@", error.localizedDescription)
        }
    }

    public static func cancel() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: KindleSyncStore.taskId)
    }

    /// Next 3am local. iOS treats this as "not before", not a promise.
    private static func nextRunDate() -> Date {
        let calendar = Calendar.current
        let now = Date()
        var components = calendar.dateComponents([.year, .month, .day], from: now)
        components.hour = 3
        components.minute = 0
        guard let today3am = calendar.date(from: components) else {
            return now.addingTimeInterval(6 * 3600)
        }
        return today3am > now ? today3am : calendar.date(byAdding: .day, value: 1, to: today3am) ?? now.addingTimeInterval(6 * 3600)
    }

    private static func handle(_ task: BGProcessingTask) {
        // Re-arm first. If anything below throws or the task is killed, the chain
        // still continues tomorrow.
        schedule()

        guard KindleSyncStore.defaults?.bool(forKey: KindleSyncStore.Key.enabled) == true else {
            task.setTaskCompleted(success: true)
            return
        }

        let configJSON = KindleSyncStore.defaults?.string(forKey: KindleSyncStore.Key.config) ?? "{}"
        let parsedConfig = (try? JSONSerialization.jsonObject(with: Data(configJSON.utf8))) as? [String: Any]
        let isFullSweep = (parsedConfig?["fullSweep"] as? Bool) ?? false

        // Both callbacks funnel through the main queue so this flag is only ever
        // touched from one thread.
        var finished = false
        task.expirationHandler = {
            DispatchQueue.main.async {
                guard !finished else { return }
                finished = true
                KindleScraper.cancelActive()
                KindleSyncStore.recordRun(status: "expired")
                task.setTaskCompleted(success: false)
            }
        }

        KindleScraper.run(configJSON: configJSON, timeout: 240) { result in
            guard !finished else { return }
            finished = true

            let status = result["status"] as? String ?? "error"
            if status == "ok" {
                var payload = result
                payload["fullSweep"] = isFullSweep
                KindleSyncStore.appendPending(result: payload)
            }
            KindleSyncStore.recordRun(status: status)
            task.setTaskCompleted(success: status == "ok")
        }
    }
}

// MARK: - Capacitor plugin

@objc(KindleSyncPlugin)
public class KindleSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KindleSyncPlugin"
    public let jsName = "KindleSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "runSync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureBackgroundSync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
    ]

    /// Run the scrape now, offscreen. Used for the foreground fallback when iOS
    /// has not granted a background window in over a day.
    @objc public func runSync(_ call: CAPPluginCall) {
        let configJSON = call.getString("config") ?? "{}"
        let timeout = (call.getDouble("timeoutMs") ?? 240000) / 1000.0

        KindleScraper.run(configJSON: configJSON, timeout: timeout) { result in
            let status = result["status"] as? String ?? "error"
            let payload = (try? JSONSerialization.data(withJSONObject: result))
                .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
            call.resolve(["status": status, "payload": payload])
        }
    }

    /// Hand over anything the background task scraped, and clear it. The app
    /// upserts to Supabase itself so auth never has to leave the JS side.
    @objc public func getPending(_ call: CAPPluginCall) {
        guard let raw = KindleSyncStore.readPendingRaw() else {
            call.resolve(["payload": ""])
            return
        }
        KindleSyncStore.clearPending()
        call.resolve(["payload": raw])
    }

    /// Mirror the JS-side sync state into the App Group and (re)schedule the
    /// nightly task. Called on app open and after every successful sync.
    @objc public func configureBackgroundSync(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        KindleSyncStore.defaults?.set(enabled, forKey: KindleSyncStore.Key.enabled)

        if let configJSON = call.getString("config") {
            KindleSyncStore.defaults?.set(configJSON, forKey: KindleSyncStore.Key.config)
        }

        if enabled {
            KindleBackgroundSync.schedule()
        } else {
            KindleBackgroundSync.cancel()
        }
        call.resolve(["success": true])
    }

    @objc public func getStatus(_ call: CAPPluginCall) {
        let pendingCount = (KindleSyncStore.readPending()?["highlights"] as? [[String: Any]])?.count ?? 0
        call.resolve([
            "enabled": KindleSyncStore.defaults?.bool(forKey: KindleSyncStore.Key.enabled) ?? false,
            "lastRunAt": KindleSyncStore.defaults?.string(forKey: KindleSyncStore.Key.lastRunAt) ?? "",
            "lastStatus": KindleSyncStore.defaults?.string(forKey: KindleSyncStore.Key.lastStatus) ?? "",
            "pendingCount": pendingCount,
        ])
    }
}
