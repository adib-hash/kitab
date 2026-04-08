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

    static var highlightOfDay: WidgetHighlight? {
        decode("highlightOfDay")
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
