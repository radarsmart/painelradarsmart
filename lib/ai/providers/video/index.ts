import { IVideoProvider } from '../../contracts/video';
import { RemotionVideoProvider } from './remotion';
import { MockVideoProvider } from './mock';

export function createVideoProvider(type?: string): IVideoProvider {
  const providerType = type || process.env.AI_VIDEO_PROVIDER || 'remotion';

  switch (providerType) {
    case 'mock':
      return new MockVideoProvider();
    case 'remotion':
    default:
      return new RemotionVideoProvider();
  }
}

export { RemotionVideoProvider, MockVideoProvider };
