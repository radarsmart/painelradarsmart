"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import useProductExtractor from "@/hooks/useProductExtractor";
import { supabase } from "@/lib/supabase";

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatBRL(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function statusLabel(status: "idle" | "loading" | "success" | "error") {
  if (status === "loading") return "Extraindo";
  if (status === "success") return "Sucesso";
  if (status === "error") return "Erro";
  return "Aguardando";
}

type ToastState = {
  type: "success" | "error";
  text: string;
} | null;

type SniperFeedItem = {
  id: string;
  title: string;
  marketplace: string;
  price: number | null;
  old_price: number | null;
  product_url: string;
  status: string;
  created_at: string;
};

function inferCategory(title: string): string {
  const normalized = title.toLowerCase();
  if (/monitor|tv|notebook|iphone|smartphone|teclado|mouse|gamer|ssd|hd/.test(normalized)) {
    return "Tecnologia";
  }
  if (/fritadeira|cooktop|chaleira|panela|cafeteira|liquidificador|geladeira|micro-ondas/.test(normalized)) {
    return "Casa";
  }
  if (/halter|bike|esteira|fitness|academia|corrida|esporte/.test(normalized)) {
    return "Fitness";
  }
  return "Geral";
}

function marketplaceStoreLabel(value?: string | null): string {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("mercado")) return "MERCADO LIVRE";
  if (normalized.includes("amazon")) return "AMAZON";
  if (normalized.includes("shopee")) return "SHOPEE";
  return "LOJA";
}

function buildWhatsAppCopy(input: {
  store: string;
  title: string;
  oldPrice: number | null;
  price: number | null;
  affiliateUrl: string;
}) {
  const oldPart =
    typeof input.oldPrice === "number" && input.oldPrice > 0
      ? `~~${formatBRL(input.oldPrice)}~~ ➡️ `
      : "";

  return [
    `🔥 *OFERTA RELÂMPAGO* | ${input.store}`,
    `📦 *${input.title}*`,
    `${oldPart}*${formatBRL(input.price)}*`,
    `🛒 Compre agora: ${input.affiliateUrl}`,
    "📲 _Via Radar Smart_",
  ].join("\n");
}

