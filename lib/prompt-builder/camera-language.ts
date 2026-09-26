// Radar Creative AI - Prompt Builder / Camera Language
//
// Traduz proposito de cena + ritmo em UMA linguagem de camera coerente -
// nunca combina todas as tecnicas ao mesmo tempo (uma cena, um movimento,
// uma lente).

import type { CommercialPace, ScenePurpose } from "@/lib/commercial-director/types";
import type { CameraLens, CameraMovement } from "@/lib/prompt-builder/types";

export type CameraLanguage = {
  camera: CameraMovement;
  lens: CameraLens;
  framing: string;
  movement: string;
  lighting: string;
};

const BASE_LANGUAGE_BY_PURPOSE: Record<ScenePurpose, CameraLanguage> = {
  HOOK: {
    camera: "HANDHELD",
    lens: "WIDE",
    framing: "dynamic close-up, high visual impact",
    movement: "quick handheld energy, fast cut feel",
    lighting: "high contrast, punchy lighting",
  },
  PROBLEM: {
    camera: "STATIC",
    lens: "NORMAL",
    framing: "medium shot, relatable everyday framing",
    movement: "static with a very subtle slow zoom",
    lighting: "natural, neutral tone lighting",
  },
  PRODUCT: {
    camera: "TRACKING",
    lens: "NORMAL",
    framing: "product as the visual hero, centered",
    movement: "smooth tracking motion following the product in use",
    lighting: "key light on the product, warm cinematic lighting",
  },
  BENEFIT: {
    camera: "DOLLY_IN",
    lens: "MACRO",
    framing: "close-up on the key benefit detail",
    movement: "slow dolly-in, shallow depth of field",
    lighting: "soft highlight on the benefit detail",
  },
  PROOF: {
    camera: "STATIC",
    lens: "NORMAL",
    framing: "medium shot, confident and calm framing",
    movement: "static, minimal motion",
    lighting: "natural, trustworthy lighting",
  },
  OFFER: {
    camera: "PAN",
    lens: "NORMAL",
    framing: "clean composition with open space reserved for a price overlay",
    movement: "slow pan, graphic-friendly motion",
    lighting: "high contrast on the product, clean background",
  },
  CTA: {
    camera: "STATIC",
    lens: "PORTRAIT",
    framing: "medium shot with clear space reserved for a call-to-action overlay",
    movement: "static, direct-to-camera feel",
    lighting: "Radar Smart brand lighting, warm gold accent over dark background",
  },
};

function applyPaceAdjustment(language: CameraLanguage, pace: CommercialPace): CameraLanguage {
  if (pace === "CINEMATIC" && language.camera === "HANDHELD") {
    return { ...language, camera: "DOLLY_IN", movement: "slow cinematic push-in" };
  }
  if (pace === "FAST" && language.camera === "STATIC") {
    return { ...language, movement: `${language.movement}, quick pacing` };
  }
  return language;
}

export function resolveCameraLanguage(purpose: ScenePurpose, pace: CommercialPace): CameraLanguage {
  const base = BASE_LANGUAGE_BY_PURPOSE[purpose];
  return applyPaceAdjustment(base, pace);
}
