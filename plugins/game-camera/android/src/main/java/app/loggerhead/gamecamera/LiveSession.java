package app.loggerhead.gamecamera;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.view.SurfaceView;
import androidx.annotation.NonNull;
import com.pedro.common.ConnectChecker;
import com.pedro.common.StreamingStatsReport;
import com.pedro.encoder.input.gl.render.filters.object.ImageFilterRender;
import com.pedro.encoder.input.sources.audio.MicrophoneSource;
import com.pedro.encoder.input.sources.audio.NoAudioSource;
import com.pedro.encoder.input.sources.video.Camera2Source;
import com.pedro.library.base.recording.RecordController;
import com.pedro.library.rtmp.RtmpStream;
import com.pedro.library.util.Mpeg2TsMuxerRecordController;
import com.pedro.library.util.QueueAwareBitrateAdapter;
import java.io.File;
import java.io.IOException;

/**
 * Live streaming to YouTube (or any RTMP or RTMPS with a stream key) while keeping a
 * full-quality copy on the phone. The scoreboard is drawn into both.
 *
 * Built for gym networks: the stream's bitrate follows what the connection can carry, the
 * send buffer rides out delay spikes, it keeps reconnecting if the connection drops, and it
 * backs off when the phone runs hot. The local copy is recorded as MPEG-TS, which stays
 * playable even if the app is killed mid-match; it becomes an MP4 when recording stops
 * (Recordings.finish), or the next time the app opens (Recordings.recover).
 */
final class LiveSession implements ConnectChecker {

    interface Events {
        /** state: connecting | live | reconnecting | failed | ended */
        void onLive(String state, String message);
        void onRecordingStarted(long startedAt);
        /** The local copy is being turned into an MP4 (can take a minute for a long match). */
        void onRecordingFinishing();
        void onRecordingStopped(File file, long durationMs, String error);
        /** Every second while live: what's actually being sent, and good | fair | poor. */
        void onHealth(long sentBitsPerSecond, String level, boolean hot);
    }

    /** Stream size and bitrate, picked by the connection check before going live. */
    static final class Quality {
        final int width;
        final int height;
        final int bitrate;

        Quality(int width, int height, int bitrate) {
            this.width = width;
            this.height = height;
            this.bitrate = bitrate;
        }

        static Quality named(String name) {
            if ("low".equals(name)) return new Quality(854, 480, 800_000);
            if ("medium".equals(name)) return new Quality(1280, 720, 1_500_000);
            return new Quality(1280, 720, 2_500_000);
        }
    }

    private static final int AUDIO_BITRATE = 128_000;
    private static final int RECORD_BITRATE = 8_000_000;
    private static final int MIN_VIDEO_BITRATE = 300_000;
    // Frames the sender can hold while the network catches up (~8 s at 30 fps with audio).
    private static final int SEND_CACHE = 600;

    private final RtmpStream stream;
    private final ImageFilterRender overlay = new ImageFilterRender();
    private final ImageFilterRender brand = new ImageFilterRender();
    private final Context context;
    private final QueueAwareBitrateAdapter bitrateAdapter;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final String endpoint;
    private final Quality quality;
    private final Events events;

    private volatile boolean wantLive;
    private volatile boolean connected;
    private volatile boolean recording;
    private volatile long videoBitrate;
    private volatile float heatFactor = 1f; // lowers the bitrate ceiling when the phone is hot
    private File file;
    private long startedAt;
    private long startElapsed;
    private String recordError;
    private Object thermalListener;

    LiveSession(Context context, String endpoint, Quality quality, boolean withAudio, Events events) {
        this.endpoint = endpoint;
        this.context = context;
        this.quality = quality;
        this.events = events;
        this.videoBitrate = quality.bitrate;
        stream = new RtmpStream(context, this, new Camera2Source(context),
            withAudio ? new MicrophoneSource() : new NoAudioSource());
        bitrateAdapter = new QueueAwareBitrateAdapter(quality.bitrate + AUDIO_BITRATE, MIN_VIDEO_BITRATE + AUDIO_BITRATE,
            bitrate -> applyBitrate(bitrate - AUDIO_BITRATE));
    }

    private void applyBitrate(long wanted) {
        long ceiling = (long) (quality.bitrate * heatFactor);
        long next = Math.max(MIN_VIDEO_BITRATE, Math.min(wanted, ceiling));
        videoBitrate = next;
        stream.setVideoBitrateOnFly((int) next);
    }

    /** Sets up the camera and encoders. Returns false if this phone can't stream. */
    boolean prepare() {
        stream.setRecordController(new Mpeg2TsMuxerRecordController());
        boolean video;
        try {
            video = stream.prepareVideo(quality.width, quality.height, quality.bitrate, 30, 2, 0, -1, -1, 1920, 1080, RECORD_BITRATE);
        } catch (Exception e) {
            video = false;
        }
        if (!video) {
            // Some phones can't run two encoders: stream and record at the stream size.
            try {
                video = stream.prepareVideo(quality.width, quality.height, quality.bitrate);
            } catch (Exception e) {
                video = false;
            }
        }
        boolean audio;
        try {
            audio = stream.prepareAudio(44100, true, AUDIO_BITRATE);
        } catch (Exception e) {
            audio = false;
        }
        stream.getStreamClient().setReTries(200); // about 10 minutes of retries
        try {
            stream.getStreamClient().resizeCache(SEND_CACHE);
        } catch (Exception ignored) {}
        stream.getGlInterface().addFilter(overlay);
        // Loggerhead tag in the bottom-right corner of the stream and the saved copy.
        stream.getGlInterface().addFilter(brand);
        brand.setImage(ScoreOverlay.renderBrand(context));
        float brandWidth = 20f;
        float brandHeight = brandWidth * ScoreOverlay.BRAND_HEIGHT / ScoreOverlay.BRAND_WIDTH * 16f / 9f;
        brand.setScale(brandWidth, brandHeight);
        brand.setPosition(100f - brandWidth - 2f, 100f - brandHeight - 3f);
        watchHeat();
        return video && audio;
    }

