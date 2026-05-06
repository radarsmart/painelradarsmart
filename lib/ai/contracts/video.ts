export interface VideoInput {
  imageUrl: string;
  script: {
    hook: string;
    body: string;
    cta: string;
    duration: number;
  };
  productName: string;
  style?: string;
  templateId?: string;
  jobId?: string;
}

export interface VideoOutput {
  status: 'success' | 'error';
  provider: string;
  videoUrl?: string;
  previewUrl?: string;
  localFilePath?: string;
  duration: number;
  dimensions: {
    width: number;
    height: number;
  };
  storage?: {
    bucket: string;
    path: string;
    publicUrl?: string;
  };
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface IVideoProvider {
  name: string;
  compose(input: VideoInput): Promise<VideoOutput>;
  render(input: VideoInput): Promise<VideoOutput>;
  isAvailable(): Promise<boolean>;
}
