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
        let highlight = SharedDataProvider.highlightOfDay
        let entry = HighlightEntry(date: Date(), highlight: highlight)
        // Refresh every 4 hours
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 4, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
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
                Text("\u{201C}\(highlight.text)\u{201D}")
                    .font(.system(size: 13, weight: .regular, design: .serif))
                    .italic()
                    .foregroundColor(.primary)
                    .lineLimit(4)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 6)

                // Attribution
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(highlight.bookTitle)
                            .font(.system(size: 11, weight: .semibold))
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
