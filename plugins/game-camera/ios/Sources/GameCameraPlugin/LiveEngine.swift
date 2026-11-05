import Foundation
import AVFoundation
import UIKit
import HaishinKit
import RTMPHaishinKit

/// Live streaming to YouTube (or any RTMP or RTMPS with a stream key) while keeping a
/// 1080p copy on the phone. The scoreboard and the Loggerhead tag are drawn into both.
///
/// Built for gym networks: the bitrate follows what the connection can carry (LiveBitRate),
/// it keeps reconnecting if the connection drops, and it backs off when the phone runs hot.
/// The local copy is written in 10-second pieces, so it stays playable if the app is killed
/// mid-match; a ".inprogress" marker next to it lets the next launch find it.
@MainActor
final class LiveEngine {
    /// state: connecting | live | reconnecting | failed | ended
    var onLive: ((String, String) -> Void)?
    var onRecordingStarted: ((Int) -> Void)?
    var onRecordingStopped: ((URL?, Int, String?) -> Void)?
    /// Every second while live: bits per second actually sent, good | fair | poor, phone hot.
    var onHealth: ((Int, String, Bool) -> Void)?

    /// Stream size and bitrate, picked by the connection check before going live.
    struct Quality {
        let size: CGSize
        let bitRate: Int

        static func named(_ name: String) -> Quality {
            switch name {
            case "low": return Quality(size: CGSize(width: 854, height: 480), bitRate: 800_000)
            case "medium": return Quality(size: CGSize(width: 1280, height: 720), bitRate: 1_500_000)
            default: return Quality(size: CGSize(width: 1280, height: 720), bitRate: 2_500_000)
            }
        }
    }

    let previewView: MTHKView
    private let mixer = MediaMixer()
    private let connection = RTMPConnection()
    private let stream: RTMPStream
    private let recorder = StreamRecorder()
    private let serverURL: String
    private let streamKey: String
    private var scoreObject: ImageScreenObject?
    private var brandObject: ImageScreenObject?
    private var wantLive = false
    private var everLive = false
    private var statusTask: Task<Void, Never>?
    private(set) var isRecording = false
    private var startedAt: Date?
    private var recordingURL: URL?
    private let quality: Quality
    private var bitRate: LiveBitRate?
    private var connected = false
    private var hot = false
    private var heatObserver: NSObjectProtocol?

    init(serverURL: String, streamKey: String, quality: String) {
        self.serverURL = serverURL
        self.streamKey = streamKey
        self.quality = Quality.named(quality)
        stream = RTMPStream(connection: connection)
        previewView = MTHKView(frame: .zero)
        previewView.videoGravity = .resizeAspect
    }

    /// Where the recording is now (for rally markers).
    var positionMs: Int {
        guard isRecording, let startedAt else { return 0 }
        return Int(Date().timeIntervalSince(startedAt) * 1000)
    }

