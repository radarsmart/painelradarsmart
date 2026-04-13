import { NextRequest, NextResponse } from "next/server";
import { load } from "cheerio";
import { fetch as undiciFetch } from "undici";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Marketplace = "amazon" | "mercadolivre" | "unknown";
type ExtractionLayer = "json_ld" | "meta" | "dom" | "mixed" | "none";

type ParsedData = {
  title: string | null;
  price: number | null;
  oldPrice: number | null;
  imageUrl: string | null;
  currency: string | null;
};

type AttemptLog = {
  profile: string;
  status: number;
  finalUrl: string;
};

const BROWSER_HEADERS = {
  desktop: {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "accept-encoding": "gzip, deflate, br",
    "cache-control": "no-cache",
    pragma: "no-cache",
    dnt: "1",
    "upgrade-insecure-requests": "1",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not(A:Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
  },
  mobile: {
    "user-agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "accept-encoding": "gzip, deflate, br",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
  },
} as const;

function detectMarketplace(url: string): Marketplace {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("amazon.")) return "amazon";
  if (host.includes("mercadolivre") || host.includes("mercadolibre")) return "mercadolivre";
  return "unknown";
}

function toText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function toPrice(value: unknown): number | null {
  const raw = toText(value);
  if (!raw) return null;

  let normalized = raw.replace(/[^\d,.-]/g, "");
  const hasDot = normalized.includes(".");
  const hasComma = normalized.includes(",");

  if (hasDot && hasComma) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizeAmazonImage(raw: string | null): string | null {
  if (!raw) return null;
  return raw
    .replace(/\._[A-Z0-9,]+_\./gi, ".")
    .replace(/_AC_SL1500_/gi, "_AC_SY450_")
    .split("?")[0];
}

function normalizeMlImage(raw: string | null): string | null {
  if (!raw) return null;
  return raw
    .replace(/-V(?=\.(jpg|jpeg|png|webp)$)/i, "")
    .replace(/([_-])I\.(jpg|jpeg|png|webp)$/i, "$1F.$2")
    .split("?")[0];
}

function pickProductNode(input: unknown): Record<string, unknown> | null {
  const queue: unknown[] = Array.isArray(input) ? [...input] : [input];

  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object") continue;
    const current = node as Record<string, unknown>;

    if (Array.isArray(current["@graph"])) {
      queue.push(...(current["@graph"] as unknown[]));
    }

    const typeValue = String(current["@type"] ?? "").toLowerCase();
    if (typeValue.includes("product")) {
      return current;
    }
  }

  return null;
}

function parseJsonLd(html: string): ParsedData {
  const $ = load(html);
  const scripts = $('script[type="application/ld+json"]')
    .toArray()
    .map((node) => $(node).text().trim())
    .filter(Boolean);

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script) as unknown;
      const product = pickProductNode(parsed);
      if (!product) continue;

      const imageValue = Array.isArray(product.image)
        ? toText(product.image[0])
        : toText(product.image);

      const offers = product.offers;
      const offersList = Array.isArray(offers)
        ? offers
        : offers && typeof offers === "object"
          ? [offers]
          : [];

      const firstOffer = offersList[0] as Record<string, unknown> | undefined;

      return {
        title: toText(product.name),
        imageUrl: imageValue,
        price: toPrice(firstOffer?.price),
        oldPrice:
          toPrice(firstOffer?.highPrice) ??
          toPrice(firstOffer?.priceBeforeDiscount) ??
          toPrice(firstOffer?.listPrice),
        currency: toText(firstOffer?.priceCurrency),
      };
    } catch {
      // ignore invalid JSON-LD blocks
    }
  }

  return { title: null, price: null, oldPrice: null, imageUrl: null, currency: null };
}

function parseMeta(html: string): ParsedData {
  const $ = load(html);
  return {
    title:
      toText($('meta[property="og:title"]').attr("content")) ??
      toText($("title").first().text()),
    imageUrl:
      toText($('meta[property="og:image"]').attr("content")) ??
      toText($('meta[name="twitter:image"]').attr("content")),
    price:
      toPrice($('meta[property="product:price:amount"]').attr("content")) ??
      toPrice($('meta[property="og:price:amount"]').attr("content")) ??
      toPrice($('meta[itemprop="price"]').attr("content")) ??
      toPrice($('meta[name="twitter:data1"]').attr("content")),
    oldPrice: null,
    currency:
      toText($('meta[property="product:price:currency"]').attr("content")) ?? "BRL",
  };
}

