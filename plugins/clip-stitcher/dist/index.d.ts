import type { PluginListenerHandle } from '@capacitor/core';

export interface Clip {
  /** Opaque handle to pass back to stitch(): a file path (iOS) or content URI (Android). */
  id: string;
  name: string;
  durationMs: number;
  /** When the clip was filmed (ms since epoch), if the file says. */
  createdAt?: number;
  width?: number;
  height?: number;
  /** Small JPEG data URL. */
  thumbnail?: string;
}

export interface StitchResult {
  /** Absolute file path of the joined video (for saveToGallery). */
  path: string;
  /** file:// URL (for Share, and Capacitor.convertFileSrc to preview). */
  uri: string;
  durationMs: number;
  /** false when clips were joined without re-encoding (iOS, matching clips). */
  reencoded: boolean;
}

export interface ClipStitcherPlugin {
  /** Opens the system video picker (multiple selection). */
  pickVideos(): Promise<{ clips: Clip[]; failed: number }>;
  /** Joins the clips in the given order. Emits 'progress' (0..1) while working. */
  stitch(options: { ids: string[] }): Promise<StitchResult>;
  cancel(): Promise<void>;
  /** Saves a stitched video to Photos (iOS) or Movies/Loggerhead (Android 10+). */
  saveToGallery(options: { path: string }): Promise<void>;
  /** Deletes picked-clip copies and stitched videos from app storage. */
  clear(): Promise<void>;
  addListener(eventName: 'progress', listener: (e: { progress: number }) => void): Promise<PluginListenerHandle>;
}

export declare const ClipStitcher: ClipStitcherPlugin;
