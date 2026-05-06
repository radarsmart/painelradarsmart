import { IImageProvider, ImageInput, ImageOutput } from '../../contracts/image';

export class MockImageProvider implements IImageProvider {
  name = 'mock';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(input: ImageInput): Promise<ImageOutput> {
    // Simula delay de API
    await new Promise((resolve) => setTimeout(resolve, 500));

    const prompt = input.sourceImageUrl
      ? '[MOCK] Existing product image selected from input.'
      : `[MOCK] Promo image for ${input.productName}: ${input.description}`;
    const imageUrl = input.sourceImageUrl || `https://via.placeholder.com/1080x1920?text=${encodeURIComponent(input.productName)}`;

    return {
      status: 'success',
      provider: this.name,
      outputUrl: imageUrl,
      prompt,
      dimensions: {
        width: 1080,
        height: 1920,
      },
      metadata: {
        mocked: true,
        selectedExistingImage: Boolean(input.sourceImageUrl),
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
