import Foundation
import Capacitor
import AVFoundation
import UIKit
import Network

/// Full-screen game camera shown over the app. The web view keeps running underneath, so the
/// live score from the logging phone keeps arriving and is shown on the camera screen.
/// Records to the app's temporary folder; the page saves or shares the video afterwards.
/// mark() reports where the recording is, so each point can be pinned to the video.
/// Opened with a stream target, it goes live instead (LiveEngine), with the scoreboard drawn
/// into the video.
///
/// Note: the Capacitor CLI registers this plugin by the FIRST objc-name attribute in this
/// file (the one on the class below), so never write that attribute with a name in any
/// comment above it, and don't add other named objc attributes to this file.
@objc(GameCameraPlugin)
public class GameCameraPlugin: CAPPlugin, CAPBridgedPlugin, AVCaptureFileOutputRecordingDelegate {
    public let identifier = "GameCameraPlugin"
    /// Wi-Fi or cellular, for the stream quality log.
    private let pathMonitor = NWPathMonitor()
    public let jsName = "GameCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setScoreboard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showPlay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mark", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deviceStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recoverRecordings", returnType: CAPPluginReturnPromise)
    ]

    private let session = AVCaptureSession()
    private let movieOutput = AVCaptureMovieFileOutput()
    private let sessionQueue = DispatchQueue(label: "app.loggerhead.gamecamera")
    private var configured = false
    private var cameraView: GameCameraView?
    private var startedAt: Date?
    private var closeAfterStop = false

    // Live streaming
    private var live: LiveEngine?
    // LiveEngine runs on the main actor; these mirror its state for synchronous reads here.
    private var liveRecording = false
    private var liveStartedAt: Date?
    private var liveState = ""
    private var sbTitle = ""
    private var sbSubtitle = ""
    private var sbPlay = ""
    private var playClear: DispatchWorkItem?

    // MARK: - Open / close

    @objc func open(_ call: CAPPluginCall) {
        let stream = call.getObject("stream")
        let target: (url: String, key: String)? = stream.map {
            (($0["url"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
             ($0["key"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
        }
        if let target = target, target.url.isEmpty || target.key.isEmpty {
            call.reject("Add your stream key first.")
            return
        }
        let quality = (stream?["quality"] as? String) ?? "high"
        AVCaptureDevice.requestAccess(for: .video) { granted in
            guard granted else {
                call.reject("Loggerhead needs camera access to film. Turn it on in Settings › Loggerhead.", "PERMISSION_DENIED")
                return
            }
            // Sound is optional: film without it if the microphone is off.
            AVCaptureDevice.requestAccess(for: .audio) { _ in
                if let target = target {
                    DispatchQueue.main.async { self.openLive(call, url: target.url, key: target.key, quality: quality) }
                    return
                }
                self.sessionQueue.async {
                    if !self.configured {
                        if let problem = self.configure() {
                            call.reject(problem)
                            return
                        }
                    }
                    if !self.session.isRunning { self.session.startRunning() }
                    DispatchQueue.main.async {
                        self.showView()
                        UIApplication.shared.isIdleTimerDisabled = true
                        call.resolve()
                    }
                }
            }
        }
    }

    /// Back camera + microphone into a movie file. Returns a message if the camera can't start.
    private func configure() -> String? {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        if session.canSetSessionPreset(.hd1920x1080) {
            session.sessionPreset = .hd1920x1080
        } else {
            session.sessionPreset = .high
        }
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: camera),
              session.canAddInput(input) else {
            return "Couldn't start the camera on this phone."
        }
        session.addInput(input)
        if AVCaptureDevice.authorizationStatus(for: .audio) == .authorized,
           let mic = AVCaptureDevice.default(for: .audio),
           let micInput = try? AVCaptureDeviceInput(device: mic),
           session.canAddInput(micInput) {
            session.addInput(micInput)
        }
        guard session.canAddOutput(movieOutput) else { return "Couldn't record on this phone." }
        session.addOutput(movieOutput)
        // Written in 10-second pieces, so the video survives the app being killed mid-match.
        movieOutput.movieFragmentInterval = CMTime(seconds: 10, preferredTimescale: 1)
        configured = true
        return nil
    }

    // MARK: - Live

    private func openLive(_ call: CAPPluginCall, url: String, key: String, quality: String) {
        guard cameraView == nil, let host = bridge?.viewController?.view else {
            call.reject("The camera is already open.")
            return
        }
        Task { @MainActor in
            let engine = LiveEngine(serverURL: url, streamKey: key, quality: quality)
            self.live = engine
            self.wireLive(engine)
            let view = GameCameraView(frame: host.bounds, session: nil, preview: engine.previewView)
            view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.onRecordTapped = { [weak self, weak view] in
                guard let self = self, let engine = self.live else { return }
                let orientation = view?.videoOrientation ?? .landscapeRight
                Task { @MainActor in await engine.toggle(orientation: orientation) }
            }
            view.onCloseTapped = { [weak self] in self?.confirmClose() }
            view.onOrientationChange = { [weak self] orientation in
                guard let engine = self?.live else { return }
                Task { @MainActor in await engine.setOrientation(orientation) }
            }
            view.recordedTime = { [weak self] in
                guard let self = self, self.liveRecording, let at = self.liveStartedAt else { return nil }
                return Date().timeIntervalSince(at)
            }
            host.addSubview(view)
            self.cameraView = view
            UIApplication.shared.isIdleTimerDisabled = true
            view.setLiveStatus("Tap the red button to go live", color: .white)
            do {
                try await engine.prepare(orientation: view.videoOrientation)
                self.refreshLiveOverlay()
                call.resolve()
            } catch {
                await engine.shutdown()
                self.live = nil
                view.stop()
                view.removeFromSuperview()
                self.cameraView = nil
                UIApplication.shared.isIdleTimerDisabled = false
                call.reject("This phone couldn't start a live stream: \(error.localizedDescription)")
            }
        }
    }

    @MainActor
    private func wireLive(_ engine: LiveEngine) {
        engine.onLive = { [weak self] state, message in
            guard let self = self else { return }
            self.liveState = state
            let amber = UIColor(red: 0.99, green: 0.73, blue: 0.45, alpha: 1)
            switch state {
            case "connecting": self.cameraView?.setLiveStatus("Connecting…", color: amber)
            case "live": self.cameraView?.setLiveStatus("● LIVE", color: UIColor(red: 0.97, green: 0.44, blue: 0.44, alpha: 1))
            case "reconnecting": self.cameraView?.setLiveStatus("Reconnecting… (still recording)", color: amber)
            case "failed": self.cameraView?.setLiveStatus("Not live (still recording)", color: amber)
            default: self.cameraView?.setLiveStatus("", color: .white)
            }
            var data: [String: Any] = ["state": state]
            if !message.isEmpty { data["message"] = message }
            self.notifyListeners("live", data: data)
        }
        engine.onHealth = { [weak self] sent, level, hot in
            guard let self = self, self.liveState == "live" else { return }
            let color: UIColor
            switch level {
            case "good": color = UIColor(red: 0.29, green: 0.87, blue: 0.5, alpha: 1)
            case "fair": color = UIColor(red: 0.98, green: 0.8, blue: 0.08, alpha: 1)
            default: color = UIColor(red: 0.97, green: 0.44, blue: 0.44, alpha: 1)
            }
            var text = String(format: "● LIVE · %.1f Mbps", Double(sent) / 1_000_000)
            if level == "poor" { text += " · weak connection" }
            if hot { text += " · phone hot" }
            self.cameraView?.setLiveStatus(text, color: color)
            // Once a second while live, for the stream quality log.
            self.notifyListeners("health", data: ["sentBps": sent, "level": level, "hot": hot])
        }
        engine.onRecordingStarted = { [weak self] at in
            self?.liveRecording = true
            self?.liveStartedAt = Date()
            self?.cameraView?.setRecording(true)
            self?.notifyListeners("recording", data: ["state": "started", "startedAt": at])
        }
        engine.onRecordingStopped = { [weak self] url, durationMs, error in
            guard let self = self else { return }
            self.liveRecording = false
            self.liveStartedAt = nil
            self.cameraView?.setRecording(false)
            var data: [String: Any]
            if let url = url, FileManager.default.fileExists(atPath: url.path) {
                let seconds = CMTimeGetSeconds(AVURLAsset(url: url).duration)
                let startedAt = Int(Date().timeIntervalSince1970 * 1000) - durationMs
                data = [
                    "state": "stopped",
                    "path": url.path,
                    "uri": url.absoluteString,
                    "durationMs": seconds.isFinite && seconds > 0 ? Int(seconds * 1000) : durationMs,
                    "startedAt": startedAt
                ]
                if let error = error { data["message"] = "Recording stopped early: \(error)" }
            } else {
                data = ["state": "error", "message": "The recording couldn't be saved: \(error ?? "unknown error")"]
            }
            self.notifyListeners("recording", data: data)
            if self.closeAfterStop {
                self.closeAfterStop = false
                self.closeCamera()
            }
        }
    }

    private func refreshLiveOverlay() {
        let title = sbTitle, subtitle = sbSubtitle, play = sbPlay
        guard let engine = live else { return }
        Task { @MainActor in
            engine.setScore(ScoreArt.score(title: title, subtitle: subtitle, play: play))
        }
    }

    private func showView() {
        guard cameraView == nil, let host = bridge?.viewController?.view else { return }
        let view = GameCameraView(frame: host.bounds, session: session, preview: nil)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.onRecordTapped = { [weak self] in self?.toggleRecording() }
        view.onCloseTapped = { [weak self] in self?.confirmClose() }
        view.recordedTime = { [weak self] in
            guard let self = self, self.movieOutput.isRecording else { return nil }
            return CMTimeGetSeconds(self.movieOutput.recordedDuration)
        }
        host.addSubview(view)
        cameraView = view
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.closeCamera()
            call.resolve()
        }
    }

    private func confirmClose() {
        guard movieOutput.isRecording || liveRecording else {
            closeCamera()
            return
        }
        let alert = UIAlertController(
            title: live != nil ? "End the live stream?" : "Stop recording?",
            message: live != nil ? "The stream ends. The video so far is kept on this phone." : "The video so far is kept.",
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Keep filming", style: .cancel))
        alert.addAction(UIAlertAction(title: "Stop and close", style: .destructive) { _ in self.closeCamera() })
        bridge?.viewController?.present(alert, animated: true)
    }

    private func closeCamera() {
        if let engine = live {
            if liveRecording {
                // Finish the file first; the view goes when the recording is saved.
                closeAfterStop = true
                Task { @MainActor in await engine.stop() }
                return
            }
            live = nil
            playClear?.cancel()
            Task { @MainActor in await engine.shutdown() }
            cameraView?.stop()
            cameraView?.removeFromSuperview()
            cameraView = nil
            UIApplication.shared.isIdleTimerDisabled = false
            notifyListeners("closed", data: [:])
            return
        }
        if movieOutput.isRecording {
            // Finish the file first; the view goes when the recording is saved.
            closeAfterStop = true
            sessionQueue.async { self.movieOutput.stopRecording() }
            return
        }
        cameraView?.stop()
        cameraView?.removeFromSuperview()
        cameraView = nil
        UIApplication.shared.isIdleTimerDisabled = false
        sessionQueue.async {
            if self.session.isRunning { self.session.stopRunning() }
        }
        notifyListeners("closed", data: [:])
    }

    // MARK: - Recording

    private func toggleRecording() {
        if movieOutput.isRecording {
            sessionQueue.async { self.movieOutput.stopRecording() }
            return
        }
        let orientation = cameraView?.videoOrientation ?? .landscapeRight
        sessionQueue.async {
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("game-camera", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent("loggerhead-game-\(Int(Date().timeIntervalSince1970 * 1000)).mov")
            if let connection = self.movieOutput.connection(with: .video), connection.isVideoOrientationSupported {
                connection.videoOrientation = orientation
            }
            RecordingMarker.set(url)
            self.movieOutput.startRecording(to: url, recordingDelegate: self)
        }
    }

    public func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        let now = Date()
        startedAt = now
        DispatchQueue.main.async { self.cameraView?.setRecording(true) }
        notifyListeners("recording", data: ["state": "started", "startedAt": Int(now.timeIntervalSince1970 * 1000)])
    }

    public func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL,
                           from connections: [AVCaptureConnection], error: Error?) {
        // An error can still leave a playable file (e.g. the phone ran low on space).
        let finished = (error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool
        let usable = error == nil || finished == true
        RecordingMarker.clear(outputFileURL)
        let seconds = CMTimeGetSeconds(AVURLAsset(url: outputFileURL).duration)
        var data: [String: Any] = [:]
        if usable && FileManager.default.fileExists(atPath: outputFileURL.path) {
            data = [
                "state": "stopped",
                "path": outputFileURL.path,
                "uri": outputFileURL.absoluteString,
                "durationMs": seconds.isFinite ? Int(seconds * 1000) : 0,
                "startedAt": Int((startedAt ?? Date()).timeIntervalSince1970 * 1000)
            ]
            if let error = error { data["message"] = "Recording stopped early: \(error.localizedDescription)" }
        } else {
            data = ["state": "error", "message": "The recording couldn't be saved: \(error?.localizedDescription ?? "unknown error")"]
        }
        notifyListeners("recording", data: data)
        DispatchQueue.main.async {
            self.cameraView?.setRecording(false)
            if self.closeAfterStop {
                self.closeAfterStop = false
                self.closeCamera()
            }
        }
    }

    // MARK: - Checks before filming, and recovery

    /// Battery, free space and heat, for the checks before filming.
    public override func load() {
        pathMonitor.start(queue: DispatchQueue.global(qos: .utility))
    }

    /// "wifi", "cellular", "other", "none" or "unknown": what the phone is using right now.
    private func networkType() -> String {
        let path = pathMonitor.currentPath
        if path.status != .satisfied { return path.status == .unsatisfied ? "none" : "unknown" }
        if path.usesInterfaceType(.wifi) { return "wifi" }
        if path.usesInterfaceType(.cellular) { return "cellular" }
        return "other"
    }

    @objc func deviceStatus(_ call: CAPPluginCall) {
        let network = networkType()
        DispatchQueue.main.async {
            UIDevice.current.isBatteryMonitoringEnabled = true
            let level = UIDevice.current.batteryLevel
            let state = UIDevice.current.batteryState
            var free: Int64 = -1
            let home = URL(fileURLWithPath: NSHomeDirectory())
            if let values = try? home.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
               let capacity = values.volumeAvailableCapacityForImportantUsage {
                free = capacity
            }
            let thermal: String
            switch ProcessInfo.processInfo.thermalState {
            case .critical: thermal = "critical"
            case .serious: thermal = "serious"
            case .fair: thermal = "fair"
            default: thermal = "nominal"
            }
            call.resolve([
                "battery": level >= 0 ? Double(level) : -1,
                "charging": state == .charging || state == .full,
                "freeBytes": free,
                "thermal": thermal,
                "network": network
            ])
        }
    }

    /// Videos left behind when the app closed mid-recording (they're written in 10-second
    /// pieces, so everything up to the last piece plays). Only while the camera is closed.
    @objc func recoverRecordings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.cameraView == nil else {
                call.resolve(["recordings": [] as [Any]])
                return
            }
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("game-camera", isDirectory: true)
            DispatchQueue.global(qos: .userInitiated).async {
                var list: [[String: Any]] = []
                for url in RecordingMarker.leftovers(in: dir, active: []) {
                    let seconds = CMTimeGetSeconds(AVURLAsset(url: url).duration)
                    let digits = url.deletingPathExtension().lastPathComponent.filter { $0.isNumber }
                    list.append([
                        "state": "stopped",
                        "path": url.path,
                        "uri": url.absoluteString,
                        "durationMs": seconds.isFinite && seconds > 0 ? Int(seconds * 1000) : 0,
                        "startedAt": Int(digits) ?? 0,
                        "recovered": true
                    ])
                }
                call.resolve(["recordings": list])
            }
        }
    }

    @objc func mark(_ call: CAPPluginCall) {
        if live != nil {
            let position = liveStartedAt.map { Int(Date().timeIntervalSince($0) * 1000) } ?? 0
            call.resolve(["recording": liveRecording, "positionMs": liveRecording ? position : 0])
            return
        }
        let recording = movieOutput.isRecording
        let seconds = recording ? CMTimeGetSeconds(movieOutput.recordedDuration) : 0
        call.resolve([
            "recording": recording,
            "positionMs": seconds.isFinite ? Int(seconds * 1000) : 0
        ])
    }

    @objc func setScoreboard(_ call: CAPPluginCall) {
        let title = call.getString("title")
        let subtitle = call.getString("subtitle")
        let status = call.getString("status")
        let connected = call.getBool("connected")
        DispatchQueue.main.async {
            if let title = title { self.sbTitle = title }
            if let subtitle = subtitle { self.sbSubtitle = subtitle }
            if self.live != nil { self.refreshLiveOverlay() }
            self.cameraView?.setScoreboard(title: title, subtitle: subtitle, status: status, connected: connected)
            call.resolve()
        }
    }

    @objc func showPlay(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        DispatchQueue.main.async {
            if self.live != nil, !text.isEmpty {
                // Live: the play goes into the video under the scoreboard for 4 seconds.
                self.sbPlay = text
                self.refreshLiveOverlay()
                self.playClear?.cancel()
                let clear = DispatchWorkItem { [weak self] in
                    self?.sbPlay = ""
                    self?.refreshLiveOverlay()
                }
                self.playClear = clear
                DispatchQueue.main.asyncAfter(deadline: .now() + 4, execute: clear)
            } else if !text.isEmpty {
                self.cameraView?.showPlay(text)
            }
            call.resolve()
        }
    }
}

/// Label with room around the text (the play banner).
final class PaddedLabel: UILabel {
    var insets = UIEdgeInsets(top: 5, left: 14, bottom: 5, right: 14)
    override func drawText(in rect: CGRect) { super.drawText(in: rect.inset(by: insets)) }
    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        return CGSize(width: size.width + insets.left + insets.right, height: size.height + insets.top + insets.bottom)
    }
}

