import { IImageProvider } from './contracts/image';
import { ITextProvider } from './contracts/text';
import { IVideoProvider } from './contracts/video';
import { createImageProvider } from './providers/image';
import { createTextProvider } from './providers/text';
import { createVideoProvider } from './providers/video';

export interface ProviderRegistry {
  image: IImageProvider[];
  text: ITextProvider[];
  video: IVideoProvider[];
}

export class AIRegistry {
  private static instance: AIRegistry;
  private registry: ProviderRegistry;

  private constructor() {
    this.registry = {
      image: this.initializeImageProviders(),
      text: this.initializeTextProviders(),
      video: this.initializeVideoProviders(),
    };
  }

  static getInstance(): AIRegistry {
    if (!AIRegistry.instance) {
      AIRegistry.instance = new AIRegistry();
    }
    return AIRegistry.instance;
  }

  private initializeImageProviders(): IImageProvider[] {
    const primary = createImageProvider(process.env.AI_IMAGE_PROVIDER);
    const fallback = createImageProvider('mock');
    return [primary, fallback];
  }

  private initializeTextProviders(): ITextProvider[] {
    const primary = createTextProvider(process.env.AI_TEXT_PROVIDER);
    const fallback = createTextProvider('mock');
    return [primary, fallback];
  }

  private initializeVideoProviders(): IVideoProvider[] {
    const primary = createVideoProvider(process.env.AI_VIDEO_PROVIDER);
    const fallback = createVideoProvider('mock');
    return [primary, fallback];
  }

  getImageProviders(): IImageProvider[] {
    return this.registry.image;
  }

  getTextProviders(): ITextProvider[] {
    return this.registry.text;
  }

  getVideoProviders(): IVideoProvider[] {
    return this.registry.video;
  }

  registerImageProvider(provider: IImageProvider, priority: number = 0): void {
    if (priority === 0) {
      this.registry.image.unshift(provider);
    } else {
      this.registry.image.push(provider);
    }
  }

  registerTextProvider(provider: ITextProvider, priority: number = 0): void {
    if (priority === 0) {
      this.registry.text.unshift(provider);
    } else {
      this.registry.text.push(provider);
    }
  }

  registerVideoProvider(provider: IVideoProvider, priority: number = 0): void {
    if (priority === 0) {
      this.registry.video.unshift(provider);
    } else {
      this.registry.video.push(provider);
    }
  }
}

export function getRegistry(): AIRegistry {
  return AIRegistry.getInstance();
}