    /// Camera, microphone, overlays and encoders. Shows the preview; doesn't go live yet.
    func prepare(orientation: AVCaptureVideoOrientation) async throws {
        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth])
        try? audioSession.setActive(true)

        var mixerSettings = await mixer.videoMixerSettings
        mixerSettings.mode = .offscreen // needed to draw the scoreboard into the video
        await mixer.setVideoMixerSettings(mixerSettings)
        await mixer.setSessionPreset(.hd1920x1080)
        await mixer.setVideoOrientation(orientation)
        try await mixer.attachVideo(AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back))
        if AVCaptureDevice.authorizationStatus(for: .audio) == .authorized {
            try? await mixer.attachAudio(AVCaptureDevice.default(for: .audio))
        }

        let objects = await LiveEngine.makeOverlays(on: mixer)
        scoreObject = objects.0
        brandObject = objects.1
        setBrand(ScoreArt.brand())

        // Stream at the size the connection check picked; the local copy is the full 1080p.
        var video = await stream.videoSettings
        video.videoSize = quality.size
        video.bitRate = quality.bitRate
        try await stream.setVideoSettings(video)
        let strategy = LiveBitRate(maximum: quality.bitRate) { [weak self] sent, target, queued in
            Task { @MainActor in self?.report(sent: sent, target: target, queued: queued) }
        }
        bitRate = strategy
        await stream.setBitRateStrategy(strategy)
        // Write the local copy in 10-second pieces so a crash doesn't lose the match.
        await recorder.setMovieFragmentInterval(10)
        watchHeat()

        await mixer.addOutput(stream)
        await mixer.addOutput(recorder)
        await mixer.addOutput(previewView)
        await mixer.startRunning()
    }

    @ScreenActor
    private static func makeOverlays(on mixer: MediaMixer) async -> (ImageScreenObject, ImageScreenObject) {
        await mixer.screen.size = CGSize(width: 1920, height: 1080)
        await mixer.screen.backgroundColor = UIColor.black.cgColor

        let score = ImageScreenObject()
        score.horizontalAlignment = .center
        score.verticalAlignment = .top
        score.layoutMargin = .init(top: 24, left: 0, bottom: 0, right: 0)
        try? await mixer.screen.addChild(score)

        let brand = ImageScreenObject()
        brand.horizontalAlignment = .right
        brand.verticalAlignment = .bottom
        brand.layoutMargin = .init(top: 0, left: 0, bottom: 32, right: 40)
        try? await mixer.screen.addChild(brand)
        return (score, brand)
    }

    func setScore(_ image: CGImage?) {
        guard let object = scoreObject else { return }
        Task { @ScreenActor in object.cgImage = image }
    }

    private func setBrand(_ image: CGImage?) {
        guard let object = brandObject else { return }
        Task { @ScreenActor in object.cgImage = image }
    }

    // MARK: - Health and heat

    private func report(sent: Int, target: Int, queued: Int) {
        guard connected else { return }
        let maxRate = Double(quality.bitRate)
        // Bytes waiting to go out: about 3 s of video behind means the connection can't keep up.
        let level: String
        if queued > quality.bitRate * 3 / 8 || Double(target) < maxRate * 0.35 {
            level = "poor"
        } else if queued > quality.bitRate / 10 || Double(target) < maxRate * 0.7 {
            level = "fair"
        } else {
            level = "good"
        }
        onHealth?(sent, level, hot)
    }

    private func watchHeat() {
        heatObserver = NotificationCenter.default.addObserver(
            forName: ProcessInfo.thermalStateDidChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.applyHeat() }
        }
        applyHeat()
    }

    private func applyHeat() {
        let factor: Double
        switch ProcessInfo.processInfo.thermalState {
        case .critical: factor = 0.4
        case .serious: factor = 0.6
        default: factor = 1
        }
        hot = factor < 1
        guard let strategy = bitRate else { return }
        let stream = self.stream
        Task {
            await strategy.setCeilingFactor(factor)
            await strategy.enforceCeiling(on: stream)
        }
    }

    // MARK: - Go live / stop

    func toggle(orientation: AVCaptureVideoOrientation) async {
        if isRecording {
            await stop()
        } else {
            await goLive(orientation: orientation)
        }
    }

    private func goLive(orientation: AVCaptureVideoOrientation) async {
        await mixer.setVideoOrientation(orientation)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("game-camera", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("loggerhead-game-\(Int(Date().timeIntervalSince1970 * 1000)).mp4")
        RecordingMarker.set(url)
        recordingURL = url
        do {
            try await recorder.startRecording(url, settings: StreamRecorder.defaultSettings)
            isRecording = true
            let now = Date()
            startedAt = now
            onRecordingStarted?(Int(now.timeIntervalSince1970 * 1000))
        } catch {
            RecordingMarker.clear(url)
            recordingURL = nil
            onRecordingStopped?(nil, 0, error.localizedDescription)
        }
        wantLive = true
        everLive = false
        await connect(attempt: 0)
    }

    private func connect(attempt: Int) async {
        guard wantLive else { return }
        connected = false
        onLive?(attempt == 0 ? "connecting" : "reconnecting", "")
        do {
            _ = try await connection.connect(serverURL)
            _ = try await stream.publish(streamKey)
            everLive = true
            connected = true
            onLive?("live", "")
            watchConnection()
        } catch {
            // A wrong stream key never connects: say so instead of retrying forever.
            if !everLive && attempt >= 2 {
                wantLive = false
                onLive?("failed", "Couldn't go live. Check the stream key and that live streaming is turned on for your account.")
                return
            }
            guard attempt < 200, wantLive else {
                wantLive = false
                onLive?("failed", error.localizedDescription)
                return
            }
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            await connect(attempt: attempt + 1)
        }
    }

    private func watchConnection() {
        statusTask?.cancel()
        statusTask = Task { [weak self] in
            guard let self else { return }
            for await status in await self.connection.status {
                if status.code == "NetConnection.Connect.Closed" || status.code == "NetConnection.Connect.Failed" {
                    if self.wantLive {
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        await self.connect(attempt: 1)
                    }
                    return
                }
            }
        }
    }

    func stop() async {
        wantLive = false
        connected = false
        statusTask?.cancel()
        statusTask = nil
        _ = try? await stream.close()
        try? await connection.close()
        onLive?("ended", "")
        guard isRecording else { return }
        isRecording = false
        let duration = positionMsAt(Date())
        do {
            let url = try await recorder.stopRecording()
            RecordingMarker.clear(url)
            onRecordingStopped?(url, duration, nil)
        } catch {
            // Pieces written so far stay playable: hand over what's there.
            let partial = recordingURL.flatMap { FileManager.default.fileExists(atPath: $0.path) ? $0 : nil }
            if let partial { RecordingMarker.clear(partial) }
            onRecordingStopped?(partial, partial == nil ? 0 : duration, error.localizedDescription)
        }
        recordingURL = nil
        startedAt = nil
    }

    private func positionMsAt(_ date: Date) -> Int {
        guard let startedAt else { return 0 }
        return Int(date.timeIntervalSince(startedAt) * 1000)
    }

    /// Ends everything and lets the camera go.
    func shutdown() async {
        if isRecording || wantLive { await stop() }
        if let heatObserver { NotificationCenter.default.removeObserver(heatObserver) }
        heatObserver = nil
        await mixer.stopRunning()
        try? await mixer.attachAudio(nil)
        try? await mixer.attachVideo(nil)
    }
}

