const LOMADEE_BASE_URL = "https://api-beta.lomadee.com.br";

type LomadeeImage = {
  url?: string | null;
};

type LomadeePricing = {
  listPrice?: number | null;
  price?: number | null;
};

type LomadeeOption = {
  id?: string | null;
  name?: string | null;
  available?: boolean | null;
  seller?: string | null;
  images?: LomadeeImage[] | null;
  pricing?: LomadeePricing[] | null;
};

type LomadeeProduct = {
  organizationId?: string | null;
  id?: string | null;
  available?: boolean | null;
  name?: string | null;
  description?: string | null;
  url?: string | null;
  images?: LomadeeImage[] | null;
  options?: LomadeeOption[] | null;
  updatedAt?: string | null;
};

export type NormalizedLomadeeProduct = {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  price: number;
  original_price: number;
  discount_pct: number;
  image: string;
  link: string;
  seller: string;
  available: boolean;
  synced_at: string;
};

export type LomadeeProductsResult = {
  products: NormalizedLomadeeProduct[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

function cleanEnv(value?: string) {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function getApiKey() {
  return cleanEnv(process.env.LOMADEE_API_KEY);
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function lomadeePriceToBRL(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function discountPct(price: number, originalPrice: number) {
  if (!price || !originalPrice || originalPrice <= price) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

function pickOption(product: LomadeeProduct) {
  const options = Array.isArray(product.options) ? product.options : [];
  return options.find((option) => option.available !== false) ?? options[0] ?? null;
}

function normalizeProduct(product: LomadeeProduct): NormalizedLomadeeProduct | null {
  const option = pickOption(product);
  const pricing = option?.pricing?.[0] ?? null;
  const price = lomadeePriceToBRL(pricing?.price);
  const originalPrice = lomadeePriceToBRL(pricing?.listPrice) || price;
  const title = toText(option?.name) || toText(product.name);
  const link = toText(product.url);
  const image = toText(option?.images?.[0]?.url) || toText(product.images?.[0]?.url);
  const id = toText(option?.id) || toText(product.id);
  const organizationId = toText(product.organizationId);

  if (!id || !organizationId || !title || !link || price <= 0) {
    return null;
  }

  return {
    id,
    organizationId,
    title,
    description: toText(product.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    price,
    original_price: originalPrice,
    discount_pct: discountPct(price, originalPrice),
    image,
    link,
    seller: toText(option?.seller) || "Lomadee",
    available: product.available !== false && option?.available !== false,
    synced_at: toText(product.updatedAt) || new Date().toISOString(),
  };
}

async function lomadeeFetch(path: string, init?: RequestInit) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("LOMADEE_API_KEY nao configurada no servidor.");
  }

  const response = await fetch(`${LOMADEE_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Lomadee retornou HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

export async function fetchLomadeeProducts(params: {
  search?: string;
  page?: number;
  limit?: number;
  price?: string;
  priceMin?: number | null;
  priceMax?: number | null;
  sort?: string;
  organizationIds?: string;
  isAvailable?: boolean;
}): Promise<LomadeeProductsResult> {
  const query = new URLSearchParams();
  query.set("page", String(Math.max(1, params.page ?? 1)));
  query.set("limit", String(Math.min(Math.max(params.limit ?? 20, 1), 100)));
  if (params.search) query.set("search", params.search);
  
  // Se houver range de preco manual, priorizar. 
  // API Lomadee as vezes aceita price=min..max ou apenas filtraremos no client se necessario.
  if (params.priceMin || params.priceMax) {
    const min = params.priceMin || 0;
    const max = params.priceMax || 999999;
    query.set("price", `${min}..${max}`);
  } else if (params.price) {
    query.set("price", params.price);
  }

  if (params.organizationIds) query.set("organizationIds", params.organizationIds);
  if (typeof params.isAvailable === "boolean") query.set("isAvailable", String(params.isAvailable));

  const payload = await lomadeeFetch(`/affiliate/products?${query.toString()}`);
  const products = Array.isArray(payload.data)
    ? payload.data.map((item) => normalizeProduct(item as LomadeeProduct)).filter(Boolean) as NormalizedLomadeeProduct[]
    : [];

  // Ordenacao manual se a API nao prover
  if (params.sort === "price_asc") {
    products.sort((a, b) => a.price - b.price);
  } else if (params.sort === "price_desc") {
    products.sort((a, b) => b.price - a.price);
  } else if (params.sort === "discount") {
    products.sort((a, b) => b.discount_pct - a.discount_pct);
  }
  const meta = (payload.meta && typeof payload.meta === "object"
    ? payload.meta
    : {}) as Record<string, unknown>;

  return {
    products: products as NormalizedLomadeeProduct[],
    meta: {
      total: Number(meta.total ?? products.length),
      page: Number(meta.page ?? params.page ?? 1),
      limit: Number(meta.limit ?? params.limit ?? 20),
      totalPages: Number(meta.totalPages ?? 1),
    },
  };
}

export async function shortenLomadeeUrl(params: {
  url: string;
  organizationId: string;
  mdasc?: string;
}) {
  const payload = await lomadeeFetch("/affiliate/shortener/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: params.url,
      organizationId: params.organizationId,
      type: "Custom",
      mdasc: params.mdasc || "radar-smart",
    }),
  });

  const type = Array.isArray(payload.type) ? payload.type : [];
  for (const item of type) {
    const record = item as Record<string, unknown>;
    const shortUrls = Array.isArray(record.shortUrls) ? record.shortUrls : [];
    const first = toText(shortUrls[0]);
    if (first) return first;
  }

  return params.url;
}
