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
        let textType = UTType.plainText.identifier

        if provider.hasItemConformingToTypeIdentifier(urlType) {
            // Direct URL share — Safari and any app that shares a URL object
            provider.loadItem(forTypeIdentifier: urlType, options: nil) { [weak self] data, _ in
                var urlString = ""
                if let url = data as? URL { urlString = url.absoluteString }
                else if let str = data as? String { urlString = str }
                self?.openKitab(with: urlString)
            }
        } else if provider.hasItemConformingToTypeIdentifier(textType) {
            // Text share — Amazon and Goodreads native apps share text containing a URL
            provider.loadItem(forTypeIdentifier: textType, options: nil) { [weak self] data, _ in
                let text = data as? String ?? ""
                let urlString = self?.extractBookURL(from: text) ?? ""
                self?.openKitab(with: urlString)
            }
        } else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    // Extract the first Amazon or Goodreads URL from shared text; falls back to any URL
    private func extractBookURL(from text: String) -> String {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return ""
        }
        let range = NSRange(text.startIndex..., in: text)
        let matches = detector.matches(in: text, options: [], range: range)
        let preferredDomains = ["amazon.com", "goodreads.com", "amzn.to", "a.co"]
        for match in matches {
            if let urlString = match.url?.absoluteString {
                for domain in preferredDomains {
                    if urlString.contains(domain) { return urlString }
                }
            }
        }
        return matches.first?.url?.absoluteString ?? ""
    }

    private func openKitab(with urlString: String) {
        let encoded = urlString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let deepLink = URL(string: "kitab://add?url=\(encoded)") else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }
        DispatchQueue.main.async { [weak self] in
            _ = self?.openURL(deepLink)
            self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
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
