import type { PluginListenerHandle } from '@capacitor/core';

export interface RecordingEvent {
  /** finishing: a live recording is being turned into a playable MP4 (Android; can take a minute). */
  state: 'started' | 'finishing' | 'stopped' | 'error';
  /** Filming phone's clock when recording began (ms since epoch). */
  startedAt?: number;
  /** Absolute file path of the video (stopped), for saving to the gallery. */
  path?: string;
  /** file:// URL (stopped), for Capacitor.convertFileSrc and Share. */
  uri?: string;
  durationMs?: number;
  message?: string;
  /** Left behind when the app closed mid-recording, found by recoverRecordings(). */
  recovered?: boolean;
}

export interface DeviceStatus {
  /** 0–1, or -1 if unknown. */
  battery: number;
  charging: boolean;
  /** Free storage in bytes, or -1 if unknown. */
  freeBytes: number;
  thermal: 'nominal' | 'fair' | 'serious' | 'critical';
}

export interface LiveEvent {
  state: 'connecting' | 'live' | 'reconnecting' | 'failed' | 'ended';
  message?: string;
}

export interface GameCameraPlugin {
  /**
   * Shows the full-screen camera over the app (asks for camera + microphone access).
   * With `stream`, the red button goes live (RTMP/RTMPS + stream key) and keeps a copy on the
   * phone; the scoreboard and the Loggerhead tag are drawn into the video. `quality` sets the
   * stream's size and top bitrate (high 720p 2.5 Mbps, medium 720p 1.5 Mbps, low 480p 0.8 Mbps);
   * the bitrate then follows the connection. The camera shows the stream's health while live.
   */
  open(options?: { stream?: { url: string; key: string; quality?: 'high' | 'medium' | 'low' } }): Promise<void>;
  /** Battery, free space and heat, for the checks before filming. */
  deviceStatus(): Promise<DeviceStatus>;
  /** Videos left behind when the app closed mid-recording, ready to save (camera must be closed). */
  recoverRecordings(): Promise<{ recordings: RecordingEvent[] }>;
  /** Stops any recording and removes the camera. Emits 'closed'. */
  close(): Promise<void>;
  /** Scoreboard text on the camera screen, e.g. title "Lakers 18 – 16 Waves", subtitle "Set 2". */
  setScoreboard(options: { title?: string; subtitle?: string; status?: string; connected?: boolean }): Promise<void>;
  /** Banner under the scoreboard for a few seconds, e.g. "KILL · #12 Ava". */
  showPlay(options: { text: string }): Promise<void>;
  /** Where the recording is right now (for rally markers). */
  mark(): Promise<{ recording: boolean; positionMs: number }>;
  addListener(eventName: 'recording', listener: (e: RecordingEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'live', listener: (e: LiveEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'closed', listener: () => void): Promise<PluginListenerHandle>;
}

export declare const GameCamera: GameCameraPlugin;
