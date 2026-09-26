// Radar Creative AI - Creative Director V2 / Validation / Hook Audit
//
// NAO repontua o hook (isso e evaluateHookStrength(), ja calculado). So
// anota CADA subscore ja existente com a evidencia bruta que o gerou e uma
// sugestao de melhoria quando o score e fraco (<70) - puramente informativo,
// para responder "65/100 realmente representa um hook comercial forte?" com
// dado auditavel, nao so o numero.

import type { CommercialDirection, CommercialScene } from "@/lib/commercial-director/types";
import type { HookStrengthEvaluation } from "@/lib/creative-director-v2/types";
import type { HookAudit, HookSubscoreAudit } from "@/lib/creative-director-v2/validation/types";

const IMPROVEMENT_THRESHOLD = 70;

const POSSIBLE_IMPROVEMENTS: Record<string, string> = {
  immediateSubjectPresence: "considerar permitir um elemento de produto/texto mais explicito no HOOK mesmo quando PRODUCT_ONLY (sem apresentadora oficial selecionada).",
  visualContrast: "hookStrategy atual tende a contraste fraco (ex.: fallback BENEFIT_FIRST) - avaliar se ha sinal real disponivel (desconto/transformacao) que justificaria outra estrategia.",
  motionIntensity: "o motion do HOOK hoje e fixo por purpose (PURPOSE_STAGING.HOOK.motion em scene-planner.ts), independente do hookStrategy - considerar variar conforme a estrategia escolhida.",
  curiosity: "hookStrategy atual nao e centrado em curiosidade - avaliar se CURIOSITY/DISCOVERY/QUESTION serviria melhor para esta campanha.",
  messageClarity: "considerar sempre incluir overlay de texto no HOOK, nao so quando textOverlayStrategy (MINIMAL/NO_TEXT) permite.",
  mobileReadability: "combinar overlay de texto com camera em close-up no HOOK reforca legibilidade mobile - hoje so um dos dois sinais esta presente.",
};

function buildSubscore(name: keyof HookStrengthEvaluation & string, evaluation: HookStrengthEvaluation, evidence: string): HookSubscoreAudit {
  const sub = evaluation[name] as { score: number; reason: string };
  return {
    name,
    score: sub.score,
    reason: sub.reason,
    evidence,
    possibleImprovement: sub.score < IMPROVEMENT_THRESHOLD ? POSSIBLE_IMPROVEMENTS[name] ?? null : null,
  };
}

export function auditHookStrength(hookScene: CommercialScene, direction: CommercialDirection, hookStrength: HookStrengthEvaluation): HookAudit {
  const subscores: HookSubscoreAudit[] = [
    buildSubscore(
      "immediateSubjectPresence",
      hookStrength,
      `characterDirection=${hookScene.characterDirection ? "presente" : "null"}; productAction="${hookScene.productAction}"`,
    ),
    buildSubscore("visualContrast", hookStrength, `hookStrategy="${direction.hookStrategy}"`),
    buildSubscore("motionIntensity", hookStrength, `motion="${hookScene.motion}"`),
    buildSubscore("curiosity", hookStrength, `hookStrategy="${direction.hookStrategy}"`),
    buildSubscore(
      "messageClarity",
      hookStrength,
      `textOverlay=${hookScene.textOverlay ? `"${hookScene.textOverlay}"` : "null"}; voiceoverIntent.length=${hookScene.voiceoverIntent.length}`,
    ),
    buildSubscore(
      "mobileReadability",
      hookStrength,
      `textOverlay=${hookScene.textOverlay ? `"${hookScene.textOverlay}"` : "null"}; camera="${hookScene.camera}"`,
    ),
  ];

  return {
    overallScore: hookStrength.overallScore,
    passesMinimum: hookStrength.passesMinimum,
    subscores,
  };
}
