package app.loggerhead.gamecamera;

import com.pedro.common.TimeUtils;
import com.pedro.encoder.Frame;
import com.pedro.encoder.input.audio.GetMicrophoneData;
import com.pedro.encoder.input.sources.audio.AudioSource;

/**
 * Silence, for streaming when Loggerhead isn't allowed to use the microphone.
 *
 * The stream always tells YouTube it has a sound track. With RootEncoder's NoAudioSource no
 * sound ever arrives, and YouTube can sit on "Start sending us your video" waiting for it,
 * even though the video is getting through. Sending silent sound keeps YouTube happy.
 */
final class SilentAudioSource extends AudioSource {

    private static final int SAMPLES_PER_FRAME = 1024; // one AAC frame

    private volatile boolean running;
    private Thread thread;

    @Override
    protected boolean create(int sampleRate, boolean isStereo, boolean echoCanceler, boolean noiseSuppressor) {
        return true;
    }

    @Override
    public void start(GetMicrophoneData out) {
        if (running) return;
        running = true;
        final int rate = getSampleRate() > 0 ? getSampleRate() : 44100;
        final int channels = isStereo() ? 2 : 1;
        final int bytes = SAMPLES_PER_FRAME * channels * 2; // 16-bit PCM
        thread = new Thread(() -> {
            long startMicros = TimeUtils.getCurrentTimeMicro();
            long samples = 0;
            while (running) {
                // Timestamps come from the sample count, so the sound never drifts from the video.
                long ts = startMicros + samples * 1_000_000L / rate;
                out.inputPCMData(new Frame(new byte[bytes], 0, bytes, ts));
                samples += SAMPLES_PER_FRAME;
                long waitMicros = startMicros + samples * 1_000_000L / rate - TimeUtils.getCurrentTimeMicro();
                if (waitMicros > 0) {
                    try {
                        Thread.sleep(waitMicros / 1000, (int) (waitMicros % 1000) * 1000);
                    } catch (InterruptedException e) {
                        return;
                    }
                }
            }
        }, "loggerhead-silent-audio");
        thread.start();
    }

    @Override
    public void stop() {
        running = false;
        if (thread != null) thread.interrupt();
        thread = null;
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public void release() {
        stop();
    }
}
