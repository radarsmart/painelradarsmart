import { IVideoProvider, VideoInput, VideoOutput } from '../../contracts/video';

const REGION = (process.env.REMOTION_AWS_REGION || 'us-east-1') as
  | 'us-east-1'
  | 'us-east-2'
  | 'us-west-2'
  | 'eu-west-1'
  | 'eu-central-1'
  | 'ap-southeast-1'
  | 'ap-southeast-2'
  | 'ap-northeast-1';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 100; // ~5 minutos

export class RemotionLambdaVideoProvider implements IVideoProvider {
  name = 'remotion-lambda';

  async isAvailable(): Promise<boolean> {
    return !!(
      process.env.REMOTION_AWS_ACCESS_KEY_ID &&
      process.env.REMOTION_AWS_SECRET_ACCESS_KEY &&
      process.env.REMOTION_LAMBDA_FUNCTION_NAME &&
      process.env.REMOTION_SERVE_URL
    );
  }

  async compose(input: VideoInput): Promise<VideoOutput> {
    try {
      if (!input.imageUrl || !input.script) {
        throw new Error('Missing imageUrl or script');
      }

      const previewUrl = `${this.getBaseUrl()}/api/ai/video/status?jobId=${encodeURIComponent(input.jobId || 'preview')}`;

      return {
        status: 'success',
        provider: this.name,
        previewUrl,
        duration: input.script.duration,
        dimensions: { width: 1080, height: 1920 },
        metadata: {
          compositionId: 'tiktok-video',
          composedAt: new Date().toISOString(),
          renderEngine: 'remotion-lambda',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
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

      this.configureAwsCredentials();

      // Import dinâmico para não quebrar o bundle quando não há Lambda
      const { renderMediaOnLambda, getRenderProgress } = await import(
        '@remotion/lambda/client'
      );

      const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME!;
      const serveUrl = process.env.REMOTION_SERVE_URL!;
      const duration = Math.max(6, Math.min(Number(input.script.duration) || 10, 60));

      console.log(`[${this.name}] Starting Lambda render for "${input.productName}"`);

      const { renderId, bucketName } = await renderMediaOnLambda({
        region: REGION,
        functionName,
        serveUrl,
        composition: 'tiktok-video',
        codec: 'h264',
        inputProps: {
          imageUrl: input.imageUrl,
          hook: input.script.hook,
          body: input.script.body,
          cta: input.script.cta,
          productName: input.productName,
          duration,
          durationInFrames: Math.ceil(duration * 30),
        },
        imageFormat: 'jpeg',
        jpegQuality: 90,
        maxRetries: 1,
        framesPerLambda: 20,
        privacy: 'public',
        timeoutInMilliseconds: 240000,
      });

      console.log(`[${this.name}] Render started: renderId=${renderId} bucket=${bucketName}`);

      // Polling até completar
      let attempts = 0;
      while (attempts < MAX_POLL_ATTEMPTS) {
        await this.sleep(POLL_INTERVAL_MS);
        attempts++;

        const progress = await getRenderProgress({
          renderId,
          bucketName,
          region: REGION,
          functionName,
        });

        const pct = ((progress.overallProgress ?? 0) * 100).toFixed(1);
        console.log(`[${this.name}] Progress: ${pct}% (attempt ${attempts})`);

        if (progress.fatalErrorEncountered) {
          const errMsg = progress.errors?.[0]?.message || 'Lambda render failed';
          throw new Error(errMsg);
        }

        if (progress.done && progress.outputFile) {
          const videoUrl = progress.outputFile;
          console.log(`[${this.name}] Render complete: ${videoUrl}`);

          return {
            status: 'success',
            provider: this.name,
            videoUrl,
            // Lambda retorna URL S3 pública — não há localFilePath
            duration,
            dimensions: { width: 1080, height: 1920 },
            metadata: {
              renderId,
              bucketName,
              renderedAt: new Date().toISOString(),
              format: 'mp4',
              codec: 'h264',
            },
          };
        }
      }

      throw new Error(`Render timeout after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
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

  private configureAwsCredentials(): void {
    // O SDK da AWS lê as variáveis de ambiente automaticamente,
    // mas garantimos que estão definidas globalmente para o processo
    if (process.env.REMOTION_AWS_ACCESS_KEY_ID) {
      process.env.AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    }
    if (process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
      process.env.AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
    }
    if (process.env.REMOTION_AWS_REGION) {
      process.env.AWS_REGION = process.env.REMOTION_AWS_REGION;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getBaseUrl(): string {
    const url = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
  }
}
