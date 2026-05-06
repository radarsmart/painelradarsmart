import { IImageProvider, ImageInput, ImageOutput } from '../../contracts/image';

export class OpenAIImageProvider implements IImageProvider {
  name = 'openai';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async generate(input: ImageInput): Promise<ImageOutput> {
    if (!this.apiKey) {
      return {
        status: 'error',
        provider: this.name,
        outputUrl: '',
        prompt: '',
        dimensions: { width: 1080, height: 1920 },
        error: 'OpenAI API key not configured',
      };
    }

    try {
      if (input.sourceImageUrl) {
        return {
          status: 'success',
          provider: this.name,
          outputUrl: input.sourceImageUrl,
          prompt: 'Existing product image selected from input.',
          dimensions: { width: 1080, height: 1920 },
          metadata: {
            selectedExistingImage: true,
          },
        };
      }

      const prompt = [
        'Create a vertical 9:16 product image for a short TikTok creative for Radar Smart.',
        `Product: ${input.productName}.`,
        `Description: ${input.description}.`,
        input.price ? `Price context: ${input.price}.` : '',
        `Style: ${input.style || 'clean, high-contrast, premium retail, dark navy background with gold accents'}.`,
        'Show the product early and clearly. Do not mention or show any marketplace brand.',
      ].filter(Boolean).join(' ');

      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          size: '1024x1792',
          quality: 'standard',
          n: 1,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const imageUrl = data.data?.[0]?.url;

      if (!imageUrl) {
        throw new Error('No image URL in response');
      }

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
          model: 'dall-e-3',
          size: '1024x1792',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${this.name}] Image generation failed:`, message);

      return {
        status: 'error',
        provider: this.name,
        outputUrl: '',
        prompt: '',
        dimensions: { width: 1080, height: 1920 },
        error: message,
      };
    }
  }
}
