import Foundation
import Capacitor
import AVFoundation
import Photos
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// Joins video clips into one video, on the phone.
///
/// Clips that share size, orientation and codec (the usual case: one phone, one game) are
/// joined without re-encoding, which takes seconds and keeps full quality. Mixed clips are
/// re-encoded to the first clip's size, letterboxed.
///
/// Note: the Capacitor CLI registers this plugin by the FIRST objc-name attribute in this
/// file (the one on the class below), so never write that attribute with a name in any
/// comment above it, and don't add other named objc attributes to this file.
@objc(ClipStitcherPlugin)
public class ClipStitcherPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "ClipStitcherPlugin"
    public let jsName = "ClipStitcher"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickVideos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stitch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToGallery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private var pickCall: CAPPluginCall?
    private var exportSession: AVAssetExportSession?
    private var progressTimer: Timer?

    private func workDir() -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("clip-stitcher", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    // MARK: - Picking

    @objc func pickVideos(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var config = PHPickerConfiguration()
            config.filter = .videos
            config.selectionLimit = 0 // no limit
            config.selection = .ordered
            // Hand over the original file; the default "compatible" mode can transcode HEVC first.
            config.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            self.pickCall = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pickCall else { return }
        pickCall = nil
        if results.isEmpty {
            call.resolve(["clips": [], "failed": 0])
            return
        }

        let dir = workDir()
        let picked = PickedClips(count: results.count)
        let group = DispatchGroup()
        let movie = UTType.movie.identifier

        for (index, result) in results.enumerated() {
            let provider = result.itemProvider
            guard provider.hasItemConformingToTypeIdentifier(movie) else { continue }
            let name = provider.suggestedName ?? "Clip \(index + 1)"
            group.enter()
            provider.loadFileRepresentation(forTypeIdentifier: movie) { url, _ in
                defer { group.leave() }
                // The system deletes `url` when this handler returns, so copy it now.
                guard let url = url else { return }
                let ext = url.pathExtension.isEmpty ? "mov" : url.pathExtension
                let dest = dir.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext)
                do {
                    try FileManager.default.copyItem(at: url, to: dest)
                    picked.set(index, url: dest, name: name)
                } catch {}
            }
        }

        group.notify(queue: .global(qos: .userInitiated)) {
            let ok = picked.all()
            let clips = ok.map { self.describe($0.url, name: $0.name) }
            call.resolve(["clips": clips, "failed": results.count - ok.count])
        }
    }

    private func describe(_ url: URL, name: String) -> [String: Any] {
        let asset = AVURLAsset(url: url)
        var clip: [String: Any] = ["id": url.path, "name": name]
        let seconds = CMTimeGetSeconds(asset.duration)
        clip["durationMs"] = seconds.isFinite ? Int(seconds * 1000) : 0
        if let date = asset.creationDate?.dateValue {
            clip["createdAt"] = Int(date.timeIntervalSince1970 * 1000)
        }
        if let track = asset.tracks(withMediaType: .video).first {
            let size = orientedSize(track)
            clip["width"] = Int(size.width)
            clip["height"] = Int(size.height)
        }
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 240, height: 240)
        let at = CMTime(seconds: min(0.5, max(seconds.isFinite ? seconds / 2 : 0, 0)), preferredTimescale: 600)
        if let image = try? generator.copyCGImage(at: at, actualTime: nil),
           let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.7) {
            clip["thumbnail"] = "data:image/jpeg;base64," + data.base64EncodedString()
        }
        return clip
    }

    // MARK: - Stitching

    @objc func stitch(_ call: CAPPluginCall) {
        guard let ids = call.getArray("ids", String.self), !ids.isEmpty else {
            call.reject("Choose at least one clip.")
            return
        }
        if exportSession != nil {
            call.reject("Already making a video.")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            self.runStitch(call, ids: ids)
        }
    }

    private struct Segment {
        let track: AVAssetTrack
        let start: CMTime
        let duration: CMTime
    }

    private func runStitch(_ call: CAPPluginCall, ids: [String]) {
        let assets = ids.map { AVURLAsset(url: URL(fileURLWithPath: $0)) }
        if assets.contains(where: { $0.tracks(withMediaType: .video).isEmpty }) {
            call.reject("One of the clips couldn't be read. Remove it and try again.")
            return
        }

        let composition = AVMutableComposition()
        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            call.reject("Couldn't start the video.")
            return
        }
        let hasAudio = assets.contains { !$0.tracks(withMediaType: .audio).isEmpty }
        let audioTrack = hasAudio
            ? composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
            : nil

        var segments: [Segment] = []
        var cursor = CMTime.zero
        do {
            for asset in assets {
                let source = asset.tracks(withMediaType: .video)[0]
                let range = source.timeRange
                try videoTrack.insertTimeRange(range, of: source, at: cursor)
                if let audioTrack = audioTrack, let sourceAudio = asset.tracks(withMediaType: .audio).first {
                    let audioRange = CMTimeRangeGetIntersection(sourceAudio.timeRange, otherRange: range)
                    if audioRange.duration > .zero {
                        try audioTrack.insertTimeRange(audioRange, of: sourceAudio, at: cursor + (audioRange.start - range.start))
                    }
                }
                segments.append(Segment(track: source, start: cursor, duration: range.duration))
                cursor = cursor + range.duration
            }
        } catch {
            call.reject("Couldn't join the clips: \(error.localizedDescription)")
            return
        }

        let first = segments[0].track
        let uniform = segments.allSatisfy {
            $0.track.naturalSize == first.naturalSize
                && $0.track.preferredTransform == first.preferredTransform
                && codec($0.track) == codec(first)
        }

        let reencode = {
            videoTrack.preferredTransform = .identity
            let videoComposition = self.makeVideoComposition(videoTrack: videoTrack, segments: segments,
                                                             total: composition.duration)
            self.export(composition, preset: AVAssetExportPresetHighestQuality, videoComposition: videoComposition,
                        call: call, reencoded: true, onFailure: nil)
        }

        if uniform {
            videoTrack.preferredTransform = first.preferredTransform
            // If the fast path fails for any reason, fall back to re-encoding.
            export(composition, preset: AVAssetExportPresetPassthrough, videoComposition: nil,
                   call: call, reencoded: false, onFailure: reencode)
        } else {
            reencode()
        }
    }

    private func codec(_ track: AVAssetTrack) -> FourCharCode {
        guard let first = track.formatDescriptions.first else { return 0 }
        let description = first as! CMFormatDescription // swiftlint:disable:this force_cast
        return CMFormatDescriptionGetMediaSubType(description)
    }

    private func orientedSize(_ track: AVAssetTrack) -> CGSize {
        let rect = CGRect(origin: .zero, size: track.naturalSize).applying(track.preferredTransform)
        return CGSize(width: abs(rect.width), height: abs(rect.height))
    }

    private func makeVideoComposition(videoTrack: AVMutableCompositionTrack, segments: [Segment],
                                      total: CMTime) -> AVMutableVideoComposition {
        let size = commonSize(segments)
        // Encoders want even dimensions.
        let render = CGSize(width: floor(size.width / 2) * 2, height: floor(size.height / 2) * 2)
        // Highest clip frame rate (capped at 60), not the first clip's, so order doesn't matter.
        let fps = segments.map { $0.track.nominalFrameRate }.max() ?? 30
        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = render
        videoComposition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps > 0 ? min(fps.rounded(), 60) : 30))
        // AVFoundation rejects the export (AVErrorInvalidVideoComposition) unless the
        // instructions tile the WHOLE timeline exactly. Clips from different sources use
        // different timescales, so summed durations can be a few ticks off the composition's
        // real length; anchor the first at zero and stretch the last to the true end.
        let last = segments.count - 1
        videoComposition.instructions = segments.enumerated().map { index, segment in
            let instruction = AVMutableVideoCompositionInstruction()
            let start = index == 0 ? CMTime.zero : segment.start
            let end = index == last ? max(total, segment.start + segment.duration) : segments[index + 1].start
            instruction.timeRange = CMTimeRange(start: start, end: end)
            let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
            layer.setTransform(fitTransform(segment.track, into: render), at: segment.start)
            instruction.layerInstructions = [layer]
            return instruction
        }
        return videoComposition
    }

    /// Rotates the clip upright, scales it to fit `render`, and centres it.
    /// The upright size most clips share (ties: the earliest), so moving one odd clip (a
    /// screen recording, a texted video) to the front doesn't reshape the whole game.
    private func commonSize(_ segments: [Segment]) -> CGSize {
        var counts: [String: (size: CGSize, count: Int, first: Int)] = [:]
        for (index, segment) in segments.enumerated() {
            let size = orientedSize(segment.track)
            let key = "\(Int(size.width))x\(Int(size.height))"
            let entry = counts[key] ?? (size, 0, index)
            counts[key] = (entry.size, entry.count + 1, entry.first)
        }
        let best = counts.values.max { a, b in a.count != b.count ? a.count < b.count : a.first > b.first }
        return best?.size ?? orientedSize(segments[0].track)
    }

    private func fitTransform(_ track: AVAssetTrack, into render: CGSize) -> CGAffineTransform {
        let preferred = track.preferredTransform
        let rect = CGRect(origin: .zero, size: track.naturalSize).applying(preferred)
        let scale = min(render.width / rect.width, render.height / rect.height)
        return preferred
            .concatenating(CGAffineTransform(translationX: -rect.origin.x, y: -rect.origin.y))
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(CGAffineTransform(translationX: (render.width - rect.width * scale) / 2,
                                             y: (render.height - rect.height * scale) / 2))
    }

    private func export(_ asset: AVAsset, preset: String, videoComposition: AVVideoComposition?,
                        call: CAPPluginCall, reencoded: Bool, onFailure: (() -> Void)?) {
        guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
            if let onFailure = onFailure { onFailure() } else { call.reject("Couldn't make the video on this phone.") }
            return
        }
        let fileType: AVFileType = session.supportedFileTypes.contains(.mp4) ? .mp4 : .mov
        let name = "loggerhead-\(Int(Date().timeIntervalSince1970 * 1000)).\(fileType == .mp4 ? "mp4" : "mov")"
        let output = workDir().appendingPathComponent(name)
        try? FileManager.default.removeItem(at: output)
        session.outputURL = output
        session.outputFileType = fileType
        session.videoComposition = videoComposition
        session.shouldOptimizeForNetworkUse = true

        exportSession = session
        startProgress(session)
        session.exportAsynchronously { [weak self] in
            guard let self = self else { return }
            self.stopProgress()
            self.exportSession = nil
            switch session.status {
            case .completed:
                let seconds = CMTimeGetSeconds(asset.duration)
                call.resolve([
                    "path": output.path,
                    "uri": output.absoluteString,
                    "durationMs": seconds.isFinite ? Int(seconds * 1000) : 0,
                    "reencoded": reencoded
                ])
            case .cancelled:
                try? FileManager.default.removeItem(at: output)
                call.reject("Cancelled", "CANCELLED")
            default:
                try? FileManager.default.removeItem(at: output)
                if let onFailure = onFailure {
                    onFailure()
                } else {
                    call.reject("Couldn't make the video: \(self.describeError(session.error))")
                }
            }
        }
    }

    /// Readable error with codes, e.g. "Operation Stopped (AVFoundationErrorDomain -11841;
    /// underlying -12780)", so a failure report from a parent says what went wrong.
    private func describeError(_ error: Error?) -> String {
        guard let error = error as NSError? else { return "unknown error" }
        var text = "\(error.localizedDescription) (\(error.domain) \(error.code)"
        if let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError {
            text += "; underlying \(underlying.domain) \(underlying.code)"
        }
        return text + ")"
    }

    private func startProgress(_ session: AVAssetExportSession) {
        DispatchQueue.main.async {
            self.progressTimer?.invalidate()
            self.progressTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] _ in
                self?.notifyListeners("progress", data: ["progress": Double(session.progress)])
            }
        }
    }

    private func stopProgress() {
        DispatchQueue.main.async {
            self.progressTimer?.invalidate()
            self.progressTimer = nil
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        exportSession?.cancelExport()
        call.resolve()
    }

    // MARK: - Saving and cleanup

    @objc func saveToGallery(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("Missing video.")
            return
        }
        let url = URL(fileURLWithPath: path)
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("Loggerhead can't save to Photos. Allow it in Settings > Loggerhead > Photos.", "DENIED")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                _ = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }, completionHandler: { success, error in
                if success {
                    call.resolve()
                } else {
                    call.reject("Couldn't save the video: \(error?.localizedDescription ?? "unknown error")")
                }
            })
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("clip-stitcher", isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
        call.resolve()
    }
}

/// Picked clips, filled in from the item providers' background callbacks.
/// A class (not a captured `var`) because those callbacks are @Sendable.
private final class PickedClips: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [(url: URL, name: String)?]

    init(count: Int) {
        items = Array(repeating: nil, count: count)
    }

    func set(_ index: Int, url: URL, name: String) {
        lock.lock()
        items[index] = (url, name)
        lock.unlock()
    }

    func all() -> [(url: URL, name: String)] {
        lock.lock()
        defer { lock.unlock() }
        return items.compactMap { $0 }
    }
}
