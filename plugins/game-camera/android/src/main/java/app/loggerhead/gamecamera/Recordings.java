package app.loggerhead.gamecamera;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaMuxer;
import android.util.Log;
import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/**
 * Crash-safe game recordings.
 *
 * A live recording is written as MPEG-TS, which stays playable up to the last frame written
 * even if the app is killed or the battery dies (an MP4 written by Android's muxer is
 * unreadable until it's finished). A ".inprogress" marker sits next to the file while it's
 * being recorded. When recording stops, finish() copies the frames into an MP4 (no
 * re-encoding) so the gallery, sharing and highlight reels work as before. If the app died
 * mid-match, recover() finds the leftover file the next time the camera page opens.
 */
final class Recordings {

    private static final String TAG = "LoggerheadRecordings";
    private static final String MARKER = ".inprogress";
    // Files being recorded or finished right now in this process: recover() leaves them alone.
    private static final java.util.Set<String> BUSY = java.util.Collections.synchronizedSet(new java.util.HashSet<>());

    private Recordings() {}

    static File dir(File cacheDir) {
        File dir = new File(cacheDir, "game-camera");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    static File newLiveFile(File cacheDir) {
        return new File(dir(cacheDir), "loggerhead-game-" + System.currentTimeMillis() + ".ts");
    }

    static void markInProgress(File video) throws IOException {
        BUSY.add(video.getAbsolutePath());
        //noinspection ResultOfMethodCallIgnored
        marker(video).createNewFile();
    }

    private static File marker(File video) {
        return new File(video.getAbsolutePath() + MARKER);
    }

    /**
     * Turns a finished TS recording into an MP4 next to it. Returns the MP4, or the TS itself if
     * it couldn't be converted (most players still open it), or null if there's no video.
     */
    static File finish(File ts) {
        if (ts == null) return null;
        BUSY.add(ts.getAbsolutePath());
        try {
            return finishNow(ts);
        } finally {
            BUSY.remove(ts.getAbsolutePath());
        }
    }

    private static File finishNow(File ts) {
        if (!ts.exists() || ts.length() == 0) {
            //noinspection ResultOfMethodCallIgnored
            marker(ts).delete();
            return null;
        }
        File mp4 = new File(ts.getAbsolutePath().replaceAll("\\.ts$", "") + ".mp4");
        boolean ok = remux(ts, mp4);
        if (ok) {
            //noinspection ResultOfMethodCallIgnored
            ts.delete();
        } else {
            //noinspection ResultOfMethodCallIgnored
            mp4.delete();
        }
        //noinspection ResultOfMethodCallIgnored
        marker(ts).delete();
        return ok ? mp4 : ts;
    }

    /** A recording left behind when the app closed mid-match: the video and its length. */
    static final class Recovered {
        final File file;
        final long startedAt;
        final long durationMs;

        Recovered(File file, long startedAt, long durationMs) {
            this.file = file;
            this.startedAt = startedAt;
            this.durationMs = durationMs;
        }
    }

    /**
     * Finishes recordings that were interrupted (app killed, phone died). Skips files this app
     * is recording or finishing right now. Call off the main thread.
     */
    static List<Recovered> recover(File cacheDir) {
        List<Recovered> out = new ArrayList<>();
        File[] files = dir(cacheDir).listFiles();
        if (files == null) return out;
        for (File m : files) {
            String name = m.getName();
            if (!name.endsWith(MARKER)) continue;
            File video = new File(m.getParentFile(), name.substring(0, name.length() - MARKER.length()));
            if (BUSY.contains(video.getAbsolutePath())) continue;
            if (!video.exists() || video.length() < 64 * 1024) {
                //noinspection ResultOfMethodCallIgnored
                m.delete();
                //noinspection ResultOfMethodCallIgnored
                video.delete();
                continue;
            }
            File done = video.getName().endsWith(".ts") ? finish(video) : video;
            //noinspection ResultOfMethodCallIgnored
            m.delete();
            if (done == null) continue;
            out.add(new Recovered(done, startedAtFromName(video.getName()), durationMs(done)));
        }
        return out;
    }

    private static long startedAtFromName(String name) {
        try {
            return Long.parseLong(name.replaceAll("\\D", ""));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static long durationMs(File file) {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(file.getAbsolutePath());
            String d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            return d != null ? Long.parseLong(d) : 0;
        } catch (Exception e) {
            return 0;
        } finally {
            try {
                r.release();
            } catch (Exception ignored) {}
        }
    }

    /** Copies the audio and video frames from `in` into an MP4 at `out`, without re-encoding. */
    static boolean remux(File in, File out) {
        MediaExtractor extractor = new MediaExtractor();
        MediaMuxer muxer = null;
        try {
            extractor.setDataSource(in.getAbsolutePath());
            muxer = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int count = extractor.getTrackCount();
            int[] tracks = new int[count];
            int maxInput = 1024 * 1024;
            boolean anyVideo = false;
            for (int i = 0; i < count; i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime != null && (mime.startsWith("video/") || mime.startsWith("audio/"))) {
                    extractor.selectTrack(i);
                    tracks[i] = muxer.addTrack(format);
                    if (mime.startsWith("video/")) anyVideo = true;
                    if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
                        maxInput = Math.max(maxInput, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE));
                    }
                } else {
                    tracks[i] = -1;
                }
            }
            if (!anyVideo) return false;
            muxer.start();
            ByteBuffer buffer = ByteBuffer.allocateDirect(Math.max(maxInput, 4 * 1024 * 1024));
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            while (true) {
                buffer.clear();
                int size = extractor.readSampleData(buffer, 0);
                if (size < 0) break;
                int track = extractor.getSampleTrackIndex();
                long pts = extractor.getSampleTime();
                if (track >= 0 && track < count && tracks[track] >= 0 && pts >= 0 && size > 0) {
                    info.set(0, size, pts,
                        (extractor.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0);
                    muxer.writeSampleData(tracks[track], buffer, info);
                }
                if (!extractor.advance()) break;
            }
            muxer.stop();
            return out.length() > 0;
        } catch (Exception e) {
            Log.w(TAG, "Couldn't convert " + in.getName() + ": " + e.getMessage());
            return false;
        } finally {
            extractor.release();
            if (muxer != null) {
                try {
                    muxer.release();
                } catch (Exception ignored) {}
            }
        }
    }
}