function parseDom(html: string, marketplace: Marketplace): ParsedData {
  const $ = load(html);

  if (marketplace === "amazon") {
    const whole = toText($("#corePriceDisplay_desktop_feature_div .a-price .a-price-whole").first().text());
    const fraction = toText($("#corePriceDisplay_desktop_feature_div .a-price .a-price-fraction").first().text());
    const fromParts = toPrice(`${whole ?? ""},${fraction ?? "00"}`);

    return {
      title: toText($("#productTitle").first().text()) ?? toText($("#title").first().text()),
      imageUrl:
        toText($("#landingImage").attr("data-old-hires")) ??
        toText($("#landingImage").attr("src")) ??
        toText($("#imgTagWrapperId img").attr("src")),
      price:
        fromParts ??
        toPrice($("#apexPriceToPay .a-offscreen").first().text()) ??
        toPrice($("#priceblock_ourprice").first().text()) ??
        toPrice($("#priceblock_dealprice").first().text()),
      oldPrice:
        toPrice($("#priceblock_listprice").first().text()) ??
        toPrice($(".a-text-price .a-offscreen").first().text()),
      currency: "BRL",
    };
  }

  if (marketplace === "mercadolivre") {
    const fraction = toText($(".ui-pdp-price__second-line .andes-money-amount__fraction").first().text());
    const cents = toText($(".ui-pdp-price__second-line .andes-money-amount__cents").first().text());
    const composed = fraction ? `${fraction},${cents ?? "00"}` : null;

    return {
      title: toText($("h1.ui-pdp-title").first().text()),
      imageUrl:
        toText($(".ui-pdp-image.ui-pdp-image--active").first().attr("src")) ??
        toText($(".ui-pdp-gallery__figure img").first().attr("src")),
      price:
        toPrice(composed) ??
        toPrice($(".ui-p-price__shadow").first().text()) ??
        toPrice($("meta[itemprop='price']").attr("content")) ??
        toPrice($("meta[name='twitter:data1']").attr("content")),
      oldPrice: toPrice($(".ui-pdp-price__original-value").first().text()),
      currency: "BRL",
    };
  }

  return { title: null, price: null, oldPrice: null, imageUrl: null, currency: null };
}

function pickByPriority(jsonLd: ParsedData, meta: ParsedData, dom: ParsedData, marketplace: Marketplace) {
  const imageRaw = jsonLd.imageUrl ?? meta.imageUrl ?? dom.imageUrl;

  return {
    title: jsonLd.title ?? meta.title ?? dom.title,
    price: jsonLd.price ?? meta.price ?? dom.price,
    old_price: jsonLd.oldPrice ?? dom.oldPrice,
    image_url:
      marketplace === "amazon"
        ? normalizeAmazonImage(imageRaw)
        : marketplace === "mercadolivre"
          ? normalizeMlImage(imageRaw)
          : imageRaw,
    currency: jsonLd.currency ?? meta.currency ?? dom.currency ?? "BRL",
  };
}

function detectLayer(jsonLd: ParsedData, meta: ParsedData, dom: ParsedData): ExtractionLayer {
  if (jsonLd.title && jsonLd.price && jsonLd.imageUrl) return "json_ld";
  if (meta.title && meta.price && meta.imageUrl) return "meta";
  if (dom.title && dom.price && dom.imageUrl) return "dom";
  if (jsonLd.title || jsonLd.price || meta.title || meta.price || dom.title || dom.price) {
    return "mixed";
  }
  return "none";
}

function isCompleteResult(input: {
  title: string | null;
  price: number | null;
  image_url: string | null;
}): boolean {
  return Boolean(input.title && input.price && input.image_url);
}

function mergeBestResult(
  base: {
    title: string | null;
    price: number | null;
    old_price: number | null;
    image_url: string | null;
    currency: string | null;
  },
  incoming: Partial<{
    title: string | null;
    price: number | null;
    old_price: number | null;
    image_url: string | null;
    currency: string | null;
  }>,
) {
  return {
    title: base.title ?? incoming.title ?? null,
    price: base.price ?? incoming.price ?? null,
    old_price: base.old_price ?? incoming.old_price ?? null,
    image_url: base.image_url ?? incoming.image_url ?? null,
    currency: base.currency ?? incoming.currency ?? null,
  };
}

function buildProxyUrl(proxyBase: string, targetUrl: string): string {
  const safeProxy = proxyBase.trim().replace(/\/+$/g, "");
  return `${safeProxy}?url=${encodeURIComponent(targetUrl)}`;
}

