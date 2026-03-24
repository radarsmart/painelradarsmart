"use client";

import { useCallback, useMemo, useState } from "react";

type ExtractionSource = "internal_api" | "microlink" | "cloudflare_proxy";

export type ExtractAttempt = {
  source: ExtractionSource;
  ok: boolean;
  message: string;
  timestamp: string;
};

export type ExtractedProduct = {
  title: string;
  price: number | null;
  old_price: number | null;
  image_url: string;
  product_url: string;
  marketplace: "amazon" | "mercadolivre" | "unknown";
  extraction_layer: string;
};

export type ExtractorState = {
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  attempts: ExtractAttempt[];
};

type InternalApiPayload = {
  success?: boolean;
  marketplace?: "amazon" | "mercadolivre" | "unknown";
  extraction_layer?: string;
  data?: {
    title?: string | null;
    price?: number | null;
    old_price?: number | null;
    image_url?: string | null;
    product_url?: string | null;
  };
  error?: string;
};

type MicrolinkPayload = {
  status?: string;
  data?: {
    title?: string;
    url?: string;
    image?: { url?: string };
    logo?: { url?: string };
  };
};

function nowIso() {
  return new Date().toISOString();
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
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

function detectMarketplace(url: string): "amazon" | "mercadolivre" | "unknown" {
  const normalized = url.toLowerCase();
  if (normalized.includes("amazon.")) return "amazon";
  if (normalized.includes("mercadolivre") || normalized.includes("mercadolibre")) return "mercadolivre";
  return "unknown";
}

function isComplete(product: Partial<ExtractedProduct> | null | undefined): product is ExtractedProduct {
  if (!product) return false;
  if (!toText(product.title)) return false;
  if (typeof product.price !== "number" || !Number.isFinite(product.price) || product.price <= 0) {
    return false;
  }
  if (!toText(product.image_url)) return false;
  if (!toText(product.product_url)) return false;
  if (!toText(product.marketplace)) return false;
  return true;
}

function buildProxyUrl(proxyBase: string, targetUrl: string): string {
  const safeProxy = proxyBase
    .trim()
    .replace(/^\[+|\]+$/g, "")
    .replace(/\/+$/g, "");
  return `${safeProxy}?url=${encodeURIComponent(targetUrl)}`;
}

function parseJsonLdPrice(scriptText: string): number | null {
  try {
    const parsed = JSON.parse(scriptText) as unknown;
    const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];

    while (queue.length) {
      const item = queue.shift();
      if (!item || typeof item !== "object") continue;
      const node = item as Record<string, unknown>;

      if (Array.isArray(node["@graph"])) {
        queue.push(...(node["@graph"] as unknown[]));
      }

      const typeValue = String(node["@type"] ?? "").toLowerCase();
      if (!typeValue.includes("product")) continue;

      const offers = node.offers;
      const offersList = Array.isArray(offers)
        ? offers
        : offers && typeof offers === "object"
          ? [offers]
          : [];

      const firstOffer = offersList[0] as Record<string, unknown> | undefined;
      const price = toPrice(firstOffer?.price);
      if (price) return price;
    }
  } catch {
    return null;
  }

  return null;
}

function extractFromHtml(html: string, sourceUrl: string): Partial<ExtractedProduct> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ??
    doc.querySelector("title")?.textContent ??
    "";

  const image =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ??
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ??
    "";

  const metaPrice =
    doc.querySelector('meta[property="product:price:amount"]')?.getAttribute("content") ??
    doc.querySelector('meta[property="og:price:amount"]')?.getAttribute("content") ??
    doc.querySelector('meta[itemprop="price"]')?.getAttribute("content") ??
    doc.querySelector('meta[name="twitter:data1"]')?.getAttribute("content") ??
    "";

  const jsonLdScripts = Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]'),
  )
    .map((script) => script.textContent ?? "")
    .filter(Boolean);

  const jsonLdPrice = jsonLdScripts.map(parseJsonLdPrice).find((value) => value !== null) ?? null;

  return {
    title: toText(title),
    image_url: toText(image),
    price: jsonLdPrice ?? toPrice(metaPrice),
    old_price: null,
    product_url: sourceUrl,
    marketplace: detectMarketplace(sourceUrl),
    extraction_layer: jsonLdPrice ? "json_ld" : "meta",
  };
}

