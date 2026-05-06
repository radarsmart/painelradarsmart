import { ITextProvider } from '../../contracts/text';
import { OpenAITextProvider } from './openai';
import { MockTextProvider } from './mock';

export function createTextProvider(type?: string): ITextProvider {
  const providerType = type || process.env.AI_TEXT_PROVIDER || 'openai';

  switch (providerType) {
    case 'mock':
      return new MockTextProvider();
    case 'openai':
    default:
      return new OpenAITextProvider();
  }
}

export { OpenAITextProvider, MockTextProvider };
