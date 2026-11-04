package app.loggerhead.gamecamera;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;

/**
 * The scoreboard drawn into a live stream (and its local copy): the score card at the top and,
 * for a few seconds after a highlight, the play banner under it. Same look as the iPhone.
 */
final class ScoreOverlay {
    static final int WIDTH = 1200;
    static final int HEIGHT = 300;

    private ScoreOverlay() {}

    static Bitmap render(String title, String subtitle, String play) {
        Bitmap bitmap = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888);
        if (isEmpty(title) && isEmpty(play)) return bitmap; // nothing to show yet
        Canvas canvas = new Canvas(bitmap);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextAlign(Paint.Align.CENTER);
        Paint box = new Paint(Paint.ANTI_ALIAS_FLAG);

        if (!isEmpty(title)) {
            text.setTypeface(Typeface.DEFAULT_BOLD);
            text.setTextSize(64);
            String t = fit(text, title, WIDTH - 80);
            float titleWidth = text.measureText(t);
            text.setTypeface(Typeface.DEFAULT);
            text.setTextSize(36);
            String s = isEmpty(subtitle) ? "" : fit(text, subtitle, WIDTH - 80);
            float boxWidth = Math.min(WIDTH, Math.max(titleWidth, text.measureText(s)) + 64);
            float boxHeight = s.isEmpty() ? 104 : 156;
            box.setColor(Color.argb(170, 0, 0, 0));
            canvas.drawRoundRect(new RectF((WIDTH - boxWidth) / 2, 0, (WIDTH + boxWidth) / 2, boxHeight), 24, 24, box);
            text.setColor(Color.WHITE);
            text.setTypeface(Typeface.DEFAULT_BOLD);
            text.setTextSize(64);
            canvas.drawText(t, WIDTH / 2f, 76, text);
            if (!s.isEmpty()) {
                text.setTypeface(Typeface.DEFAULT);
                text.setTextSize(36);
                text.setColor(Color.rgb(229, 231, 235));
                canvas.drawText(s, WIDTH / 2f, 132, text);
            }
        }

        if (!isEmpty(play)) {
            text.setTypeface(Typeface.DEFAULT_BOLD);
            text.setTextSize(48);
            String p = fit(text, play, WIDTH - 80);
            float boxWidth = text.measureText(p) + 56;
            box.setColor(Color.rgb(250, 204, 21));
            canvas.drawRoundRect(new RectF((WIDTH - boxWidth) / 2, 176, (WIDTH + boxWidth) / 2, 256), 20, 20, box);
            text.setColor(Color.rgb(17, 24, 39));
            canvas.drawText(p, WIDTH / 2f, 233, text);
        }
        return bitmap;
    }

    static final int BRAND_WIDTH = 600;
    static final int BRAND_HEIGHT = 112;

    /** Loggerhead wordmark on a light tag (the app's web assets carry the image). */
    static Bitmap renderBrand(Context context) {
        Bitmap bitmap = Bitmap.createBitmap(BRAND_WIDTH, BRAND_HEIGHT, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint box = new Paint(Paint.ANTI_ALIAS_FLAG);
        box.setColor(Color.argb(225, 255, 255, 255));
        canvas.drawRoundRect(new RectF(0, 0, BRAND_WIDTH, BRAND_HEIGHT), 22, 22, box);
        Bitmap mark = null;
        try (java.io.InputStream in = context.getAssets().open("public/loggerhead-wordmark.png")) {
            mark = BitmapFactory.decodeStream(in);
        } catch (Exception ignored) {}
        if (mark != null) {
            float w = BRAND_WIDTH - 48;
            float h = w * mark.getHeight() / mark.getWidth();
            float top = (BRAND_HEIGHT - h) / 2;
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            canvas.drawBitmap(mark, null, new RectF(24, top, 24 + w, top + h), p);
        } else {
            Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
            text.setTextAlign(Paint.Align.CENTER);
            text.setTypeface(Typeface.DEFAULT_BOLD);
            text.setTextSize(64);
            text.setColor(Color.rgb(15, 37, 64));
            canvas.drawText("LOGGERHEAD.APP", BRAND_WIDTH / 2f, 78, text);
        }
        return bitmap;
    }

    private static boolean isEmpty(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String fit(Paint paint, String s, float max) {
        if (paint.measureText(s) <= max) return s;
        String out = s;
        while (out.length() > 1 && paint.measureText(out + "…") > max) out = out.substring(0, out.length() - 1);
        return out + "…";
    }
}
