// Radar Creative AI - Commercial Director / Types
//
// O Commercial Director NAO gera prompt nem midia - ele decide, de forma
// estruturada e deterministica (sem LLM), a direcao publicitaria completa
// de uma campanha antes do Prompt Builder existir.

import type {
  CharacterExpression,
  CharacterPose,
  CharacterShot,
} from "@/lib/brand-character/character-types";

export type CommercialObjective =
  | "CONVERSION"
  | "TRAFFIC"
  | "DISCOVERY"
  | "ENGAGEMENT"
  | "RETARGETING";

export type SellingArgument =
  | "PRICE"
  | "DISCOUNT"
  | "SAVINGS"
  | "PRACTICAL_BENEFIT"
  | "EMOTIONAL_BENEFIT"
  | "DEMONSTRATION"
  | "SOCIAL_PROOF"
  | "CONVENIENCE"
  | "EXCLUSIVITY"
  | "URGENCY";

export type HookStrategy =
  | "PRICE_SHOCK"
  | "VISUAL_PROBLEM"
  | "CURIOSITY"
  | "DEMONSTRATION"
  | "TRANSFORMATION"
  | "SOCIAL_PROOF"
  | "DISCOVERY"
  | "BENEFIT_FIRST"
  | "QUESTION"
  | "COMPARISON";

export type StoryStructure =
  | "DIRECT_OFFER"
  | "PROBLEM_SOLUTION"
  | "DEMONSTRATION"
  | "REVIEW"
  | "STORYTELLING"
  | "COMPARISON"
  | "UGC"
  | "DISCOVERY";

export type CommercialPace = "FAST" | "MEDIUM" | "CINEMATIC";

export type VisualStyle =
  | "PREMIUM_COMMERCIAL"
  | "UGC_NATIVE"
  | "PRODUCT_HERO"
  | "LIFESTYLE"
  | "LUXURY"
  | "TECH"
  | "BEAUTY"
  | "FITNESS"
  | "HOME_DEMO";

export type PresenterStrategy =
  | "GAROTA_RADAR_FULL"
  | "GAROTA_RADAR_HOOK_ONLY"
  | "GAROTA_RADAR_CTA_ONLY"
  | "GAROTA_RADAR_RECOMMENDATION"
  | "PRODUCT_ONLY"
  | "UGC_PERSONA";

export type ProofStrategy =
  | "NONE"
  | "RATING"
  | "SALES_COUNT"
  | "MARKETPLACE_TRUST"
  | "BEFORE_AFTER"
  | "DEMONSTRATION"
  | "TESTIMONIAL_STYLE";

export type PriceRevealTiming =
  | "SHOW_PRICE_EARLY"
  | "SHOW_PRICE_MIDDLE"
  | "SHOW_PRICE_LATE"
  | "HIDE_PRICE";

export type TextOverlayStrategy =
  | "MINIMAL"
  | "PRICE_FOCUSED"
  | "BENEFIT_FOCUSED"
  | "SOCIAL_PROOF"
  | "NO_TEXT";

export type ScenePurpose =
  | "HOOK"
  | "PROBLEM"
  | "PRODUCT"
  | "BENEFIT"
  | "PROOF"
  | "OFFER"
  | "CTA";

export type OfferStrategy = {
  currentPrice: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  savingsAmount: number | null;
  priceReveal: PriceRevealTiming;
};

export type CtaStrategy = {
  ctaText: string;
  ctaVisual: string;
  ctaPresenter: PresenterStrategy;
  ctaUrgency: "LOW" | "MEDIUM" | "HIGH";
};

export type AudioDirection = {
  musicMood: string;
  musicEnergy: "LOW" | "MEDIUM" | "HIGH";
  voiceStyle: string;
  sfxStyle: string | null;
};

export type CommercialSceneCharacterDirection = {
  expression: CharacterExpression;
  pose: CharacterPose;
  shot: CharacterShot;
};

// Reaproveita PresenterStrategy no nivel de cena, mas so com os 2 valores
// que fazem sentido pra "quem esta na tela AGORA": GAROTA_RADAR_FULL
// (ela aparece nesta cena) ou PRODUCT_ONLY (so o produto). A riqueza de
// HOOK_ONLY/CTA_ONLY/RECOMMENDATION vive no presenterStrategy GERAL da
// campanha - o scene planner traduz isso pra presenca concreta por cena.
export type ScenePresenter = "GAROTA_RADAR_FULL" | "PRODUCT_ONLY" | "UGC_PERSONA";

export type CommercialScene = {
  id: string;
  order: number;
  startSecond: number;
  endSecond: number;
  purpose: ScenePurpose;
  visualSubject: string;
  presenter: ScenePresenter;
  productAction: string;
  characterDirection: CommercialSceneCharacterDirection | null;
  identityReferenceAssetId: string | null;
  supportReferenceAssetId: string | null;
  camera: string;
  motion: string;
  lighting: string;
  textOverlay: string | null;
  voiceoverIntent: string;
  sfxIntent: string | null;
  transitionIntent: string;
};

export type CommercialDirection = {
  objective: CommercialObjective;
  durationSeconds: number;
  sellingArgument: SellingArgument;
  hookStrategy: HookStrategy;
  storyStructure: StoryStructure;
  pace: CommercialPace;
  visualStyle: VisualStyle;
  proofStrategy: ProofStrategy;
  offerStrategy: OfferStrategy;
  ctaStrategy: CtaStrategy;
  presenterStrategy: PresenterStrategy;
  sceneCount: number;
  audioDirection: AudioDirection;
  textOverlayStrategy: TextOverlayStrategy;
  scenes: CommercialScene[];
  reasoningSummary: string;
};

// Entrada do director - ja e o resultado consolidado de Product
// Intelligence + Creative Brain, nao dados crus.
export type CommercialDirectorInput = {
  offerId: string;
  productTitle: string;
  category: string;
  discountPct: number | null;
  price: number | null;
  originalPrice: number | null;
  rating: number | null;
  reviewsCount: number | null;
  marketplace: string | null;
  primaryPain: string;
  primaryDesire: string;
  primaryObjection: string;
  purchaseMotivation: string;
  frameworkSlug: string;
  angleSlug: string;
  // null quando a persona selecionada pelo Creative Brain NAO e a
  // personagem oficial - o Commercial Director nunca forca a Garota Radar
  // a entrar numa campanha que o Creative Brain nao escolheu ela.
  officialCharacterSlug: string | null;
};
