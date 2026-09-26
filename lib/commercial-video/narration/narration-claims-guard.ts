// Radar Creative AI - Narration Script Builder / Claims Guard
//
// PURO - fino wrapper sobre a politica de claims JA existente
// (lib/content-safety/claims-policy.ts). Nao reimplementa nenhuma regra -
// toda fala candidata passa exatamente pelo mesmo scanner usado pelo
// resto do pipeline (Product Intelligence, Prompt Builder).

import { scanTextForForbiddenClaims, type ClaimViolation } from "@/lib/content-safety/claims-policy";

export type ClaimsCheckResult = {
  safe: boolean;
  violations: ClaimViolation[];
};

export function checkCandidateClaimsSafety(candidate: string, category: string): ClaimsCheckResult {
  const violations = scanTextForForbiddenClaims(candidate, category);
  return { safe: violations.length === 0, violations };
}