/// The camera screen: preview, scoreboard, record button, timer, battery and free space.
final class GameCameraView: UIView {
    var onRecordTapped: (() -> Void)?
    var onCloseTapped: (() -> Void)?
    var recordedTime: (() -> Double?)?
    /// Called when the phone is turned, so the live stream turns with it.
    var onOrientationChange: ((AVCaptureVideoOrientation) -> Void)?
    private var heldOrientation: AVCaptureVideoOrientation? // from the motion sensor
    private var lastReported: AVCaptureVideoOrientation?
    private var rotationObserver: NSObjectProtocol?

    private let previewLayer: AVCaptureVideoPreviewLayer?
    private let previewView: UIView?
    private let isLive: Bool
    private let liveLabel = PaddedLabel()
    private let board = UIStackView()
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let statusLabel = UILabel()
    private let timerLabel = UILabel()
    private let infoLabel = UILabel()
    private let playLabel = PaddedLabel()
    private var playHide: DispatchWorkItem?
    private let recordButton = UIButton(type: .custom)
    private let recordInner = UIView()
    private var ticker: Timer?
    private var tickCount = 0

    init(frame: CGRect, session: AVCaptureSession?, preview: UIView?) {
        previewLayer = session.map { AVCaptureVideoPreviewLayer(session: $0) }
        previewView = preview
        isLive = preview != nil
        super.init(frame: frame)
        backgroundColor = .black
        if let previewLayer = previewLayer {
            previewLayer.videoGravity = .resizeAspect
            layer.addSublayer(previewLayer)
        }
        if let preview = preview {
            preview.frame = bounds
            preview.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(preview)
        }
        UIDevice.current.isBatteryMonitoringEnabled = true
        UIDevice.current.beginGeneratingDeviceOrientationNotifications()
        heldOrientation = GameCameraView.videoOrientation(for: UIDevice.current.orientation)
        rotationObserver = NotificationCenter.default.addObserver(
            forName: UIDevice.orientationDidChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self = self,
                      let held = GameCameraView.videoOrientation(for: UIDevice.current.orientation) else { return }
                self.heldOrientation = held
                self.reportOrientation()
            }
        }
        buildUI()
        ticker = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.tick() }
        tick()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func stop() {
        ticker?.invalidate()
        ticker = nil
        if let rotationObserver {
            NotificationCenter.default.removeObserver(rotationObserver)
            UIDevice.current.endGeneratingDeviceOrientationNotifications()
        }
        rotationObserver = nil
    }

    /// The device's sensor reading as a video orientation. Flat or unknown gives nil.
    /// (The device's "landscape left" is the video's "landscape right".)
    static func videoOrientation(for device: UIDeviceOrientation) -> AVCaptureVideoOrientation? {
        switch device {
        case .portrait: return .portrait
        case .portraitUpsideDown: return .portraitUpsideDown
        case .landscapeLeft: return .landscapeRight
        case .landscapeRight: return .landscapeLeft
        default: return nil
        }
    }

    /// Matches the video to how the phone is held, even if the screen didn't rotate.
    var videoOrientation: AVCaptureVideoOrientation {
        heldOrientation ?? screenOrientation
    }

    private func reportOrientation() {
        let now = videoOrientation
        guard now != lastReported else { return }
        lastReported = now
        onOrientationChange?(now)
    }

    /// How the screen is turned, for the on-screen preview.
    private var screenOrientation: AVCaptureVideoOrientation {
        switch window?.windowScene?.interfaceOrientation ?? .landscapeRight {
        case .portrait: return .portrait
        case .portraitUpsideDown: return .portraitUpsideDown
        case .landscapeLeft: return .landscapeLeft
        default: return .landscapeRight
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
        previewView?.frame = bounds
        if let connection = previewLayer?.connection, connection.isVideoOrientationSupported {
            connection.videoOrientation = screenOrientation
        }
        reportOrientation()
    }

    private func style(_ label: UILabel, size: CGFloat, weight: UIFont.Weight) {
        label.font = .systemFont(ofSize: size, weight: weight)
        label.textColor = .white
        label.textAlignment = .center
        label.shadowColor = UIColor.black.withAlphaComponent(0.8)
        label.shadowOffset = CGSize(width: 0, height: 1)
        label.isHidden = true
    }

    private func buildUI() {
        style(titleLabel, size: 20, weight: .bold)
        style(subtitleLabel, size: 13, weight: .regular)
        style(statusLabel, size: 12, weight: .semibold)
        board.axis = .vertical
        board.alignment = .center
        board.spacing = 2
        board.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        board.layer.cornerRadius = 12
        board.isLayoutMarginsRelativeArrangement = true
        board.layoutMargins = UIEdgeInsets(top: 6, left: 14, bottom: 6, right: 14)
        board.isHidden = true
        [titleLabel, subtitleLabel, statusLabel].forEach { board.addArrangedSubview($0) }

        playLabel.font = .systemFont(ofSize: 17, weight: .bold)
        playLabel.textColor = UIColor(red: 0.07, green: 0.09, blue: 0.15, alpha: 1)
        playLabel.backgroundColor = UIColor(red: 0.98, green: 0.8, blue: 0.08, alpha: 1)
        playLabel.textAlignment = .center
        playLabel.layer.cornerRadius = 10
        playLabel.clipsToBounds = true
        playLabel.alpha = 0

        let close = UIButton(type: .system)
        close.setTitle("✕", for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 26, weight: .bold)
        close.tintColor = .white
        close.accessibilityLabel = "Close camera"
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)

        timerLabel.font = .monospacedDigitSystemFont(ofSize: 16, weight: .bold)
        timerLabel.textColor = UIColor(red: 0.97, green: 0.44, blue: 0.44, alpha: 1)

        infoLabel.font = .systemFont(ofSize: 12, weight: .medium)
        infoLabel.textColor = .white
        infoLabel.shadowColor = UIColor.black.withAlphaComponent(0.8)
        infoLabel.shadowOffset = CGSize(width: 0, height: 1)

        recordButton.layer.cornerRadius = 38
        recordButton.layer.borderWidth = 5
        recordButton.layer.borderColor = UIColor.white.cgColor
        recordButton.accessibilityLabel = "Start recording"
        recordButton.addTarget(self, action: #selector(recordTapped), for: .touchUpInside)
        recordInner.backgroundColor = UIColor(red: 0.94, green: 0.27, blue: 0.27, alpha: 1)
        recordInner.isUserInteractionEnabled = false
        recordInner.layer.cornerRadius = 29
        recordButton.addSubview(recordInner)

        liveLabel.font = .systemFont(ofSize: 14, weight: .bold)
        liveLabel.textColor = .white
        liveLabel.backgroundColor = UIColor.black.withAlphaComponent(0.6)
        liveLabel.layer.cornerRadius = 8
        liveLabel.clipsToBounds = true
        liveLabel.insets = UIEdgeInsets(top: 4, left: 10, bottom: 4, right: 10)
        liveLabel.isHidden = true
        // Live: the scoreboard is drawn into the video itself, so the on-screen copy stays hidden.
        if isLive {
            board.alpha = 0
            playLabel.isHidden = true
        }

        for view in [board, playLabel, close, timerLabel, infoLabel, recordButton, liveLabel] as [UIView] {
            view.translatesAutoresizingMaskIntoConstraints = false
            addSubview(view)
        }
        recordInner.translatesAutoresizingMaskIntoConstraints = false
        let guide = safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            board.topAnchor.constraint(equalTo: guide.topAnchor, constant: 8),
            board.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            board.widthAnchor.constraint(lessThanOrEqualTo: guide.widthAnchor, constant: -120),
            playLabel.topAnchor.constraint(equalTo: board.bottomAnchor, constant: 6),
            playLabel.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            playLabel.widthAnchor.constraint(lessThanOrEqualTo: guide.widthAnchor, constant: -120),
            close.topAnchor.constraint(equalTo: guide.topAnchor, constant: 4),
            close.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 12),
            close.widthAnchor.constraint(equalToConstant: 44),
            close.heightAnchor.constraint(equalToConstant: 44),
            recordButton.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -16),
            recordButton.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            recordButton.widthAnchor.constraint(equalToConstant: 76),
            recordButton.heightAnchor.constraint(equalToConstant: 76),
            recordInner.centerXAnchor.constraint(equalTo: recordButton.centerXAnchor),
            recordInner.centerYAnchor.constraint(equalTo: recordButton.centerYAnchor),
            recordInner.widthAnchor.constraint(equalToConstant: 58),
            recordInner.heightAnchor.constraint(equalToConstant: 58),
            timerLabel.bottomAnchor.constraint(equalTo: recordButton.topAnchor, constant: -10),
            timerLabel.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            liveLabel.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            liveLabel.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -12),
            infoLabel.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 14),
            infoLabel.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -14),
        ])
    }

    @objc private func closeTapped() { onCloseTapped?() }
    @objc private func recordTapped() { onRecordTapped?() }

    func setRecording(_ recording: Bool) {
        UIView.animate(withDuration: 0.2) {
            self.recordInner.transform = recording ? CGAffineTransform(scaleX: 0.55, y: 0.55) : .identity
            self.recordInner.layer.cornerRadius = recording ? 12 : 29
        }
        recordButton.accessibilityLabel = recording ? "Stop recording" : "Start recording"
        if !recording { timerLabel.text = "" }
    }

    func setScoreboard(title: String?, subtitle: String?, status: String?, connected: Bool?) {
        if let title = title { titleLabel.text = title }
        if let subtitle = subtitle { subtitleLabel.text = subtitle }
        if let status = status { statusLabel.text = status }
        if let connected = connected {
            statusLabel.textColor = connected
                ? UIColor(red: 0.29, green: 0.87, blue: 0.5, alpha: 1)
                : UIColor(red: 0.99, green: 0.73, blue: 0.45, alpha: 1)
        }
        for label in [titleLabel, subtitleLabel, statusLabel] {
            label.isHidden = (label.text ?? "").isEmpty
        }
        board.isHidden = titleLabel.isHidden && subtitleLabel.isHidden && statusLabel.isHidden
    }

    func setLiveStatus(_ text: String, color: UIColor) {
        liveLabel.text = text
        liveLabel.textColor = color
        liveLabel.isHidden = text.isEmpty
    }

    /// Shows the play under the scoreboard for 4 seconds.
    func showPlay(_ text: String) {
        playHide?.cancel()
        playLabel.text = text
        UIView.animate(withDuration: 0.2) { self.playLabel.alpha = 1 }
        let hide = DispatchWorkItem { [weak self] in
            UIView.animate(withDuration: 0.3) { self?.playLabel.alpha = 0 }
        }
        playHide = hide
        DispatchQueue.main.asyncAfter(deadline: .now() + 4, execute: hide)
    }

    private func tick() {
        if let seconds = recordedTime?(), seconds.isFinite {
            let s = Int(seconds)
            timerLabel.text = String(format: "● %d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60)
        }
        if tickCount % 20 == 0 { infoLabel.text = deviceInfo() }
        tickCount += 1
    }

    private func deviceInfo() -> String {
        var parts: [String] = []
        let level = UIDevice.current.batteryLevel
        if level >= 0 { parts.append("🔋 \(Int(level * 100))%") }
        if let values = try? URL(fileURLWithPath: NSHomeDirectory())
            .resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
           let free = values.volumeAvailableCapacityForImportantUsage {
            parts.append(String(format: "💾 %.1f GB free", Double(free) / 1e9))
        }
        return parts.joined(separator: "   ")
    }
}
