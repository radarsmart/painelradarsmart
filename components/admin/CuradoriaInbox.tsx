"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { formatBRL } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import { sanitizeMarketplaceUrl } from "@/lib/amazon";
import {
  computeDiscountPct,
  computePopularityScore,
  computeProfitPotential,
  getRelevanceSignals,
} from "@/lib/radar-sniper";

type DestinationBlock = "flash" | "day" | "blog";

type CuradoriaOffer = {
  id: string;
  title: string | null;
  marketplace: string | null;
  price: number | null;
  old_price: number | null;
  discount_pct: number | null;
  discount_percent: number | null;
  rating: number | null;
  review_count: number | null;
  reviews_count: number | null;
  raw_data: unknown;
  image_url: string | null;
  affiliate_url: string | null;
  product_url: string | null;
  status: string | null;
  curations_status: string | null;
  created_at: string | null;
  quality_score?: number | null;
  is_priority?: boolean | null;
};

import { QualityScoreBadge } from "./QualityScoreBadge";

type EnrichedOffer = CuradoriaOffer & {
  discount: number;
  popularityScore: number;
  profitPotential: number;
  hasBestSeller: boolean;
  hasPrimeOrFull: boolean;
};

type GroupModalState = {
  open: boolean;
  offerTitle: string;
  copyText: string;
  affiliateUrl: string;
  confirmationText: string;
};

function offerMarketplaceLabel(marketplace: string | null) {
  const value = String(marketplace ?? "").toLowerCase();
  if (value.includes("amazon")) {
    return { label: "🟠 Amazon", className: "bg-orange-50 text-orange-700" };
  }
  if (value.includes("mercado")) {
    return { label: "🟡 ML", className: "bg-yellow-50 text-yellow-700" };
  }
  if (value.includes("shopee")) {
    return { label: "🔴 Shopee", className: "bg-red-50 text-red-700" };
  }
  return { label: marketplace || "Marketplace", className: "bg-slate-100 text-slate-700" };
}

function OfferImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const safeSrc = !failed && src ? src : "/logo.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={safeSrc}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-20 w-20 rounded-xl border border-slate-200 bg-white object-contain p-1"
    />
  );
}

function destinationOptions() {
  return [
    { value: "day", label: "Oferta do Dia" },
    { value: "flash", label: "Ofertas Relâmpago" },
    { value: "blog", label: "Destaque Blog" },
  ] as Array<{ value: DestinationBlock; label: string }>;
}

function destinationLabel(value: DestinationBlock) {
  return destinationOptions().find((option) => option.value === value)?.label ?? "Oferta do Dia";
}

function looksLikeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const AFFILIATE_STORAGE_KEY = "curadoria_affiliate_links";

type AffiliateLinkClass = "valid" | "missing_tracking" | "invalid" | "empty";

function classifyAffiliateUrl(url: string, marketplace: string | null): AffiliateLinkClass {
  if (!url.trim()) return "empty";
  if (!looksLikeUrl(url)) return "invalid";
  const mp = String(marketplace ?? "").toLowerCase();
  if (mp.includes("amazon")) {
    return url.includes("tag=") || url.includes("amzn.to") ? "valid" : "missing_tracking";
  }
  if (mp.includes("mercado")) {
    return url.includes("matt_tool=") || url.includes("mla.io") ? "valid" : "missing_tracking";
  }
  if (mp.includes("shopee")) {
    return url.includes("shope.ee") || url.includes("s.shopee.com.br") ? "valid" : "missing_tracking";
  }
  return "valid";
}

