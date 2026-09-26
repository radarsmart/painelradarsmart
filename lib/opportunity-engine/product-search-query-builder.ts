import { getCategorySchema } from "@/lib/opportunity-engine/category-schemas";
import type { NormalizedProduct } from "@/lib/opportunity-engine/product-normalizer";
import { normalizeIdentifier, normalizeWhitespace } from "@/lib/opportunity-engine/text-utils";

export type ProductSearchQueryStrategy = "gtin" | "brand_model_attributes" | "canonical_name";

export type ProductSearchQuery = {
  query: string;
  strategy: ProductSearchQueryStrategy;
  confidence: number;
  identifiers: {
    ean: string | null;
    gtin: string | null;
    brand: string | null;
    model: string | null;
    critical_attributes: Record<string, string | number | boolean>;
  };
};

function formatAttribute(key: string, value: string | number | boolean | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "boolean") return value ? key.replace(/_/g, " ") : null;

  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (Number.isFinite(number)) {
    if (key === "storage_gb" || key === "ram_gb") return `${Math.round(number)}GB`;
    if (key === "volume_ml") return `${Math.round(number)}ml`;
    if (key === "weight_g") return `${Math.round(number)}g`;
    if (key === "capacity_liters" || key === "capacity") return `${Number(number.toFixed(2))}L`;
    if (key === "voltage") return `${Math.round(number)}V`;
    if (key === "power_watts") return `${Math.round(number)}W`;
    if (key === "screen_size_inches") return `${Math.round(number)} polegadas`;
    if (key === "quantity" && number > 1) return `kit ${Math.round(number)}`;
  }

  const text = normalizeWhitespace(String(value));
  if (!text || text.toUpperCase() === "UNKNOWN") return null;
  return text;
}

function uniqueParts(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const text = normalizeWhitespace(part ?? "");
    if (!text) continue;
    const key = normalizeIdentifier(text) ?? text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function criticalAttributes(product: NormalizedProduct): Record<string, string | number | boolean> {
  const schema = getCategorySchema(product.category);
  const keys = new Set([...schema.criticalAttributes, ...product.critical_attributes]);
  const result: Record<string, string | number | boolean> = {};
  for (const key of keys) {
    const value = product.attributes_json[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    }
  }
  return result;
}

function buildBrandModelQuery(product: NormalizedProduct): string | null {
  const attrs = criticalAttributes(product);
  const attrParts = Object.entries(attrs)
    .map(([key, value]) => formatAttribute(key, value))
    .filter((value): value is string => Boolean(value));

  const parts = uniqueParts([product.brand, product.model, ...attrParts]);
  if (parts.length < 2 && !product.model) return null;
  return parts.join(" ");
}

function buildCanonicalQuery(product: NormalizedProduct): string | null {
  const attrs = Object.entries(criticalAttributes(product))
    .map(([key, value]) => formatAttribute(key, value))
    .filter((value): value is string => Boolean(value));
  const parts = uniqueParts([product.canonical_name, ...attrs]);
  if (!product.brand && !product.model && !product.ean && !product.gtin) return null;
  return parts.join(" ");
}

export function buildProductSearchQueries(product: NormalizedProduct): ProductSearchQuery[] {
  const attrs = criticalAttributes(product);
  const identifiers = {
    ean: product.ean,
    gtin: product.gtin,
    brand: product.brand,
    model: product.model,
    critical_attributes: attrs,
  };
  const queries: ProductSearchQuery[] = [];
  const gtin = normalizeIdentifier(product.gtin ?? product.ean);
  if (gtin) {
    queries.push({
      query: gtin,
      strategy: "gtin",
      confidence: 100,
      identifiers,
    });
  }

  const brandModel = buildBrandModelQuery(product);
  if (brandModel) {
    queries.push({
      query: brandModel,
      strategy: "brand_model_attributes",
      confidence: product.model ? 92 : 82,
      identifiers,
    });
  }

  const canonical = buildCanonicalQuery(product);
  if (canonical && !queries.some((item) => item.query.toLowerCase() === canonical.toLowerCase())) {
    queries.push({
      query: canonical,
      strategy: "canonical_name",
      confidence: 72,
      identifiers,
    });
  }

  return queries;
}

export function buildPrimaryProductSearchQuery(product: NormalizedProduct): ProductSearchQuery | null {
  return buildProductSearchQueries(product)[0] ?? null;
}
