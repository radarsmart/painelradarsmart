import { IVideoProvider } from '../../contracts/video';
import { RemotionVideoProvider } from './remotion';
import { RemotionLambdaVideoProvider } from './remotion-lambda';
import { MockVideoProvider } from './mock';

export function createVideoProvider(type?: string): IVideoProvider {
  const providerType = type || process.env.AI_VIDEO_PROVIDER || 'remotion';

  switch (providerType) {
    case 'mock':
      return new MockVideoProvider();
    case 'remotion-lambda':
      return new RemotionLambdaVideoProvider();
    case 'remotion':
    default:
      return new RemotionVideoProvider();
  }
}

export { RemotionVideoProvider, RemotionLambdaVideoProvider, MockVideoProvider };