    // ------------------------------------------------------------ heat

    private void watchHeat() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        PowerManager.OnThermalStatusChangedListener listener = this::onHeat;
        pm.addThermalStatusListener(context.getMainExecutor(), listener);
        thermalListener = listener;
        onHeat(pm.getCurrentThermalStatus());
    }

    private void onHeat(int status) {
        float factor;
        if (status >= PowerManager.THERMAL_STATUS_CRITICAL) factor = 0.4f;
        else if (status >= PowerManager.THERMAL_STATUS_SEVERE) factor = 0.6f;
        else factor = 1f;
        if (factor == heatFactor) return;
        heatFactor = factor;
        if (videoBitrate > quality.bitrate * factor) applyBitrate(videoBitrate);
    }

    private void stopWatchingHeat() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || thermalListener == null) return;
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (pm != null) pm.removeThermalStatusListener((PowerManager.OnThermalStatusChangedListener) thermalListener);
        thermalListener = null;
    }

    // ------------------------------------------------------------ preview / overlay

    void startPreview(SurfaceView view) {
        stream.startPreview(view, true);
    }

    /** Shows the scoreboard in the video: centered at the top, half the width. */
    void setOverlay(Bitmap bitmap) {
        overlay.setImage(bitmap);
        float widthPercent = 50f;
        float heightPercent = widthPercent * ScoreOverlay.HEIGHT / ScoreOverlay.WIDTH * 16f / 9f;
        overlay.setScale(widthPercent, heightPercent);
        overlay.setPosition((100f - widthPercent) / 2f, 2f);
    }

    boolean isRecording() {
        return recording;
    }

    /** Where the recording is now (for rally markers). */
    long positionMs() {
        return recording ? SystemClock.elapsedRealtime() - startElapsed : 0;
    }

    // ------------------------------------------------------------ go live / stop

    /** Goes live and starts the local copy (an MPEG-TS file, see Recordings). */
    void start(File output) {
        if (recording || stream.isRecording()) return;
        file = output;
        recordError = null;
        wantLive = true;
        try {
            Recordings.markInProgress(output);
        } catch (IOException ignored) {}
        stream.startRecord(output.getAbsolutePath(), null, new RecordController.Listener() {
            @Override
            public void onStatusChange(@NonNull RecordController.Status status) {
                main.post(() -> onRecordStatus(status));
            }

            @Override
            public void onError(Exception e) {
                recordError = e != null ? e.getMessage() : "unknown error";
            }
        });
        events.onLive("connecting", "");
        stream.startStream(endpoint);
    }

    private void onRecordStatus(RecordController.Status status) {
        if (status == RecordController.Status.STARTED && !recording) {
            recording = true;
            startedAt = System.currentTimeMillis();
            startElapsed = SystemClock.elapsedRealtime();
            events.onRecordingStarted(startedAt);
        } else if (status == RecordController.Status.STOPPED && recording) {
            recording = false;
            long duration = SystemClock.elapsedRealtime() - startElapsed;
            File ts = file;
            String error = recordError;
            events.onRecordingFinishing();
            // Turning the TS into an MP4 reads and writes the whole file: off the main thread.
            new Thread(() -> {
                File mp4 = Recordings.finish(ts);
                main.post(() -> events.onRecordingStopped(mp4, duration, error));
            }, "loggerhead-finish-video").start();
        }
    }

    /** Ends the stream and finishes the local copy. */
    void stop() {
        wantLive = false;
        connected = false;
        if (stream.isStreaming()) stream.stopStream();
        if (stream.isRecording()) stream.stopRecord();
        events.onLive("ended", "");
    }

    void release() {
        wantLive = false;
        stopWatchingHeat();
        try {
            stream.release();
        } catch (Exception ignored) {}
    }

    // ------------------------------------------------------------ connection

    @Override
    public void onConnectionStarted(@NonNull String url) {
        bitrateAdapter.reset();
    }

    @Override
    public void onConnectionSuccess() {
        connected = true;
        main.post(() -> events.onLive("live", ""));
    }

    @Override
    public void onConnectionFailed(@NonNull String reason) {
        connected = false;
        if (wantLive && stream.getStreamClient().reTry(3000, reason)) {
            main.post(() -> events.onLive("reconnecting", reason));
            return;
        }
        main.post(() -> {
            if (stream.isStreaming()) stream.stopStream();
            if (wantLive) events.onLive("failed", reason);
            wantLive = false;
        });
    }

    @Override
    public void onDisconnect() {
        connected = false;
    }

    @Override
    public void onAuthError() {
        main.post(() -> {
            wantLive = false;
            connected = false;
            if (stream.isStreaming()) stream.stopStream();
            events.onLive("failed", "The stream key wasn't accepted. Copy it again from YouTube Studio.");
        });
    }

    @Override
    public void onAuthSuccess() {}

    @Override
    public void onStreamingStats(@NonNull StreamingStatsReport report) {
        bitrateAdapter.onStreamingStats(report);
        if (!connected) return;
        long sent = report.getBytesOutPerSecond() * 8;
        float congestion = report.getQueueCongestionPercent();
        String level;
        if (congestion > 60f || videoBitrate < quality.bitrate * 0.35) level = "poor";
        else if (congestion > 20f || videoBitrate < quality.bitrate * 0.7) level = "fair";
        else level = "good";
        boolean hot = heatFactor < 1f;
        main.post(() -> events.onHealth(sent, level, hot));
    }
}
