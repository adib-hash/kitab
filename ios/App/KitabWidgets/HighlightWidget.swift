import WidgetKit
import SwiftUI

// MARK: - Highlight of the Day Widget (Medium)

struct HighlightProvider: TimelineProvider {
    func placeholder(in context: Context) -> HighlightEntry {
        HighlightEntry(date: Date(), highlight: WidgetHighlight(
            text: "The only way to do great work is to love what you do.",
            bookTitle: "Sample Book",
            bookAuthor: "Author Name",
            bookId: nil
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (HighlightEntry) -> Void) {
        let highlight = SharedDataProvider.highlightOfDay
        completion(HighlightEntry(date: Date(), highlight: highlight))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HighlightEntry>) -> Void) {
        // One entry now, then one at each of the next three midnights, so the
        // quote changes daily even if the app isn't opened.
        let cal = Calendar.current
        let startOfToday = cal.startOfDay(for: Date())
        var entries = [HighlightEntry(date: Date(), highlight: SharedDataProvider.highlightOfDay)]
        for offset in 1...3 {
            if let day = cal.date(byAdding: .day, value: offset, to: startOfToday) {
                entries.append(HighlightEntry(date: day, highlight: SharedDataProvider.highlight(for: day) ?? SharedDataProvider.highlightOfDay))
            }
        }
        let refresh = cal.date(byAdding: .day, value: 3, to: startOfToday) ?? Date().addingTimeInterval(86_400)
        completion(Timeline(entries: entries, policy: .after(refresh)))
    }
}

struct HighlightEntry: TimelineEntry {
    let date: Date
    let highlight: WidgetHighlight?
}

struct HighlightMediumView: View {
    let entry: HighlightEntry

    var body: some View {
        if let highlight = entry.highlight {
            VStack(alignment: .leading, spacing: 0) {
                // Quote text
                // Pool entries are capped at 220 characters, so shrinking the
                // type a little always fits the whole quote. No ellipsis.
                Text("\u{201C}\(highlight.text)\u{201D}")
                    .font(.system(size: highlight.text.count > 150 ? 14 : 16, weight: .regular, design: .serif))
                    .italic()
                    .foregroundColor(.primary)
                    .lineLimit(6)
                    .minimumScaleFactor(0.75)

                Spacer(minLength: 6)

                // Attribution
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(highlight.bookTitle)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.teal)
                            .lineLimit(1)

                        if !highlight.bookAuthor.isEmpty {
                            Text(highlight.bookAuthor)
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    Image(systemName: "quote.opening")
                        .font(.system(size: 12))
                        .foregroundColor(.teal.opacity(0.3))
                }
            }
            .padding(16)
            .widgetURL(highlight.bookId.flatMap { URL(string: "kitab://library/\($0)") })
        } else {
            VStack(spacing: 8) {
                Image(systemName: "text.quote")
                    .font(.system(size: 28))
                    .foregroundColor(.teal.opacity(0.4))
                Text("Sync Kindle highlights to see your daily quote")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(16)
        }
    }
}

struct HighlightWidget: Widget {
    let kind = "HighlightWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HighlightProvider()) { entry in
            if #available(iOS 17.0, *) {
                HighlightMediumView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                HighlightMediumView(entry: entry)
                    .padding()
                    .background()
            }
        }
        .configurationDisplayName("Highlight of the Day")
        .description("A daily Kindle highlight from your library.")
        .supportedFamilies([.systemMedium])
    }
}
