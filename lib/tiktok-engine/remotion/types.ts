export type RemotionTemplate =
  | "hook_choque"
  | "comparacao_preco"
  | "storytelling_beneficio"
  // Legado — mantido para briefings antigos
  | "problem_solution"
  | "comparison"
  | "price_duel"
  | "social_proof"
  | "generic";

export type TikTokRemotionInput = {
  template: RemotionTemplate;
  durationInFrames: number;
  fps: number;
  modelId: number;
  productName: string;
  productPrice: string;
  productDiscount?: string;
  productCategory?: string;
  competitorName?: string;
  competitorPrice?: string;
  benefits: string[];
  onScreenText: string[];
  hook: string;
  body: string[];
  cta: string;
  caption: string;
  imageUrls: string[];
  audioUrl: string;
  shopUrl?: string;
  hookVariationIndex?: number;
};
