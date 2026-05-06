export interface TextInput {
  productName: string;
  description: string;
  price?: string;
  targetAudience?: string;
  platform?: 'tiktok' | 'reels' | 'shorts' | 'generic';
  durationSeconds?: number;
}

export interface TextScene {
  index: number;
  startSecond: number;
  endSecond: number;
  visual: string;
  overlayText: string;
}

export interface TextOutput {
  status: 'success' | 'error';
  provider: string;
  hook: string;
  body: string;
  cta: string;
  duration: number;
  variations: string[];
  scenes: TextScene[];
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface ITextProvider {
  name: string;
  generate(input: TextInput): Promise<TextOutput>;
  isAvailable(): Promise<boolean>;
}
