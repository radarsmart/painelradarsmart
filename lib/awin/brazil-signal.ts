import { supabaseAdmin } from "@/lib/supabase";

type SignalConfidence = "low" | "medium" | "high";
type SignalSource = "heuristic" | "firecrawl";

export type AwinBrazilSignal = {
  isBrazilDomestic: boolean;
  signalSummary: string;
  signalConfidence: SignalConfidence;
  signalSource: SignalSource;
};

export type AwinProductSignals = AwinBrazilSignal & {
  isFreeShipping: boolean;
  shippingSummary: string;
  shippingConfidence: SignalConfidence;
  shippingSource: SignalSource;
};

type ProductLike = {
  advertiserId: string;
  id: string;
  merchantProductId: string;
  merchantName: string;
  productName: string;
  description?: string;
  awDeepLink: string;
  merchantDeepLink: string;
};

type CachedRow = {
  cache_key: string;
  is_brazil_domestic: boolean | null;
  signal_summary: string | null;
  signal_confidence: string | null;
  signal_source: string | null;
  is_free_shipping: boolean | null;
  shipping_summary: string | null;
  shipping_confidence: string | null;
  shipping_source: string | null;
  expires_at: string | null;
};

const FIRECRAWL_URL = "https://api.firecrawl.dev/v1/scrape";
const CACHE_TTL_DAYS = 7;

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function buildCacheKey(product: ProductLike) {
  return [
    toText(product.advertiserId),
    toText(product.id),
    toText(product.merchantProductId),
    toText(product.merchantDeepLink || product.awDeepLink),
  ].join(":");
}

function normalizeConfidence(value: unknown): SignalConfidence {
  const normalized = toText(value).toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "low";
}

function normalizeSource(value: unknown): SignalSource {
  return toText(value).toLowerCase() === "firecrawl" ? "firecrawl" : "heuristic";
}

function decodeUrl(value: string) {
  let next = toText(value);
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(next);
      if (decoded === next) break;
      next = decoded;
    } catch {
      break;
    }
  }
  return next;
}

function isAliExpressLikeProduct(product: ProductLike) {
  const merchant = toText(product.merchantName).toLowerCase();
  if (merchant.includes("aliexpress")) return true;

  for (const value of [product.merchantDeepLink, product.awDeepLink]) {
    const decoded = decodeUrl(value).toLowerCase();
    if (decoded.includes("aliexpress.com")) return true;
  }

  return false;
}

function detectBrazilSignalHeuristically(product: ProductLike): AwinBrazilSignal | null {
  const haystacks = [
    decodeUrl(product.merchantDeepLink).toLowerCase(),
    decodeUrl(product.awDeepLink).toLowerCase(),
    toText(product.productName).toLowerCase(),
    toText(product.description).toLowerCase(),
  ].filter(Boolean);

  const urlNeedles = [
    "shipfromcountry=br",
    "ship_from_country=br",
    "shipsfrom=br",
    "fromcountry=br",
    "country=br",
    "countrycode=br",
    "locale=pt_br",
    "warehouse=br",
    "stockcountry=br",
    "sellercountry=br",
    "source=br",
    "region=br",
  ];

  const textNeedles = [
    "envio do brasil",
    "enviado do brasil",
    "estoque no brasil",
    "entrega do brasil",
    "produto no brasil",
    "ships from brazil",
    "ship from brazil",
    "seller ships from brazil",
    "brazil warehouse",
    "warehouse br",
  ];

  for (const haystack of haystacks) {
    const urlNeedle = urlNeedles.find((needle) => haystack.includes(needle));
    if (urlNeedle) {
      return {
        isBrazilDomestic: true,
        signalSummary: `Sinal explicito no link: ${urlNeedle}`,
        signalConfidence: "medium",
        signalSource: "heuristic",
      };
    }

    const textNeedle = textNeedles.find((needle) => haystack.includes(needle));
    if (textNeedle) {
      return {
        isBrazilDomestic: true,
        signalSummary: `Sinal textual: ${textNeedle}`,
        signalConfidence: "medium",
        signalSource: "heuristic",
      };
    }
  }

  return null;
}

function detectFreeShippingHeuristically(product: ProductLike) {
  const haystacks = [
    decodeUrl(product.merchantDeepLink).toLowerCase(),
    decodeUrl(product.awDeepLink).toLowerCase(),
    toText(product.productName).toLowerCase(),
    toText(product.description).toLowerCase(),
  ].filter(Boolean);

  const needles = [
    "free shipping",
    "frete gratis",
    "frete grátis",
    "envio gratis",
    "envio grátis",
    "free delivery",
    "delivery: free",
    "shipping: free",
    "shipping free",
  ];

  for (const haystack of haystacks) {
    const needle = needles.find((entry) => haystack.includes(entry));
    if (needle) {
      return {
        isFreeShipping: true,
        shippingSummary: `Sinal textual de frete gratis: ${needle}`,
        shippingConfidence: "medium" as SignalConfidence,
        shippingSource: "heuristic" as SignalSource,
      };
    }
  }

  return null;
}

