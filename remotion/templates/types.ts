/**
 * Video composition schema
 */
export interface VideoSchema {
  imageUrl: string;
  hook: string;
  body: string;
  cta: string;
  productName: string;
  duration?: number; // in seconds
}

/**
 * Render options for Remotion
 */
export interface RemotionRenderOptions {
  codec?: 'h264' | 'h265' | 'prores' | 'vp8' | 'vp9';
  pixelFormat?: 'yuv420' | 'yuv422' | 'yuv444';
  audioBitrate?: string;
  videoBitrate?: string;
  concurrency?: number;
  outputLocation?: string;
}

/**
 * Render progress callback
 */
export interface RenderProgress {
  progress: number; // 0-1
  phase: 'init' | 'encoding' | 'done';
  durationMs?: number;
  framesRendered?: number;
}