/// The pictures drawn into a live video: the scoreboard (with the play banner under it for a
/// few seconds) and the Loggerhead tag. Same look as Android.
@MainActor
enum ScoreArt {
    static func score(title: String, subtitle: String, play: String) -> CGImage? {
        let size = CGSize(width: 960, height: 240)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            let center = NSMutableParagraphStyle()
            center.alignment = .center
            center.lineBreakMode = .byTruncatingTail
            if !title.isEmpty {
                let titleAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 52, weight: .bold),
                    .foregroundColor: UIColor.white,
                    .paragraphStyle: center
                ]
                let subAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 29, weight: .regular),
                    .foregroundColor: UIColor(white: 0.9, alpha: 1),
                    .paragraphStyle: center
                ]
                let titleWidth = min(size.width - 60, (title as NSString).size(withAttributes: titleAttrs).width)
                let subWidth = subtitle.isEmpty ? 0 : min(size.width - 60, (subtitle as NSString).size(withAttributes: subAttrs).width)
                let boxWidth = min(size.width, max(titleWidth, subWidth) + 52)
                let boxHeight: CGFloat = subtitle.isEmpty ? 84 : 126
                UIColor(white: 0, alpha: 0.67).setFill()
                UIBezierPath(roundedRect: CGRect(x: (size.width - boxWidth) / 2, y: 0, width: boxWidth, height: boxHeight), cornerRadius: 20).fill()
                (title as NSString).draw(in: CGRect(x: 24, y: 10, width: size.width - 48, height: 64), withAttributes: titleAttrs)
                if !subtitle.isEmpty {
                    (subtitle as NSString).draw(in: CGRect(x: 24, y: 76, width: size.width - 48, height: 40), withAttributes: subAttrs)
                }
            }
            if !play.isEmpty {
                let playAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 38, weight: .bold),
                    .foregroundColor: UIColor(red: 0.07, green: 0.09, blue: 0.15, alpha: 1),
                    .paragraphStyle: center
                ]
                let width = min(size.width, (play as NSString).size(withAttributes: playAttrs).width + 44)
                UIColor(red: 0.98, green: 0.8, blue: 0.08, alpha: 1).setFill()
                UIBezierPath(roundedRect: CGRect(x: (size.width - width) / 2, y: 141, width: width, height: 64), cornerRadius: 16).fill()
                (play as NSString).draw(in: CGRect(x: 22, y: 149, width: size.width - 44, height: 50), withAttributes: playAttrs)
            }
        }
        return image.cgImage
    }

    /// The Loggerhead wordmark on a light tag (the app's web assets carry the image).
    static func brand() -> CGImage? {
        let size = CGSize(width: 384, height: 72)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let mark = Bundle.main.url(forResource: "loggerhead-wordmark", withExtension: "png", subdirectory: "public")
            .flatMap { UIImage(contentsOfFile: $0.path) }
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            UIColor(white: 1, alpha: 0.88).setFill()
            UIBezierPath(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: 14).fill()
            if let mark, mark.size.width > 0 {
                let width = size.width - 30
                let height = width * mark.size.height / mark.size.width
                mark.draw(in: CGRect(x: 15, y: (size.height - height) / 2, width: width, height: height))
            } else {
                let center = NSMutableParagraphStyle()
                center.alignment = .center
                ("LOGGERHEAD.APP" as NSString).draw(in: CGRect(x: 0, y: 14, width: size.width, height: 48), withAttributes: [
                    .font: UIFont.systemFont(ofSize: 38, weight: .heavy),
                    .foregroundColor: UIColor(red: 0.06, green: 0.15, blue: 0.25, alpha: 1),
                    .paragraphStyle: center
                ])
            }
        }
        return image.cgImage
    }
}


