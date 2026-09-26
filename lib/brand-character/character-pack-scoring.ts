// Radar Creative AI - Character Pack / Scoring
//
// Modulo PURO: zero I/O, zero dependencia de Supabase. Existe separado de
// character-pack.ts de proposito, para poder ser testado com objetos mock
// em memoria sem tocar banco nenhum.
//
// Scoring 100% deterministico, sem IA. Pesos documentados abaixo - ajustar
// aqui se algum dia houver dado de performance real (CTR/retencao) para
// justificar mudanca.

import type {
  CharacterReferenceCandidate,
  CharacterReferenceCriteria,
  ScoredCharacterReference,
} from "@/lib/brand-character/character-types";

// Pesos por campo. Character (characterSlug) NAO entra aqui porque e um
// filtro obrigatorio anterior ao scoring, nao um criterio de pontuacao -
// ver findCharacterReferences() em character-pack.ts.
const FIELD_WEIGHTS = {
  expression: 30,
  pose: 25,
  shot: 20,
  cameraAngle: 10,
  outfit: 10,
  environment: 5,
} as const;

type ScorableField = keyof typeof FIELD_WEIGHTS;

const SCORABLE_FIELDS = Object.keys(FIELD_WEIGHTS) as ScorableField[];

/**
 * Pontua UMA referencia contra um criterio. Nunca lanca excecao, nunca
 * acessa rede/banco - so compara os campos presentes no criterio contra a
 * metadata do candidato.
 */
export function scoreCharacterReference<T extends CharacterReferenceCandidate>(
  candidate: T,
  criteria: CharacterReferenceCriteria,
): ScoredCharacterReference<T> {
  let score = 0;
  const matchedFields: string[] = [];
  const reasons: string[] = [];

  for (const field of SCORABLE_FIELDS) {
    const wanted = criteria[field];
    if (!wanted) continue;

    const actual = candidate.metadata[field];
    if (actual && actual === wanted) {
      score += FIELD_WEIGHTS[field];
      matchedFields.push(field);
      reasons.push(`${field} = "${wanted}" corresponde ao criterio`);
    }
  }

  if (matchedFields.length === 0) {
    reasons.push("nenhum campo de metadata correspondeu ao criterio pedido");
  }

  return { asset: candidate, score, matchedFields, reasons };
}

/**
 * Ordena candidatos do maior para o menor score. PRIMARY deve ser
 * filtrada ANTES de chamar isso (ver character-pack.ts) - aqui e so
 * ordenacao pura.
 */
export function rankCharacterReferences<T extends CharacterReferenceCandidate>(
  candidates: T[],
  criteria: CharacterReferenceCriteria,
): ScoredCharacterReference<T>[] {
  return candidates
    .map((candidate) => scoreCharacterReference(candidate, criteria))
    .sort((a, b) => b.score - a.score);
}

/**
 * Retorna o melhor candidato ou null se nenhum tiver pontuado acima de 0
 * (ou seja, nenhum campo do criterio bateu com nenhuma referencia).
 *
 * generationSafe no criterio e um FILTRO DE ELEGIBILIDADE, nao um campo
 * pontuado: quando criteria.generationSafe===true, referencias sem
 * metadata.generationSafe===true nem entram no ranking - nunca competem,
 * mesmo que pontuassem alto nos outros campos. Isso e deliberado (ver
 * lib/brand-assets/types.ts) - a protecao contra vazamento de marca e
 * metadata explicita, nunca inferida aqui.
 */
export function selectBestFromCandidates<T extends CharacterReferenceCandidate>(
  candidates: T[],
  criteria: CharacterReferenceCriteria,
): ScoredCharacterReference<T> | null {
  const nonPrimaryCandidates = candidates.filter((candidate) => !candidate.metadata.isPrimary);
  const eligibleCandidates = criteria.generationSafe
    ? nonPrimaryCandidates.filter((candidate) => candidate.metadata.generationSafe === true)
    : nonPrimaryCandidates;

  const ranked = rankCharacterReferences(eligibleCandidates, criteria);
  const best = ranked[0];
  if (!best || best.score === 0) return null;
  return best;
}
