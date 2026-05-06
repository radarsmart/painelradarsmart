import { IVideoProvider, VideoInput, VideoOutput } from '../../contracts/video';

export class MockVideoProvider implements IVideoProvider {
  name = 'mock';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async compose(input: VideoInput): Promise<VideoOutput> {
    // Simula delay de composição
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      status: 'success',
      provider: this.name,
      previewUrl: `https://via.placeholder.com/1080x1920?text=Preview+${encodeURIComponent(input.productName)}`,
      duration: input.script.duration,
      dimensions: { width: 1080, height: 1920 },
      metadata: {
        mocked: true,
        composedAt: new Date().toISOString(),
      },
    };
  }

  async render(input: VideoInput): Promise<VideoOutput> {
    // Simula delay de render
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      status: 'success',
      provider: this.name,
      videoUrl: `mock://video/${encodeURIComponent(input.productName)}.mp4`,
      duration: input.script.duration,
      dimensions: { width: 1080, height: 1920 },
      metadata: {
        mocked: true,
        renderedAt: new Date().toISOString(),
        format: 'mp4',
      },
    };
  }
}
