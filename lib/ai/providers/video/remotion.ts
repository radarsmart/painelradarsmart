import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

import { IVideoProvider, VideoInput, VideoOutput } from '../../contracts/video';

type RemotionBundler = typeof import('@remotion/bundler');
type RemotionRenderer = typeof import('@remotion/renderer');

let bundlePromise: Promise<string> | null = null;

function runtimeRequire<T>(moduleName: string): T {
  const req = eval('require') as NodeRequire;
  return req(moduleName) as T;
}

function sanitizeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 64) || 'video';
}

function getBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  if (configured.startsWith('http://') || configured.startsWith('https://')) return configured;
  return `https://${configured}`;
}

async function getServeUrl(): Promise<string> {
  const { bundle } = runtimeRequire<RemotionBundler>('@remotion/bundler');

  if (!bundlePromise) {
    const projectRoot = process.cwd();
    bundlePromise = bundle({
      entryPoint: path.join(projectRoot, 'remotion', 'root.tsx'),
      webpackOverride: (config) => {
        config.resolve = config.resolve ?? {};
        config.resolve.alias = {
          ...(config.resolve.alias as Record<string, string> | undefined),
          '@': projectRoot,
        };
        return config;
      },
    });
  }

  return bundlePromise;
}

function getFfmpegPath(): string {
  return (
    process.env.FFMPEG_PATH ||
    path.join(process.env.LOCALAPPDATA || '', 'CapCut', 'Apps', '8.1.1.3417', 'ffmpeg.exe') ||
    'ffmpeg'
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath();
    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
    });
  });
}

export class RemotionVideoProvider implements IVideoProvider {
  name = 'remotion';
  private outputDir: string;

  constructor() {
    this.outputDir = process.env.REMOTION_OUTPUT_DIR || path.join(process.cwd(), 'temp', 'videos');
  }

  async isAvailable(): Promise<boolean> {
    try {
      runtimeRequire<RemotionBundler>('@remotion/bundler');
      runtimeRequire<RemotionRenderer>('@remotion/renderer');
      const ffmpegPath = getFfmpegPath();
      if (path.isAbsolute(ffmpegPath) && !(await pathExists(ffmpegPath))) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async compose(input: VideoInput): Promise<VideoOutput> {
    try {
      if (!input.imageUrl || !input.script) {
        throw new Error('Missing imageUrl or script');
      }

      const previewId = input.jobId || `preview-${randomUUID()}`;
      const previewUrl = `${getBaseUrl()}/api/ai/video/status?previewId=${encodeURIComponent(previewId)}`;

      return {
        status: 'success',
        provider: this.name,
        previewUrl,
        duration: input.script.duration,
        dimensions: { width: 1080, height: 1920 },
        metadata: {
          compositionId: 'tiktok-video',
          previewId,
          composedAt: new Date().toISOString(),
          renderEngine: 'remotion',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${this.name}] Composition failed:`, message);

      return {
        status: 'error',
        provider: this.name,
        duration: 0,
        dimensions: { width: 1080, height: 1920 },
        error: message,
      };
    }
  }

  async render(input: VideoInput): Promise<VideoOutput> {
    try {
      if (!input.imageUrl || !input.script) {
        throw new Error('Missing imageUrl or script');
      }

      await fs.mkdir(this.outputDir, { recursive: true });

      const { renderFrames, selectComposition } = runtimeRequire<RemotionRenderer>('@remotion/renderer');
      const serveUrl = await getServeUrl();
      const fps = 30;
      const duration = Math.max(6, Math.min(Number(input.script.duration) || 20, 60));
      const durationInFrames = Math.ceil(duration * fps);
      const videoId = input.jobId || `video-${randomUUID()}`;
      const outputFile = path.join(this.outputDir, `${sanitizeFileName(input.productName)}-${videoId}.mp4`);
      const framesDir = path.join(this.outputDir, `${sanitizeFileName(input.productName)}-${videoId}-frames`);
      const inputProps = {
        imageUrl: input.imageUrl,
        hook: input.script.hook,
        body: input.script.body,
        cta: input.script.cta,
        productName: input.productName,
        duration,
        durationInFrames,
      };

      const composition = await selectComposition({
        serveUrl,
        id: 'tiktok-video',
        inputProps,
      });

      await fs.mkdir(framesDir, { recursive: true });

      await renderFrames({
        composition,
        serveUrl,
        inputProps,
        outputDir: framesDir,
        imageFormat: 'jpeg',
        jpegQuality: 92,
        muted: true,
        onStart: () => undefined,
        onFrameUpdate: () => undefined,
        chromiumOptions: {
          gl: 'swiftshader',
        },
      });

      const framePad = String(durationInFrames - 1).length;
      const framePattern = path.join(framesDir, `element-%0${framePad}d.jpeg`);
      await runFfmpeg([
        '-y',
        '-framerate',
        String(fps),
        '-i',
        framePattern,
        '-t',
        String(duration),
        '-c:v',
        'mpeg4',
        '-q:v',
        '4',
        '-r',
        String(fps),
        '-pix_fmt',
        'yuv420p',
        outputFile,
      ]);

      await fs.rm(framesDir, { recursive: true, force: true });

      if (!(await pathExists(outputFile))) {
        throw new Error('FFmpeg did not produce an output file.');
      }

      return {
        status: 'success',
        provider: this.name,
        videoUrl: outputFile,
        localFilePath: outputFile,
        duration,
        dimensions: { width: 1080, height: 1920 },
        metadata: {
          videoId,
          compositionId: 'tiktok-video',
          renderedAt: new Date().toISOString(),
          format: 'mp4',
          codec: 'mpeg4',
          outputFile,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${this.name}] Render failed:`, message);

      return {
        status: 'error',
        provider: this.name,
        duration: 0,
        dimensions: { width: 1080, height: 1920 },
        error: message,
      };
    }
  }
}
