export interface PublishInput {
  localFilePath?: string;
  videoUrl?: string;
  fileName?: string;
  bucket?: string;
  contentType?: string;
  jobId?: string;
  metadata?: Record<string, unknown>;
}

export interface PublishOutput {
  status: 'success' | 'error';
  provider: string;
  bucket?: string;
  path?: string;
  publicUrl?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}