async function fetchHtmlWithProfiles(url: string): Promise<{ html: string; finalUrl: string; attempts: AttemptLog[] }> {
  const attempts: AttemptLog[] = [];
  const profiles = [
    { name: "desktop", headers: BROWSER_HEADERS.desktop },
    { name: "mobile", headers: BROWSER_HEADERS.mobile },
  ];

  let lastError = "Falha ao carregar HTML";
  for (const profile of profiles) {
    try {
      const response = await undiciFetch(url, {
        method: "GET",
        headers: {
          ...profile.headers,
          referer: "https://www.google.com/",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });

      const html = await response.text();
      attempts.push({
        profile: profile.name,
        status: response.status,
        finalUrl: response.url || url,
      });

      if (response.ok && html.length > 800) {
        return { html, finalUrl: response.url || url, attempts };
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Falha de rede";
      attempts.push({ profile: profile.name, status: 0, finalUrl: url });
    }
  }

  throw new Error(`${lastError} (profiles: ${attempts.map((a) => `${a.profile}:${a.status}`).join(", ")})`);
}

async function fetchHtmlViaProxy(url: string): Promise<{ html: string; finalUrl: string; status: number }> {
  const proxyBase =
    process.env.CORS_PROXY_URL?.trim() ||
    process.env.NEXT_PUBLIC_CORS_PROXY?.trim() ||
    "";

  if (!proxyBase) {
    throw new Error("CORS proxy nao configurado.");
  }

  const response = await undiciFetch(buildProxyUrl(proxyBase, url), {
    method: "GET",
    signal: AbortSignal.timeout(12000),
  });

  return {
    html: await response.text(),
    finalUrl: response.url || url,
    status: response.status,
  };
}

async function fetchMicrolinkMetadata(url: string): Promise<{
  status: number;
  title: string | null;
  imageUrl: string | null;
  finalUrl: string;
}> {
  const apiKey =
    process.env.MICROLINK_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_MICROLINK_API_KEY?.trim() ||
    "";

  if (!apiKey) {
    throw new Error("Microlink API key nao configurada.");
  }

  const response = await undiciFetch(
    `https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=true&screenshot=false&video=false&audio=false`,
    {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(12000),
    },
  );

  const payload = (await response.json()) as {
    data?: {
      title?: unknown;
      url?: unknown;
      image?: { url?: unknown };
      logo?: { url?: unknown };
    };
  };

  return {
    status: response.status,
    title: toText(payload.data?.title),
    imageUrl:
      toText(payload.data?.image?.url) ??
      toText(payload.data?.logo?.url),
    finalUrl: toText(payload.data?.url) ?? url,
  };
}

export async function POST(req: NextRequest) {
  try {
    const adminGuard = await requireAdmin(req);
    if (!adminGuard.ok) {
      return NextResponse.json({ success: false, error: adminGuard.error }, { status: adminGuard.status });
    }

    const body = (await req.json()) as { url?: string };
    const sourceUrl = String(body?.url ?? "").trim();

    if (!sourceUrl) {
      return NextResponse.json({ success: false, error: "Campo url obrigatorio." }, { status: 400 });
    }

    const marketplace = detectMarketplace(sourceUrl);
    const attempts: AttemptLog[] = [];
    let finalUrl = sourceUrl;
    let extractionLayer: ExtractionLayer = "none";
    let best = {
      title: null as string | null,
      price: null as number | null,
      old_price: null as number | null,
      image_url: null as string | null,
      currency: "BRL" as string | null,
    };

    try {
      const direct = await fetchHtmlWithProfiles(sourceUrl);
      attempts.push(...direct.attempts);
      finalUrl = direct.finalUrl;

      const jsonLd = parseJsonLd(direct.html);
      const meta = parseMeta(direct.html);
      const dom = parseDom(direct.html, marketplace);

      best = pickByPriority(jsonLd, meta, dom, marketplace);
      extractionLayer = detectLayer(jsonLd, meta, dom);
    } catch {
      attempts.push({ profile: "direct", status: 0, finalUrl: sourceUrl });
    }

    if (!isCompleteResult(best)) {
      try {
        const proxied = await fetchHtmlViaProxy(sourceUrl);
        attempts.push({ profile: "proxy", status: proxied.status, finalUrl: proxied.finalUrl });

        if (proxied.status >= 200 && proxied.status < 300 && proxied.html.length > 800) {
          const jsonLd = parseJsonLd(proxied.html);
          const meta = parseMeta(proxied.html);
          const dom = parseDom(proxied.html, marketplace);
          const proxiedBest = pickByPriority(jsonLd, meta, dom, marketplace);
          best = mergeBestResult(best, proxiedBest);
          if (extractionLayer === "none") {
            extractionLayer = detectLayer(jsonLd, meta, dom);
          }
          finalUrl = proxied.finalUrl || finalUrl;
        }
      } catch {
        attempts.push({ profile: "proxy", status: 0, finalUrl: sourceUrl });
      }
    }

    if (!isCompleteResult(best)) {
      try {
        const microlink = await fetchMicrolinkMetadata(sourceUrl);
        attempts.push({ profile: "microlink", status: microlink.status, finalUrl: microlink.finalUrl });
        best = mergeBestResult(best, {
          title: microlink.title,
          image_url: microlink.imageUrl,
        });
        finalUrl = microlink.finalUrl || finalUrl;
      } catch {
        attempts.push({ profile: "microlink", status: 0, finalUrl: sourceUrl });
      }
    }

    if (!isCompleteResult(best)) {
      return NextResponse.json(
        {
          success: false,
          error: "Nao foi possivel extrair os dados apos as camadas do servidor.",
          attempts,
          data: {
            source_url: sourceUrl,
            product_url: finalUrl,
            title: best.title,
            price: best.price,
            old_price: best.old_price,
            image_url: best.image_url,
            currency: best.currency,
          },
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      marketplace,
      extraction_layer: extractionLayer,
      attempts,
      data: {
        source_url: sourceUrl,
        product_url: finalUrl,
        title: best.title,
        price: best.price,
        old_price: best.old_price,
        image_url: best.image_url,
        currency: best.currency,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Falha na extracao.",
      },
      { status: 500 },
    );
  }
}
