import Foundation
import AVFoundation
import UIKit
import HaishinKit
import RTMPHaishinKit

/// Live streaming to YouTube (or any RTMP or RTMPS with a stream key) while keeping a
/// 1080p copy on the phone. The scoreboard and the Loggerhead tag are drawn into both.
/// If the connection drops it keeps reconnecting; the local copy keeps recording either way.
@MainActor
final class LiveEngine {
    /// state: connecting | live | reconnecting | failed | ended
    var onLive: ((String, String) -> Void)?
    var onRecordingStarted: ((Int) -> Void)?
    var onRecordingStopped: ((URL?, Int, String?) -> Void)?

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

    init(serverURL: String, streamKey: String) {
        self.serverURL = serverURL
        self.streamKey = streamKey
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

        // Stream 720p (works on most bleacher connections); the local copy is the full 1080p.
        var video = await stream.videoSettings
        video.videoSize = CGSize(width: 1280, height: 720)
        video.bitRate = 2_500_000
        try await stream.setVideoSettings(video)

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
        do {
            try await recorder.startRecording(url, settings: StreamRecorder.defaultSettings)
            isRecording = true
            let now = Date()
            startedAt = now
            onRecordingStarted?(Int(now.timeIntervalSince1970 * 1000))
        } catch {
            onRecordingStopped?(nil, 0, error.localizedDescription)
        }
        wantLive = true
        everLive = false
        await connect(attempt: 0)
    }

    private func connect(attempt: Int) async {
        guard wantLive else { return }
        onLive?(attempt == 0 ? "connecting" : "reconnecting", "")
        do {
            _ = try await connection.connect(serverURL)
            _ = try await stream.publish(streamKey)
            everLive = true
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
            onRecordingStopped?(url, duration, nil)
        } catch {
            onRecordingStopped?(nil, 0, error.localizedDescription)
        }
        startedAt = nil
    }

    private func positionMsAt(_ date: Date) -> Int {
        guard let startedAt else { return 0 }
        return Int(date.timeIntervalSince(startedAt) * 1000)
    }

    /// Ends everything and lets the camera go.
    func shutdown() async {
        if isRecording || wantLive { await stop() }
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