async function readCachedSignals(product: ProductLike): Promise<AwinProductSignals | null> {
  const cacheKey = buildCacheKey(product);
  const { data, error } = await supabaseAdmin
    .from("awin_product_enrichment_cache")
    .select(
      "cache_key,is_brazil_domestic,signal_summary,signal_confidence,signal_source,is_free_shipping,shipping_summary,shipping_confidence,shipping_source,expires_at",
    )
    .eq("cache_key", cacheKey)
    .maybeSingle<CachedRow>();

  if (error || !data) return null;

  const expiresAt = Date.parse(toText(data.expires_at));
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    return null;
  }

  return {
    isBrazilDomestic: data.is_brazil_domestic === true,
    signalSummary: toText(data.signal_summary),
    signalConfidence: normalizeConfidence(data.signal_confidence),
    signalSource: normalizeSource(data.signal_source),
    isFreeShipping: data.is_free_shipping === true,
    shippingSummary: toText(data.shipping_summary),
    shippingConfidence: normalizeConfidence(data.shipping_confidence),
    shippingSource: normalizeSource(data.shipping_source),
  };
}

async function persistSignals(
  product: ProductLike,
  signals: AwinProductSignals,
  rawPayload: unknown,
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await supabaseAdmin.from("awin_product_enrichment_cache").upsert(
    {
      cache_key: buildCacheKey(product),
      advertiser_id: toText(product.advertiserId),
      product_id: toText(product.id),
      merchant_product_id: toText(product.merchantProductId),
      merchant_name: toText(product.merchantName),
      product_name: toText(product.productName),
      product_url: toText(product.merchantDeepLink),
      affiliate_url: toText(product.awDeepLink),
      is_brazil_domestic: signals.isBrazilDomestic,
      signal_summary: signals.signalSummary,
      signal_confidence: signals.signalConfidence,
      signal_source: signals.signalSource,
      is_free_shipping: signals.isFreeShipping,
      shipping_summary: signals.shippingSummary,
      shipping_confidence: signals.shippingConfidence,
      shipping_source: signals.shippingSource,
      raw_payload: rawPayload,
      enriched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "cache_key" },
  );
}

