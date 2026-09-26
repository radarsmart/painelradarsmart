// Radar Creative AI - Prompt Builder / Types
//
// O Prompt Builder so CONSTROI prompts estruturados por cena - nunca
// chama provider, nunca gera midia. Prompts (positivo/negativo) sao
// escritos em INGLES de proposito (e o idioma que a maioria dos
// providers de imagem/video entende melhor); o resto do produto
// continua em portugues.

import type {
  CharacterExpression,
  CharacterPose,
  CharacterShot,
  CharacterCameraAngle,
} from "@/lib/brand-character/character-types";
import type {
  CommercialDirection,
  CommercialPace,
  ScenePurpose,
  VisualStyle,
} from "@/lib/commercial-director/types";
import type { ProductIntegrityMode, ProductIntegrityRisk } from "@/lib/prompt-builder/product-integrity-mode";
import type { ProductFidelityRequirement } from "@/lib/prompt-builder/product-fidelity-requirement";

export type SceneMediaType =
  | "IMAGE"
  | "IMAGE_TO_VIDEO"
  | "TEXT_TO_VIDEO"
  | "PRODUCT_VIDEO"
  | "CHARACTER_VIDEO";

export type CameraMovement =
  | "STATIC"
  | "DOLLY_IN"
  | "DOLLY_OUT"
  | "PAN"
  | "TILT"
  | "ORBIT"
  | "HANDHELD"
  | "TRACKING"
  | "MACRO"
  | "PRODUCT_360";

export type CameraLens = "WIDE" | "NORMAL" | "PORTRAIT" | "MACRO" | "ANAMORPHIC";

export type SafeAreaDirection = "LEFT" | "RIGHT" | "TOP" | "BOTTOM" | "CENTER_CLEAR" | "NONE";

export type Platform = "TIKTOK" | "INSTAGRAM_REELS" | "META_ADS";

export type ProviderHints = {
  requiresIdentityReference: boolean;
  requiresProductReference: boolean;
  preferredMode: string;
  motionStrength: "low" | "medium" | "high";
};

// Elementos textuais que NUNCA devem ser pedidos ao modelo generativo -
// entram depois via compositor (FFmpeg/Remotion), nunca no prompt visual.
export type OverlayInstructions = {
  priceText: string | null;
  discountText: string | null;
  ctaText: string | null;
};

export type SceneGenerationPrompt = {
  sceneId: string;
  sceneOrder: number;
  purpose: ScenePurpose;

  mediaType: SceneMediaType;
  durationSeconds: number;
  aspectRatio: string;
  platform: Platform;

  subject: string;
  environment: string;
  action: string;

  character: string | null;
  product: string;

  camera: CameraMovement;
  lens: CameraLens;
  framing: string;
  movement: string;
  lighting: string;

  visualStyle: VisualStyle;
  pace: CommercialPace;

  expression: CharacterExpression | null;
  pose: CharacterPose | null;
  shot: CharacterShot | null;
  cameraAngle: CharacterCameraAngle | null;
  outfit: string | null;

  // Nunca aponta pra uma imagem gerada - so referencias JA existentes
  // (Character Pack / futura foto real do produto).
  identityReferenceAssetId: string | null;
  supportReferenceAssetId: string | null;
  productReferenceUrl: string | null;

  textOverlay: string | null;
  voiceoverIntent: string;
  sfxIntent: string | null;

  // positivePrompt == "generatedVisualPrompt" da especificacao - nomeado
  // positivePrompt pra casar com o campo pareado negativePrompt.
  positivePrompt: string;
  negativePrompt: string;

  overlayInstructions: OverlayInstructions;
  safeAreaDirection: SafeAreaDirection;
  brandOverlayRequired: boolean;
  brandAssetId: string | null;

  // Aprendizado do canary real da scene-3 (Creatina, 2026-08-08): risco
  // de perda de integridade visual do produto (embalagem/rotulo) e o
  // que fazemos a respeito - ver product-integrity-mode.ts. Classificacao
  // generica, nunca especifica de um produto.
  productIntegrityRisk: ProductIntegrityRisk;
  productIntegrityMode: ProductIntegrityMode;

  // Subject-Aware Capability Routing V1 (aprendizado do CREATIVE V2 HOOK
  // CANARY real, Kokeshi, 2026-08-10) - ver product-fidelity-requirement.ts.
  // Decide se mediaType/capability desta cena PRECISAM aceitar uma
  // referencia real de produto, independente de ScenePurpose sozinho.
  productFidelityRequirement: ProductFidelityRequirement;

  providerHints: ProviderHints;
};

export type CampaignPromptPlan = {
  campaignId: string;
  commercialDirection: CommercialDirection;
  scenes: SceneGenerationPrompt[];
};
