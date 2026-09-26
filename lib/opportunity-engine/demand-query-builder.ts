import type { NormalizedProduct } from "@/lib/opportunity-engine/product-normalizer";
import { normalizeIdentifier, normalizeWhitespace } from "@/lib/opportunity-engine/text-utils";

export type DemandQueryIntent =
  | "base"
  | "price"
  | "promotion"
  | "discount"
  | "buy"
  | "coupon"
  | "review";

export type DemandQuery = {
  query: string;
  intent: DemandQueryIntent;
  commercial_intent: boolean;
  confidence: number;
  identifiers: {
    brand: string | null;
    model: string | null;
    ean: string | null;
    gtin: string | null;
    canonical_key: string;
  };
};

const INTENT_SUFFIXES: Array<{ intent: DemandQueryIntent; suffix: string; commercial: boolean }> = [
  { intent: "base", suffix: "", commercial: false },
  { intent: "price", suffix: "preco", commercial: true },
  { intent: "promotion", suffix: "promocao", commercial: true },
  { intent: "discount", suffix: "desconto", commercial: true },
  { intent: "buy", suffix: "comprar", commercial: true },
  { intent: "coupon", suffix: "cupom", commercial: true },
  { intent: "review", suffix: "vale a pena", commercial: false },
];

function buildSpecificBase(product: NormalizedProduct): string | null {
  const parts = [product.brand, product.model]
    .map((part) => normalizeWhitespace(part ?? ""))
    .filter(Boolean);

  if (parts.length >= 2) return parts.join(" ");
  if (product.model) return normalizeWhitespace(product.model);
  if (product.gtin || product.ean) return String(product.gtin ?? product.ean);

  const canonicalName = normalizeWhitespace(product.canonical_name);
  if (!canonicalName) return null;
  if (!product.brand && !product.model && product.category !== "general") return null;
  return canonicalName;
}

function uniqueQueries(queries: DemandQuery[]): DemandQuery[] {
  const seen = new Set<string>();
  const result: DemandQuery[] = [];
  for (const query of queries) {
    const key = normalizeIdentifier(query.query) ?? query.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(query);
  }
  return result;
}

export function buildDemandQueries(product: NormalizedProduct): DemandQuery[] {
  const base = buildSpecificBase(product);
  if (!base) return [];

  const identifiers = {
    brand: product.brand,
    model: product.model,
    ean: product.ean,
    gtin: product.gtin,
    canonical_key: product.canonical_key,
  };

  return uniqueQueries(
    INTENT_SUFFIXES.map((item) => ({
      query: normalizeWhitespace([base, item.suffix].filter(Boolean).join(" ")),
      intent: item.intent,
      commercial_intent: item.commercial,
      confidence: product.brand && product.model ? 92 : product.model || product.gtin || product.ean ? 84 : 70,
      identifiers,
    })),
  );
}

export function buildPrimaryDemandQuery(product: NormalizedProduct): DemandQuery | null {
  return buildDemandQueries(product)[0] ?? null;
}
