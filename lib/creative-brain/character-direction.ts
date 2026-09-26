// Radar Creative AI - Creative Brain / Character Direction
//
// Regras deterministicas (sem LLM) que decidem expressao/pose/enquadramento
// da Garota Radar de acordo com o framework escolhido. Centralizadas aqui
// de proposito - ajustar a direcao de um framework e so editar o mapa
// abaixo, sem mexer no orchestrator.
//
// Mapeamento conceito -> slug real de ugc_templates (mesmo mapeamento ja
// documentado em lib/creative-brain/framework-selector.ts):
//   OFERTA DIRETA  -> oferta-direta
//   REVIEW         -> review-curto
//   DEMONSTRACAO   -> demonstracao-curta
//   STORYTELLING   -> grupo-secreto

import type {
  CharacterExpression,
  CharacterPose,
  CharacterShot,
} from "@/lib/brand-character/character-types";
import type { CharacterPreset } from "@/lib/creative-brain/character-presets";
import type { PresenterMode } from "@/lib/creative-brain/presenter-mode";

export type CharacterDirection = {
  characterSlug: string;
  presenterMode: PresenterMode;
  preset: CharacterPreset;
  expression: CharacterExpression;
  pose: CharacterPose;
  shot: CharacterShot;
  // Ainda nao ha regra determinada para estes 3 por framework - ficam
  // null nesta fase (nao inventar valor sem criterio definido).
  cameraAngle: null;
  outfit: null;
  environment: null;
};

type FrameworkCharacterRule = {
  expression: CharacterExpression;
  pose: CharacterPose;
  shot: CharacterShot;
};

const FRAMEWORK_CHARACTER_RULES: Record<string, FrameworkCharacterRule> = {
  "oferta-direta": { expression: "EXCITED", pose: "POINTING", shot: "HALF_BODY" },
  "review-curto": { expression: "CONFIDENT", pose: "PRESENTING", shot: "HALF_BODY" },
  "demonstracao-curta": { expression: "SMILING", pose: "PRESENTING", shot: "THREE_QUARTER_BODY" },
  "grupo-secreto": { expression: "HAPPY", pose: "NEUTRAL", shot: "HALF_BODY" },
};

// Fallback para frameworks sem regra especifica ainda (ex: comparacao-preco).
const DEFAULT_CHARACTER_RULE: FrameworkCharacterRule = {
  expression: "SMILING",
  pose: "NEUTRAL",
  shot: "HALF_BODY",
};

export function resolveCharacterDirection(
  frameworkSlug: string,
  characterSlug: string,
  preset: CharacterPreset,
  presenterMode: PresenterMode,
): CharacterDirection {
  const rule = FRAMEWORK_CHARACTER_RULES[frameworkSlug] ?? DEFAULT_CHARACTER_RULE;

  return {
    characterSlug,
    presenterMode,
    preset,
    expression: rule.expression,
    pose: rule.pose,
    shot: rule.shot,
    cameraAngle: null,
    outfit: null,
    environment: null,
  };
}
