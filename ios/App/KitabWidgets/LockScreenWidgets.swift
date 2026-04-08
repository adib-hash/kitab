import WidgetKit
import SwiftUI

// MARK: - Lock Screen Widgets (iOS 16+)

// Shared provider for lock screen widgets
struct LockScreenProvider: TimelineProvider {
    func placeholder(in context: Context) -> LockScreenEntry {
        LockScreenEntry(
            date: Date(),
            book: nil,
            goal: WidgetGoal(year: 2026, target: 24, current: 12)
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (LockScreenEntry) -> Void) {
        let book = SharedDataProvider.currentlyReading.first
        let goal = SharedDataProvider.readingGoal
        completion(LockScreenEntry(date: Date(), book: book, goal: goal))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LockScreenEntry>) -> Void) {
        let book = SharedDataProvider.currentlyReading.first
        let goal = SharedDataProvider.readingGoal
        let entry = LockScreenEntry(date: Date(), book: book, goal: goal)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct LockScreenEntry: TimelineEntry {
    let date: Date
    let book: WidgetBook?
    let goal: WidgetGoal?
}

// MARK: - Circular: Reading Goal Ring

@available(iOS 16.0, *)
struct GoalCircularView: View {
    let entry: LockScreenEntry

    var body: some View {
        if let goal = entry.goal {
            Gauge(value: goal.progress) {
                Image(systemName: "book.fill")
            } currentValueLabel: {
                Text("\(goal.current)")
                    .font(.system(size: 12, weight: .bold))
            }
            .gaugeStyle(.accessoryCircular)
            .widgetURL(URL(string: "kitab://stats"))
        } else {
            Image(systemName: "book.fill")
                .font(.system(size: 20))
        }
    }
}

// MARK: - Inline: Currently Reading Status

@available(iOS 16.0, *)
struct ReadingInlineView: View {
    let entry: LockScreenEntry

    var body: some View {
        if let book = entry.book {
            let progressPct = Int(book.progress * 100)
            ViewThatFits {
                Text("Reading: \(book.title) (\(progressPct)%)")
                Text("\(book.title) · \(progressPct)%")
                Text("\(progressPct)% · \(book.title)")
            }
        } else {
            Text("Kitab · Pick up a book")
        }
    }
}

// MARK: - Rectangular: Currently Reading Progress

@available(iOS 16.0, *)
struct ReadingRectangularView: View {
    let entry: LockScreenEntry

    var body: some View {
        if let book = entry.book {
            VStack(alignment: .leading, spacing: 3) {
                Text(book.title)
                    .font(.system(size: 13, weight: .semibold, design: .serif))
                    .lineLimit(1)

                Text(book.author)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
                    .lineLimit(1)

                if let pageCount = book.pageCount, pageCount > 0 {
                    Gauge(value: book.progress) {
                        EmptyView()
                    }
                    .gaugeStyle(.accessoryLinear)

                    Text("p.\(book.currentPage ?? 0) of \(pageCount)")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
            }
            .widgetURL(URL(string: "kitab://library/\(book.id)"))
        } else if let goal = entry.goal {
            VStack(alignment: .leading, spacing: 3) {
                Text("\(goal.year) Reading Goal")
                    .font(.system(size: 12, weight: .semibold))

                Gauge(value: goal.progress) {
                    EmptyView()
                }
                .gaugeStyle(.accessoryLinear)

                Text("\(goal.current) of \(goal.target) books")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
            .widgetURL(URL(string: "kitab://stats"))
        } else {
            VStack(alignment: .leading, spacing: 3) {
                Text("Kitab")
                    .font(.system(size: 13, weight: .semibold, design: .serif))
                Text("Open app to sync data")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
        }
    }
}

// MARK: - Lock Screen Widget Definition

@available(iOS 16.0, *)
struct KitabLockScreenWidget: Widget {
    let kind = "KitabLockScreenWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LockScreenProvider()) { entry in
            if #available(iOS 17.0, *) {
                LockScreenContentView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                LockScreenContentView(entry: entry)
            }
        }
        .configurationDisplayName("Kitab")
        .description("Reading progress on your lock screen.")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryInline,
            .accessoryRectangular,
        ])
    }
}

@available(iOS 16.0, *)
struct LockScreenContentView: View {
    @Environment(\.widgetFamily) var family
    let entry: LockScreenEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            GoalCircularView(entry: entry)
        case .accessoryInline:
            ReadingInlineView(entry: entry)
        case .accessoryRectangular:
            ReadingRectangularView(entry: entry)
        default:
            EmptyView()
        }
    }
}