/// Bitrate control for gym networks. Backs off quickly to what the connection is actually
/// carrying, climbs back slowly once it's been steady, and never goes above the ceiling (lowered
/// when the phone runs hot). If nothing is getting out at all, it sends fewer video frames so the
/// audio keeps flowing. Reports what's being sent every second for the health badge.
final actor LiveBitRate: StreamBitRateStrategy {
    nonisolated let mamimumVideoBitRate: Int
    nonisolated let mamimumAudioBitRate: Int = 0
    private let floor: Int
    private let onReport: @Sendable (Int, Int, Int) -> Void // sent bps, target bps, queued bytes
    private var ceilingFactor: Double = 1
    private var steadySeconds = 0
    private var stalledSeconds = 0

    init(maximum: Int, onReport: @escaping @Sendable (Int, Int, Int) -> Void) {
        mamimumVideoBitRate = maximum
        floor = max(250_000, maximum / 8)
        self.onReport = onReport
    }

    private var ceiling: Int { max(floor, Int(Double(mamimumVideoBitRate) * ceilingFactor)) }

    func setCeilingFactor(_ factor: Double) {
        ceilingFactor = factor
    }

    /// Applies a lowered ceiling right away (for heat).
    func enforceCeiling(on stream: some StreamConvertible) async {
        var video = await stream.videoSettings
        guard video.bitRate > ceiling else { return }
        video.bitRate = ceiling
        try? await stream.setVideoSettings(video)
    }

    func adjustBitrate(_ event: NetworkMonitorEvent, stream: some StreamConvertible) async {
        var video = await stream.videoSettings
        switch event {
        case .status(let report):
            onReport(report.currentBytesOutPerSecond * 8, video.bitRate, report.currentQueueBytesOut)
            stalledSeconds = 0
            if video.bitRate > ceiling {
                video.bitRate = ceiling
                try? await stream.setVideoSettings(video)
                return
            }
            steadySeconds += 1
            if steadySeconds >= 8 && (video.bitRate < ceiling || video.frameInterval != 0) {
                video.bitRate = min(ceiling, video.bitRate + mamimumVideoBitRate / 10)
                video.frameInterval = 0
                try? await stream.setVideoSettings(video)
                steadySeconds = 0
            }
        case .publishInsufficientBWOccured(let report):
            onReport(report.currentBytesOutPerSecond * 8, video.bitRate, report.currentQueueBytesOut)
            steadySeconds = 0
            let audio = await stream.audioSettings
            let sent = report.currentBytesOutPerSecond * 8
            if sent > 0 {
                stalledSeconds = 0
                video.bitRate = max(floor, min(ceiling, Int(Double(sent - audio.bitRate) * 0.8)))
            } else {
                stalledSeconds += 1
                video.bitRate = floor
                // Nothing getting out: fewer video frames, so the sound keeps going.
                if stalledSeconds >= 4 {
                    video.frameInterval = VideoCodecSettings.frameInterval05
                } else if stalledSeconds >= 2 {
                    video.frameInterval = VideoCodecSettings.frameInterval10
                }
            }
            try? await stream.setVideoSettings(video)
        case .reset:
            steadySeconds = 0
            stalledSeconds = 0
            video.bitRate = ceiling
            video.frameInterval = 0
            try? await stream.setVideoSettings(video)
        }
    }
}

/// A ".inprogress" file next to a recording while it's being written. If the app is killed
/// mid-match the marker stays, and the next launch offers the video (see recoverRecordings).
enum RecordingMarker {
    static func markerURL(_ video: URL) -> URL {
        URL(fileURLWithPath: video.path + ".inprogress")
    }

    static func set(_ video: URL) {
        FileManager.default.createFile(atPath: markerURL(video).path, contents: nil)
    }

    static func clear(_ video: URL) {
        try? FileManager.default.removeItem(at: markerURL(video))
    }

    /// Recordings left behind, skipping `active` (paths being recorded now).
    static func leftovers(in dir: URL, active: Set<String>) -> [URL] {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        var out: [URL] = []
        for marker in files where marker.lastPathComponent.hasSuffix(".inprogress") {
            let video = URL(fileURLWithPath: String(marker.path.dropLast(".inprogress".count)))
            if active.contains(video.path) { continue }
            try? FileManager.default.removeItem(at: marker)
            let size = (try? FileManager.default.attributesOfItem(atPath: video.path)[.size] as? Int) ?? 0
            if size > 64 * 1024 { out.append(video) } else { try? FileManager.default.removeItem(at: video) }
        }
        return out
    }
}
