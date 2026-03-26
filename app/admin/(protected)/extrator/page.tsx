"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  MousePointer2,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";

import { sanitizeMarketplaceUrl } from "@/lib/amazon";
import { normalizeMercadoLivreAffiliateUrl } from "@/lib/mercadolivre";
import { formatBRL } from "@/lib/formatters";
import { computeProfitPotential } from "@/lib/radar-sniper";
import { supabase } from "@/lib/supabase";

type SupportedMarketplace = "amazon" | "mercadolivre";
type UnsupportedMarketplace = "shopee";
type RouteMarketplace = SupportedMarketplace | UnsupportedMarketplace | null;
type DispatchAction = "telegram" | "whatsapp" | "site";

type SlotType = "flash" | "best" | "hero" | "comparator";

type ExtractPreview = {
  title: string;
  price: number;
  old_price: number;
  final_price: number;
  image_url: string;
  product_url: string;
  affiliate_url: string;
  marketplace: SupportedMarketplace;
  engine: string;
  extraction_layer: string;
  coupon_code: string;
  coupon_discount_pct: number;
  momentum_score: number;
  raw_data: Record<string, unknown>;
  missing_fields: string[];
};

type ExtractResponse = {
  success?: boolean;
  status?: "ok" | "partial_failure" | "error";
  marketplace?: SupportedMarketplace;
  engine?: string;
  extraction_layer?: string;
  title?: string;
  price?: number;
  old_price?: number;
  final_price?: number;
  image?: string;
  image_url?: string;
  product_url?: string;
  affiliate_url?: string;
  coupon_code?: string | null;
  coupon_discount_pct?: number | null;
  momentum_score?: number;
  preview?: {
    title?: string;
    price?: number;
    old_price?: number;
    original_price?: number;
    final_price?: number;
    image_url?: string;
    product_url?: string;
    affiliate_url?: string;
    coupon_code?: string | null;
    coupon_discount_pct?: number | null;
    momentum_score?: number;
  };
  extracted?: Record<string, unknown>;
  missing_fields?: string[];
  debug_info?: {
    layer_used?: string;
    latency_ms?: number;
  };
  error?: string;
};

type DispatchResponse = {
  success?: boolean;
  message?: string;
  offer_id?: string;
  distribution?: {
    queued?: number;
    skipped?: number;
  };
  error?: string;
};

type Feedback = {
  type: "success" | "error" | "info";
  text: string;
};

type PriceAlert = {
  show: boolean;
  message: string;
  link: string;
  store: string;
  price: number;
  title: string;
};

type DailyCategoryLinks = {
  amz: string;
  ml: string;
};

