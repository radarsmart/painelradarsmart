export interface ImageInput {
  productName: string;
  description: string;
  price?: string;
  style?: string;
  sourceImageUrl?: string;
}

export interface ImageOutput {
  status: 'success' | 'error';
  provider: string;
  outputUrl: string;
  prompt: string;
  dimensions: {
    width: number;
    height: number;
  };
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface IImageProvider {
  name: string;
  generate(input: ImageInput): Promise<ImageOutput>;
  isAvailable(): Promise<boolean>;
}
