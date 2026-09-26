import {
  CATEGORY_ATTRIBUTE_SCHEMAS,
  getCategorySchema,
  type ProductCategory,
} from "@/lib/opportunity-engine/category-schemas";
import {
  normalizeIdentifier,
  normalizeText,
  normalizeWhitespace,
  stripAccents,
  toNullableNumber,
} from "@/lib/opportunity-engine/text-utils";

export type ProductCondition =
  | "NEW"
  | "USED"
  | "REFURBISHED"
  | "OPEN_BOX"
  | "GENERIC"
  | "COMPATIBLE"
  | "UNKNOWN";

export type RawProductInput = {
  source?: unknown;
  marketplace?: unknown;
  external_product_id?: unknown;
  external_seller_id?: unknown;
  title_original?: unknown;
  title?: unknown;
  description_original?: unknown;
  description?: unknown;
  url?: unknown;
  product_url?: unknown;
  affiliate_url?: unknown;
  image_url?: unknown;
  brand_original?: unknown;
  brand?: unknown;
  model_original?: unknown;
  model?: unknown;
  ean_original?: unknown;
  ean?: unknown;
  sku_original?: unknown;
  sku?: unknown;
  category?: unknown;
  price_original?: unknown;
  price?: unknown;
  old_price_original?: unknown;
  old_price?: unknown;
  payment_information_original?: unknown;
  raw_payload?: unknown;
  raw_data?: unknown;
};

export type NormalizedProductAttributes = Record<string, string | number | boolean | null>;

export type CanonicalProductDraft = {
  canonical_name: string;
  brand: string | null;
  model: string | null;
  ean: string | null;
  gtin: string | null;
  mpn: string | null;
  category: ProductCategory;
  attributes_json: NormalizedProductAttributes;
  canonical_key: string;
  status: "active" | "review_required";
};

export type NormalizedProduct = CanonicalProductDraft & {
  title_original: string;
  title_normalized: string;
  condition: ProductCondition;
  authenticity: ProductCondition;
  critical_attributes: string[];
  raw_payload: unknown;
};

const KNOWN_BRANDS = [
  "apple",
  "samsung",
  "xiaomi",
  "motorola",
  "lg",
  "sony",
  "philips",
  "mondial",
  "britania",
  "electrolux",
  "brastemp",
  "consul",
  "arno",
  "oster",
  "natura",
  "boticario",
  "eudora",
  "avon",
  "growth",
  "max titanium",
  "integralmedica",
];

const MODEL_STOP_WORDS = new Set([
  "air",
  "fryer",
  "fritadeira",
  "familia",
  "family",
  "inox",
  "litros",
  "litro",
  "smart",
  "novo",
  "nova",
  "original",
  "kit",
]);

function toText(value: unknown): string {
  return normalizeWhitespace(String(value ?? ""));
}

function readFirstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return null;
}

function inferCategory(text: string, explicit: unknown): ProductCategory {
  const explicitCategory = normalizeText(explicit);
  const joined = `${normalizeText(text)} ${explicitCategory}`;

  if (/(iphone|smartphone|celular|galaxy|android)/.test(joined)) return "smartphone";
  if (/(perfume|eau de parfum|eau de toilette|colonia|deo colonia)/.test(joined)) return "perfume";
  if (/(whey|creatina|suplemento|protein|pre treino|hipercalorico)/.test(joined)) return "supplement";
  if (/(tv|televisao|oled|qled|uhd|4k|8k)/.test(joined)) return "tv";
  if (/(air fryer|fritadeira|geladeira|fogao|microondas|lavadora|aspirador|cafeteira)/.test(joined)) {
    return "appliance";
  }
  if (/(skincare|creme|serum|maquiagem|shampoo|condicionador|cosmetico|beleza)/.test(joined)) {
    return "beauty";
  }

  const explicitKey = Object.keys(CATEGORY_ATTRIBUTE_SCHEMAS).find((category) =>
    explicitCategory.includes(category),
  ) as ProductCategory | undefined;
  return explicitKey ?? "general";
}

function inferCondition(text: string): ProductCondition {
  const normalized = normalizeText(text);
  if (/\b(compativel|similar)\b/.test(normalized)) return "COMPATIBLE";
  if (/\b(generico|paralelo)\b/.test(normalized)) return "GENERIC";
  if (/\b(recondicionado|refurbished|remanufaturado)\b/.test(normalized)) return "REFURBISHED";
  if (/\b(open box|mostruario|vitrine)\b/.test(normalized)) return "OPEN_BOX";
  if (/\b(usado|seminovo|semi novo)\b/.test(normalized)) return "USED";
  if (/\b(novo|nova|lacrado|lacrada|original)\b/.test(normalized)) return "NEW";
  return "UNKNOWN";
}