type CompetitorPriceResponse = {
  found?: boolean;
  store?: string;
  title?: string;
  price?: number;
  url?: string;
  error?: string;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function detectMarketplace(url: string): RouteMarketplace {
  const normalized = url.toLowerCase();

  if (normalized.includes("amazon.com.br") || normalized.includes("amzn.to")) {
    return "amazon";
  }

  if (
    normalized.includes("mercadolivre.com.br") ||
    normalized.includes("mercadolivre.com") ||
    normalized.includes("mercadolibre.") ||
    normalized.includes("meli.la")
  ) {
    return "mercadolivre";
  }

  if (normalized.includes("shopee.com.br")) {
    return "shopee";
  }

  return null;
}

function buildAffiliateUrl(url: string, marketplace: SupportedMarketplace) {
  const normalizedUrl = sanitizeMarketplaceUrl(url, marketplace, { fallbackUrl: url, amazonTag: null });

  if (marketplace === "mercadolivre") {
    return normalizeMercadoLivreAffiliateUrl(normalizedUrl);
  }

  return normalizedUrl;
}

function buildPreview(
  response: ExtractResponse,
  sourceUrl: string,
  marketplace: SupportedMarketplace,
): ExtractPreview {
  const preview = response.preview ?? {};
  const originalPrice = toNumber(preview.price ?? response.price);
  const finalPrice = toNumber(preview.final_price ?? response.final_price ?? originalPrice);
  const oldPrice = toNumber(
    preview.old_price ??
      preview.original_price ??
      response.old_price ??
      (finalPrice < originalPrice ? originalPrice : 0),
  );
  const imageUrl =
    toText(preview.image_url) || toText(response.image_url) || toText(response.image);
  const productUrl = toText(preview.product_url) || toText(response.product_url) || sourceUrl;
  const affiliateUrl =
    toText(preview.affiliate_url) || toText(response.affiliate_url) || buildAffiliateUrl(productUrl, marketplace);

  return {
    title: toText(preview.title) || toText(response.title),
    price: finalPrice,
    old_price: oldPrice,
    final_price: finalPrice,
    image_url: imageUrl,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    marketplace,
    engine: toText(response.engine) || "auto",
    extraction_layer:
      toText(response.debug_info?.layer_used) || toText(response.extraction_layer) || "auto",
    coupon_code: toText(preview.coupon_code ?? response.coupon_code).toUpperCase(),
    coupon_discount_pct: toNumber(preview.coupon_discount_pct ?? response.coupon_discount_pct),
    momentum_score: toNumber(preview.momentum_score ?? response.momentum_score),
    raw_data: (response.extracted ?? {}) as Record<string, unknown>,
    missing_fields: Array.isArray(response.missing_fields) ? response.missing_fields : [],
  };
}

function buildDispatchCopy(preview: ExtractPreview): string {
  const lines = [
    "Oferta Radar Smart",
    preview.title,
    `Preco: ${formatBRL(preview.price)}`,
  ];

  if (preview.old_price > preview.price) {
    lines.push(`De: ${formatBRL(preview.old_price)}`);
  }

  if (preview.coupon_code) {
    lines.push(`Cupom: ${preview.coupon_code}`);
  }

  lines.push(`Link: ${preview.affiliate_url}`);
  return lines.join("\n");
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(raw || `Resposta invalida do servidor (HTTP ${response.status}).`);
  }
}

function resolveEngineLabel(preview: ExtractPreview | null) {
  if (!preview) return "Deteccao automatica";
  const engine = preview.engine.toLowerCase();

  if (engine.includes("rainforest")) return "Rainforest";
  if (engine.includes("zenscrape")) return "ZenScrape";
  if (engine.includes("official")) return "ML Oficial";
  if (engine.includes("merged")) return "ZenScrape + Oficial";
  if (engine.includes("container")) return "Fallback Container";
  return preview.engine;
}

function getSaoPauloWeekdayIndex() {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  const dayIndexMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  return dayIndexMap[weekday] ?? 0;
}

function getDailyTip() {
  const days = [
    { day: "Domingo", niche: "Retro 🔥", tip: "Dia de repostar o que bombou na semana!" },
    { day: "Segunda", niche: "Tech 💻", tip: "Foco em Smartphones, Notebooks e Gadgets." },
    { day: "Terca", niche: "Casa 🏠", tip: "Air Fryers, Robos Aspiradores e Cozinha." },
    { day: "Quarta", niche: "Gamer 🎮", tip: "Busque itens de PC, Consoles e Acessorios." },
    { day: "Quinta", niche: "Beleza 💄", tip: "Skincare, Perfumes e itens de Saude." },
    { day: "Sexta", niche: "Lazer 📺", tip: "TVs, Caixas de Som e Churrasco." },
    { day: "Sabado", niche: "Variedades 🛠️", tip: "Brinquedos, Ferramentas e Automotivo." },
  ];
  return days[getSaoPauloWeekdayIndex()];
}

function getCategoryLinks(): DailyCategoryLinks {
  const links: Record<number, DailyCategoryLinks> = {
    0: { amz: "specials", ml: "ofertas" },
    1: { amz: "node=16364751011", ml: "c/informatica" },
    2: { amz: "node=17122851011", ml: "c/casa-moveis-e-decoracao" },
    3: { amz: "node=16339926011", ml: "c/games" },
    4: { amz: "node=16350392011", ml: "c/beleza-e-cuidado-pessoal" },
    5: { amz: "node=16333215011", ml: "c/eletronicos-audio-e-video" },
    6: { amz: "node=16360411011", ml: "c/ferramentas" },
  };

  return links[getSaoPauloWeekdayIndex()];
}

function buildAmazonCategoryUrl(category: string) {
  if (category === "specials") {
    return "https://www.amazon.com.br/gp/goldbox";
  }

  return `https://www.amazon.com.br/b?${category}`;
}

