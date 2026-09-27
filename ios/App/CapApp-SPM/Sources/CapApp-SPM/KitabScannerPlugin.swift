import Foundation
import UIKit
import AVFoundation
import Capacitor

/// Native ISBN barcode scanner.
///
/// Replaces the in-WebView @zxing scanner on iOS. That one decoded a
/// low-resolution getUserMedia stream from the default wide camera, which on
/// recent Pro iPhones cannot focus closer than ~20 cm, so a book held at a
/// natural distance was a blur and nothing ever decoded. This uses
/// AVCaptureMetadataOutput (hardware barcode detection) on the virtual
/// multi-camera device, which switches to the ultra-wide lens for close focus
/// automatically.
///
/// JS: KitabScanner.scan() resolves { status: 'ok', code } | { status: 'cancelled' }
///     | { status: 'denied' } | { status: 'unavailable' }.
@objc(KitabScannerPlugin)
public class KitabScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KitabScannerPlugin"
    public let jsName = "KitabScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
    ]

    @objc public func scan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                self.present(call)
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    DispatchQueue.main.async {
                        if granted { self.present(call) } else { call.resolve(["status": "denied"]) }
                    }
                }
            default:
                call.resolve(["status": "denied"])
            }
        }
    }

    private func present(_ call: CAPPluginCall) {
        guard let host = bridge?.viewController else {
            call.resolve(["status": "unavailable"])
            return
        }
        let scanner = KitabScannerViewController()
        scanner.modalPresentationStyle = .fullScreen
        scanner.onFinish = { [weak scanner] result in
            let payload: [String: Any]
            switch result {
            case .code(let code): payload = ["status": "ok", "code": code]
            case .cancelled: payload = ["status": "cancelled"]
            case .unavailable: payload = ["status": "unavailable"]
            }
            if let scanner = scanner, scanner.presentingViewController != nil {
                scanner.dismiss(animated: true) { call.resolve(payload) }
            } else {
                call.resolve(payload)
            }
        }
        host.present(scanner, animated: true)
    }
}

enum KitabScanResult {
    case code(String)
    case cancelled
    case unavailable
}

final class KitabScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onFinish: ((KitabScanResult) -> Void)?

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "kitab.scanner.session")
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var finished = false
    private var configured = false
    private let frameView = UIView()

    private static let teal = UIColor(red: 45/255, green: 212/255, blue: 191/255, alpha: 1)

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configured = configureSession()
        buildOverlay()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if !configured { finish(.unavailable); return }
        sessionQueue.async { [session] in if !session.isRunning { session.startRunning() } }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sessionQueue.async { [session] in if session.isRunning { session.stopRunning() } }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    /// Prefer the virtual multi-camera devices: they auto-switch lenses, which
    /// is what gives close-up focus on a book's back cover.
    private func bestCamera() -> AVCaptureDevice? {
        let types: [AVCaptureDevice.DeviceType] = [
            .builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera,
        ]
        for type in types {
            if let device = AVCaptureDevice.default(type, for: .video, position: .back) { return device }
        }
        return AVCaptureDevice.default(for: .video)
    }

    private func configureSession() -> Bool {
        guard let device = bestCamera(),
              let input = try? AVCaptureDeviceInput(device: device) else { return false }

        session.beginConfiguration()
        if session.canSetSessionPreset(.hd1920x1080) { session.sessionPreset = .hd1920x1080 }
        guard session.canAddInput(input) else { session.commitConfiguration(); return false }
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { session.commitConfiguration(); return false }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        let wanted: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce]
        output.metadataObjectTypes = wanted.filter { output.availableMetadataObjectTypes.contains($0) }
        session.commitConfiguration()

        if (try? device.lockForConfiguration()) != nil {
            if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
            if device.isAutoFocusRangeRestrictionSupported { device.autoFocusRangeRestriction = .near }
            device.unlockForConfiguration()
        }

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.addSublayer(layer)
        previewLayer = layer
        return true
    }

    private func buildOverlay() {
        frameView.translatesAutoresizingMaskIntoConstraints = false
        frameView.layer.borderColor = Self.teal.cgColor
        frameView.layer.borderWidth = 3
        frameView.layer.cornerRadius = 14
        view.addSubview(frameView)

        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = "Point at the barcode on the back cover"
        label.textColor = UIColor.white.withAlphaComponent(0.85)
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.textAlignment = .center
        label.numberOfLines = 2
        view.addSubview(label)

        var config = UIButton.Configuration.filled()
        config.title = "Cancel"
        config.baseBackgroundColor = UIColor.white.withAlphaComponent(0.18)
        config.baseForegroundColor = .white
        config.cornerStyle = .capsule
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 32, bottom: 12, trailing: 32)
        let cancel = UIButton(configuration: config)
        cancel.translatesAutoresizingMaskIntoConstraints = false
        cancel.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        view.addSubview(cancel)

        NSLayoutConstraint.activate([
            frameView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frameView.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -30),
            frameView.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.78),
            frameView.heightAnchor.constraint(equalToConstant: 150),
            label.topAnchor.constraint(equalTo: frameView.bottomAnchor, constant: 22),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
            cancel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            cancel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
        ])
    }

    @objc private func cancelTapped() { finish(.cancelled) }

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard !finished else { return }
        let codes = metadataObjects.compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }
        // Books carry an ISBN (EAN-13 starting 978/979); mass-market paperbacks may
        // also show a UPC price code. Prefer the ISBN when both are in frame.
        guard let code = codes.first(where: { $0.hasPrefix("978") || $0.hasPrefix("979") }) ?? codes.first else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        frameView.layer.borderColor = UIColor.white.cgColor
        finish(.code(code))
    }

    private func finish(_ result: KitabScanResult) {
        guard !finished else { return }
        finished = true
        sessionQueue.async { [session] in if session.isRunning { session.stopRunning() } }
        onFinish?(result)
    }
}
