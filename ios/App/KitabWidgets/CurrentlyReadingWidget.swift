import WidgetKit
import SwiftUI

// MARK: - Currently Reading Widget (Small + Medium)

struct CurrentlyReadingProvider: TimelineProvider {
    func placeholder(in context: Context) -> CurrentlyReadingEntry {
        CurrentlyReadingEntry(date: Date(), book: nil, tbrPick: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (CurrentlyReadingEntry) -> Void) {
        let books = SharedDataProvider.currentlyReading
        let tbr = SharedDataProvider.tbrNext.first
        completion(CurrentlyReadingEntry(date: Date(), book: books.first, tbrPick: tbr))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CurrentlyReadingEntry>) -> Void) {
        let books = SharedDataProvider.currentlyReading
        let tbr = SharedDataProvider.tbrNext.first
        let entry = CurrentlyReadingEntry(date: Date(), book: books.first, tbrPick: tbr)
        // Refresh every 30 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct CurrentlyReadingEntry: TimelineEntry {
    let date: Date
    let book: WidgetBook?
    let tbrPick: WidgetTBRBook?
}

// MARK: - Small Widget View

struct CurrentlyReadingSmallView: View {
    let entry: CurrentlyReadingEntry

    var body: some View {
        if let book = entry.book {
            VStack(alignment: .leading, spacing: 6) {
                // Cover + title
                HStack(spacing: 8) {
                    if let image = SharedDataProvider.coverImage(for: book.id) {
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 36, height: 54)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    } else {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.teal.opacity(0.2))
                            .frame(width: 36, height: 54)
                            .overlay(
                                Image(systemName: "book.fill")
                                    .font(.system(size: 14))
                                    .foregroundColor(.teal)
                            )
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(book.title)
                            .font(.system(size: 13, weight: .semibold, design: .serif))
                            .lineLimit(2)
                            .foregroundColor(.primary)

                        Text(book.author)
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 0)

                // Progress bar
                if book.pageCount != nil && book.pageCount! > 0 {
                    VStack(alignment: .leading, spacing: 3) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color.gray.opacity(0.2))
                                    .frame(height: 4)
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color.teal)
                                    .frame(width: max(4, geo.size.width * book.progress), height: 4)
                            }
                        }
                        .frame(height: 4)

                        Text("p.\(book.currentPage ?? 0)/\(book.pageCount ?? 0)")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding(14)
            .widgetURL(URL(string: "kitab://library/\(book.id)"))
        } else {
            // Empty state — show TBR suggestion
            VStack(spacing: 8) {
                Image(systemName: "book.closed")
                    .font(.system(size: 24))
                    .foregroundColor(.teal.opacity(0.5))

                Text("Pick up a book")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.secondary)

                if let tbr = entry.tbrPick {
                    Text(tbr.title)
                        .font(.system(size: 11, weight: .semibold, design: .serif))
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .foregroundColor(.primary)
                }
            }
            .padding(14)
        }
    }
}

// MARK: - Medium Widget View

struct CurrentlyReadingMediumView: View {
    let entry: CurrentlyReadingEntry

    var body: some View {
        if let book = entry.book {
            HStack(spacing: 14) {
                // Cover
                if let image = SharedDataProvider.coverImage(for: book.id) {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 56, height: 84)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                } else {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.teal.opacity(0.15))
                        .frame(width: 56, height: 84)
                        .overlay(
                            Image(systemName: "book.fill")
                                .font(.system(size: 20))
                                .foregroundColor(.teal)
                        )
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Currently Reading")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.teal)
                        .textCase(.uppercase)

                    Text(book.title)
                        .font(.system(size: 15, weight: .semibold, design: .serif))
                        .lineLimit(2)
                        .foregroundColor(.primary)

                    Text(book.author)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .lineLimit(1)

                    Spacer(minLength: 0)

                    if let pageCount = book.pageCount, pageCount > 0 {
                        VStack(alignment: .leading, spacing: 3) {
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    RoundedRectangle(cornerRadius: 2.5)
                                        .fill(Color.gray.opacity(0.2))
                                        .frame(height: 5)
                                    RoundedRectangle(cornerRadius: 2.5)
                                        .fill(Color.teal)
                                        .frame(width: max(5, geo.size.width * book.progress), height: 5)
                                }
                            }
                            .frame(height: 5)

                            if let remaining = book.pagesRemaining {
                                Text("\(remaining) pages to go")
                                    .font(.system(size: 10))
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(14)
            .widgetURL(URL(string: "kitab://library/\(book.id)"))
        } else {
            // Empty state
            HStack {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "book.closed")
                        .font(.system(size: 28))
                        .foregroundColor(.teal.opacity(0.5))
                    Text("Nothing on the go")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.secondary)
                    if let tbr = entry.tbrPick {
                        Text("Next up: \(tbr.title)")
                            .font(.system(size: 11, design: .serif))
                            .foregroundColor(.primary)
                            .lineLimit(1)
                    }
                }
                Spacer()
            }
            .padding(14)
        }
    }
}

// MARK: - Widget Definition

struct CurrentlyReadingContentView: View {
    @Environment(\.widgetFamily) var family
    let entry: CurrentlyReadingEntry

    var body: some View {
        switch family {
        case .systemMedium:
            CurrentlyReadingMediumView(entry: entry)
        default:
            CurrentlyReadingSmallView(entry: entry)
        }
    }
}

struct CurrentlyReadingWidget: Widget {
    let kind = "CurrentlyReadingWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CurrentlyReadingProvider()) { entry in
            if #available(iOS 17.0, *) {
                CurrentlyReadingContentView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                CurrentlyReadingContentView(entry: entry)
                    .padding()
                    .background()
            }
        }
        .configurationDisplayName("Currently Reading")
        .description("Track your reading progress.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