export default function CuradoriaDashboard() {
  const { product, state, extract, reset } = useProductExtractor();
  const [url, setUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [category, setCategory] = useState("Geral");
  const [sniperFeed, setSniperFeed] = useState<SniperFeedItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const autoTriggeredRef = useRef<string>("");

  const hasValidUrl = useMemo(() => isValidUrl(url), [url]);

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
    if (!nextToast) return;
    setTimeout(() => {
      setToast((prev) => (prev === nextToast ? null : prev));
    }, 3500);
  }, []);

  const loadSniperFeed = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const { data, error } = await supabase
        .from("inbox_cache")
        .select("id,title,marketplace,price,old_price,product_url,status,created_at")
        .order("created_at", { ascending: false })
        .limit(12);

      if (!error && Array.isArray(data)) {
        const mapped = data.map((item) => ({
          id: String(item.id),
          title: String(item.title ?? "Sugestão sem título"),
          marketplace: String(item.marketplace ?? "unknown"),
          price: typeof item.price === "number" ? item.price : null,
          old_price: typeof item.old_price === "number" ? item.old_price : null,
          product_url: String(item.product_url ?? ""),
          status: String(item.status ?? "captured"),
          created_at: String(item.created_at ?? new Date().toISOString()),
        }));
        setSniperFeed(mapped);
        return;
      }

      const fallback = await supabase
        .from("scrape_jobs")
        .select("id,source,product_url,status,created_at")
        .order("created_at", { ascending: false })
        .limit(12);

      if (fallback.error) {
        throw new Error(fallback.error.message);
      }

      const mappedFallback = (fallback.data ?? []).map((item) => ({
        id: String(item.id),
        title: "Sugestão capturada pelo monitor",
        marketplace: String(item.source ?? "unknown"),
        price: null,
        old_price: null,
        product_url: String(item.product_url ?? ""),
        status: String(item.status ?? "pending"),
        created_at: String(item.created_at ?? new Date().toISOString()),
      }));
      setSniperFeed(mappedFallback);
    } catch (error) {
      showToast({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao carregar Sniper Feed.",
      });
    } finally {
      setLoadingFeed(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSniperFeed();
  }, [loadSniperFeed]);

  useEffect(() => {
    if (!hasValidUrl) return;
    if (autoTriggeredRef.current === url) return;

    const timer = setTimeout(() => {
      autoTriggeredRef.current = url;
      void extract(url);
    }, 450);

    return () => clearTimeout(timer);
  }, [url, hasValidUrl, extract]);

  useEffect(() => {
    if (!product) return;

    if (!affiliateUrl.trim()) {
      setAffiliateUrl(product.product_url);
    }

    setCategory((prev) => (prev === "Geral" ? inferCategory(product.title) : prev));
  }, [product, affiliateUrl]);

  const handleExtractNow = async () => {
    if (!hasValidUrl) return;
    autoTriggeredRef.current = url;
    await extract(url);
  };

  const handleReset = () => {
    autoTriggeredRef.current = "";
    setUrl("");
    setAffiliateUrl("");
    setCategory("Geral");
    reset();
  };

  const handleGenerateCopy = async () => {
    if (!product) {
      showToast({ type: "error", text: "Extraia um produto antes de gerar a copy." });
      return;
    }
    const affiliate = affiliateUrl.trim() || product.product_url;
    const copy = buildWhatsAppCopy({
      store: marketplaceStoreLabel(product.marketplace),
      title: product.title,
      oldPrice: product.old_price,
      price: product.price,
      affiliateUrl: affiliate,
    });

    try {
      await navigator.clipboard.writeText(copy);
      showToast({ type: "success", text: "📲 Copy WhatsApp copiada com sucesso!" });
    } catch {
      showToast({ type: "error", text: "Falha ao copiar a copy para clipboard." });
    }
  };

  const handleApproveToSite = async () => {
    if (!product) {
      showToast({ type: "error", text: "Extraia um produto antes de aprovar." });
      return;
    }

    const affiliate = affiliateUrl.trim() || product.product_url;
    if (!affiliate) {
      showToast({ type: "error", text: "Informe o link de afiliado." });
      return;
    }

    setPublishing(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) {
        throw new Error("Sessao expirada. Faca login novamente.");
      }

      const response = await fetch("/api/admin/extrator/dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: product.title,
          price: product.price,
          old_price: product.old_price,
          image_url: product.image_url,
          product_url: product.product_url,
          affiliate_url: affiliate,
          marketplace: product.marketplace,
          slot_type: "best",
          publish_to_site: true,
          channels: [],
          raw_data: {
            category,
            source: "curadoria_dashboard",
          },
        }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string; message?: string };
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error ?? payload.message ?? "Falha ao publicar oferta.");
      }

      showToast({ type: "success", text: "🚀 Oferta publicada no Radar Smart!" });
      await loadSniperFeed();
    } catch (error) {
      showToast({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao publicar oferta.",
      });
    } finally {
      setPublishing(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast({ type: "success", text: `Copiado: ${label}.` });
    } catch {
      showToast({ type: "error", text: `Falha ao copiar: ${label}.` });
    }
  };

  const priceFrom = product?.old_price ?? null;
  const priceTo = product?.price ?? null;
  const imageHiRes = product?.image_url ?? "";

  return (
    <div className="space-y-6 rounded-2xl border border-[#1F2A44] bg-[#0A1020] p-5 text-slate-100 shadow-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1F2A44] bg-[#0F172A] p-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Curadoria Dashboard</h1>
          <p className="mt-1 text-sm text-slate-300">
            Radar Smart Deep Scraping | JSON-LD → MetaTags → DOM
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#9e6a18]/50 bg-[#9e6a18]/15 px-3 py-1 text-xs font-semibold text-[#F5D08B]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Sniper Feed Online
        </div>
      </header>

      {toast ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            toast.type === "success"
              ? "border-emerald-300 bg-emerald-100/90 text-emerald-800"
              : "border-red-300 bg-red-100/90 text-red-800"
          }`}
        >
          {toast.text}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-[#1F2A44] bg-[#0F172A] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#F5D08B]">
            <Sparkles className="h-4 w-4" />
            Motor de Extração
          </div>

          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            URL do produto
          </label>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Cole o link da Amazon ou Mercado Livre"
            className="mt-2 h-11 w-full rounded-lg border border-[#22304F] bg-[#0B1222] px-3 text-sm text-white outline-none transition focus:border-[#9e6a18]"
          />

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Link de afiliado (Franeto)
          </label>
          <input
            value={affiliateUrl}
            onChange={(event) => setAffiliateUrl(event.target.value)}
            placeholder="https://..."
            className="mt-2 h-11 w-full rounded-lg border border-[#22304F] bg-[#0B1222] px-3 text-sm text-white outline-none transition focus:border-[#9e6a18]"
          />

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Categoria
          </label>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="mt-2 h-11 w-full rounded-lg border border-[#22304F] bg-[#0B1222] px-3 text-sm text-white outline-none transition focus:border-[#9e6a18]"
          />

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleExtractNow}
              disabled={!hasValidUrl || state.status === "loading"}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#9e6a18] text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state.status === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TerminalSquare className="h-4 w-4" />
              )}
              Extrair
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#22304F] bg-[#111A2E] text-sm font-semibold text-slate-200 transition hover:bg-[#17223A]"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-[#22304F] bg-[#0B1222] p-3 text-xs text-slate-300">
            <p>
              Status: <span className="font-semibold text-white">{statusLabel(state.status)}</span>
            </p>
            <p className="mt-1">
              Camada: <span className="font-semibold text-white">{product?.extraction_layer ?? "--"}</span>
            </p>
            {state.error ? (
              <p className="mt-2 inline-flex items-center gap-1 text-red-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {state.error}
              </p>
            ) : null}
          </div>
        </article>

        <article className="rounded-xl border border-[#1F2A44] bg-[#0F172A] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#F5D08B]">Preview da Oferta</p>
            {product ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Dados carregados
              </span>
            ) : null}
          </div>

          <div className="rounded-xl border border-[#22304F] bg-[#0B1222] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageHiRes || "/logo.png"}
              alt={product?.title || "Preview"}
              className="h-52 w-full rounded-lg border border-[#22304F] bg-white object-contain p-2"
            />

            <h3 className="mt-3 line-clamp-3 text-base font-bold text-white">
              {product?.title || "Aguardando extração..."}
            </h3>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-[#22304F] bg-[#111A2E] p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Preço De</p>
                <p className="mt-1 font-semibold text-slate-200">{formatBRL(priceFrom)}</p>
              </div>
              <div className="rounded-lg border border-[#22304F] bg-[#111A2E] p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Preço Por</p>
                <p className="mt-1 text-lg font-black text-[#F5D08B]">{formatBRL(priceTo)}</p>
              </div>
            </div>

            <div className="mt-3 space-y-1 text-xs text-slate-300">
              <p>
                URL Produto: <span className="text-slate-100">{product?.product_url || "--"}</span>
              </p>
              <p>
                Marketplace: <span className="text-slate-100">{product?.marketplace || "--"}</span>
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleApproveToSite}
                disabled={!product || publishing}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                ✅ Aprovar p/ Site
              </button>
              <button
                type="button"
                onClick={handleGenerateCopy}
                disabled={!product}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#9e6a18] text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Clipboard className="h-4 w-4" />
                📲 Gerar Copy WhatsApp
              </button>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-[#1F2A44] bg-[#0F172A] p-4">
          <div className="mb-3 text-sm font-semibold text-[#F5D08B]">Sniper Feed (Banco)</div>

          <div className="h-[190px] overflow-auto rounded-lg border border-[#22304F] bg-[#0B1222] p-3">
            {loadingFeed ? (
              <div className="inline-flex items-center gap-2 text-xs text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando sinais da inbox_cache...
              </div>
            ) : sniperFeed.length === 0 ? (
              <p className="text-xs text-slate-400">Sem alertas recentes na inbox_cache.</p>
            ) : (
              <ul className="space-y-2">
                {sniperFeed.map((item) => (
                  <li key={item.id} className="rounded-lg border border-[#22304F] bg-[#111A2E] p-2 text-xs text-slate-200">
                    <p className="line-clamp-1 font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-[11px] text-slate-300">
                      {marketplaceStoreLabel(item.marketplace)} • {item.status} • {new Date(item.created_at).toLocaleTimeString("pt-BR")}
                    </p>
                    <p className="mt-1 text-[11px] text-[#F5D08B]">{formatBRL(item.price)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mb-3 mt-4 text-sm font-semibold text-[#F5D08B]">Logs de Guerra (attempts)</div>
          <div className="h-[120px] overflow-auto rounded-lg border border-[#22304F] bg-[#0B1222] p-3">
            {state.attempts.length === 0 ? (
              <p className="text-xs text-slate-400">Sem tentativas ainda.</p>
            ) : (
              <ul className="space-y-2">
                {state.attempts.map((attempt, index) => (
                  <li
                    key={`${attempt.timestamp}-${index}`}
                    className={`rounded-lg border p-2 text-xs ${
                      attempt.ok
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        : "border-red-500/40 bg-red-500/10 text-red-200"
                    }`}
                  >
                    <p className="font-semibold">
                      {attempt.source} • {attempt.ok ? "OK" : "FAIL"}
                    </p>
                    <p className="mt-1 opacity-90">{attempt.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard(product?.title || "", "título")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#22304F] bg-[#111A2E] text-xs font-semibold text-slate-100 transition hover:bg-[#17223A]"
            >
              <Clipboard className="h-3.5 w-3.5" /> Copiar Título
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(formatBRL(product?.price), "preço")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#22304F] bg-[#111A2E] text-xs font-semibold text-slate-100 transition hover:bg-[#17223A]"
            >
              <Clipboard className="h-3.5 w-3.5" /> Copiar Preço
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