async function detectSignalsWithFirecrawl(product: ProductLike): Promise<AwinProductSignals | null> {
  const apiKey = toText(process.env.FIRECRAWL_API_KEY);
  const targetUrl = toText(product.merchantDeepLink || product.awDeepLink);
  if (!apiKey || !targetUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(FIRECRAWL_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["json"],
        onlyMainContent: true,
        jsonOptions: {
          prompt:
            "Analise a pagina do produto e responda se ha sinal claro de que o envio, estoque ou vendedor e do Brasil e se ha frete gratis explicito. Nao infira sem evidencia textual. Resuma a evidencia encontrada.",
          schema: {
            type: "object",
            properties: {
              isBrazilDomestic: { type: "boolean" },
              signalSummary: { type: "string" },
              signalConfidence: {
                type: "string",
                enum: ["low", "medium", "high"],
              },
              isFreeShipping: { type: "boolean" },
              shippingSummary: { type: "string" },
              shippingConfidence: {
                type: "string",
                enum: ["low", "medium", "high"],
              },
            },
            required: [
              "isBrazilDomestic",
              "signalSummary",
              "signalConfidence",
              "isFreeShipping",
              "shippingSummary",
              "shippingConfidence",
            ],
          },
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = (await response.json().catch(() => ({}))) as {
      data?: { json?: Record<string, unknown> };
    };
    const extracted = payload.data?.json;
    if (!extracted) return null;

    const signals: AwinProductSignals = {
      isBrazilDomestic: extracted.isBrazilDomestic === true,
      signalSummary: toText(extracted.signalSummary) || "Sem evidencia clara de envio do Brasil.",
      signalConfidence: normalizeConfidence(extracted.signalConfidence),
      signalSource: "firecrawl",
      isFreeShipping: extracted.isFreeShipping === true,
      shippingSummary: toText(extracted.shippingSummary) || "Sem evidencia clara de frete gratis.",
      shippingConfidence: normalizeConfidence(extracted.shippingConfidence),
      shippingSource: "firecrawl",
    };

    await persistSignals(product, signals, extracted);
    return signals;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveAwinProductSignals(
  product: ProductLike,
  options?: { enrichIfMissing?: boolean },
): Promise<AwinProductSignals | null> {
  const brazilHeuristic = detectBrazilSignalHeuristically(product);
  const shippingHeuristic = detectFreeShippingHeuristically(product);
  const cached = await readCachedSignals(product);

  if (cached) {
    return {
      ...cached,
      isBrazilDomestic: cached.isBrazilDomestic || brazilHeuristic?.isBrazilDomestic === true,
      signalSummary: cached.signalSummary || brazilHeuristic?.signalSummary || "",
      signalConfidence: cached.signalSummary
        ? cached.signalConfidence
        : (brazilHeuristic?.signalConfidence ?? "low"),
      signalSource: cached.signalSummary
        ? cached.signalSource
        : (brazilHeuristic?.signalSource ?? "heuristic"),
      isFreeShipping: cached.isFreeShipping || shippingHeuristic?.isFreeShipping === true,
      shippingSummary: cached.shippingSummary || shippingHeuristic?.shippingSummary || "",
      shippingConfidence: cached.shippingSummary
        ? cached.shippingConfidence
        : (shippingHeuristic?.shippingConfidence ?? "low"),
      shippingSource: cached.shippingSummary
        ? cached.shippingSource
        : (shippingHeuristic?.shippingSource ?? "heuristic"),
    };
  }

  if (options?.enrichIfMissing !== true || !isAliExpressLikeProduct(product)) {
    if (!brazilHeuristic && !shippingHeuristic) return null;

    return {
      isBrazilDomestic: brazilHeuristic?.isBrazilDomestic === true,
      signalSummary: brazilHeuristic?.signalSummary || "",
      signalConfidence: brazilHeuristic?.signalConfidence ?? "low",
      signalSource: brazilHeuristic?.signalSource ?? "heuristic",
      isFreeShipping: shippingHeuristic?.isFreeShipping === true,
      shippingSummary: shippingHeuristic?.shippingSummary || "",
      shippingConfidence: shippingHeuristic?.shippingConfidence ?? "low",
      shippingSource: shippingHeuristic?.shippingSource ?? "heuristic",
    };
  }

  const firecrawlSignals = await detectSignalsWithFirecrawl(product);
  if (!firecrawlSignals) {
    if (!brazilHeuristic && !shippingHeuristic) return null;

    return {
      isBrazilDomestic: brazilHeuristic?.isBrazilDomestic === true,
      signalSummary: brazilHeuristic?.signalSummary || "",
      signalConfidence: brazilHeuristic?.signalConfidence ?? "low",
      signalSource: brazilHeuristic?.signalSource ?? "heuristic",
      isFreeShipping: shippingHeuristic?.isFreeShipping === true,
      shippingSummary: shippingHeuristic?.shippingSummary || "",
      shippingConfidence: shippingHeuristic?.shippingConfidence ?? "low",
      shippingSource: shippingHeuristic?.shippingSource ?? "heuristic",
    };
  }

  return {
    ...firecrawlSignals,
    isBrazilDomestic: firecrawlSignals.isBrazilDomestic || brazilHeuristic?.isBrazilDomestic === true,
    signalSummary: firecrawlSignals.signalSummary || brazilHeuristic?.signalSummary || "",
    signalConfidence: firecrawlSignals.signalSummary
      ? firecrawlSignals.signalConfidence
      : (brazilHeuristic?.signalConfidence ?? "low"),
    signalSource: firecrawlSignals.signalSummary
      ? firecrawlSignals.signalSource
      : (brazilHeuristic?.signalSource ?? "heuristic"),
    isFreeShipping: firecrawlSignals.isFreeShipping || shippingHeuristic?.isFreeShipping === true,
    shippingSummary: firecrawlSignals.shippingSummary || shippingHeuristic?.shippingSummary || "",
    shippingConfidence: firecrawlSignals.shippingSummary
      ? firecrawlSignals.shippingConfidence
      : (shippingHeuristic?.shippingConfidence ?? "low"),
    shippingSource: firecrawlSignals.shippingSummary
      ? firecrawlSignals.shippingSource
      : (shippingHeuristic?.shippingSource ?? "heuristic"),
  };
}

export async function resolveBrazilSignal(
  product: ProductLike,
  options?: { enrichIfMissing?: boolean },
): Promise<AwinBrazilSignal | null> {
  const signals = await resolveAwinProductSignals(product, options);
  if (!signals) return null;

  return {
    isBrazilDomestic: signals.isBrazilDomestic,
    signalSummary: signals.signalSummary,
    signalConfidence: signals.signalConfidence,
    signalSource: signals.signalSource,
  };
}
