
import UIKit
    import UniformTypeIdentifiers

    class ShareViewController: UIViewController {
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
                  let provider = item.attachments?.first else {
                extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
                return
            }
            let urlType = UTType.url.identifier
            if provider.hasItemConformingToTypeIdentifier(urlType) {
                provider.loadItem(forTypeIdentifier: urlType, options: nil) { [weak self] data, _
    in
                    var urlString = ""
                    if let url = data as? URL { urlString = url.absoluteString }
                    else if let str = data as? String { urlString = str }
                    let encoded = urlString.addingPercentEncoding(
                        withAllowedCharacters: .urlQueryAllowed) ?? ""
                    let deepLink = URL(string: "kitab://add?url=\(encoded)")!
                    DispatchQueue.main.async {
                        _ = self?.openURL(deepLink)
                        self?.extensionContext?.completeRequest(
                            returningItems: [], completionHandler: nil)
                    }
                }
            } else {
                extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            }
        }

        @objc func openURL(_ url: URL) -> Bool {
            var responder: UIResponder? = self
            while responder != nil {
                if let app = responder as? UIApplication {
                    app.open(url, options: [:], completionHandler: nil)
                    return true
                }
                responder = responder?.next
            }
            return false
        }
    }
