package app.loggerhead.gamecamera;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
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
import com.pedro.library.util.QueueAwareBitrateAdapter;
import java.io.File;

/**
 * Live streaming to YouTube (or any RTMP or RTMPS with a stream key) while keeping a
 * full-quality copy on the phone. The scoreboard is drawn into both. If the connection drops,
 * it keeps trying to reconnect and the local copy keeps recording either way.
 */
final class LiveSession implements ConnectChecker {

    interface Events {
        /** state: connecting | live | reconnecting | failed | ended */
        void onLive(String state, String message);
        void onRecordingStarted(long startedAt);
        void onRecordingStopped(File file, long durationMs, String error);
    }

    // Stream 720p (works on most bleacher connections); keep a 1080p copy on the phone.
    private static final int STREAM_BITRATE = 2_500_000;
    private static final int AUDIO_BITRATE = 128_000;
    private static final int RECORD_BITRATE = 8_000_000;

    private final RtmpStream stream;
    private final ImageFilterRender overlay = new ImageFilterRender();
    private final ImageFilterRender brand = new ImageFilterRender();
    private final Context context;
    private final QueueAwareBitrateAdapter bitrateAdapter;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final String endpoint;
    private final Events events;

    private volatile boolean wantLive;
    private volatile boolean recording;
    private File file;
    private long startedAt;
    private long startElapsed;
    private String recordError;

    LiveSession(Context context, String endpoint, boolean withAudio, Events events) {
        this.endpoint = endpoint;
        this.context = context;
        this.events = events;
        stream = new RtmpStream(context, this, new Camera2Source(context),
            withAudio ? new MicrophoneSource() : new NoAudioSource());
        bitrateAdapter = new QueueAwareBitrateAdapter(STREAM_BITRATE + AUDIO_BITRATE,
            bitrate -> stream.setVideoBitrateOnFly(Math.max(300_000, bitrate - AUDIO_BITRATE)));
    }

    /** Sets up the camera and encoders. Returns false if this phone can't stream. */
    boolean prepare() {
        boolean video;
        try {
            video = stream.prepareVideo(1280, 720, STREAM_BITRATE, 30, 2, 0, -1, -1, 1920, 1080, RECORD_BITRATE);
        } catch (Exception e) {
            video = false;
        }
        if (!video) {
            // Some phones can't run two encoders: stream and record at 720p.
            try {
                video = stream.prepareVideo(1280, 720, STREAM_BITRATE);
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
        stream.getGlInterface().addFilter(overlay);
        // Loggerhead tag in the bottom-right corner of the stream and the saved copy.
        stream.getGlInterface().addFilter(brand);
        brand.setImage(ScoreOverlay.renderBrand(context));
        float brandWidth = 20f;
        float brandHeight = brandWidth * ScoreOverlay.BRAND_HEIGHT / ScoreOverlay.BRAND_WIDTH * 16f / 9f;
        brand.setScale(brandWidth, brandHeight);
        brand.setPosition(100f - brandWidth - 2f, 100f - brandHeight - 3f);
        return video && audio;
    }

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

    /** Goes live and starts the local copy. */
    void start(File output) {
        if (recording || stream.isRecording()) return;
        file = output;
        recordError = null;
        wantLive = true;
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
            events.onRecordingStopped(file, duration, recordError);
        }
    }

    /** Ends the stream and finishes the local copy. */
    void stop() {
        wantLive = false;
        if (stream.isStreaming()) stream.stopStream();
        if (stream.isRecording()) stream.stopRecord();
        events.onLive("ended", "");
    }

    void release() {
        wantLive = false;
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
        main.post(() -> events.onLive("live", ""));
    }

    @Override
    public void onConnectionFailed(@NonNull String reason) {
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
    public void onDisconnect() {}

    @Override
    public void onAuthError() {
        main.post(() -> {
            wantLive = false;
            if (stream.isStreaming()) stream.stopStream();
            events.onLive("failed", "The stream key wasn't accepted. Copy it again from YouTube Studio.");
        });
    }

    @Override
    public void onAuthSuccess() {}

    @Override
    public void onStreamingStats(@NonNull StreamingStatsReport report) {
        bitrateAdapter.onStreamingStats(report);
    }
}