export function useProductExtractor() {
  const [product, setProduct] = useState<ExtractedProduct | null>(null);
  const [state, setState] = useState<ExtractorState>({
    status: "idle",
    error: null,
    attempts: [],
  });

  const appendAttempt = useCallback((attempt: Omit<ExtractAttempt, "timestamp">) => {
    setState((prev) => ({
      ...prev,
      attempts: [...prev.attempts, { ...attempt, timestamp: nowIso() }],
    }));
  }, []);

  const reset = useCallback(() => {
    setProduct(null);
    setState({ status: "idle", error: null, attempts: [] });
  }, []);

  const extract = useCallback(async (url: string) => {
    const sourceUrl = toText(url);
    if (!sourceUrl) {
      const error = "Informe uma URL valida para extracao.";
      setState({ status: "error", error, attempts: [] });
      setProduct(null);
      return null;
    }

    setProduct(null);
    setState({ status: "loading", error: null, attempts: [] });

    // Layer 1: internal API
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl }),
      });

      const payload = (await response.json()) as InternalApiPayload;
      const candidate: Partial<ExtractedProduct> = {
        title: toText(payload.data?.title),
        price: payload.data?.price ?? null,
        old_price: payload.data?.old_price ?? null,
        image_url: toText(payload.data?.image_url),
        product_url: toText(payload.data?.product_url) || sourceUrl,
        marketplace: payload.marketplace ?? detectMarketplace(sourceUrl),
        extraction_layer: payload.extraction_layer ?? "none",
      };

      if (response.ok && isComplete(candidate)) {
        appendAttempt({ source: "internal_api", ok: true, message: "Extraido com sucesso pela API interna." });
        setProduct(candidate);
        setState((prev) => ({ ...prev, status: "success", error: null }));
        return candidate;
      }

      appendAttempt({
        source: "internal_api",
        ok: false,
        message: payload.error ?? "API interna retornou dados incompletos.",
      });
    } catch (error) {
      appendAttempt({
        source: "internal_api",
        ok: false,
        message: error instanceof Error ? error.message : "Falha na API interna.",
      });
    }

    // Layer 2: Microlink
    try {
      const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(sourceUrl)}&meta=true&screenshot=false&video=false&audio=false`;
      const microlinkApiKey = toText(process.env.NEXT_PUBLIC_MICROLINK_API_KEY);
      const response = await fetch(microlinkUrl, {
        method: "GET",
        headers: microlinkApiKey ? { "x-api-key": microlinkApiKey } : undefined,
      });
      const payload = (await response.json()) as MicrolinkPayload;

      const candidate: Partial<ExtractedProduct> = {
        title: toText(payload.data?.title),
        price: null,
        old_price: null,
        image_url: toText(payload.data?.image?.url) || toText(payload.data?.logo?.url),
        product_url: toText(payload.data?.url) || sourceUrl,
        marketplace: detectMarketplace(sourceUrl),
        extraction_layer: "meta",
      };

      if (response.ok && isComplete(candidate)) {
        appendAttempt({ source: "microlink", ok: true, message: "Extraido com sucesso via Microlink." });
        setProduct(candidate);
        setState((prev) => ({ ...prev, status: "success", error: null }));
        return candidate;
      }

      appendAttempt({
        source: "microlink",
        ok: false,
        message: payload.status === "success"
          ? "Microlink retornou sem preco ou imagem completa."
          : "Microlink falhou.",
      });
    } catch (error) {
      appendAttempt({
        source: "microlink",
        ok: false,
        message: error instanceof Error ? error.message : "Falha na Microlink API.",
      });
    }

    // Layer 3: Cloudflare proxy
    try {
      const proxyBase = toText(process.env.NEXT_PUBLIC_CORS_PROXY);
      if (!proxyBase) {
        throw new Error("NEXT_PUBLIC_CORS_PROXY nao configurada.");
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_CORS_PROXY}?url=${encodeURIComponent(sourceUrl)}`,
        { method: "GET" },
      );
      const html = await response.text();
      const candidate = extractFromHtml(html, sourceUrl);

      if (response.ok && isComplete(candidate)) {
        appendAttempt({ source: "cloudflare_proxy", ok: true, message: "Extraido com sucesso via Cloudflare proxy." });
        setProduct(candidate);
        setState((prev) => ({ ...prev, status: "success", error: null }));
        return candidate;
      }

      appendAttempt({
        source: "cloudflare_proxy",
        ok: false,
        message: "Proxy retornou dados incompletos.",
      });
    } catch (error) {
      appendAttempt({
        source: "cloudflare_proxy",
        ok: false,
        message: error instanceof Error ? error.message : "Falha no fallback Cloudflare.",
      });
    }

    const finalError = "Nao foi possivel extrair os dados apos 3 camadas de fallback.";
    setState((prev) => ({ ...prev, status: "error", error: finalError }));
    setProduct(null);
    return null;
  }, [appendAttempt]);

  return useMemo(
    () => ({ product, state, extract, reset }),
    [product, state, extract, reset],
  );
}

export default useProductExtractor;
