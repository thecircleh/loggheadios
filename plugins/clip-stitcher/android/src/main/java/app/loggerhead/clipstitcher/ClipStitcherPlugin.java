package app.loggerhead.clipstitcher;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.effect.Presentation;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.EditedMediaItemSequence;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.ProgressHolder;
import androidx.media3.transformer.Transformer;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.collect.ImmutableList;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Joins video clips into one video, on the phone, with Media3 Transformer.
 * Every clip is scaled to fit the first clip's size (letterboxed), so mixed
 * orientations/resolutions still produce one clean video.
 */
@CapacitorPlugin(name = "ClipStitcher")
public class ClipStitcherPlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());
    private Transformer transformer;
    private PluginCall stitchCall;
    private File stitchOutput;
    private Runnable progressPoller;
    private volatile boolean pickCancelled = false;

    private File workDir() {
        File dir = new File(getContext().getCacheDir(), "clip-stitcher");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    // ---------------------------------------------------------------- picking

    @PluginMethod
    public void pickVideos(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 33) {
            // System photo picker: no storage permission needed.
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
            intent.setType("video/*");
            intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(100, MediaStore.getPickImagesMaxLimit()));
        } else {
            intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.setType("video/*");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        final List<Uri> uris = new ArrayList<>();
        if (result.getResultCode() == Activity.RESULT_OK && data != null) {
            ClipData clipData = data.getClipData();
            if (clipData != null) {
                for (int i = 0; i < clipData.getItemCount(); i++) {
                    uris.add(clipData.getItemAt(i).getUri());
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
        }
        pickCancelled = false;
        new Thread(() -> {
            JSArray clips = new JSArray();
            int failed = 0;
            int done = 0;
            final int total = uris.size();
            // Clips kept in Google Photos' cloud download when first read, which is slow on
            // cellular. Report each clip so the page can show it's working, not stuck.
            notifyPickProgress(0, total);
            for (Uri uri : uris) {
                if (pickCancelled) break;
                try {
                    clips.put(describe(uri));
                } catch (Exception e) {
                    failed++;
                }
                done++;
                notifyPickProgress(done, total);
            }
            JSObject ret = new JSObject();
            ret.put("clips", clips);
            ret.put("failed", failed);
            ret.put("cancelled", pickCancelled && done < total);
            call.resolve(ret);
        }).start();
    }

    private void notifyPickProgress(int done, int total) {
        JSObject progress = new JSObject();
        progress.put("done", done);
        progress.put("total", total);
        progress.put("fraction", total > 0 ? (double) done / total : 0);
        notifyListeners("pickProgress", progress);
    }

    private JSObject describe(Uri uri) throws Exception {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(getContext(), uri);
            JSObject clip = new JSObject();
            clip.put("id", uri.toString());
            clip.put("name", displayName(uri));
            long durationMs = parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
            clip.put("durationMs", durationMs);

            Long createdAt = dateTaken(uri);
            if (createdAt == null) createdAt = parseMetadataDate(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE));
            if (createdAt != null) clip.put("createdAt", (long) createdAt);

            int width = (int) parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            int height = (int) parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            int rotation = (int) parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION));
            if (rotation == 90 || rotation == 270) {
                int swap = width;
                width = height;
                height = swap;
            }
            if (width > 0 && height > 0) {
                clip.put("width", width);
                clip.put("height", height);
            }

            long frameUs = Math.min(500_000L, durationMs * 500L);
            Bitmap frame = retriever.getFrameAtTime(frameUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            if (frame != null) {
                float scale = 240f / Math.max(frame.getWidth(), frame.getHeight());
                Bitmap small = scale < 1f
                    ? Bitmap.createScaledBitmap(frame, Math.round(frame.getWidth() * scale), Math.round(frame.getHeight() * scale), true)
                    : frame;
                ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
                small.compress(Bitmap.CompressFormat.JPEG, 70, jpeg);
                clip.put("thumbnail", "data:image/jpeg;base64," + Base64.encodeToString(jpeg.toByteArray(), Base64.NO_WRAP));
            }
            return clip;
        } finally {
            try {
                retriever.release();
            } catch (Exception ignored) {}
        }
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null) return name;
            }
        } catch (Exception ignored) {}
        String last = uri.getLastPathSegment();
        return last != null ? last : "Clip";
    }

    /** "datetaken" from the photo picker / MediaStore, when the provider offers it. */
    private Long dateTaken(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { "datetaken" }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) {
                long ms = cursor.getLong(0);
                if (ms > 0) return ms;
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** MP4 "creation_time", e.g. 20261018T143512.000Z. Ignores the 1904 "unset" date. */
    private Long parseMetadataDate(String value) {
        if (value == null) return null;
        for (String pattern : new String[] { "yyyyMMdd'T'HHmmss.SSS'Z'", "yyyyMMdd'T'HHmmss'Z'" }) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date date = format.parse(value);
                if (date != null && date.getTime() > 31_536_000_000L) return date.getTime();
            } catch (Exception ignored) {}
        }
        return null;
    }

    private static long parseLong(String value) {
        try {
            return value == null ? 0 : Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    // -------------------------------------------------------------- stitching

    @PluginMethod
    public void stitch(PluginCall call) {
        final List<String> ids = new ArrayList<>();
        JSArray array = call.getArray("ids");
        if (array != null) {
            for (int i = 0; i < array.length(); i++) {
                String id = array.optString(i, null);
                if (id != null) ids.add(id);
            }
        }
        if (ids.isEmpty()) {
            call.reject("Choose at least one clip.");
            return;
        }
        main.post(() -> startStitch(call, ids));
    }

    private void startStitch(PluginCall call, List<String> ids) {
        if (transformer != null) {
            call.reject("Already making a video.");
            return;
        }
        try {
            // Output size: the upright size most clips share (ties: the earliest), rounded down to
            // even numbers, so moving one odd clip to the front doesn't reshape the whole game.
            int[] size = commonSize(ids);
            ImmutableList<androidx.media3.common.Effect> videoEffects = size == null
                ? ImmutableList.of()
                : ImmutableList.of(Presentation.createForWidthAndHeight(size[0], size[1], Presentation.LAYOUT_SCALE_TO_FIT));

            List<EditedMediaItem> items = new ArrayList<>();
            for (String id : ids) {
                items.add(
                    new EditedMediaItem.Builder(MediaItem.fromUri(Uri.parse(id)))
                        .setEffects(new Effects(ImmutableList.of(), videoEffects))
                        .build()
                );
            }
            // Clips from other sources (texted, downloaded, screen recordings) may have no audio
            // track; Transformer rejects a sequence mixing audio and no-audio items unless it
            // can fill the gaps with silence.
            Composition composition = new Composition.Builder(new EditedMediaItemSequence(items))
                .experimentalSetForceAudioTrack(true)
                .build();

            File output = new File(workDir(), "loggerhead-" + System.currentTimeMillis() + ".mp4");
            stitchCall = call;
            stitchOutput = output;
            transformer = new Transformer.Builder(getContext())
                .setVideoMimeType(MimeTypes.VIDEO_H264)
                .setAudioMimeType(MimeTypes.AUDIO_AAC)
                .addListener(
                    new Transformer.Listener() {
                        @Override
                        public void onCompleted(Composition composition, ExportResult exportResult) {
                            finishStitch();
                            JSObject ret = new JSObject();
                            ret.put("path", output.getAbsolutePath());
                            ret.put("uri", Uri.fromFile(output).toString());
                            ret.put("durationMs", exportResult.durationMs);
                            ret.put("reencoded", true);
                            call.resolve(ret);
                        }

                        @Override
                        public void onError(Composition composition, ExportResult exportResult, ExportException exception) {
                            finishStitch();
                            //noinspection ResultOfMethodCallIgnored
                            output.delete();
                            call.reject("Couldn't make the video (" + exception.getErrorCodeName() + "): " + exception.getMessage());
                        }
                    }
                )
                .build();
            transformer.start(composition, output.getAbsolutePath());
            startProgress();
        } catch (Exception e) {
            finishStitch();
            call.reject("Couldn't make the video: " + e.getMessage());
        }
    }

    private int[] commonSize(List<String> ids) {
        java.util.Map<String, Integer> counts = new java.util.HashMap<>();
        java.util.Map<String, int[]> sizes = new java.util.LinkedHashMap<>();
        for (String id : ids) {
            int[] size = uprightSize(Uri.parse(id));
            if (size == null) continue;
            String key = size[0] + "x" + size[1];
            counts.merge(key, 1, Integer::sum);
            sizes.putIfAbsent(key, size);
        }
        int[] best = null;
        int bestCount = 0;
        for (java.util.Map.Entry<String, int[]> e : sizes.entrySet()) { // insertion order = earliest first
            int count = counts.get(e.getKey());
            if (count > bestCount) {
                best = e.getValue();
                bestCount = count;
            }
        }
        return best;
    }

    private int[] uprightSize(Uri uri) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(getContext(), uri);
            int width = (int) parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            int height = (int) parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            int rotation = (int) parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION));
            if (rotation == 90 || rotation == 270) {
                int swap = width;
                width = height;
                height = swap;
            }
            if (width <= 0 || height <= 0) return null;
            return new int[] { width - (width % 2), height - (height % 2) };
        } catch (Exception e) {
            return null;
        } finally {
            try {
                retriever.release();
            } catch (Exception ignored) {}
        }
    }

    private void startProgress() {
        final ProgressHolder holder = new ProgressHolder();
        progressPoller = new Runnable() {
            @Override
            public void run() {
                if (transformer == null) return;
                if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
                    JSObject progress = new JSObject();
                    progress.put("progress", holder.progress / 100.0);
                    notifyListeners("progress", progress);
                }
                main.postDelayed(this, 300);
            }
        };
        main.post(progressPoller);
    }

    private void finishStitch() {
        if (progressPoller != null) main.removeCallbacks(progressPoller);
        progressPoller = null;
        transformer = null;
        stitchCall = null;
        stitchOutput = null;
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        // Stops loading picked clips after the current one; clips already loaded are kept.
        pickCancelled = true;
        main.post(() -> {
            if (transformer != null) {
                PluginCall pending = stitchCall;
                File output = stitchOutput;
                transformer.cancel();
                finishStitch();
                if (output != null) {
                    //noinspection ResultOfMethodCallIgnored
                    output.delete();
                }
                if (pending != null) pending.reject("Cancelled", "CANCELLED");
            }
            call.resolve();
        });
    }

    // ------------------------------------------------------ saving / cleanup

    @PluginMethod
    public void saveToGallery(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Missing video.");
            return;
        }
        if (Build.VERSION.SDK_INT < 29) {
            call.reject("On this version of Android, use Share to save the video.", "UNSUPPORTED");
            return;
        }
        new Thread(() -> {
            ContentResolver resolver = getContext().getContentResolver();
            Uri item = null;
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Video.Media.DISPLAY_NAME, new File(path).getName());
                values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
                values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/Loggerhead");
                values.put(MediaStore.Video.Media.IS_PENDING, 1);
                item = resolver.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
                if (item == null) throw new IllegalStateException("no gallery entry");
                try (InputStream in = new FileInputStream(path); OutputStream out = resolver.openOutputStream(item)) {
                    if (out == null) throw new IllegalStateException("can't write to gallery");
                    byte[] buffer = new byte[1 << 16];
                    int n;
                    while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
                }
                values.clear();
                values.put(MediaStore.Video.Media.IS_PENDING, 0);
                resolver.update(item, values, null, null);
                call.resolve();
            } catch (Exception e) {
                if (item != null) {
                    try {
                        resolver.delete(item, null, null);
                    } catch (Exception ignored) {}
                }
                call.reject("Couldn't save the video: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        File dir = new File(getContext().getCacheDir(), "clip-stitcher");
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
        call.resolve();
    }
}
