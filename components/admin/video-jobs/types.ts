export type AiVideoJobEvent = {
  status?: string;
  at?: string;
  detail?: string;
  error?: string | null;
};

export type AiVideoJob = {
  id: string;
  product_name: string | null;
  status: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  status_events: AiVideoJobEvent[];
  original_job_id?: string | null;
  attempt_number?: number | null;
  created_by_email: string | null;
  created_at: string | null;
  updated_at: string | null;
  providers: string[];
  provider: string;
  published_url: string | null;
  last_event: AiVideoJobEvent | null;
  render_seconds: number | null;
};

export type VideoJobsKpis = {
  jobsToday: number;
  published: number;
  failed: number;
  averageRenderSeconds: number | null;
};

export type VideoJobsResponse = {
  jobs: AiVideoJob[];
  kpis: VideoJobsKpis;
  providers: string[];
  total: number;
  error?: string;
};

export type VideoJobFiltersState = {
  search: string;
  status: string;
  provider: string;
  period: string;
  errorOnly: boolean;
};