function inferBrand(text: string, explicit: unknown): string | null {
  const provided = readFirstText(explicit);
  if (provided) return provided;

  const normalized = normalizeText(text);
  const brand = KNOWN_BRANDS.find((candidate) => normalized.includes(candidate));
  if (!brand) {
    if (/\biphone\b/.test(normalized)) return "Apple";
    return null;
  }

  return brand
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferModel(text: string, explicit: unknown): string | null {
  const provided = readFirstText(explicit);
  if (provided) return provided;

  const iphone = normalizeText(text).match(/\biphone\s+(\d{1,2})(?:\s+(pro|max|plus))?/);
  if (iphone?.[1]) {
    return ["iPhone", iphone[1], iphone[2]].filter(Boolean).join(" ");
  }

  const normalized = stripAccents(text).replace(/[^\w\s-]/g, " ");
  // Separador so pode ser hifen ou nada (letras coladas nos digitos), nunca
  // espaco: um codigo real (RTX3080, GT-B5330) vem colado; "Vidro 340ml" ou
  // "Aco 2L" sao so um substantivo comum seguido de medida com espaco no
  // meio, e sem essa distincao "Vidro" virava "modelo" e gerava buscas de
  // mercado inuteis tipo "VIDRO 1".
  const skuCandidates = normalized.match(/\b[a-zA-Z]{2,}-?\d{2,}(?:-?[a-zA-Z]{1,4}){0,3}\b/g) ?? [];
  const skuModel = skuCandidates.find((candidate) => {
    const firstToken = candidate.trim().split(/\s+/)[0] ?? candidate;
    const clean = firstToken.toLowerCase().replace(/[^a-z0-9]/g, "");
    return clean.length >= 4 && !MODEL_STOP_WORDS.has(clean);
  });
  if (skuModel) return (skuModel.trim().split(/\s+/)[0] ?? skuModel).toUpperCase();

  const candidates = normalized.match(/\b[a-zA-Z]{1,8}-?\d{1,4}(?:-?[a-zA-Z]{1,4}){0,3}\b/g) ?? [];
  const model = candidates.find((candidate) => {
    const clean = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
    return clean.length >= 3 && !MODEL_STOP_WORDS.has(clean);
  });
  if (model) return model.toUpperCase().replace(/\s+/g, "-");

  return null;
}

function extractNumberMatch(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  return toNullableNumber(match[1]);
}

function extractStorageGb(text: string): number | null {
  const normalized = normalizeText(text);
  const tb = extractNumberMatch(normalized, /\b(\d+(?:[.,]\d+)?)\s*tb\b/);
  if (tb !== null) return tb * 1000;
  return extractNumberMatch(normalized, /\b(\d+(?:[.,]\d+)?)\s*gb\b/);
}

function extractVolumeMl(text: string): number | null {
  const normalized = normalizeText(text);
  const ml = extractNumberMatch(normalized, /\b(\d+(?:[.,]\d+)?)\s*ml\b/);
  if (ml !== null) return ml;
  const liters = extractNumberMatch(normalized, /\b(\d+(?:[.,]\d+)?)\s*(?:l|litro|litros)\b/);
  return liters !== null ? liters * 1000 : null;
}

function extractCapacityLiters(text: string): number | null {
  const normalized = normalizeText(text);
  const liters = extractNumberMatch(normalized, /\b(\d+(?:[.,]\d+)?)\s*(?:l|litro|litros)\b/);
  if (liters !== null) return liters;
  const ml = extractNumberMatch(normalized, /\b(\d+(?:[.,]\d+)?)\s*ml\b/);
  return ml !== null ? ml / 1000 : null;
}

function extractWeightG(text: string): number | null {
  const normalized = normalizeText(text);
  const kg = extractNumberMatch(normalized, /\b(\d+(?:[.,]\d+)?)\s*kg\b/);
  if (kg !== null) return kg * 1000;
  return extractNumberMatch(normalized, /\b(\d+(?:[.,]\d+)?)\s*g\b/);
}

function extractVoltage(text: string): number | null {
  const normalized = normalizeText(text);
  const voltage = extractNumberMatch(normalized, /\b(110|127|220)\s*v\b/);
  if (voltage === 110) return 127;
  return voltage;
}

// Marcas de perfumaria/cosmeticos (ex.: Natura) vendem a mesma linha em
// varios formatos (perfume, gel de banho, hidratante, sabonete...) com o
// mesmo nome de linha e ate volume parecido — sem isso, o matching so via
// marca+categoria+volume confundia produtos completamente diferentes (ex.:
// "Deo Parfum" comparado com "Shower Gel" da mesma linha, mesma marca).
// Ordem importa: frases mais especificas ("deo parfum"/"deo colonia", que
// sao nomes de linha de fragancia da Natura) precisam ser checadas antes de
// "desodorante" generico, senao um "deo" isolado seria mal classificado.
const PERSONAL_CARE_FORM_PATTERNS: Array<{ form: string; pattern: RegExp }> = [
  { form: "fragrance", pattern: /(deo parfum|deo colonia|eau de parfum|eau de toilette|\bparfum\b|\bperfume\b|\bcolonia\b)/ },
  { form: "shower_gel", pattern: /(shower gel|gel de banho|sabonete liquido)/ },
  { form: "shampoo", pattern: /\bshampoo\b/ },
  { form: "conditioner", pattern: /\bcondicionador\b/ },
  { form: "lotion", pattern: /(hidratante|locao corporal|creme corporal|body lotion|creme hidratante)/ },
  { form: "soap", pattern: /\bsabonete\b/ },
  { form: "deodorant", pattern: /(desodorante|antitranspirante|deo spray|deo aerosol|deo roll[- ]?on)/ },
  { form: "oil", pattern: /(oleo corporal|body oil)/ },
  { form: "powder", pattern: /\btalco\b/ },
];

function extractPersonalCareForm(text: string): string | null {
  const normalized = normalizeText(text);
  for (const { form, pattern } of PERSONAL_CARE_FORM_PATTERNS) {
    if (pattern.test(normalized)) return form;
  }
  return null;
}

function extractQuantity(text: string): number | null {
  const normalized = normalizeText(text);
  const kit = extractNumberMatch(normalized, /\bkit\s*(?:com|de)?\s*(\d+)\b/);
  if (kit !== null) return kit;
  const units = extractNumberMatch(normalized, /\b(\d+)\s*(?:un|unid|unidades)\b/);
  return units ?? 1;
}

function buildAttributes(params: {
  text: string;
  category: ProductCategory;
  brand: string | null;
  model: string | null;
  condition: ProductCondition;
}): NormalizedProductAttributes {
  const attributes: NormalizedProductAttributes = {
    brand: params.brand,
    model: params.model,
    condition: params.condition,
    storage_gb: extractStorageGb(params.text),
    volume_ml: extractVolumeMl(params.text),
    capacity_liters: extractCapacityLiters(params.text),
    weight_g: extractWeightG(params.text),
    voltage: extractVoltage(params.text),
    power_watts: extractNumberMatch(normalizeText(params.text), /\b(\d{2,5})\s*w\b/),
    quantity: extractQuantity(params.text),
  };

  if (params.category === "smartphone") {
    attributes.ram_gb = extractNumberMatch(normalizeText(params.text), /\b(\d{1,2})\s*gb\s*(?:ram|memoria)\b/);
  }

  if (params.category === "tv") {
    attributes.screen_size_inches = extractNumberMatch(normalizeText(params.text), /\b(\d{2,3})\s*(?:pol|polegadas|")\b/);
    attributes.resolution = normalizeText(params.text).match(/\b(4k|8k|full hd|hd)\b/)?.[1] ?? null;
  }

  // Incondicional (nao so perfume/beauty): a classificacao de categoria
  // nao reconhece todo termo de cuidado pessoal (ex.: "shower gel" cai em
  // "general") — calcular sempre evita que esse atributo critico suma so
  // porque a categoria de um dos dois lados saiu errada.
  attributes.product_form = extractPersonalCareForm(params.text);

  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== null && value !== ""),
  );
}

function buildCanonicalName(brand: string | null, model: string | null, title: string): string {
  if (brand && model) return `${brand} ${model}`;
  if (brand) return `${brand} ${title}`.slice(0, 140);
  return title.slice(0, 140);
}

function buildCanonicalKey(input: {
  brand: string | null;
  model: string | null;
  ean: string | null;
  gtin: string | null;
  mpn: string | null;
  category: ProductCategory;
  attributes: NormalizedProductAttributes;
  criticalAttributes: string[];
}): string {
  if (input.gtin || input.ean) return `gtin|${input.gtin ?? input.ean}`;
  if (input.mpn) return `mpn|${input.mpn}`;

  const parts = [
    input.category,
    normalizeIdentifier(input.brand),
    normalizeIdentifier(input.model),
    ...input.criticalAttributes.map((key) => {
      const value = input.attributes[key];
      return value === undefined || value === null ? null : `${key}:${normalizeIdentifier(value) ?? value}`;
    }),
  ].filter(Boolean);

  return parts.join("|");
}

export function normalizeProduct(input: RawProductInput): NormalizedProduct {
  const title = readFirstText(input.title_original, input.title) ?? "";
  const description = readFirstText(input.description_original, input.description) ?? "";
  const combinedText = `${title} ${description}`;
  const category = inferCategory(combinedText, input.category);
  const condition = inferCondition(combinedText);
  const brand = inferBrand(combinedText, input.brand_original ?? input.brand);
  const model = inferModel(combinedText, input.model_original ?? input.model);
  const ean = normalizeIdentifier(input.ean_original ?? input.ean);
  const gtin = ean;
  const mpn = normalizeIdentifier(input.sku_original ?? input.sku);
  const attributes = buildAttributes({ text: combinedText, category, brand, model, condition });
  const schema = getCategorySchema(category);
  const canonicalKey = buildCanonicalKey({
    brand,
    model,
    ean,
    gtin,
    mpn,
    category,
    attributes,
    criticalAttributes: schema.criticalAttributes,
  });

  return {
    title_original: title,
    title_normalized: normalizeText(title),
    canonical_name: buildCanonicalName(brand, model, title),
    brand,
    model,
    ean,
    gtin,
    mpn,
    category,
    attributes_json: attributes,
    canonical_key: canonicalKey,
    status: brand || model || ean ? "active" : "review_required",
    condition,
    authenticity: condition,
    critical_attributes: schema.criticalAttributes,
    raw_payload: input.raw_payload ?? input.raw_data ?? input,
  };
}
