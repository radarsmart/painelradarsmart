export type TikTokGenerateRequest = {
  product_name: string;
  product_price: string;
  product_discount?: string;
  product_category?: string;
  product_benefits: string;
  product_pain: string;
  competitor_name?: string;
  competitor_price?: string;
  shop_url?: string;
  product_image_urls?: string[];
  model_ids: number[];
  /** Quantas variações de hook gerar por modelo. Default: 1. Máx: 5. */
  hook_count?: number;
  voice_id?: string;
  avatar_id?: string;
  video_provider?: "remotion" | "heygen";
  webhook_url?: string;
};

export type ScriptPayload = {
  title: string;
  hook: string;
  body: string[];
  cta: string;
  caption: string;
  on_screen_text: string[];
  duration_target_seconds: number;
};

export type BriefingStatus = "pending" | "processing" | "completed" | "partial_failed" | "failed";
export type JobStatus =
  | "pending"
  | "script_generating"
  | "script_done"
  | "script_failed"
  | "script"
  | "audio"
  | "avatar"
  | "processing"
  | "rendering_video"
  | "video_uploading"
  | "video_submitted"
  | "video_rendering"
  | "completed"
  | "failed";

export type JobLogStep = {
  step: string;
  detail: string;
  ok: boolean;
  ts: string; // ISO timestamp
};