function buildMercadoLivreCategoryUrl(category: string) {
  if (category === "ofertas") {
    return "https://www.mercadolivre.com.br/ofertas";
  }

  return `https://www.mercadolivre.com.br/${category}`;
}

function buildCompetitorSearchQuery(productTitle: string) {
  return encodeURIComponent(
    productTitle
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .join(" "),
  );
}

export default function ExtratorManualPage() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscountPct, setCouponDiscountPct] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [dispatching, setDispatching] = useState<DispatchAction | null>(null);
  const [preview, setPreview] = useState<ExtractPreview | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [priceAlert, setPriceAlert] = useState<PriceAlert | null>(null);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [selectedSlotType, setSelectedSlotType] = useState<SlotType | null>(null);
  const [mlStatus, setMlStatus] = useState<{
    hasToken: boolean;
    isExpired: boolean;
    minutesRemaining: number;
  } | null>(null);

  const canDispatch = Boolean(
    preview && preview.title && preview.price > 0 && preview.product_url && preview.affiliate_url,
  );

  const momentumScore = useMemo(() => {
    if (!preview) return 0;
    if (preview.momentum_score > 0) return preview.momentum_score;

    return computeProfitPotential({
      title: preview.title,
      marketplace: preview.marketplace,
      price: preview.price,
      oldPrice: preview.old_price,
      raw: preview.raw_data,
    });
  }, [preview]);
  const dailyTip = useMemo(() => getDailyTip(), []);
  const categoryLinks = useMemo(() => getCategoryLinks(), []);

  useEffect(() => {
    const fetchMLStatus = async () => {
      try {
        const accessToken = await getAccessToken();
        const response = await fetch("/api/admin/ml/status", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setMlStatus(data);
        }
      } catch (error) {
        console.warn("Failed to fetch ML status:", error);
      }
    };

    fetchMLStatus();
    // Refresh every 5 minutes
    const interval = setInterval(fetchMLStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (error || !token) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }

    return token;
  };

  const checkCompetitorPrice = async (productTitle: string, currentPrice: number, accessToken: string) => {
    const searchQuery = buildCompetitorSearchQuery(productTitle);
    if (!searchQuery) {
      setPriceAlert(null);
      return;
    }

    try {
      const response = await fetch(`/api/admin/check-price?q=${searchQuery}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const competitorData = await parseApiResponse<CompetitorPriceResponse>(response);

      if (!response.ok || !competitorData.found || !competitorData.price) {
        setPriceAlert(null);
        return;
      }

      if (competitorData.price < currentPrice) {
        setPriceAlert({
          show: true,
          message: `Franeto, atencao! Encontramos o mesmo produto no ${competitorData.store ?? "Mercado Livre"} por ${formatBRL(competitorData.price)}.`,
          link: toText(competitorData.url) || "https://www.mercadolivre.com.br/",
          store: toText(competitorData.store) || "Mercado Livre",
          price: competitorData.price,
          title: toText(competitorData.title) || "Oferta concorrente",
        });
        return;
      }

      setPriceAlert(null);
    } catch {
      setPriceAlert(null);
    }
  };

  const handleExtract = async () => {
    const url = sourceUrl.trim();
    const detected = detectMarketplace(url);

    if (!url) {
      setFeedback({ type: "error", text: "Cole uma URL valida para iniciar a captura." });
      return;
    }

    if (detected === "shopee") {
      setFeedback({
        type: "info",
        text: "Shopee ainda nao esta conectada neste extrator. Hoje o fluxo esta ativo para Amazon e Mercado Livre.",
      });
      return;
    }

    if (!detected) {
      setFeedback({
        type: "error",
        text: "URL invalida. Use um link de Amazon, Mercado Livre ou Shopee.",
      });
      return;
    }

    setExtracting(true);
    setFeedback(null);
    setPreview(null);
    setPriceAlert(null);

    try {
      const accessToken = await getAccessToken();
      const affiliateUrl = buildAffiliateUrl(url, detected);
      const normalizedCouponCode = couponCode.trim().toUpperCase();
      const normalizedCouponDiscountPct = Number(couponDiscountPct);
      const response = await fetch("/api/admin/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          url,
          affiliate_url: affiliateUrl,
          marketplace: detected,
          coupon_code: normalizedCouponCode || null,
          coupon_discount_pct:
            Number.isFinite(normalizedCouponDiscountPct) && normalizedCouponDiscountPct > 0
              ? normalizedCouponDiscountPct
              : null,
        }),
      });

      const data = await parseApiResponse<ExtractResponse>(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao extrair a oferta informada.");
      }

      const nextPreview = buildPreview(data, url, detected);
      setPreview(nextPreview);
      if (detected === "amazon" && nextPreview.title && nextPreview.price > 0) {
        void checkCompetitorPrice(nextPreview.title, nextPreview.price, accessToken);
      }
      setFeedback({
        type: data.status === "partial_failure" ? "info" : "success",
        text:
          data.status === "partial_failure"
            ? "Preview parcial carregado. Revise os campos antes do despacho."
            : "Preview carregado. Oferta pronta para despacho instantaneo.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao extrair oferta.",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleDispatch = async (action: DispatchAction, slotType?: SlotType) => {
    if (!preview || !canDispatch) {
      setFeedback({
        type: "error",
        text: "Extraia uma oferta valida antes de tentar aprovar ou despachar.",
      });
      return;
    }

    setDispatching(action);
    setFeedback(null);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/extrator/dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: preview.title,
          price: preview.price,
          old_price: preview.old_price,
          image_url: preview.image_url,
          product_url: preview.product_url,
          affiliate_url: preview.affiliate_url,
          marketplace: preview.marketplace,
          slot_type: slotType,
          raw_data: {
            ...preview.raw_data,
            coupon_code: preview.coupon_code || null,
            coupon_discount_pct: preview.coupon_discount_pct || null,
            momentum_score: momentumScore,
          },
          score: momentumScore,
          coupon_code: preview.coupon_code || null,
          coupon_discount_pct: preview.coupon_discount_pct || null,
          copy_text: buildDispatchCopy(preview),
          channels:
            action === "site"
              ? []
              : action === "telegram"
                ? ["telegram"]
                : ["whatsapp"],
        }),
      });

      const data = await parseApiResponse<DispatchResponse>(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao aprovar ou despachar a oferta.");
      }

      const queued = Number(data.distribution?.queued ?? 0);
      const skipped = Number(data.distribution?.skipped ?? 0);
      const suffix =
        action === "site"
          ? ""
          : queued > 0
            ? ` Jobs enfileirados: ${queued}${skipped ? ` | Ignorados: ${skipped}` : ""}.`
            : "";

      setFeedback({
        type: "success",
        text: `${data.message ?? "Oferta processada com sucesso."}${suffix}`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error ? error.message : "Falha ao executar a acao solicitada.",
      });
    } finally {
      setDispatching(null);
    }
  };

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <MousePointer2 className="text-indigo-600" />
            Extrator de Elite (Sniper)
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Capture ofertas avulsas via <span className="font-bold text-orange-500">Rainforest</span> ou{" "}
            <span className="font-bold text-indigo-500">ZenScrape</span>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <div className="space-y-6 rounded-3xl bg-white p-8 shadow-sm">
            <div className="mb-6 rounded-2xl border-b-4 border-blue-800 bg-gradient-to-r from-blue-600 to-indigo-700 p-5 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                  <span className="text-3xl">🚀</span>
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight text-white">
                    Estrategia de Hoje: {dailyTip.day} {dailyTip.niche}
                  </h2>
                  <p className="text-sm font-medium text-blue-100">
                    Franeto, {dailyTip.tip.toLowerCase()}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-8 flex flex-wrap gap-3">
              <a
                href={buildAmazonCategoryUrl(categoryLinks.amz)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex-1 items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-6 py-4 text-center font-black text-black shadow-md transition-all hover:bg-yellow-500 md:flex"
              >
                <span>🏹 BUSCAR NA AMAZON</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>

              <a
                href={buildMercadoLivreCategoryUrl(categoryLinks.ml)}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 text-center font-black text-white shadow-md transition-all hover:bg-blue-700 md:flex"
              >
                <span>🎯 BUSCAR NO MERCADO LIVRE</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
                {mlStatus && (
                  <span className={`absolute -top-2 -right-2 rounded-full px-2 py-1 text-xs font-bold ${
                    mlStatus.hasToken && !mlStatus.isExpired
                      ? mlStatus.minutesRemaining < 30
                        ? "bg-yellow-500 text-black"
                        : "bg-green-500 text-white"
                      : "bg-red-500 text-white"
                  }`}>
                    {mlStatus.hasToken && !mlStatus.isExpired
                      ? mlStatus.minutesRemaining < 30
                        ? `${mlStatus.minutesRemaining}min`
                        : "✓"
                      : "✗"}
                  </span>
                )}
              </a>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400">
                <LinkIcon size={14} />
                URL da Oferta (Amazon ou Mercado Livre)
              </label>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://www.amazon.com.br/dp/... ou https://www.mercadolivre.com.br/..."
                  className="flex-1 rounded-2xl border-2 border-gray-100 px-6 py-4 text-sm font-medium outline-none transition-all focus:border-indigo-500"
                />

                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={extracting}
                  className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-8 py-4 font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {extracting ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {extracting ? "Extraindo" : "Extrair"}
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-6">
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-lg bg-emerald-500 p-1.5">
                  <Zap size={14} className="fill-white text-white" />
                </div>
                <h3 className="text-xs font-black uppercase tracking-widest text-emerald-900">
                  Injetor de Desconto
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="ml-1 text-[10px] font-bold uppercase text-emerald-700">
                    Codigo do Cupom
                  </label>
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                    placeholder="EX: QUERO10"
                    className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 font-mono text-sm uppercase outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-[10px] font-bold uppercase text-emerald-700">
                    % de Desconto
                  </label>
                  <input
                    type="number"
                    value={couponDiscountPct}
                    onChange={(event) => setCouponDiscountPct(event.target.value)}
                    placeholder="10"
                    className="w-full rounded-xl border-2 border-emerald-100 px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-[10px] font-bold uppercase text-gray-400">API de Captura</p>
                <p className="mt-1 text-sm font-bold text-gray-700">{resolveEngineLabel(preview)}</p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-[10px] font-bold uppercase text-gray-400">Afiliacao</p>
                <p className="mt-1 text-sm font-bold text-indigo-600">
                  {preview?.marketplace === "amazon" ? "radarsmart202-20 (Ativo)" : "Link canonico (Ativo)"}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Shopee entra no proximo ciclo. Hoje o extrator esta ligado em Amazon e Mercado Livre com preview imediato.
            </p>
          </div>

          {priceAlert?.show ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-red-100 p-2 text-red-600">
                  <AlertTriangle size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-500">
                    Modulo Sentinela
                  </p>
                  <h3 className="mt-1 text-sm font-black text-red-900">
                    Concorrente mais barato detectado
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-red-800">
                    🚨 {priceAlert.message}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-red-700">
                      {priceAlert.store}: {formatBRL(priceAlert.price)}
                    </span>
                    <a
                      href={priceAlert.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-black uppercase tracking-[0.18em] text-red-700 underline underline-offset-2"
                    >
                      Abrir concorrente
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {!preview ? (
            <div className="flex items-start gap-6 rounded-3xl bg-white p-8 opacity-50 shadow-sm">
              <div className="flex h-32 w-32 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-100 text-gray-300">
                <Zap size={32} />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
                <div className="mt-4 h-10 w-full rounded-xl bg-gray-50" />
              </div>
            </div>
          ) : (
            <div className="flex gap-6 rounded-3xl bg-white p-8 shadow-sm">
              {preview.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.image_url}
                  alt={preview.title}
                  className="h-32 w-32 rounded-2xl object-cover"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-100 text-gray-300">
                  <Zap size={32} />
                </div>
              )}

              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-lg font-black text-[#1A1A1A]">{preview.title || "Titulo nao encontrado"}</p>
                  <p className="text-xs font-medium uppercase tracking-widest text-gray-400">
                    {preview.marketplace === "amazon" ? "Amazon" : "Mercado Livre"} • {preview.extraction_layer}
                  </p>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <p className="text-3xl font-black text-indigo-600">{formatBRL(preview.price)}</p>
                  {preview.old_price > preview.price ? (
                    <p className="text-sm font-semibold text-gray-400 line-through">
                      {formatBRL(preview.old_price)}
                    </p>
                  ) : null}
                </div>

                {preview.coupon_code ? (
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                    Cupom aplicado: {preview.coupon_code}
                    {preview.coupon_discount_pct > 0 ? ` (${preview.coupon_discount_pct}% OFF)` : ""}
                  </p>
                ) : null}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-gray-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Score de Momentum
                    </p>
                    <p className="mt-1 text-lg font-black text-emerald-600">{momentumScore}</p>
                  </div>

                  <div className="rounded-2xl bg-gray-50 p-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Link Afinado
                    </p>
                    <input
                      type="text"
                      value={preview.affiliate_url}
                      onChange={(event) =>
                        setPreview((current) =>
                          current
                            ? {
                                ...current,
                                affiliate_url: event.target.value,
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-gray-500">
                      Edite o link de afiliado antes do despacho.
                    </p>
                  </div>
                </div>

                {preview.missing_fields.length ? (
                  <p className="text-xs text-amber-700">
                    Campos em revisao: {preview.missing_fields.join(", ")}.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="space-y-6 rounded-3xl bg-[#1A1A1A] p-8 text-white shadow-xl">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Send className="text-[#FFC300]" />
              Despacho Imediato
            </h2>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleDispatch("telegram")}
                disabled={!canDispatch || dispatching !== null}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-sky-500 py-4 font-bold transition-all shadow-lg shadow-sky-500/20 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dispatching === "telegram" ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                Enviar para Telegram
              </button>

              <button
                type="button"
                onClick={() => handleDispatch("whatsapp")}
                disabled={!canDispatch || dispatching !== null}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 py-4 font-bold transition-all shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dispatching === "whatsapp" ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <MessageSquare size={20} />
                )}
                Enviar para WhatsApp
              </button>

              <button
                type="button"
                onClick={() => setShowSlotModal(true)}
                disabled={!canDispatch || dispatching !== null}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white py-4 font-bold text-black transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dispatching === "site" ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                Aprovar no Radar (Site)
              </button>
            </div>

            <p className="text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">
              O link de afiliado e afinado automaticamente no preview
            </p>
          </div>

          <div className="rounded-3xl border border-amber-100 bg-amber-50 p-6">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-800">
              <Zap size={16} />
              Dica de Sniper
            </h3>
            <p className="text-xs leading-relaxed text-amber-700">
              Use o extrator manual para erros de preco ou janelas relampago. O despacho usa a mesma base
              do legacy pipeline para acelerar Telegram e WhatsApp.
            </p>
          </div>

          {feedback ? (
            <div
              className={`rounded-3xl border p-4 text-sm ${
                feedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : feedback.type === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-blue-200 bg-blue-50 text-blue-700"
              }`}
            >
              {feedback.text}
            </div>
          ) : null}
        </div>

        {showSlotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-bold text-gray-900">Escolha o bloco de destino</h3>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setSelectedSlotType("flash");
                    setShowSlotModal(false);
                    handleDispatch("site", "flash");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-orange-100 p-4 text-left hover:bg-orange-200"
                >
                  <span className="text-2xl">🔥</span>
                  <div>
                    <p className="font-semibold text-orange-900">Oferta Relâmpago</p>
                    <p className="text-sm text-orange-700">flash</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setSelectedSlotType("best");
                    setShowSlotModal(false);
                    handleDispatch("site", "best");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-blue-100 p-4 text-left hover:bg-blue-200"
                >
                  <span className="text-2xl">⭐</span>
                  <div>
                    <p className="font-semibold text-blue-900">Melhores Ofertas</p>
                    <p className="text-sm text-blue-700">best</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setSelectedSlotType("hero");
                    setShowSlotModal(false);
                    handleDispatch("site", "hero");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-purple-100 p-4 text-left hover:bg-purple-200"
                >
                  <span className="text-2xl">🏆</span>
                  <div>
                    <p className="font-semibold text-purple-900">Destaque Hero</p>
                    <p className="text-sm text-purple-700">hero</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setSelectedSlotType("comparator");
                    setShowSlotModal(false);
                    handleDispatch("site", "comparator");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-green-100 p-4 text-left hover:bg-green-200"
                >
                  <span className="text-2xl">📊</span>
                  <div>
                    <p className="font-semibold text-green-900">Comparador</p>
                    <p className="text-sm text-green-700">comparator</p>
                  </div>
                </button>
              </div>
              <button
                onClick={() => setShowSlotModal(false)}
                className="mt-4 w-full rounded-2xl bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
