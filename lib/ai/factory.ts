import { ImageInput, ImageOutput } from './contracts/image';
import { TextInput, TextOutput } from './contracts/text';
import { VideoInput, VideoOutput } from './contracts/video';
import { getRegistry } from './registry';

export interface FactoryOptions {
  retryOnFailure?: boolean;
  logAttempts?: boolean;
}

type ProviderLike = {
  name: string;
  isAvailable(): Promise<boolean>;
};

export class AIFactory {
  private static readonly defaultOptions: FactoryOptions = {
    retryOnFailure: true,
    logAttempts: true,
  };

  static async generateImage(input: ImageInput, options?: FactoryOptions): Promise<ImageOutput> {
    const opts = { ...this.defaultOptions, ...options };
    const providers = getRegistry().getImageProviders();

    return this.executeWithFallback(
      providers,
      (provider) => provider.generate(input),
      'Image',
      opts,
      (message) => ({
        status: 'error',
        provider: 'none',
        outputUrl: '',
        prompt: '',
        dimensions: { width: 1080, height: 1920 },
        error: message,
      })
    );
  }

  static async generateText(input: TextInput, options?: FactoryOptions): Promise<TextOutput> {
    const opts = { ...this.defaultOptions, ...options };
    const providers = getRegistry().getTextProviders();

    return this.executeWithFallback(
      providers,
      (provider) => provider.generate(input),
      'Text',
      opts,
      (message) => ({
        status: 'error',
        provider: 'none',
        hook: '',
        body: '',
        cta: '',
        duration: 0,
        variations: [],
        scenes: [],
        error: message,
      })
    );
  }

  static async composeVideo(input: VideoInput, options?: FactoryOptions): Promise<VideoOutput> {
    const opts = { ...this.defaultOptions, ...options };
    const providers = getRegistry().getVideoProviders();

    return this.executeWithFallback(
      providers,
      (provider) => provider.compose(input),
      'Video Compose',
      opts,
      (message) => ({
        status: 'error',
        provider: 'none',
        duration: 0,
        dimensions: { width: 1080, height: 1920 },
        error: message,
      })
    );
  }

  static async renderVideo(input: VideoInput, options?: FactoryOptions): Promise<VideoOutput> {
    const opts = { ...this.defaultOptions, ...options };
    const providers = getRegistry().getVideoProviders();

    return this.executeWithFallback(
      providers,
      (provider) => provider.render(input),
      'Video Render',
      opts,
      (message) => ({
        status: 'error',
        provider: 'none',
        duration: 0,
        dimensions: { width: 1080, height: 1920 },
        error: message,
      })
    );
  }

  private static async executeWithFallback<T extends ProviderLike, R extends { status: 'success' | 'error'; error?: string }>(
    providers: T[],
    execute: (provider: T) => Promise<R>,
    operationName: string,
    options: FactoryOptions,
    createErrorResult: (message: string) => R
  ): Promise<R> {
    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        if (options.logAttempts) {
          console.log(`[AIFactory] Attempting ${operationName} with ${provider.name}`);
        }

        const available = await provider.isAvailable();
        if (!available) {
          lastError = new Error(`${provider.name} is not available`);
          if (options.logAttempts) {
            console.warn(`[AIFactory] ${operationName} skipped: ${lastError.message}`);
          }
          continue;
        }

        const result = await execute(provider);

        if (result.status === 'success') {
          if (options.logAttempts) {
            console.log(`[AIFactory] ${operationName} succeeded with ${provider.name}`);
          }
          return result;
        }

        if (options.logAttempts) {
          console.warn(
            `[AIFactory] ${operationName} failed with ${provider.name}: ${result.error}`
          );
        }

        lastError = new Error(result.error || `Unknown error with ${provider.name}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (options.logAttempts) {
          console.warn(`[AIFactory] ${operationName} exception: ${lastError.message}`);
        }

        if (!options.retryOnFailure) {
          throw lastError;
        }
      }
    }

    return createErrorResult(lastError?.message || `All ${operationName} providers failed`);
  }
}
