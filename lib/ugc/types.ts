export type UGCType = "model-a" | "model-b" | "model-c";

export type UGCScript = {
  hook: string;
  body: string;
  cta: string;
  full_text: string;
  tone: string;
  part1?: string;
  part2?: string;
  part3?: string;
};

export type UGCOfferContext = {
  title: string;
  price: number;
  originalPrice?: number;
  marketplace: string;
  category?: string;
  discountPct?: number;
  productUrl: string;
};

export type UGCModelCResponse = {
  success: boolean;
  videoUrl?: string;
  screenshotUrl?: string;
  script: UGCScript;
  error?: string;
};
