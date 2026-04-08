import Foundation
import Capacitor
import WidgetKit

@objc(KitabDataBridgePlugin)
public class KitabDataBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KitabDataBridgePlugin"
    public let jsName = "KitabDataBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncWidgetData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cacheCoverImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearCoverCache", returnType: CAPPluginReturnPromise),
    ]

    private let appGroupId = "group.com.adibchoudhury.kitab"

    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    private var sharedContainerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
    }

    // MARK: - syncWidgetData
    // Accepts a JSON payload from JS and writes each key to shared UserDefaults.
    // Then triggers a widget timeline reload.
    @objc public func syncWidgetData(_ call: CAPPluginCall) {
        guard let defaults = sharedDefaults else {
            call.reject("App Group not configured")
            return
        }

        // Write each data key to shared UserDefaults as JSON strings
        if let currentlyReading = call.getArray("currentlyReading") {
            if let jsonData = try? JSONSerialization.data(withJSONObject: currentlyReading),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                defaults.set(jsonString, forKey: "currentlyReading")
            }
        }

        if let readingGoal = call.getObject("readingGoal") {
            if let jsonData = try? JSONSerialization.data(withJSONObject: readingGoal),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                defaults.set(jsonString, forKey: "readingGoal")
            }
        }

        if let highlightOfDay = call.getObject("highlightOfDay") {
            if let jsonData = try? JSONSerialization.data(withJSONObject: highlightOfDay),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                defaults.set(jsonString, forKey: "highlightOfDay")
            }
        }

        if let tbrNext = call.getArray("tbrNext") {
            if let jsonData = try? JSONSerialization.data(withJSONObject: tbrNext),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                defaults.set(jsonString, forKey: "tbrNext")
            }
        }

        if let yearStats = call.getObject("yearStats") {
            if let jsonData = try? JSONSerialization.data(withJSONObject: yearStats),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                defaults.set(jsonString, forKey: "yearStats")
            }
        }

        if let topRanked = call.getArray("topRanked") {
            if let jsonData = try? JSONSerialization.data(withJSONObject: topRanked),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                defaults.set(jsonString, forKey: "topRanked")
            }
        }

        // Always update the timestamp
        defaults.set(ISO8601DateFormatter().string(from: Date()), forKey: "lastUpdated")
        defaults.synchronize()

        // Reload widget timelines
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve(["success": true])
    }

    // MARK: - cacheCoverImage
    // Accepts a book ID and base64-encoded image data, writes it to the shared container.
    @objc public func cacheCoverImage(_ call: CAPPluginCall) {
        guard let bookId = call.getString("bookId"),
              let base64 = call.getString("base64") else {
            call.reject("Missing bookId or base64 parameter")
            return
        }

        guard let containerURL = sharedContainerURL else {
            call.reject("App Group container not available")
            return
        }

        let coversDir = containerURL.appendingPathComponent("covers", isDirectory: true)

        // Create covers directory if needed
        try? FileManager.default.createDirectory(at: coversDir, withIntermediateDirectories: true)

        // Decode base64 and write
        guard let imageData = Data(base64Encoded: base64) else {
            call.reject("Invalid base64 data")
            return
        }

        let filePath = coversDir.appendingPathComponent("\(bookId).png")

        do {
            try imageData.write(to: filePath)
            call.resolve(["path": filePath.path])
        } catch {
            call.reject("Failed to write image: \(error.localizedDescription)")
        }
    }

    // MARK: - clearCoverCache
    // Removes all cached cover images from the shared container.
    @objc public func clearCoverCache(_ call: CAPPluginCall) {
        guard let containerURL = sharedContainerURL else {
            call.reject("App Group container not available")
            return
        }

        let coversDir = containerURL.appendingPathComponent("covers", isDirectory: true)
        try? FileManager.default.removeItem(at: coversDir)

        call.resolve(["success": true])
    }
}