export default function CuradoriaInbox({
  initialOffers,
}: {
  initialOffers: CuradoriaOffer[];
}) {
  const router = useRouter();
  const [offers, setOffers] = useState(initialOffers);
  const [loadingMap, setLoadingMap] = useState<Record<string, string>>({});
  const [affiliateByOffer, setAffiliateByOffer] = useState<Record<string, string>>(
    Object.fromEntries(
      initialOffers.map((offer) => [offer.id, String(offer.affiliate_url ?? "").trim()]),
    ),
  );
  const [destinationByOffer, setDestinationByOffer] = useState<
    Record<string, DestinationBlock>
  >(
    Object.fromEntries(
      initialOffers.map((offer) => [offer.id, "day"]),
    ),
  );
  const [groupModal, setGroupModal] = useState<GroupModalState>({
    open: false,
    offerTitle: "",
    copyText: "",
    affiliateUrl: "",
    confirmationText: "",
  });
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [discoveringMore, setDiscoveringMore] = useState(false);
  const [priorityOnly, setPriorityOnly] = useState(false);

  const getAuthHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const handleUnauthorized = () => {
    window.location.href = "/admin/login";
  };

  useEffect(() => {
    setOffers(initialOffers);
    setAffiliateByOffer(
      Object.fromEntries(
        initialOffers.map((offer) => [offer.id, String(offer.affiliate_url ?? "").trim()]),
      ),
    );
    setDestinationByOffer(
      Object.fromEntries(initialOffers.map((offer) => [offer.id, "day"])),
    );
  }, [initialOffers]);

  // Melhoria #3 — carrega links salvos na sessão ao montar
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(AFFILIATE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, string>;
        setAffiliateByOffer((prev) => ({ ...parsed, ...prev }));
      }
    } catch {
      // sessionStorage indisponível (modo privado etc.) — degrada sem erros
    }
  }, []);

  // Melhoria #3 — persiste links na sessão sempre que o admin digita/cola
  useEffect(() => {
    try {
      sessionStorage.setItem(AFFILIATE_STORAGE_KEY, JSON.stringify(affiliateByOffer));
    } catch {
      // ignora silenciosamente
    }
  }, [affiliateByOffer]);

  const enrichedOffers = useMemo<EnrichedOffer[]>(
    () =>
      [...offers]
        .map((offer) => {
          const discount = computeDiscountPct(
            Number(offer.price ?? 0),
            Number(offer.old_price ?? 0),
            Number(offer.discount_percent ?? offer.discount_pct ?? 0),
          );
          const reviewCount = Number(offer.review_count ?? offer.reviews_count ?? 0);
          const signals = getRelevanceSignals({
            title: offer.title,
            marketplace: offer.marketplace,
            price: offer.price,
            oldPrice: offer.old_price,
            discountPct: discount,
            rating: offer.rating,
            reviewCount,
            raw: offer.raw_data,
          });
          const popularityScore = computePopularityScore({
            title: offer.title,
            marketplace: offer.marketplace,
            price: offer.price,
            oldPrice: offer.old_price,
            discountPct: discount,
            rating: offer.rating,
            reviewCount,
            raw: offer.raw_data,
          });
          const profitPotential = computeProfitPotential({
            title: offer.title,
            marketplace: offer.marketplace,
            price: offer.price,
            oldPrice: offer.old_price,
            discountPct: discount,
            rating: offer.rating,
            reviewCount,
            raw: offer.raw_data,
          });
          return {
            ...offer,
            discount,
            popularityScore,
            profitPotential,
            hasBestSeller: signals.hasBestSeller,
            hasPrimeOrFull: signals.hasPrimeOrFull,
          };
        })
        .sort((a, b) => b.profitPotential - a.profitPotential),
    [offers],
  );

  const displayedOffers = priorityOnly 
    ? enrichedOffers.filter(o => o.is_priority === true)
    : enrichedOffers;

  const curadoriaCount = displayedOffers.length;
  const reviewCount = displayedOffers.filter((offer) =>
    String(offer.curations_status ?? "").toLowerCase().includes("review"),
  ).length;

  const topPotential = enrichedOffers.slice(0, 3);

  const setLoading = (offerId: string, action: string | null) => {
    setLoadingMap((prev) => {
      if (!action) {
        const next = { ...prev };
        delete next[offerId];
        return next;
      }
      return { ...prev, [offerId]: action };
    });
  };

  const removeFromState = (offerId: string) => {
    setOffers((prev) => prev.filter((offer) => offer.id !== offerId));
    setAffiliateByOffer((prev) => {
      const next = { ...prev };
      delete next[offerId];
      return next;
    });
    setDestinationByOffer((prev) => {
      const next = { ...prev };
      delete next[offerId];
      return next;
    });
  };

  const executeArchive = async (offerId: string) => {
    setLoading(offerId, "archive");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/curadoria", {
        method: "POST",
        headers: await getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          action: "archive",
          offer_id: offerId,
        }),
      });
      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao arquivar.");

      removeFromState(offerId);
      setFeedback({ type: "success", text: "Item arquivado com sucesso." });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao arquivar item.",
      });
    } finally {
      setLoading(offerId, null);
    }
  };

  const executePrepareGroup = async (offer: EnrichedOffer) => {
    const manualAffiliateUrl = String(affiliateByOffer[offer.id] ?? "").trim();
    if (!manualAffiliateUrl) {
      setFeedback({
        type: "error",
        text: "Preencha o link de afiliado antes de gerar copy.",
      });
      return;
    }
    if (!looksLikeUrl(manualAffiliateUrl)) {
      setFeedback({
        type: "error",
        text: "Link de afiliado invalido. Use URL completa (https://...).",
      });
      return;
    }

    setLoading(offer.id, "group");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/curadoria", {
        method: "POST",
        headers: await getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          action: "prepare_group",
          offer_id: offer.id,
          affiliate_url: manualAffiliateUrl,
        }),
      });
      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      const payload = (await response.json()) as {
        error?: string;
        copy_text?: string;
        affiliate_url?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao gerar copy.");

      const safeAffiliate = String(payload.affiliate_url ?? manualAffiliateUrl);
      setAffiliateByOffer((prev) => ({ ...prev, [offer.id]: safeAffiliate }));

      setGroupModal({
        open: true,
        offerTitle: String(offer.title ?? "Oferta"),
        copyText: String(payload.copy_text ?? ""),
        affiliateUrl: safeAffiliate,
        confirmationText: "",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao preparar copy.",
      });
    } finally {
      setLoading(offer.id, null);
    }
  };

  const executeApproveOffer = async (offer: EnrichedOffer) => {
    const manualAffiliateUrl = String(affiliateByOffer[offer.id] ?? "").trim();
    const destinationBlock = destinationByOffer[offer.id] ?? "day";

    // Melhoria #2 — usa classificação de URL em vez de apenas looksLikeUrl
    const urlClass = classifyAffiliateUrl(manualAffiliateUrl, offer.marketplace);

    if (urlClass === "empty") {
      setFeedback({
        type: "error",
        text: "Cole seu link de afiliado antes de aprovar a oferta.",
      });
      return;
    }
    if (urlClass === "invalid") {
      setFeedback({
        type: "error",
        text: "Link de afiliado inválido. Use URL completa (https://...).",
      });
      return;
    }

    setLoading(offer.id, "approve");
    setFeedback(null);
    try {
      // Melhoria #4 — uma única requisição: publish já retorna copy_text
      const publishResponse = await fetch("/api/admin/curadoria", {
        method: "POST",
        headers: await getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          action: "publish",
          offer_id: offer.id,
          destination_block: destinationBlock,
          affiliate_url: manualAffiliateUrl,
        }),
      });
      if (publishResponse.status === 401 || publishResponse.status === 403) {
        handleUnauthorized();
        return;
      }
      const publishPayload = (await publishResponse.json()) as {
        error?: string;
        copy_text?: string;
        affiliate_url?: string;
      };
      if (!publishResponse.ok) {
        throw new Error(publishPayload.error ?? "Falha ao aprovar oferta.");
      }

      const safeAffiliate = String(publishPayload.affiliate_url ?? manualAffiliateUrl);
      const confirmationText = `Enviado para: ${destinationLabel(destinationBlock)} ✅`;
      setGroupModal({
        open: true,
        offerTitle: String(offer.title ?? "Oferta"),
        copyText: String(publishPayload.copy_text ?? ""),
        affiliateUrl: safeAffiliate,
        confirmationText,
      });
      removeFromState(offer.id);
      setFeedback({
        type: "success",
        text: confirmationText,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao aprovar oferta.",
      });
    } finally {
      setLoading(offer.id, null);
    }
  };

  const executeUseSuggestion = (offerId: string) => {
    router.push(`/admin/ofertas/nova?suggestion_offer_id=${encodeURIComponent(offerId)}`);
  };

  const fetchMoreOffers = async () => {
    setDiscoveringMore(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/admin/curadoria/discover?force=1&limit=20&t=${Date.now()}`,
        {
          method: "GET",
          headers: await getAuthHeaders(),
          credentials: "include",
          cache: "no-store",
        },
      );

      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }

      const payload = (await response.json()) as {
        error?: string;
        offers?: CuradoriaOffer[];
        source?: string;
        requested_limit?: number;
        existing_count?: number;
        seeded_count?: number;
      };

      const incoming = Array.isArray(payload.offers) ? payload.offers : [];

      // Debug solicitado: mostrar contagens e origem do discover.
      // eslint-disable-next-line no-console
      console.log("curadoria/discover force=1:", {
        source: payload.source,
        requested_limit: payload.requested_limit,
        existing_count: payload.existing_count,
        seeded_count: payload.seeded_count,
        returned_offers: incoming.length,
        offer_ids: incoming.slice(0, 8).map((offer) => offer.id),
      });

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao buscar mais ofertas.");
      }

      if (!incoming.length) {
        setFeedback({
          type: "error",
          text: "Nenhuma nova oferta encontrada agora. Tente novamente em instantes.",
        });
        return;
      }

      setOffers((prev) => {
        const map = new Map(prev.map((offer) => [offer.id, offer]));
        for (const offer of incoming) {
          map.set(offer.id, offer);
        }
        return Array.from(map.values());
      });

      setAffiliateByOffer((prev) => {
        const next = { ...prev };
        for (const offer of incoming) {
          if (!next[offer.id]) {
            next[offer.id] = String(offer.affiliate_url ?? "").trim();
          }
        }
        return next;
      });

      setDestinationByOffer((prev) => {
        const next = { ...prev };
        for (const offer of incoming) {
          if (!next[offer.id]) {
            next[offer.id] = "day";
          }
        }
        return next;
      });

      setFeedback({
        type: "success",
        text: `${incoming.length} ofertas processadas pelo Sniper.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Falha ao buscar mais ofertas de curadoria.",
      });
    } finally {
      setDiscoveringMore(false);
    }
  };

  const copyGroupText = async () => {
    if (!groupModal.copyText.trim()) return;
    await navigator.clipboard.writeText(groupModal.copyText);
    setFeedback({ type: "success", text: "Copy AIDA copiada para a area de transferencia." });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Inbox de Curadoria
          </p>
          <p className="mt-2 text-3xl font-black text-[#22223B]">{curadoriaCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Precisa de Revisao
          </p>
          <p className="mt-2 text-3xl font-black text-[#9e6a18]">{reviewCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Triagem Inteligente
          </p>
          <p className="mt-2 text-sm font-semibold text-[#22223B]">
            Ordenado por potencial de lucro (desconto + popularidade).
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={fetchMoreOffers}
          disabled={discoveringMore}
          className="inline-flex items-center gap-2 rounded-xl border border-[#9e6a18]/30 bg-[#9e6a18]/10 px-4 py-2 text-sm font-semibold text-[#9e6a18] transition hover:bg-[#9e6a18]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {discoveringMore ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          BUSCAR MAIS OFERTAS
        </button>
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={() => setPriorityOnly(!priorityOnly)}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            priorityOnly 
              ? "bg-emerald-500 text-white shadow-sm" 
              : "bg-black/5 text-gray-600 hover:bg-black/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
          }`}
        >
          <Zap className="h-4 w-4" />
          Apenas Prioridade Alta
        </button>
      </div>

      {topPotential.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Top 3 Potencial de Lucro
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            {topPotential.map((offer) => (
              <div
                key={`top-${offer.id}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <p className="line-clamp-1 text-sm font-semibold text-[#22223B]">
                  {offer.title || "Oferta sem titulo"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Potencial: <strong>{offer.profitPotential}/100</strong>
                </p>
                <p className="text-xs text-slate-500">
                  Desconto do robo: <strong>{offer.discount}%</strong>
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {feedback ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {discoveringMore ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`discovering-skeleton-${index}`}
              className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="h-20 w-20 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-slate-200" />
                  <div className="h-4 w-1/2 rounded bg-slate-200" />
                  <div className="h-3 w-1/3 rounded bg-slate-100" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!displayedOffers.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          🕵️ O Sniper esta procurando ofertas com lucro agora... tente atualizar em 30 segundos.
        </div>
      ) : null}

      <div className="space-y-4">
        {displayedOffers.map((offer) => {
          const loadingAction = loadingMap[offer.id] ?? null;
          const market = offerMarketplaceLabel(offer.marketplace);
          const marketplaceUrl = sanitizeMarketplaceUrl(
            offer.product_url,
            offer.marketplace,
            {
              fallbackUrl: offer.affiliate_url,
              amazonTag: "radarsmart202-20",
            },
          );
          const affiliateValue = String(affiliateByOffer[offer.id] ?? "").trim();
          const destination = destinationByOffer[offer.id] ?? "day";
          // Melhoria #2 — classifica o link e define se o botão está habilitado
          const urlClass = classifyAffiliateUrl(affiliateValue, offer.marketplace);
          const approveDisabled = (urlClass === "empty" || urlClass === "invalid") || Boolean(loadingAction);

          return (
            <article
              key={offer.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <OfferImage src={offer.image_url} alt={offer.title ?? "Oferta"} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${market.className}`}
                      >
                        {market.label}
                      </span>
                      <span className="inline-flex rounded-full bg-[#9e6a18]/10 px-2.5 py-1 text-xs font-semibold text-[#9e6a18]">
                        Desconto do robo: {offer.discount}%
                      </span>
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        Potencial {offer.profitPotential}/100
                      </span>
                      {offer.hasBestSeller ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          Mais Vendidos
                        </span>
                      ) : null}
                      {offer.hasPrimeOrFull ? (
                        <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          Prime/Full
                        </span>
                      ) : null}
                      <QualityScoreBadge score={offer.quality_score} isPriority={offer.is_priority} />
                    </div>
                    <p className="mt-2 line-clamp-2 text-base font-bold text-[#22223B]">
                      {offer.title || "Oferta sem titulo"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {offer.created_at
                        ? `Detectada em ${new Date(offer.created_at).toLocaleString("pt-BR")}`
                        : "Sem data de deteccao"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-mono text-lg font-bold text-[#22223B]">
                        {formatBRL(Number(offer.price ?? 0))}
                      </span>
                      {Number(offer.old_price ?? 0) > Number(offer.price ?? 0) ? (
                        <span className="text-slate-400 line-through">
                          {formatBRL(Number(offer.old_price ?? 0))}
                        </span>
                      ) : null}
                      <span className="text-xs text-slate-500">
                        Popularidade: {offer.popularityScore}/100
                      </span>
                    </div>
                    {!offer.image_url && Number(offer.price ?? 0) > 0 ? (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                        ⚠️ Preço extraído, mas a imagem foi bloqueada pela loja.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="w-full max-w-md space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cole seu Link de Afiliado aqui
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={affiliateByOffer[offer.id] ?? ""}
                      onChange={(event) =>
                        setAffiliateByOffer((prev) => ({
                          ...prev,
                          [offer.id]: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                      className={`h-10 flex-1 rounded-lg border-2 bg-white px-3 text-sm outline-none transition-colors ${
                        urlClass === "valid"
                          ? "border-emerald-500 focus:border-emerald-600"
                          : urlClass === "missing_tracking"
                            ? "border-amber-400 focus:border-amber-500"
                            : urlClass === "invalid"
                              ? "border-red-400 focus:border-red-500"
                              : "border-[#9e6a18]/50 focus:border-[#9e6a18]"
                      }`}
                    />
                    <button
                      type="button"
                      disabled={!marketplaceUrl}
                      onClick={() => window.open(marketplaceUrl, "_blank")}
                      className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir no Marketplace
                    </button>
                  </div>
                  {/* Melhoria #2 — feedback visual do link de afiliado */}
                  {urlClass === "valid" && affiliateValue ? (
                    <p className="text-xs font-semibold text-emerald-600">✅ Link de afiliado válido</p>
                  ) : urlClass === "missing_tracking" ? (
                    <p className="text-xs font-semibold text-amber-600">
                      ⚠️ URL válida, mas sem parâmetro de rastreamento detectado. Verifique se você gerou o link pelo portal de afiliados do marketplace.
                    </p>
                  ) : urlClass === "invalid" ? (
                    <p className="text-xs text-red-600">❌ URL inválida — use o formato https://...</p>
                  ) : null}

                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <select
                      value={destination}
                      onChange={(event) =>
                        setDestinationByOffer((prev) => ({
                          ...prev,
                          [offer.id]: event.target.value as DestinationBlock,
                        }))
                      }
                      className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    >
                      {destinationOptions().map((option) => (
                        <option key={`${offer.id}-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => executeApproveOffer(offer)}
                      disabled={approveDisabled}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#9e6a18] px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingAction === "approve" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      APROVAR OFERTA
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => executeUseSuggestion(offer.id)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#22223B] px-3 text-xs font-semibold text-white transition hover:brightness-110"
                    >
                      ⚡ USAR ESTA OFERTA
                    </button>
                    <button
                      type="button"
                      onClick={() => executePrepareGroup(offer)}
                      disabled={Boolean(loadingAction)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingAction === "group" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-[#9e6a18]" />
                      )}
                      Gerar Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => executeArchive(offer.id)}
                      disabled={Boolean(loadingAction)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingAction === "archive" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                      Arquivar
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {groupModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-[#22223B]">Copy para Grupo</h3>
            <p className="mt-1 text-sm text-slate-500">{groupModal.offerTitle}</p>
            {groupModal.confirmationText ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                {groupModal.confirmationText}
              </div>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">
              Link de afiliado aplicado: {groupModal.affiliateUrl || "nao informado"}
            </p>
            <textarea
              value={groupModal.copyText}
              onChange={(event) =>
                setGroupModal((prev) => ({ ...prev, copyText: event.target.value }))
              }
              className="mt-3 min-h-[220px] w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-800"
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={copyGroupText}
                className="inline-flex items-center gap-2 rounded-lg bg-[#22223B] px-4 py-2 text-sm font-semibold text-white"
              >
                <Copy className="h-4 w-4" />
                Copiar Copy AIDA
              </button>
              <button
                type="button"
                onClick={() =>
                  setGroupModal({
                    open: false,
                    offerTitle: "",
                    copyText: "",
                    affiliateUrl: "",
                    confirmationText: "",
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                <Send className="h-4 w-4" />
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
