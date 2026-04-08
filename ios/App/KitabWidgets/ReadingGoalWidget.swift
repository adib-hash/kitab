import WidgetKit
import SwiftUI

// MARK: - Reading Goal Widget (Small)

struct ReadingGoalProvider: TimelineProvider {
    func placeholder(in context: Context) -> ReadingGoalEntry {
        ReadingGoalEntry(date: Date(), goal: WidgetGoal(year: 2026, target: 24, current: 12))
    }

    func getSnapshot(in context: Context, completion: @escaping (ReadingGoalEntry) -> Void) {
        let goal = SharedDataProvider.readingGoal
        completion(ReadingGoalEntry(date: Date(), goal: goal))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ReadingGoalEntry>) -> Void) {
        let goal = SharedDataProvider.readingGoal
        let entry = ReadingGoalEntry(date: Date(), goal: goal)
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct ReadingGoalEntry: TimelineEntry {
    let date: Date
    let goal: WidgetGoal?
}

struct ReadingGoalSmallView: View {
    let entry: ReadingGoalEntry

    var body: some View {
        if let goal = entry.goal {
            VStack(spacing: 8) {
                // Circular progress
                ZStack {
                    Circle()
                        .stroke(Color.gray.opacity(0.2), lineWidth: 6)
                    Circle()
                        .trim(from: 0, to: goal.progress)
                        .stroke(
                            goal.progress >= 1.0 ? Color.green : Color.teal,
                            style: StrokeStyle(lineWidth: 6, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))

                    VStack(spacing: 1) {
                        Text("\(goal.current)")
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundColor(.primary)
                        Text("of \(goal.target)")
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                    }
                }
                .frame(width: 80, height: 80)

                VStack(spacing: 2) {
                    Text("\(goal.year) Goal")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.primary)

                    Text(goal.progress >= 1.0
                         ? "Complete!"
                         : "\(goal.remaining) to go")
                        .font(.system(size: 10))
                        .foregroundColor(goal.progress >= 1.0 ? .green : .secondary)
                }
            }
            .padding(12)
            .widgetURL(URL(string: "kitab://stats"))
        } else {
            VStack(spacing: 8) {
                Image(systemName: "target")
                    .font(.system(size: 28))
                    .foregroundColor(.teal.opacity(0.4))
                Text("Set a reading goal")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(14)
        }
    }
}

struct ReadingGoalWidget: Widget {
    let kind = "ReadingGoalWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ReadingGoalProvider()) { entry in
            if #available(iOS 17.0, *) {
                ReadingGoalSmallView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                ReadingGoalSmallView(entry: entry)
                    .padding()
                    .background()
            }
        }
        .configurationDisplayName("Reading Goal")
        .description("Track your annual reading goal.")
        .supportedFamilies([.systemSmall])
    }
}
