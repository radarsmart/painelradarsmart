import { getCategorySchema } from "@/lib/opportunity-engine/category-schemas";
import {
  normalizeProduct,
  type NormalizedProduct,
  type RawProductInput,
} from "@/lib/opportunity-engine/product-normalizer";
import {
  clamp,
  normalizeIdentifier,
  tokenSimilarity,
} from "@/lib/opportunity-engine/text-utils";

export type MatchStatus = "CONFIRMED" | "PROBABLE" | "REVIEW_REQUIRED" | "REJECTED";

export type ProductMatchResult = {
  match_score: number;
  match_status: MatchStatus;
  match_reasons: string[];
  conflicts: string[];
};

function equalNormalized(left: unknown, right: unknown): boolean {
  const leftId = normalizeIdentifier(left);
  const rightId = normalizeIdentifier(right);
  return Boolean(leftId && rightId && leftId === rightId);
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function findCriticalConflicts(left: NormalizedProduct, right: NormalizedProduct): string[] {
  const schema = getCategorySchema(left.category);
  const critical = new Set([
    ...schema.criticalAttributes,
    ...getCategorySchema(right.category).criticalAttributes,
    "storage_gb",
    "volume_ml",
    "weight_g",
    "capacity_liters",
    "voltage",
    "quantity",
    "condition",
    "product_form",
  ]);

  const conflicts: string[] = [];
  for (const key of critical) {
    const leftValue = left.attributes_json[key];
    const rightValue = right.attributes_json[key];
    if (!hasValue(leftValue) || !hasValue(rightValue)) continue;
    if (!equalNormalized(leftValue, rightValue)) {
      conflicts.push(`${key}: ${String(leftValue)} vs ${String(rightValue)}`);
    }
  }

  return conflicts;
}

function classify(score: number, conflicts: string[]): MatchStatus {
  if (conflicts.length > 0) return "REJECTED";
  if (score >= 90) return "CONFIRMED";
  if (score >= 80) return "PROBABLE";
  if (score >= 65) return "REVIEW_REQUIRED";
  return "REJECTED";
}

export function matchNormalizedProducts(
  left: NormalizedProduct,
  right: NormalizedProduct,
): ProductMatchResult {
  const conflicts = findCriticalConflicts(left, right);
  const reasons: string[] = [];
  let score = 0;

  if ((left.ean || left.gtin) && equalNormalized(left.ean ?? left.gtin, right.ean ?? right.gtin)) {
    score += 50;
    reasons.push("EAN/GTIN igual");
  }

  if (!left.ean && !left.gtin && left.canonical_key && left.canonical_key === right.canonical_key) {
    score += 35;
    reasons.push("Canonical key igual");
  }

  if (left.model && right.model && equalNormalized(left.model, right.model)) {
    score += 25;
    reasons.push("Modelo exato");
  }

  if (left.brand && right.brand && equalNormalized(left.brand, right.brand)) {
    score += 10;
    reasons.push("Marca igual");
  }

  const criticalKeys = getCategorySchema(left.category).criticalAttributes;
  const comparableCritical = criticalKeys.filter((key) =>
    hasValue(left.attributes_json[key]) && hasValue(right.attributes_json[key]),
  );
  const equalCritical = comparableCritical.filter((key) =>
    equalNormalized(left.attributes_json[key], right.attributes_json[key]),
  );
  if (comparableCritical.length > 0 && equalCritical.length === comparableCritical.length) {
    score += 10;
    reasons.push("Atributos criticos iguais");
  } else if (equalCritical.length > 0) {
    const partialScore = Math.round((equalCritical.length / comparableCritical.length) * 10);
    score += partialScore;
    reasons.push("Parte dos atributos criticos iguais");
  }

  const similarity = tokenSimilarity(left.title_original, right.title_original);
  if (similarity >= 0.65) {
    score += 5;
    reasons.push(`Titulo semelhante (${Math.round(similarity * 100)}%)`);
  }

  if (left.category === right.category && left.category !== "general") {
    score += 5;
    reasons.push("Categoria igual");
  }

  const matchScore = conflicts.length ? Math.min(score, 64) : clamp(score, 0, 100);

  return {
    match_score: matchScore,
    match_status: classify(matchScore, conflicts),
    match_reasons: reasons,
    conflicts,
  };
}

export function matchProducts(left: RawProductInput, right: RawProductInput): ProductMatchResult {
  return matchNormalizedProducts(normalizeProduct(left), normalizeProduct(right));
}
