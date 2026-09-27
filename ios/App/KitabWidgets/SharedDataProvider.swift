import Foundation
import SwiftUI

// MARK: - Reads widget data from shared UserDefaults

struct SharedDataProvider {
    static let appGroupId = "group.com.adibchoudhury.kitab"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    private static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
    }

    // MARK: - Data accessors

    static var currentlyReading: [WidgetBook] {
        decode("currentlyReading") ?? []
    }

    static var readingGoal: WidgetGoal? {
        decode("readingGoal")
    }

    /// Today's highlight. Must match pickDailyHighlight() in
    /// src/lib/dailyHighlight.js: index = local days-since-epoch % pool size,
    /// so the widget, the notification and the app all show the same quote.
    static var highlightOfDay: WidgetHighlight? {
        highlight(for: Date()) ?? decode("highlightOfDay")
    }

    static func highlight(for date: Date) -> WidgetHighlight? {
        let pool: [WidgetHighlight] = decode("highlightPool") ?? []
        guard !pool.isEmpty else { return nil }
        let comps = Calendar.current.dateComponents([.year, .month, .day], from: date)
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        guard let midnightUTC = utc.date(from: comps) else { return pool.first }
        let day = Int(floor(midnightUTC.timeIntervalSince1970 / 86_400))
        return pool[((day % pool.count) + pool.count) % pool.count]
    }

    static var tbrNext: [WidgetTBRBook] {
        decode("tbrNext") ?? []
    }

    static var yearStats: WidgetStats? {
        decode("yearStats")
    }

    static var topRanked: [WidgetRankedBook] {
        decode("topRanked") ?? []
    }

    static var lastUpdated: Date? {
        guard let str = defaults?.string(forKey: "lastUpdated") else { return nil }
        return ISO8601DateFormatter().date(from: str)
    }

    // MARK: - Cover image

    static func coverImage(for bookId: String) -> UIImage? {
        guard let container = containerURL else { return nil }
        let path = container.appendingPathComponent("covers/\(bookId).png")
        guard let data = try? Data(contentsOf: path) else { return nil }
        return UIImage(data: data)
    }

    // MARK: - Helpers

    private static func decode<T: Decodable>(_ key: String) -> T? {
        guard let jsonString = defaults?.string(forKey: key),
              let data = jsonString.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}
