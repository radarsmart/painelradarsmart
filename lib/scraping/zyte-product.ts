type ZyteImage = {
  url?: unknown;
};

type ZyteProduct = {
  name?: unknown;
  price?: unknown;
  regularPrice?: unknown;
  currency?: unknown;
  currencyRaw?: unknown;
  mainImage?: ZyteImage;
  images?: ZyteImage[];
  url?: unknown;
  canonicalUrl?: unknown;
};

type ZyteExtractResponse = {
  product?: ZyteProduct;
  url?: string;
};

export type ZyteProductExtraction = {
  title: string;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string;
  productUrl: string;
  currency: string;
  raw: Record<string, unknown>;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100) / 100;
  }

  const raw = toText(value);
  if (!raw) return null;

  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

function toAbsoluteHttpUrl(value: unknown): string {
  const raw = toText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return "";
}

function pickImage(product: ZyteProduct): string {
  const mainImage = toAbsoluteHttpUrl(product.mainImage?.url);
  if (mainImage) return mainImage;

  for (const image of product.images ?? []) {
    const candidate = toAbsoluteHttpUrl(image?.url);
    if (candidate) return candidate;
  }

  return "";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractWithZyteProduct(input: {
  url: string;
  timeoutMs?: number;
}): Promise<ZyteProductExtraction> {
  const apiKey = toText(process.env.ZYTE_API_KEY);
  if (!apiKey) {
    throw new Error("ZYTE_API_KEY nao configurada.");
  }

  const response = await fetchWithTimeout(
    "https://api.zyte.com/v1/extract",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: input.url,
        product: true,
        productOptions: {
          extractFrom: "browserHtml",
        },
      }),
      cache: "no-store",
    },
    input.timeoutMs ?? 12000,
  );

  const text = await response.text();
  const payload = (text ? JSON.parse(text) : {}) as ZyteExtractResponse & Record<string, unknown>;

  if (!response.ok) {
    const detail = toText((payload as { detail?: unknown }).detail) || text;
    throw new Error(`Zyte API ${response.status}: ${detail || response.statusText}`);
  }

  const product = payload.product;
  if (!product) {
    throw new Error("Zyte nao retornou dados de produto.");
  }

  const price = toPrice(product.price);
  const oldPrice = toPrice(product.regularPrice);

  return {
    title: toText(product.name),
    price,
    oldPrice: oldPrice && price && oldPrice > price ? oldPrice : null,
    imageUrl: pickImage(product),
    productUrl:
      toAbsoluteHttpUrl(product.canonicalUrl) ||
      toAbsoluteHttpUrl(product.url) ||
      toAbsoluteHttpUrl(payload.url) ||
      input.url,
    currency: toText(product.currency) || toText(product.currencyRaw),
    raw: payload,
  };
}
