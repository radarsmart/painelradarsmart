import { IImageProvider } from '../../contracts/image';
import { OpenAIImageProvider } from './openai';
import { MockImageProvider } from './mock';

export function createImageProvider(type?: string): IImageProvider {
  const providerType = type || process.env.AI_IMAGE_PROVIDER || 'openai';

  switch (providerType) {
    case 'mock':
      return new MockImageProvider();
    case 'openai':
    default:
      return new OpenAIImageProvider();
  }
}

export { OpenAIImageProvider, MockImageProvider };
