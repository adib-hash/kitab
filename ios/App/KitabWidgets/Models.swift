import Foundation

// MARK: - Shared data models for widgets
// These mirror the JSON shapes written by widgetBridge.js

struct WidgetBook: Codable {
    let id: String
    let title: String
    let author: String
    let coverUrl: String?
    let currentPage: Int?
    let pageCount: Int?

    var progress: Double {
        guard let current = currentPage, let total = pageCount, total > 0 else { return 0 }
        return Double(current) / Double(total)
    }

    var pagesRemaining: Int? {
        guard let current = currentPage, let total = pageCount else { return nil }
        return max(0, total - current)
    }
}

struct WidgetGoal: Codable {
    let year: Int
    let target: Int
    let current: Int

    var progress: Double {
        guard target > 0 else { return 0 }
        return min(1.0, Double(current) / Double(target))
    }

    var remaining: Int {
        max(0, target - current)
    }
}

struct WidgetHighlight: Codable {
    let text: String
    let bookTitle: String
    let bookAuthor: String
    let bookId: String?
}

struct WidgetTBRBook: Codable {
    let id: String
    let title: String
    let author: String
    let coverUrl: String?
}

struct WidgetStats: Codable {
    let totalRead: Int
    let totalPages: Int
    let avgRating: Double?
}

struct WidgetRankedBook: Codable {
    let title: String
    let author: String
    let elo: Int
}
