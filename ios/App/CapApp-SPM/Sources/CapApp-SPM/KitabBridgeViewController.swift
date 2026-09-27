import UIKit
import Capacitor

/// The app's root view controller (see Main.storyboard).
///
/// Capacitor 8 only auto-registers plugins listed in the generated
/// capacitor.config.json `packageClassList`, which `npx cap sync` rebuilds from
/// npm packages on every sync. Plugins written directly in this Swift package
/// are never in that list, so they must be registered here by hand. Before
/// v2.13 nothing registered them, which silently broke the widgets
/// (KitabDataBridge) and the automatic Kindle sync (KindleSync).
open class KitabBridgeViewController: CAPBridgeViewController {
    open override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(KitabDataBridgePlugin())
        bridge?.registerPluginInstance(KindleSyncPlugin())
        bridge?.registerPluginInstance(KitabScannerPlugin())
        let found = ["KitabDataBridge", "KindleSync", "KitabScanner"].filter { bridge?.plugin(withName: $0) != nil }
        CAPLog.print("⚡️  Kitab native plugins registered: \(found.joined(separator: ", "))")
    }
}
