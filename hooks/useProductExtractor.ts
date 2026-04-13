"use client";

import { useCallback, useMemo, useState } from "react";

type ExtractionSource = "internal_api";

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
  attempts?: Array<{
    profile?: string;
    status?: number;
    finalUrl?: string;
  }>;
  data?: {
    title?: string | null;
    price?: number | null;
    old_price?: number | null;
    image_url?: string | null;
    product_url?: string | null;
  };
  error?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
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
        marketplace: payload.marketplace ?? "unknown",
        extraction_layer: payload.extraction_layer ?? "none",
      };

      if (response.ok && isComplete(candidate)) {
        const attemptsMessage =
          payload.attempts && payload.attempts.length > 0
            ? payload.attempts
                .map((attempt) => `${attempt.profile ?? "server"}:${attempt.status ?? 0}`)
                .join(", ")
            : "camadas do servidor";

        appendAttempt({
          source: "internal_api",
          ok: true,
          message: `Extraido com sucesso pela API interna (${attemptsMessage}).`,
        });
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

    const finalError = "Nao foi possivel extrair os dados pelas camadas do servidor.";
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
