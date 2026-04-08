import WidgetKit
import SwiftUI

@main
struct KitabWidgetBundle: WidgetBundle {
    var body: some Widget {
        CurrentlyReadingWidget()
        ReadingGoalWidget()
        HighlightWidget()
        if #available(iOS 16.0, *) {
            KitabLockScreenWidget()
        }
    }
}
