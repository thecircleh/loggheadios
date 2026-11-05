package app.loggerhead.gamecamera;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FallbackStrategy;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.lifecycle.LifecycleOwner;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.util.Locale;

/**
 * Full-screen game camera shown over the app (the web view keeps running underneath, so the
 * live score keeps arriving). Records to the app's storage; the page saves or shares it.
 * mark() reports where the recording is, so each point can be pinned to the video.
 * With a stream target, the camera goes live (LiveSession) with the scoreboard in the video.
 */
@CapacitorPlugin(
    name = "GameCamera",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class GameCameraPlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());

    private FrameLayout root;
    private PreviewView previewView;
    private TextView titleView;
    private TextView subtitleView;
    private TextView statusView;
    private TextView timerView;
    private TextView infoView;
    private TextView recordButton;
    private TextView playView;
    private final Runnable hidePlay = () -> {
        if (playView != null) playView.animate().alpha(0f).setDuration(300).withEndAction(() -> {
            if (playView != null) playView.setVisibility(View.GONE);
        }).start();
    };

    private ProcessCameraProvider provider;
    private VideoCapture<Recorder> videoCapture;
    private Recording recording;
    private File recordingFile;
    private long startedAt;
    private volatile long recordedNanos;
    private volatile long lastStatusAt;
    private volatile boolean isRecording;
    private Runnable ticker;

    // Live streaming (open with a stream target)
    private String liveEndpoint;
    private String liveQuality = "high";
    private String liveState = "";
    private LiveSession live;
    private SurfaceView liveView;
    private TextView liveBadge;
    private Integer savedOrientation;
    private String sbTitle = "";
    private String sbSubtitle = "";
    private String sbPlay = "";
    private final Runnable clearLivePlay = () -> {
        sbPlay = "";
        refreshLiveOverlay();
    };

    // ------------------------------------------------------------ open / close

    @PluginMethod
    public void open(PluginCall call) {
        liveEndpoint = null;
        JSObject target = call.getObject("stream", null);
        if (target != null) {
            String url = target.optString("url", "").trim();
            String key = target.optString("key", "").trim();
            if (url.isEmpty() || key.isEmpty()) {
                call.reject("Add your stream key first.");
                return;
            }
            liveEndpoint = url.endsWith("/") ? url + key : url + "/" + key;
            liveQuality = target.optString("quality", "high");
        }
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "camera", "microphone" }, call, "permissionsDone");
            return;
        }
        startCamera(call);
    }

    @PermissionCallback
    private void permissionsDone(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Loggerhead needs camera access to film. Turn it on in Settings › Apps › Loggerhead › Permissions.", "PERMISSION_DENIED");
            return;
        }
        startCamera(call);
    }

    private void startCamera(PluginCall call) {
        if (liveEndpoint != null) {
            startLiveCamera(call);
            return;
        }
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                if (root == null) buildView(activity);
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(activity);
                future.addListener(() -> {
                    try {
                        provider = future.get();
                        Preview preview = new Preview.Builder().build();
                        preview.setSurfaceProvider(previewView.getSurfaceProvider());
                        Recorder recorder = new Recorder.Builder()
                            .setQualitySelector(QualitySelector.from(Quality.FHD, FallbackStrategy.lowerQualityOrHigherThan(Quality.FHD)))
                            .build();
                        videoCapture = VideoCapture.withOutput(recorder);
                        provider.unbindAll();
                        provider.bindToLifecycle((LifecycleOwner) activity, CameraSelector.DEFAULT_BACK_CAMERA, preview, videoCapture);
                        startTicker();
                        call.resolve();
                    } catch (Exception e) {
                        removeView();
                        call.reject("Couldn't start the camera: " + e.getMessage());
                    }
                }, ContextCompat.getMainExecutor(activity));
            } catch (Exception e) {
                call.reject("Couldn't open the camera: " + e.getMessage());
            }
        });
    }

    // Live: RootEncoder owns the camera. Sideways only, so the stream is landscape.
    private void startLiveCamera(PluginCall call) {
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                if (savedOrientation == null) savedOrientation = activity.getRequestedOrientation();
                activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                if (root == null) buildView(activity);
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                boolean withAudio = getPermissionState("microphone") == PermissionState.GRANTED;
                live = new LiveSession(activity, liveEndpoint, LiveSession.Quality.named(liveQuality), withAudio, liveEvents);
                if (!live.prepare()) {
                    live.release();
                    live = null;
                    removeView();
                    restoreOrientation();
                    call.reject("This phone couldn't start a live stream.");
                    return;
                }
                live.startPreview(liveView);
                refreshLiveOverlay();
                setLiveBadge("Tap the red button to go live", Color.WHITE);
                startTicker();
                call.resolve();
            } catch (Exception e) {
                if (live != null) live.release();
                live = null;
                removeView();
                restoreOrientation();
                call.reject("Couldn't start the live camera: " + e.getMessage());
            }
        });
    }

    private final LiveSession.Events liveEvents = new LiveSession.Events() {
        @Override
        public void onLive(String state, String message) {
            liveState = state;
            switch (state) {
                case "connecting": setLiveBadge("Connecting…", Color.rgb(253, 186, 116)); break;
                case "live": setLiveBadge("● LIVE", Color.rgb(248, 113, 113)); break;
                case "reconnecting": setLiveBadge("Reconnecting… (still recording)", Color.rgb(253, 186, 116)); break;
                case "failed": setLiveBadge("Not live (still recording)", Color.rgb(253, 186, 116)); break;
                default: setLiveBadge("", Color.WHITE); break;
            }
            JSObject data = new JSObject();
            data.put("state", state);
            if (message != null && !message.isEmpty()) data.put("message", message);
            notifyListeners("live", data);
        }

        @Override
        public void onRecordingStarted(long at) {
            startedAt = at;
            isRecording = true;
            updateRecordButton();
            JSObject data = new JSObject();
            data.put("state", "started");
            data.put("startedAt", at);
            notifyListeners("recording", data);
        }

        @Override
        public void onRecordingFinishing() {
            isRecording = false;
            updateRecordButton();
            setLiveBadge("Finishing the video…", Color.WHITE);
            JSObject data = new JSObject();
            data.put("state", "finishing");
            notifyListeners("recording", data);
        }

        @Override
        public void onHealth(long sentBitsPerSecond, String level, boolean hot) {
            if (!"live".equals(liveState)) return;
            int color = "good".equals(level) ? Color.rgb(74, 222, 128)
                : "fair".equals(level) ? Color.rgb(250, 204, 21) : Color.rgb(248, 113, 113);
            String text = String.format(Locale.US, "● LIVE · %.1f Mbps", sentBitsPerSecond / 1_000_000.0);
            if ("poor".equals(level)) text += " · weak connection";
            if (hot) text += " · phone hot";
            setLiveBadge(text, color);
        }

        @Override
        public void onRecordingStopped(File file, long durationMs, String error) {
            isRecording = false;
            updateRecordButton();
            if ("ended".equals(liveState) || "".equals(liveState)) setLiveBadge("", Color.WHITE);
            JSObject data = new JSObject();
            if (file != null && file.exists() && file.length() > 0) {
                data.put("state", "stopped");
                data.put("path", file.getAbsolutePath());
                data.put("uri", Uri.fromFile(file).toString());
                data.put("durationMs", durationMs);
                data.put("startedAt", startedAt);
                if (error != null) data.put("message", "Recording stopped early (" + error + ").");
            } else {
                data.put("state", "error");
                data.put("message", "The recording couldn't be saved" + (error != null ? " (" + error + ")." : "."));
            }
            notifyListeners("recording", data);
        }
    };

    private void setLiveBadge(String text, int color) {
        main.post(() -> {
            if (liveBadge == null) return;
            liveBadge.setText(text);
            liveBadge.setTextColor(color);
            liveBadge.setVisibility(text.isEmpty() ? View.GONE : View.VISIBLE);
        });
    }

    private void refreshLiveOverlay() {
        if (live != null) live.setOverlay(ScoreOverlay.render(sbTitle, sbSubtitle, sbPlay));
    }

    private void restoreOrientation() {
        if (savedOrientation != null) getActivity().setRequestedOrientation(savedOrientation);
        savedOrientation = null;
    }

    private File newRecordingFile() {
        File dir = new File(getContext().getCacheDir(), "game-camera");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, "loggerhead-game-" + System.currentTimeMillis() + ".mp4");
    }

    @PluginMethod
    public void close(PluginCall call) {
        main.post(() -> {
            closeCamera();
            call.resolve();
        });
    }

    private void closeCamera() {
        if (live != null) {
            if (live.isRecording()) live.stop(); // 'stopped' event follows
            final LiveSession ending = live;
            live = null;
            main.postDelayed(ending::release, 1500); // let the file finish first
            main.removeCallbacks(clearLivePlay);
            restoreOrientation();
        }
        if (recording != null) recording.stop(); // 'stopped' event follows
        if (provider != null) provider.unbindAll();
        provider = null;
        videoCapture = null;
        stopTicker();
        removeView();
        getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        notifyListeners("closed", new JSObject());
    }

    // ------------------------------------------------------------ recording

    @SuppressLint("MissingPermission") // audio is only enabled when the permission is granted
    private void startRecording() {
        if (videoCapture == null || recording != null) return;
        recordingFile = newRecordingFile();
        if (previewView.getDisplay() != null) videoCapture.setTargetRotation(previewView.getDisplay().getRotation());
        PendingRecording pending = videoCapture.getOutput()
            .prepareRecording(getContext(), new FileOutputOptions.Builder(recordingFile).build());
        if (getPermissionState("microphone") == PermissionState.GRANTED) pending = pending.withAudioEnabled();
        recordedNanos = 0;
        lastStatusAt = SystemClock.elapsedRealtime();
        recording = pending.start(ContextCompat.getMainExecutor(getContext()), this::onRecordEvent);
    }

    private void onRecordEvent(VideoRecordEvent event) {
        if (event instanceof VideoRecordEvent.Start) {
            startedAt = System.currentTimeMillis();
            isRecording = true;
            updateRecordButton();
            JSObject data = new JSObject();
            data.put("state", "started");
            data.put("startedAt", startedAt);
            notifyListeners("recording", data);
        } else if (event instanceof VideoRecordEvent.Status) {
            recordedNanos = event.getRecordingStats().getRecordedDurationNanos();
            lastStatusAt = SystemClock.elapsedRealtime();
        } else if (event instanceof VideoRecordEvent.Finalize) {
            VideoRecordEvent.Finalize done = (VideoRecordEvent.Finalize) event;
            long durationMs = done.getRecordingStats().getRecordedDurationNanos() / 1_000_000L;
            File file = recordingFile;
            recording = null;
            isRecording = false;
            updateRecordButton();
            JSObject data = new JSObject();
            // Some errors (e.g. storage full) still leave a playable file: keep it if so.
            boolean usable = file != null && file.exists() && file.length() > 0 && durationMs > 0;
            if (usable) {
                data.put("state", "stopped");
                data.put("path", file.getAbsolutePath());
                data.put("uri", Uri.fromFile(file).toString());
                data.put("durationMs", durationMs);
                data.put("startedAt", startedAt);
                if (done.hasError()) data.put("message", "Recording stopped early (error " + done.getError() + ").");
            } else {
                data.put("state", "error");
                data.put("message", "The recording couldn't be saved (error " + done.getError() + ").");
            }
            notifyListeners("recording", data);
        }
    }

    /** Battery, free space and heat, for the checks before filming. */
    @PluginMethod
    public void deviceStatus(PluginCall call) {
        JSObject ret = new JSObject();
        BatteryManager bm = (BatteryManager) getContext().getSystemService(Context.BATTERY_SERVICE);
        int level = bm != null ? bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) : -1;
        ret.put("battery", level >= 0 && level <= 100 ? level / 100.0 : -1);
        ret.put("charging", bm != null && bm.isCharging());
        long free = -1;
        try {
            free = new StatFs(getContext().getCacheDir().getAbsolutePath()).getAvailableBytes();
        } catch (Exception ignored) {}
        ret.put("freeBytes", free);
        String thermal = "nominal";
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            int t = pm != null ? pm.getCurrentThermalStatus() : 0;
            if (t >= android.os.PowerManager.THERMAL_STATUS_CRITICAL) thermal = "critical";
            else if (t >= android.os.PowerManager.THERMAL_STATUS_SEVERE) thermal = "serious";
            else if (t >= android.os.PowerManager.THERMAL_STATUS_MODERATE) thermal = "fair";
        }
        ret.put("thermal", thermal);
        call.resolve(ret);
    }

    /** Videos left behind when the app closed mid-recording, finished and ready to save. */
    @PluginMethod
    public void recoverRecordings(PluginCall call) {
        final File cache = getContext().getCacheDir();
        new Thread(() -> {
            com.getcapacitor.JSArray list = new com.getcapacitor.JSArray();
            try {
                for (Recordings.Recovered r : Recordings.recover(cache)) {
                    JSObject item = new JSObject();
                    item.put("state", "stopped");
                    item.put("path", r.file.getAbsolutePath());
                    item.put("uri", Uri.fromFile(r.file).toString());
                    item.put("durationMs", r.durationMs);
                    item.put("startedAt", r.startedAt);
                    item.put("recovered", true);
                    list.put(item);
                }
            } catch (Exception ignored) {}
            JSObject ret = new JSObject();
            ret.put("recordings", list);
            call.resolve(ret);
        }, "loggerhead-recover").start();
    }

    @PluginMethod
    public void mark(PluginCall call) {
        JSObject ret = new JSObject();
        if (live != null) {
            ret.put("recording", live.isRecording());
            ret.put("positionMs", live.positionMs());
            call.resolve(ret);
            return;
        }
        ret.put("recording", isRecording);
        long sinceStatus = Math.min(1000, SystemClock.elapsedRealtime() - lastStatusAt);
        ret.put("positionMs", isRecording ? recordedNanos / 1_000_000L + sinceStatus : 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void setScoreboard(PluginCall call) {
        String title = call.getString("title");
        String subtitle = call.getString("subtitle");
        String status = call.getString("status");
        Boolean connected = call.getBoolean("connected");
        if (title != null) sbTitle = title;
        if (subtitle != null) sbSubtitle = subtitle;
        refreshLiveOverlay();
        main.post(() -> {
            if (root != null) {
                if (title != null) titleView.setText(title);
                if (subtitle != null) subtitleView.setText(subtitle);
                if (status != null) statusView.setText(status);
                if (connected != null) statusView.setTextColor(connected ? Color.rgb(74, 222, 128) : Color.rgb(253, 186, 116));
                titleView.setVisibility(titleView.getText().length() > 0 ? View.VISIBLE : View.GONE);
                subtitleView.setVisibility(subtitleView.getText().length() > 0 ? View.VISIBLE : View.GONE);
                statusView.setVisibility(statusView.getText().length() > 0 ? View.VISIBLE : View.GONE);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void showPlay(PluginCall call) {
        String text = call.getString("text", "");
        if (live != null && text != null && !text.isEmpty()) {
            sbPlay = text;
            refreshLiveOverlay();
            main.removeCallbacks(clearLivePlay);
            main.postDelayed(clearLivePlay, 4000);
            call.resolve();
            return;
        }
        main.post(() -> {
            if (root != null && playView != null && text != null && !text.isEmpty()) {
                main.removeCallbacks(hidePlay);
                playView.animate().cancel();
                playView.setText(text);
                playView.setAlpha(0f);
                playView.setVisibility(View.VISIBLE);
                playView.animate().alpha(1f).setDuration(200).start();
                main.postDelayed(hidePlay, 4000);
            }
            call.resolve();
        });
    }

    // ------------------------------------------------------------ view

    private int dp(float value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getContext().getResources().getDisplayMetrics());
    }

    private TextView label(Context ctx, float sp, boolean bold) {
        TextView v = new TextView(ctx);
        v.setTextColor(Color.WHITE);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setShadowLayer(4, 0, 1, Color.BLACK);
        return v;
    }

    private void buildView(Activity activity) {
        Context ctx = activity;
        root = new FrameLayout(ctx);
        root.setBackgroundColor(Color.BLACK);
        root.setClickable(true); // don't let taps reach the app underneath

        if (liveEndpoint != null) {
            liveView = new SurfaceView(ctx);
            root.addView(liveView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        } else {
            previewView = new PreviewView(ctx);
            previewView.setScaleType(PreviewView.ScaleType.FIT_CENTER);
            root.addView(previewView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }

        // Everything else sits inside the system bars.
        FrameLayout ui = new FrameLayout(ctx);
        root.addView(ui, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ViewCompat.setOnApplyWindowInsetsListener(ui, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });

        LinearLayout board = new LinearLayout(ctx);
        board.setOrientation(LinearLayout.VERTICAL);
        board.setGravity(Gravity.CENTER_HORIZONTAL);
        GradientDrawable boardBg = new GradientDrawable();
        boardBg.setColor(Color.argb(140, 0, 0, 0));
        boardBg.setCornerRadius(dp(12));
        board.setBackground(boardBg);
        board.setPadding(dp(14), dp(6), dp(14), dp(6));
        titleView = label(ctx, 20, true);
        subtitleView = label(ctx, 13, false);
        statusView = label(ctx, 12, true);
        board.addView(titleView);
        board.addView(subtitleView);
        board.addView(statusView);
        titleView.setVisibility(View.GONE);
        subtitleView.setVisibility(View.GONE);
        statusView.setVisibility(View.GONE);
        // Scoreboard with the play banner under it.
        LinearLayout top = new LinearLayout(ctx);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setGravity(Gravity.CENTER_HORIZONTAL);
        top.addView(board);
        playView = label(ctx, 17, true);
        playView.setTextColor(Color.rgb(17, 24, 39));
        playView.setShadowLayer(0, 0, 0, Color.TRANSPARENT);
        GradientDrawable playBg = new GradientDrawable();
        playBg.setColor(Color.rgb(250, 204, 21));
        playBg.setCornerRadius(dp(10));
        playView.setBackground(playBg);
        playView.setPadding(dp(14), dp(5), dp(14), dp(5));
        playView.setVisibility(View.GONE);
        LinearLayout.LayoutParams playLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        playLp.topMargin = dp(6);
        top.addView(playView, playLp);
        FrameLayout.LayoutParams topLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        topLp.topMargin = dp(8);
        ui.addView(top, topLp);
        // Live: the scoreboard is drawn into the video itself, so the on-screen copy is hidden.
        if (liveEndpoint != null) top.setVisibility(View.GONE);

        liveBadge = label(ctx, 14, true);
        liveBadge.setPadding(dp(10), dp(4), dp(10), dp(4));
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(Color.argb(150, 0, 0, 0));
        badgeBg.setCornerRadius(dp(8));
        liveBadge.setBackground(badgeBg);
        liveBadge.setVisibility(View.GONE);
        FrameLayout.LayoutParams badgeLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        badgeLp.topMargin = dp(12);
        badgeLp.rightMargin = dp(12);
        ui.addView(liveBadge, badgeLp);

        TextView closeButton = label(ctx, 26, true);
        closeButton.setText("✕");
        closeButton.setPadding(dp(16), dp(8), dp(16), dp(8));
        closeButton.setOnClickListener(v -> confirmClose());
        ui.addView(closeButton, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START));

        timerView = label(ctx, 16, true);
        timerView.setTextColor(Color.rgb(248, 113, 113));
        FrameLayout.LayoutParams timerLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        timerLp.bottomMargin = dp(104);
        ui.addView(timerView, timerLp);

        recordButton = new TextView(ctx);
        recordButton.setOnClickListener(v -> {
            if (live != null) {
                if (live.isRecording()) live.stop();
                else live.start(Recordings.newLiveFile(getContext().getCacheDir()));
                return;
            }
            if (recording == null) startRecording();
            else recording.stop();
        });
        FrameLayout.LayoutParams recLp = new FrameLayout.LayoutParams(dp(76), dp(76), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        recLp.bottomMargin = dp(20);
        ui.addView(recordButton, recLp);
        updateRecordButton();

        infoView = label(ctx, 12, false);
        FrameLayout.LayoutParams infoLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        infoLp.leftMargin = dp(14);
        infoLp.bottomMargin = dp(16);
        ui.addView(infoView, infoLp);

        ViewGroup content = activity.findViewById(android.R.id.content);
        content.addView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ViewCompat.requestApplyInsets(ui);
    }

    private void updateRecordButton() {
        if (recordButton == null) return;
        main.post(() -> {
            GradientDrawable ring = new GradientDrawable();
            ring.setShape(isRecording ? GradientDrawable.RECTANGLE : GradientDrawable.OVAL);
            ring.setCornerRadius(dp(14));
            ring.setColor(Color.rgb(239, 68, 68));
            ring.setStroke(dp(5), Color.WHITE);
            recordButton.setBackground(ring);
            recordButton.setContentDescription(isRecording ? "Stop recording" : "Start recording");
            if (!isRecording && timerView != null) timerView.setText("");
        });
    }

    private void confirmClose() {
        if (recording == null && (live == null || !live.isRecording())) {
            closeCamera();
            return;
        }
        new AlertDialog.Builder(getActivity())
            .setTitle(live != null ? "End the live stream?" : "Stop recording?")
            .setMessage(live != null ? "The stream ends. The video so far is kept on this phone." : "The video so far is kept.")
            .setPositiveButton("Stop and close", (d, w) -> closeCamera())
            .setNegativeButton("Keep filming", null)
            .show();
    }

    private void removeView() {
        main.removeCallbacks(hidePlay);
        playView = null;
        liveBadge = null;
        liveView = null;
        if (root != null && root.getParent() instanceof ViewGroup) ((ViewGroup) root.getParent()).removeView(root);
        root = null;
    }

    // Timer, battery and free space, refreshed every half second.
    private void startTicker() {
        stopTicker();
        ticker = new Runnable() {
            private int tick = 0;

            @Override
            public void run() {
                if (root == null) return;
                if (live != null && live.isRecording()) {
                    long s = live.positionMs() / 1000;
                    timerView.setText(String.format(Locale.US, "● %d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60));
                } else if (isRecording) {
                    long ms = recordedNanos / 1_000_000L + Math.min(1000, SystemClock.elapsedRealtime() - lastStatusAt);
                    long s = ms / 1000;
                    timerView.setText(String.format(Locale.US, "● %d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60));
                }
                if (tick++ % 20 == 0) infoView.setText(deviceInfo());
                main.postDelayed(this, 500);
            }
        };
        main.post(ticker);
    }

    private void stopTicker() {
        if (ticker != null) main.removeCallbacks(ticker);
        ticker = null;
    }

    @NonNull
    private String deviceInfo() {
        StringBuilder text = new StringBuilder();
        Intent battery = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery != null) {
            int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            if (level >= 0 && scale > 0) text.append("🔋 ").append(level * 100 / scale).append("%   ");
        }
        try {
            StatFs fs = new StatFs(getContext().getCacheDir().getAbsolutePath());
            double gb = fs.getAvailableBytes() / 1e9;
            text.append(String.format(Locale.US, "💾 %.1f GB free", gb));
        } catch (Exception ignored) {}
        return text.toString();
    }
}
