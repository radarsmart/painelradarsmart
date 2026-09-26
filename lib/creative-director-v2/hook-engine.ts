// Radar Creative AI - Creative Director V2 / Hook Engine
//
// Avalia a forca do HOOK (primeiros 1-2s) de forma estruturada. Regra do
// briefing: hook nunca pode ser so "background bonito"/"cena vazia" - precisa
// de pelo menos um sinal forte (produto em destaque, transformacao visual,
// movimento forte, apresentadora com fala direta, numero/preco real,
// contraste antes/depois, curiosidade visual, beneficio principal). Puro,
// deterministico, opera so sobre campos que ja existem em CommercialScene/
// CommercialDirection - nao inventa dado novo.

import type { CommercialDirection, CommercialScene } from "@/lib/commercial-director/types";
import type { HookStrengthEvaluation, HookSubScore } from "@/lib/creative-director-v2/types";

export const HOOK_STRENGTH_MIN_SCORE = 55;

const STRONG_CONTRAST_HOOKS = new Set(["PRICE_SHOCK", "TRANSFORMATION", "COMPARISON"]);
const MEDIUM_CONTRAST_HOOKS = new Set(["VISUAL_PROBLEM", "DEMONSTRATION"]);
const CURIOSITY_HOOKS = new Set(["CURIOSITY", "DISCOVERY", "QUESTION"]);

function scoreImmediateSubjectPresence(scene: CommercialScene): HookSubScore {
  if (scene.characterDirection !== null) {
    return { score: 90, reason: "apresentadora presente na cena, com fala direta (voiceoverIntent)" };
  }
  if (scene.productAction && scene.productAction !== "produto em segundo plano ou destaque grafico") {
    return { score: 65, reason: "produto em acao clara logo no gancho" };
  }
  return { score: 30, reason: "sujeito da cena nao esta claramente em destaque (produto em segundo plano)" };
}

function scoreVisualContrast(direction: CommercialDirection): HookSubScore {
  if (STRONG_CONTRAST_HOOKS.has(direction.hookStrategy)) {
    return { score: 90, reason: `hookStrategy "${direction.hookStrategy}" gera contraste visual forte` };
  }
  if (MEDIUM_CONTRAST_HOOKS.has(direction.hookStrategy)) {
    return { score: 70, reason: `hookStrategy "${direction.hookStrategy}" gera contraste visual moderado` };
  }
  if (direction.hookStrategy === "BENEFIT_FIRST") {
    return { score: 40, reason: "BENEFIT_FIRST e o fallback mais fraco de hookStrategy (documentado em hook-selector.ts)" };
  }
  return { score: 55, reason: `hookStrategy "${direction.hookStrategy}" tem contraste visual mediano` };
}

function scoreMotionIntensity(scene: CommercialScene): HookSubScore {
  const motion = scene.motion.toLowerCase();
  if (motion.includes("rapido") || motion.includes("dinamico") || motion.includes("choque")) {
    return { score: 85, reason: `motion "${scene.motion}" indica movimento forte` };
  }
  if (motion.includes("zoom") || motion.includes("estatico com")) {
    return { score: 55, reason: `motion "${scene.motion}" indica movimento moderado` };
  }
  return { score: 35, reason: `motion "${scene.motion}" nao indica movimento relevante` };
}

function scoreCuriosity(direction: CommercialDirection): HookSubScore {
  if (CURIOSITY_HOOKS.has(direction.hookStrategy)) {
    return { score: 90, reason: `hookStrategy "${direction.hookStrategy}" e desenhado pra gerar curiosidade` };
  }
  if (direction.hookStrategy === "TRANSFORMATION" || direction.hookStrategy === "COMPARISON") {
    return { score: 60, reason: `hookStrategy "${direction.hookStrategy}" gera curiosidade moderada` };
  }
  return { score: 40, reason: `hookStrategy "${direction.hookStrategy}" nao e centrado em curiosidade` };
}

function scoreMessageClarity(scene: CommercialScene): HookSubScore {
  if (scene.textOverlay !== null) {
    return { score: 80, reason: "ha overlay de texto reforcando a mensagem do gancho" };
  }
  if (scene.voiceoverIntent.length > 20) {
    return { score: 55, reason: "voiceoverIntent tem direcao clara mesmo sem overlay" };
  }
  return { score: 30, reason: "sem overlay de texto e sem direcao de voiceover clara" };
}

function scoreMobileReadability(scene: CommercialScene): HookSubScore {
  const hasCloseCamera = scene.camera.toLowerCase().includes("close");
  if (scene.textOverlay !== null && hasCloseCamera) {
    return { score: 85, reason: "overlay de texto + camera em close - leitura confortavel em tela pequena" };
  }
  if (scene.textOverlay !== null || hasCloseCamera) {
    return { score: 55, reason: "apenas um dos dois sinais de leitura mobile presente (overlay ou close-up)" };
  }
  return { score: 30, reason: "sem overlay de texto nem enquadramento em close - risco de baixa legibilidade mobile" };
}

export function evaluateHookStrength(hookScene: CommercialScene, direction: CommercialDirection): HookStrengthEvaluation {
  const immediateSubjectPresence = scoreImmediateSubjectPresence(hookScene);
  const visualContrast = scoreVisualContrast(direction);
  const motionIntensity = scoreMotionIntensity(hookScene);
  const curiosity = scoreCuriosity(direction);
  const messageClarity = scoreMessageClarity(hookScene);
  const mobileReadability = scoreMobileReadability(hookScene);

  const subScores = [immediateSubjectPresence, visualContrast, motionIntensity, curiosity, messageClarity, mobileReadability];
  const overallScore = Math.round(subScores.reduce((sum, s) => sum + s.score, 0) / subScores.length);

  const weakSignals = [
    ["immediateSubjectPresence", immediateSubjectPresence] as const,
    ["visualContrast", visualContrast] as const,
    ["motionIntensity", motionIntensity] as const,
    ["curiosity", curiosity] as const,
    ["messageClarity", messageClarity] as const,
    ["mobileReadability", mobileReadability] as const,
  ]
    .filter(([, s]) => s.score < 50)
    .map(([name, s]) => `${name}: ${s.reason}`);

  return {
    immediateSubjectPresence,
    visualContrast,
    motionIntensity,
    curiosity,
    messageClarity,
    mobileReadability,
    overallScore,
    passesMinimum: overallScore >= HOOK_STRENGTH_MIN_SCORE,
    weakSignals,
  };
}
