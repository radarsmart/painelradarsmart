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
  model_ids: number[];
  voice_id?: string;
  avatar_id: string;
  webhook_url?: string;
};

export type ScriptPayload = {
  model_id: number;
  model_name: string;
  title: string;
  duration_seconds: number;
  script_audio: string;
  visual_directions: Array<{ timestamp: string; direction: string }>;
  text_overlays: Array<{
    timestamp: string;
    text: string;
    position: "top" | "center" | "bottom";
    style: "bold" | "caption" | "price";
  }>;
  hashtags: string[];
  caption: string;
};

export type BriefingStatus = "pending" | "processing" | "completed" | "partial_failed" | "failed";
export type JobStatus =
  | "pending"
  | "script"
  | "audio"
  | "avatar"
  | "processing"
  | "completed"
  | "failed";
