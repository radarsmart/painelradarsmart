"use client";

import StoryGeneratorButton from "@/components/admin/StoryGeneratorButton";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Link2, Loader2, MessageSquare, Save, Send, Trash2 } from "lucide-react";
import { formatBRL } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

type Marketplace = "mercadolivre" | "amazon" | "awin";
type OfferSlot = "flash" | "best" | "comparator";

type ExtractPreview = {
  title: string;
  price: number;
  original_price?: number;
  old_price?: number;
  discount_pct?: number;
  image_url?: string;
  imageUrl?: string;
  rating?: number;
  reviews?: number;
  product_url: string;
  productUrl?: string;
  affiliate_url: string;
  affiliateUrl?: string;
};

type ExtractResponse = {
  success?: boolean;
  status?: "ok" | "partial_failure" | "error";
  missing_fields?: string[];
  engine?: string;
  extraction_layer?: string;
  elapsed_ms?: number;
  title?: string;
  price?: number;
  old_price?: number;
  image?: string;
  image_url?: string;
  imageUrl?: string;
  product_url?: string;
  affiliate_url?: string;
  preview?: Partial<ExtractPreview>;
  extracted?: Record<string, unknown>;
  debug_info?: {
    layer_used?: "rainforest" | "zenscrape" | "official" | "container" | "merged" | "html" | "apify";
    missing_fields?: string[];
    latency_ms?: number;
  };
  error?: string;
};

type PublishResponse = {
  success?: boolean;
  queued?: boolean;
  message?: string;
  offer_id?: string;
  offer_status?: string;
  needs_review?: boolean;
  distribution?: {
    queued?: number;
    skipped?: number;
  };
  error?: string;
};

type AwinFeedProduct = {
  id: string;
  productName: string;
  merchantProductId?: string;
  merchantImageUrl?: string;
  awDeepLink: string;
  merchantDeepLink?: string;
  searchPrice: number;
  currency: string;
  originalSearchPrice?: number;
  originalCurrency?: string;
  merchantName?: string;
  categoryName?: string;
};

type AwinFeedResponse = {
  products?: AwinFeedProduct[];
  error?: string;
};

type AdminOfferRecord = {
  id: string;
  title?: string | null;
  product_url?: string | null;
  affiliate_url?: string | null;
  image_url?: string | null;
  marketplace?: string | null;
  price?: number | string | null;
  old_price?: number | string | null;
  original_price?: number | string | null;
  discount_pct?: number | string | null;
  slot_type?: OfferSlot | string | null;
  status?: string | null;
  curations_status?: string | null;
  seller_name?: string | null;
  rating?: number | string | null;
  review_count?: number | string | null;
  raw_data?: Record<string, unknown> | null;
};

type DispatchAction = "telegram" | "whatsapp" | "site" | "selected";

type PublishDestinations = {
  site: boolean;
  telegram: boolean;
  whatsapp: boolean;
};

type Feedback = {
  type: "success" | "error" | "info";
  text: string;
};

type CopyVariantKey = "short" | "medium" | "long";

type WhatsAppCopyVariants = {
  hook: string;
  short: string;
  medium: string;
  long: string;
};

type CopyTemplateKey = "aida" | "urgencia" | "social" | "tecnico";

const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  mercadolivre: "Mercado Livre",
  amazon: "Amazon",
  awin: "AWIN",
};

const DEFAULT_AWIN_ADVERTISER_ID = "18879";
const DEFAULT_AWIN_PUBLISHER_ID = "2843910";
const DEFAULT_DESTINATIONS: PublishDestinations = {
  site: true,
  telegram: false,
  whatsapp: false,
};

const SLOT_OPTIONS: Array<{ id: OfferSlot; label: string; icon: string }> = [
  { id: "flash", label: "Oferta RelÃ¢mpago", icon: "âš¡" },
  { id: "best", label: "Melhores Ofertas", icon: "ðŸ†" },
  { id: "comparator", label: "Comparador", icon: "ðŸ“Š" },
];

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toCleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function detectMarketplaceFromUrl(url: string): Marketplace | null {
  const normalized = url.toLowerCase();

  if (
    normalized.includes("mercadolivre.") ||
    normalized.includes("mercadolibre.") ||
    normalized.includes("meli.la")
  ) {
    return "mercadolivre";
  }

  if (normalized.includes("amazon.") || normalized.includes("amzn.to")) {
    return "amazon";
  }

  if (
    normalized.includes("awin1.com") ||
    normalized.includes("awin.com") ||
    normalized.includes("aliexpress.com") ||
    normalized.includes("pt.aliexpress.com")
  ) {
    return "awin";
  }

  return null;
}

function parseCurrencyInput(value: string): number {
  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAliExpressBrazilUrl(value: string): string {
  const raw = toCleanText(value);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const embedded = parsed.searchParams.get("ued");
    if (parsed.hostname.toLowerCase().endsWith("awin1.com") && embedded) {
      return normalizeAliExpressBrazilUrl(embedded);
    }
    if (parsed.hostname.toLowerCase().endsWith("aliexpress.com")) {
      const targetUrl = parsed.searchParams.get("dl_target_url");
      if (parsed.pathname.toLowerCase().includes("deep_link") && targetUrl) {
        return normalizeAliExpressBrazilUrl(targetUrl);
      }
      parsed.protocol = "https:";
      parsed.hostname = "pt.aliexpress.com";
      return parsed.toString();
    }
  } catch {
    return raw.replace(/https?:\/\/(?:www\.)?aliexpress\.com/gi, "https://pt.aliexpress.com");
  }

  return raw.replace(/https?:\/\/(?:www\.)?aliexpress\.com/gi, "https://pt.aliexpress.com");
}

function isAwinTrackingUrl(value: string): boolean {
  const raw = toCleanText(value).toLowerCase();
  return raw.includes("awin1.com/cread.php");
}

function resolveAwinUrls(value: string) {
  const raw = toCleanText(value);
  const normalizedProductUrl = normalizeAliExpressBrazilUrl(raw);
  const affiliateUrl = isAwinTrackingUrl(raw) ? raw : buildManualAwinAffiliateUrl(normalizedProductUrl);

  return {
    productUrl: normalizedProductUrl,
    affiliateUrl,
  };
}

function buildManualAwinAffiliateUrl(destinationUrl: string): string {
  const normalizedUrl = normalizeAliExpressBrazilUrl(destinationUrl);
  if (!normalizedUrl) return "";

  return `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(
    DEFAULT_AWIN_ADVERTISER_ID,
  )}&awinaffid=${encodeURIComponent(DEFAULT_AWIN_PUBLISHER_ID)}&ued=${encodeURIComponent(normalizedUrl)}`;
}

function extractAliExpressItemId(value: string): string {
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return (
    decoded.match(/\/item\/(\d{8,})/i)?.[1] ||
    decoded.match(/[?&](?:productid|itemid|item_id)=([0-9]{8,})/i)?.[1] ||
    decoded.match(/\b(1005\d{8,})\b/i)?.[1] ||
    ""
  );
}

function extractAliExpressPriceFromUrl(value: string): number {
  try {
    const parsed = new URL(value);
    const pdp = parsed.searchParams.get("pdp_npi") ?? "";
    const decoded = decodeURIComponent(pdp);
    const brlPrices = Array.from(decoded.matchAll(/R\$\s*([\d.]+,\d{2}|\d+(?:[.,]\d{1,2})?)/gi))
      .map((match) => parseCurrencyInput(match[1]))
      .filter((price) => price > 0);
    if (brlPrices.length > 0) return Math.min(...brlPrices);
  } catch {
    return 0;
  }
  return 0;
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    if (
      raw.includes("FUNCTION_INVOCATION_TIMEOUT") ||
      raw.includes("An error occurred with your deployment") ||
      raw.includes("504: GATEWAY_TIMEOUT")
    ) {
      throw new Error(
        "A extraÃ§Ã£o demorou demais no servidor. Tente novamente em alguns segundos. Se persistir, revise os campos manualmente e publique depois do preview.",
      );
    }
    throw new Error(raw || `Resposta invalida do servidor (HTTP ${response.status}).`);
  }
}

function buildPreviewFromExtractResponse(
  response: ExtractResponse,
  sourceUrl: string,
  manualAffiliateUrl: string,
  forcedImageUrl?: string,
): ExtractPreview {
  const preview = response.preview ?? {};

  const title = toCleanText(preview.title) || toCleanText(response.title);
  const price = toNumber(preview.price ?? response.price);
  const oldPrice = toNumber(
    preview.original_price ?? preview.old_price ?? response.old_price,
  );

  const imageUrl =
    toCleanText(forcedImageUrl) ||
    toCleanText(preview.image_url) ||
    toCleanText(preview.imageUrl) ||
    toCleanText(response.image_url) ||
    toCleanText(response.imageUrl) ||
    toCleanText(response.image);

  const productUrl =
    toCleanText(preview.product_url) ||
    toCleanText(preview.productUrl) ||
    toCleanText(response.product_url) ||
    sourceUrl;

  const extractedAffiliate =
    toCleanText(preview.affiliate_url) ||
    toCleanText(preview.affiliateUrl) ||
    toCleanText(response.affiliate_url);

  return {
    title,
    price,
    old_price: oldPrice,
    original_price: oldPrice,
    image_url:
      imageUrl === "/logo.png" || imageUrl.endsWith("/logo.png")
        ? ""
        : imageUrl,
    product_url: productUrl,
    affiliate_url: manualAffiliateUrl || extractedAffiliate || productUrl,
  };
}

/* eslint-disable @typescript-eslint/no-unused-vars */
function buildAidaCopy(
  preview: ExtractPreview | null,
  affiliateUrl: string,
): string {
  if (!preview) return "";

  const price = toNumber(preview.price);
  const oldPrice = toNumber(preview.original_price ?? preview.old_price ?? 0);
  const discount = Number(preview.discount_pct ?? 0);
  const hasOldPrice = oldPrice > 0 && oldPrice > price;

  const oldLine = hasOldPrice ? `\nâŒ De: ${formatBRL(oldPrice)}` : "";
  const discountLine = discount > 0 ? ` (${Math.round(discount)}% de DESCONTO!)` : "";

  return [
    "ðŸš¨ *ALERTA DE OFERTA IMPERDÃVEL!* ðŸš¨",
    preview.title,
    "",
    `${oldLine}\nâœ… *Por apenas: ${formatBRL(price)}*${discountLine}`.trim(),
    "",
    "ðŸ”¥ *Por que vocÃª precisa disso agora?*",
    "Essa Ã© uma daquelas oportunidades que esgotam em minutos. Qualidade premium pelo menor preÃ§o dos Ãºltimos meses.",
    "",
    "ðŸ‘‰ *Garanta o seu antes que acabe:*",
    affiliateUrl || preview.affiliate_url || preview.product_url,
  ].join("\n");
}
function getOfferUrl(preview: ExtractPreview | null, affiliateUrl: string): string {
  return affiliateUrl || preview?.affiliate_url || preview?.product_url || "";
}

function getOldPrice(preview: ExtractPreview | null): number {
  return toNumber(preview?.original_price ?? preview?.old_price ?? 0);
}

const copyTemplates: Record<
  Exclude<CopyTemplateKey, "aida">,
  (preview: ExtractPreview | null, affiliateUrl: string) => string
> = {
  urgencia: (preview, affiliateUrl) => {
    if (!preview) return "";

    return [
      "ðŸš¨ *ESTOQUE BAIXO!*",
      "",
      `*${preview.title}*`,
      "",
      `ðŸ”¥ Por apenas: *${formatBRL(toNumber(preview.price))}*`,
      "",
      "O preÃ§o caiu agora e pode subir a qualquer momento. Aproveite antes que esgote.",
      "",
      `ðŸ‘‰ Link: ${getOfferUrl(preview, affiliateUrl)}`,
    ].join("\n");
  },
  social: (preview, affiliateUrl) => {
    if (!preview) return "";

    return [
      "â­ *O MAIS VENDIDO!*",
      "",
      `*${preview.title}*`,
      "",
      `ðŸ’° *${formatBRL(toNumber(preview.price))}*`,
      "",
      "Este item Ã© o campeÃ£o de vendas na categoria hoje. Quem comprou, aprovou!",
      "",
      `ðŸ‘‰ Garanta o seu: ${getOfferUrl(preview, affiliateUrl)}`,
    ].join("\n");
  },
  tecnico: (preview, affiliateUrl) => {
    if (!preview) return "";

    const oldPrice = getOldPrice(preview);
    const hasOldPrice = oldPrice > toNumber(preview.price);

    return [
      "âœ… *MENOR PREÃ‡O DETECTADO!*",
      "",
      `*${preview.title}*`,
      "",
      hasOldPrice ? `ðŸ“‰ De: ~~${formatBRL(oldPrice)}~~` : null,
      `ðŸ”¥ Por: *${formatBRL(toNumber(preview.price))}*`,
      "",
      "AnÃ¡lise do Radar Smart: Este Ã© o melhor momento de compra dos Ãºltimos 30 dias.",
      "",
      `ðŸ‘‰ Link: ${getOfferUrl(preview, affiliateUrl)}`,
    ]
      .filter(Boolean)
      .join("\n");
  },
};
function buildCopyByTemplate(
  template: CopyTemplateKey,
  preview: ExtractPreview | null,
  affiliateUrl: string,
): string {
  if (template === "aida") {
    return buildAidaCopy(preview, affiliateUrl);
  }

  return copyTemplates[template](preview, affiliateUrl);
}
/* eslint-enable @typescript-eslint/no-unused-vars */

async function generateWhatsAppCopyFromPreview(params: {
  preview: ExtractPreview;
  affiliateUrl: string;
  marketplace: Marketplace;
}): Promise<WhatsAppCopyVariants> {
  const response = await fetch("/api/admin/criativos/whatsapp-copy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.preview.title,
      price: params.preview.price,
      original_price: params.preview.original_price ?? params.preview.old_price,
      discount_pct: params.preview.discount_pct,
      affiliate_url: params.affiliateUrl,
      image_url: params.preview.image_url ?? params.preview.imageUrl,
      marketplace: MARKETPLACE_LABEL[params.marketplace],
      rating: params.preview.rating,
      reviews_count: params.preview.reviews,
    }),
  });

  const json = (await response.json().catch(() => ({}))) as
    | (WhatsAppCopyVariants & { error?: string })
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      typeof json.error === "string" && json.error.trim()
        ? json.error
        : "Falha ao gerar copy inteligente.",
    );
  }

  if (!("hook" in json) || !("short" in json) || !("medium" in json) || !("long" in json)) {
    throw new Error("Copy inteligente retornou resposta incompleta.");
  }

  if (!json.hook || !json.short || !json.medium || !json.long) {
    throw new Error("Copy inteligente retornou resposta incompleta.");
  }

  return {
    hook: json.hook,
    short: json.short,
    medium: json.medium,
    long: json.long,
  };
}

function getPriceScore(price: number, oldPrice: number) {
  if (price <= 0 || oldPrice <= price) {
    return { label: "ðŸ¥‰ BRONZE", color: "text-orange-600" };
  }

  const discount = ((oldPrice - price) / oldPrice) * 100;

  if (discount >= 40) return { label: "ðŸ’Ž OURO", color: "text-yellow-600" };
  if (discount >= 20) return { label: "ðŸ¥ˆ PRATA", color: "text-gray-500" };
  return { label: "ðŸ¥‰ BRONZE", color: "text-orange-600" };
}

export default function AdminNovaOfertaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingOfferId = toCleanText(searchParams.get("id"));
  const isEditing = Boolean(editingOfferId);
  const [marketplace, setMarketplace] = useState<Marketplace>("mercadolivre");
  const [selectedSlot, setSelectedSlot] = useState<OfferSlot>("best");
  const [sourceUrl, setSourceUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualOldPrice, setManualOldPrice] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [publishing, setPublishing] = useState<DispatchAction | null>(null);
  const [selectedDestinations, setSelectedDestinations] =
    useState<PublishDestinations>(DEFAULT_DESTINATIONS);
  const [preview, setPreview] = useState<ExtractPreview | null>(null);
  const [copyText, setCopyText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<CopyVariantKey>("medium");
  const [whatsappCopyVariants, setWhatsAppCopyVariants] = useState<WhatsAppCopyVariants | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [extractDebug, setExtractDebug] = useState<string>("");
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingOffer, setDeletingOffer] = useState(false);
  const [currentStatus, setCurrentStatus] = useState("active");
  const [currentCurationsStatus, setCurrentCurationsStatus] = useState("approved");

  const discountPct = useMemo(() => {
    if (!preview) return 0;
    const current = toNumber(preview.price);
    const old = toNumber(preview.original_price ?? preview.old_price ?? 0);
    if (old > current) return Math.round(((old - current) / old) * 100);
    return Math.max(0, Math.round(Number(preview.discount_pct ?? 0)));
  }, [preview]);

  useEffect(() => {
    if (!preview) {
      setCopyText("");
      setWhatsAppCopyVariants(null);
      return;
    }
    let cancelled = false;

    async function loadModernCopy() {
      const currentPreview = preview;
      if (!currentPreview) return;

      setCopyLoading(true);
      try {
        const generated = await generateWhatsAppCopyFromPreview({
          preview: currentPreview,
          affiliateUrl: getOfferUrl(currentPreview, affiliateUrl.trim()),
          marketplace,
        });

        if (cancelled) return;

        setWhatsAppCopyVariants(generated);
        setSelectedTemplate("medium");
        setCopyText(generated.medium);
        setCopyFeedback(null);
      } catch (error) {
        if (cancelled) return;
        setWhatsAppCopyVariants(null);
        setCopyText("");
        setCopyFeedback(null);
        setFeedback({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Falha ao gerar copy inteligente.",
        });
      } finally {
        if (!cancelled) {
          setCopyLoading(false);
        }
      }
    }

    void loadModernCopy();

    return () => {
      cancelled = true;
    };
  }, [preview, affiliateUrl, marketplace]);

  useEffect(() => {
    if (!whatsappCopyVariants) return;
    setCopyText(whatsappCopyVariants[selectedTemplate] || "");
  }, [selectedTemplate, whatsappCopyVariants]);

  useEffect(() => {
    const loadExistingOffer = async () => {
      if (!editingOfferId) return;

      setLoadingExisting(true);
      setFeedback(null);
      try {
        const accessToken = await getAccessToken();
        const response = await fetch(`/api/admin/offers?id=${encodeURIComponent(editingOfferId)}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });

        const payload = await parseApiResponse<{ offer?: AdminOfferRecord; error?: string }>(response);
        if (!response.ok || !payload.offer) {
          throw new Error(payload.error ?? "Falha ao carregar oferta para ediÃ§Ã£o.");
        }

        const offer = payload.offer;
        const nextMarketplace =
          detectMarketplaceFromUrl(
            toCleanText(offer.product_url) || toCleanText(offer.affiliate_url),
          ) ||
          (String(offer.marketplace ?? "").toLowerCase().includes("amazon")
            ? "amazon"
            : String(offer.marketplace ?? "").toLowerCase().includes("awin")
              ? "awin"
              : "mercadolivre");

        setMarketplace(nextMarketplace);
        setSelectedSlot(
          ["flash", "best", "comparator"].includes(String(offer.slot_type ?? ""))
            ? (offer.slot_type as OfferSlot)
            : "best",
        );
        setSourceUrl(toCleanText(offer.product_url));
        setAffiliateUrl(toCleanText(offer.affiliate_url));
        setImageUrl(toCleanText(offer.image_url));
        setManualTitle(toCleanText(offer.title));
        setManualPrice(toNumber(offer.price) ? String(toNumber(offer.price)) : "");
        setManualOldPrice(
          toNumber(offer.old_price ?? offer.original_price)
            ? String(toNumber(offer.old_price ?? offer.original_price))
            : "",
        );
        setCurrentStatus(toCleanText(offer.status) || "active");
        setCurrentCurationsStatus(toCleanText(offer.curations_status) || "approved");
        setPreview({
          title: toCleanText(offer.title),
          price: toNumber(offer.price),
          old_price: toNumber(offer.old_price ?? offer.original_price),
          original_price: toNumber(offer.original_price ?? offer.old_price),
          discount_pct: toNumber(offer.discount_pct),
          image_url: toCleanText(offer.image_url),
          product_url: toCleanText(offer.product_url),
          affiliate_url: toCleanText(offer.affiliate_url),
          rating: toNumber(offer.rating),
          reviews: toNumber(offer.review_count),
        });
        setExtractDebug(`Editando oferta #${offer.id}`);
      } catch (error) {
        setFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Falha ao abrir oferta para ediÃ§Ã£o.",
        });
      } finally {
        setLoadingExisting(false);
      }
    };

    void loadExistingOffer();
  }, [editingOfferId]);

  const priceScore = useMemo(
    () => getPriceScore(toNumber(preview?.price), getOldPrice(preview)),
    [preview],
  );

  const getAccessToken = async (): Promise<string> => {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) {
      throw new Error("SessÃ£o expirada. FaÃ§a login novamente.");
    }
    return token;
  };

  const handleSaveEdit = async () => {
    if (!isEditing || !editingOfferId || !preview) {
      setFeedback({ type: "error", text: "Nenhuma oferta carregada para ediÃ§Ã£o." });
      return;
    }

    const url = sourceUrl.trim();
    const manualAffiliate = affiliateUrl.trim();
    if (!url || !manualAffiliate) {
      setFeedback({
        type: "error",
        text: "URL do produto e Link de Afiliado sÃ£o obrigatÃ³rios.",
      });
      return;
    }

    setSavingEdit(true);
    setFeedback(null);
    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/offers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          id: editingOfferId,
          title: preview.title,
          product_url: url,
          affiliate_url: manualAffiliate,
          image_url: toCleanText(imageUrl) || preview.image_url || "",
          marketplace,
          price: toNumber(preview.price),
          old_price: toNumber(preview.original_price ?? preview.old_price ?? 0) || null,
          discount_pct: discountPct,
          slot_type: selectedSlot,
          status: currentStatus || "active",
          curations_status: currentCurationsStatus || "approved",
        }),
      });

      const payload = await parseApiResponse<{ offer?: AdminOfferRecord; error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao salvar alteraÃ§Ãµes.");
      }

      setFeedback({
        type: "success",
        text: "Oferta atualizada com sucesso.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar oferta.",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteOffer = async () => {
    if (!isEditing || !editingOfferId) return;

    const confirmed = window.confirm("Excluir esta oferta do site?");
    if (!confirmed) return;

    setDeletingOffer(true);
    setFeedback(null);
    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/offers", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: editingOfferId }),
      });

      const payload = await parseApiResponse<{ success?: boolean; error?: string }>(response);
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error ?? "Falha ao excluir oferta.");
      }

      router.push("/admin/ofertas");
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao excluir oferta.",
      });
    } finally {
      setDeletingOffer(false);
    }
  };

  const handleManualAwinPreview = () => {
    const url = sourceUrl.trim();
    const resolvedUrls = resolveAwinUrls(url);
    const manualAffiliate = affiliateUrl.trim() || resolvedUrls.affiliateUrl;
    const title = manualTitle.trim();
    const price = parseCurrencyInput(manualPrice);
    const oldPrice = parseCurrencyInput(manualOldPrice);
    const img = imageUrl.trim();

    if (!url) {
      setFeedback({
        type: "error",
        text: "Informe a URL completa do produto AWIN.",
      });
      return;
    }

    if (!title || price <= 0) {
      setFeedback({
        type: "error",
        text: "Informe pelo menos nome do produto e preÃ§o para criar o preview AWIN.",
      });
      return;
    }

    setMarketplace("awin");
    setSourceUrl(resolvedUrls.productUrl || url);
    setAffiliateUrl(manualAffiliate);
    setPreview({
      title,
      price,
      old_price: oldPrice > price ? oldPrice : 0,
      original_price: oldPrice > price ? oldPrice : 0,
      image_url: img,
      product_url: resolvedUrls.productUrl || url,
      affiliate_url: manualAffiliate,
    });
    setExtractDebug("Engine: manual | Camada: awin_manual | Missing: nenhum | 0ms");
    setFeedback({
      type: "success",
      text: "Preview AWIN criado manualmente. Revise e escolha o destino da oferta.",
    });
  };

  const handleManualPreview = () => {
    if (marketplace === "awin") {
      handleManualAwinPreview();
      return;
    }

    const url = sourceUrl.trim();
    const manualAffiliate = affiliateUrl.trim();
    const title = manualTitle.trim();
    const price = parseCurrencyInput(manualPrice);
    const oldPrice = parseCurrencyInput(manualOldPrice);
    const img = imageUrl.trim();

    if (!url) {
      setFeedback({
        type: "error",
        text:
          marketplace === "amazon"
            ? "Informe a URL completa do produto Amazon."
            : "Informe a URL completa do produto Mercado Livre.",
      });
      return;
    }

    if (!manualAffiliate) {
      setFeedback({
        type: "error",
        text: "Informe o link de afiliado antes de montar o preview manual.",
      });
      return;
    }

    if (!title || price <= 0) {
      setFeedback({
        type: "error",
        text: "Informe pelo menos nome do produto e preÃ§o para criar o preview manual.",
      });
      return;
    }

    setPreview({
      title,
      price,
      old_price: oldPrice > price ? oldPrice : 0,
      original_price: oldPrice > price ? oldPrice : 0,
      image_url: img,
      product_url: url,
      affiliate_url: manualAffiliate,
    });
    setExtractDebug(`Engine: manual | Camada: ${marketplace}_manual | Missing: nenhum | 0ms`);
    setFeedback({
      type: "success",
      text: `Preview manual criado (${MARKETPLACE_LABEL[marketplace]}). Revise e escolha o destino da oferta.`,
    });
  };

  const handleGenerateAwinAffiliate = () => {
    const resolvedUrls = resolveAwinUrls(sourceUrl.trim());
    if (!resolvedUrls.productUrl) {
      setFeedback({
        type: "error",
        text: "Informe primeiro a URL completa do produto AWIN.",
      });
      return;
    }

    const generatedAffiliateUrl = resolvedUrls.affiliateUrl;
    if (!generatedAffiliateUrl) {
      setFeedback({
        type: "error",
        text: "Nao foi possivel gerar o link afiliado AWIN para essa URL.",
      });
      return;
    }

    const detectedPrice = extractAliExpressPriceFromUrl(resolvedUrls.productUrl);

    setMarketplace("awin");
    setSourceUrl(resolvedUrls.productUrl);
    setAffiliateUrl(generatedAffiliateUrl);
    if (!manualPrice && detectedPrice > 0) {
      setManualPrice(String(detectedPrice));
    }
    setExtractDebug("Engine: awin-linkbuilder | Camada: direct_cread | Missing: nenhum | 0ms");
    setFeedback({
      type: "success",
      text: "Link afiliado AWIN gerado. Agora voce pode buscar no feed ou completar o preview manual.",
    });
  };

  const handleAwinApiLookup = async () => {
    const query = sourceUrl.trim() || manualTitle.trim();
    if (!query) {
      setFeedback({
        type: "error",
        text: "Informe a URL ou um termo do produto AWIN para buscar no feed.",
      });
      return;
    }

    setExtracting(true);
    setFeedback(null);
    setCopyFeedback(null);
    setExtractDebug("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(
        `/api/awin/feed/${DEFAULT_AWIN_ADVERTISER_ID}?search=${encodeURIComponent(query)}&page=1`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        },
      );
      const payload = await parseApiResponse<AwinFeedResponse>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao consultar feed AWIN.");
      }

      const product = payload.products?.[0];
      if (!product) {
        const resolvedUrls = resolveAwinUrls(query);
        const normalizedUrl = resolvedUrls.productUrl;
        const affiliate = affiliateUrl.trim() || resolvedUrls.affiliateUrl;
        const fallbackPrice = extractAliExpressPriceFromUrl(normalizedUrl);
        const itemId = extractAliExpressItemId(query);

        if (normalizedUrl && affiliate) {
          setMarketplace("awin");
          setSourceUrl(normalizedUrl);
          setAffiliateUrl(affiliate);
          setManualTitle(itemId ? `Produto AliExpress ${itemId}` : "");
          setManualPrice(fallbackPrice > 0 ? String(fallbackPrice) : "");
          setManualOldPrice("");
          setPreview(
            fallbackPrice > 0
              ? {
                  title: itemId ? `Produto AliExpress ${itemId}` : "Produto AliExpress",
                  price: fallbackPrice,
                  old_price: 0,
                  original_price: 0,
                  image_url: imageUrl.trim(),
                  product_url: normalizedUrl,
                  affiliate_url: affiliate,
                }
              : null,
          );
          setExtractDebug(
            `Engine: awin-linkbuilder | Camada: direct_cread | Item: ${itemId || "n/a"} | Feed: nao encontrado`,
          );
          setFeedback({
            type: "info",
            text:
              fallbackPrice > 0
                ? "Produto nÃ£o encontrado no feed AWIN, mas gerei o link afiliado direto e preenchi o preÃ§o encontrado na URL. Revise tÃ­tulo e imagem."
                : "Produto nÃ£o encontrado no feed AWIN, mas gerei o link afiliado direto. Preencha tÃ­tulo, preÃ§o e imagem para criar o preview.",
          });
          return;
        }

        setFeedback({
          type: "info",
          text: "Produto nÃ£o encontrado no feed AWIN. VocÃª ainda pode preencher os campos manuais e gerar o preview.",
        });
        setExtractDebug("Engine: awin-feed | Camada: awin_api | Missing: produto | 0ms");
        return;
      }

      const productUrl = /^https?:\/\//i.test(sourceUrl.trim())
        ? sourceUrl.trim()
        : product.merchantDeepLink || product.awDeepLink;
      const resolvedUrls = resolveAwinUrls(productUrl);
      const cleanProductUrl = resolvedUrls.productUrl;
      const finalAffiliateUrl =
        affiliateUrl.trim() || (isAwinTrackingUrl(sourceUrl.trim()) ? sourceUrl.trim() : product.awDeepLink || resolvedUrls.affiliateUrl);
      const price = toNumber(product.searchPrice);

      setMarketplace("awin");
      setSourceUrl(cleanProductUrl || productUrl || product.awDeepLink);
      setAffiliateUrl(finalAffiliateUrl);
      setImageUrl(toCleanText(product.merchantImageUrl));
      setManualTitle(product.productName);
      setManualPrice(price ? String(price) : "");
      setManualOldPrice("");
      setPreview({
        title: product.productName,
        price,
        old_price: 0,
        original_price: 0,
        image_url: toCleanText(product.merchantImageUrl),
        product_url: cleanProductUrl || product.awDeepLink,
        affiliate_url: finalAffiliateUrl,
      });
      setExtractDebug(
        `Engine: awin-feed | Camada: awin_api | Produto: ${product.id || product.merchantProductId || "n/a"} | Categoria: ${product.categoryName || "n/a"}`,
      );
      setFeedback({
        type: "success",
        text: "Produto AWIN carregado pelo feed. Link afiliado gerado automaticamente.",
      });
    } catch (error) {
      setExtractDebug(
        `Engine: awin-feed | Camada: awin_api | Missing: n/a | Erro: ${error instanceof Error ? error.message : "falha desconhecida"}`,
      );
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao buscar produto AWIN.",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleExtract = async () => {
    const url = sourceUrl.trim();
    const manualAffiliate = affiliateUrl.trim();
    const detectedMarketplace =
      detectMarketplaceFromUrl(url) ?? (marketplace === "awin" ? "awin" : null);

    if (!url) {
      setFeedback({ type: "error", text: "Informe a URL da oferta para extraÃ§Ã£o." });
      return;
    }

    if (!detectedMarketplace) {
      setFeedback({
        type: "error",
        text: "URL invÃ¡lida. Use um link vÃ¡lido de Amazon, Mercado Livre ou AWIN.",
      });
      return;
    }

    if (detectedMarketplace === "awin") {
      await handleAwinApiLookup();
      return;
    }

    if (!manualAffiliate) {
      setFeedback({
        type: "error",
        text: "Informe o seu Link de Afiliado antes de extrair.",
      });
      return;
    }

    setExtracting(true);
    setFeedback(null);
    setCopyFeedback(null);
    setExtractDebug("");

    try {
      const accessToken = await getAccessToken();
      setMarketplace(detectedMarketplace);
      const response = await fetch("/api/admin/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          url,
          affiliate_url: manualAffiliate,
          marketplace: detectedMarketplace,
          persist: false,
        }),
      });

      const data = await parseApiResponse<ExtractResponse>(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao extrair a URL informada.");
      }

      const img =
        toCleanText(data.preview?.image_url) ||
        toCleanText(data.image_url);
      setImageUrl(img);

      const result = data;
      const nextPreview = buildPreviewFromExtractResponse(
        result,
        url,
        manualAffiliate,
        img,
      );

      const layerUsed =
        toCleanText(result.debug_info?.layer_used) ||
        toCleanText(result.extraction_layer) ||
        "n/a";
      const engineUsed = toCleanText(result.engine) || "n/a";
      const missingFields =
        result.debug_info?.missing_fields?.length
          ? result.debug_info.missing_fields.join(", ")
          : result.missing_fields?.length
            ? result.missing_fields.join(", ")
            : "nenhum";
      const latency =
        Number(result.debug_info?.latency_ms ?? result.elapsed_ms ?? 0) || 0;
      const errorHint = toCleanText(result.error);
      const shouldShowErrorHint = missingFields !== "nenhum" && Boolean(errorHint);
      const imageWarning =
        result.missing_fields?.includes("image_url") ||
        result.debug_info?.missing_fields?.includes("image_url")
          ? " | imagem ausente"
          : "";

      setExtractDebug(
        `Engine: ${engineUsed} | Camada: ${layerUsed} | Missing: ${missingFields} | ${latency}ms${imageWarning}${shouldShowErrorHint ? ` | Erro: ${errorHint}` : ""}`,
      );

      setPreview(nextPreview);
      setFeedback({
        type: result.status === "partial_failure" ? "info" : "success",
        text:
          result.status === "partial_failure"
            ? `ExtraÃ§Ã£o parcial (${MARKETPLACE_LABEL[detectedMarketplace]}). Revise os campos antes de publicar.`
            : `ExtraÃ§Ã£o concluÃ­da (${MARKETPLACE_LABEL[detectedMarketplace]}). Revise o preview antes de publicar.`,
      });
    } catch (error) {
      setExtractDebug(
        `Engine: n/a | Camada: n/a | Missing: n/a | Erro: ${error instanceof Error ? error.message : "falha desconhecida"}`,
      );
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao extrair produto.",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleCopyText = async () => {
    if (!copyText.trim()) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyFeedback("âœ… Copiado!");
    } catch {
      setCopyFeedback("NÃ£o foi possÃ­vel copiar automaticamente.");
    }
  };

  const handleCopyWithImage = async () => {
    const image = toCleanText(preview?.image_url ?? preview?.imageUrl ?? imageUrl);
    const payload = image ? `${copyText}\n\nðŸ–¼ï¸ Imagem: ${image}` : copyText;

    if (!payload.trim()) return;

    try {
      await navigator.clipboard.writeText(payload);
      setCopyFeedback("âœ… Copiado!");
    } catch {
      setCopyFeedback("NÃ£o foi possÃ­vel copiar automaticamente.");
    }
  };

  const handleClear = () => {
    setMarketplace("mercadolivre");
    setSelectedSlot("best");
    setSourceUrl("");
    setAffiliateUrl("");
    setImageUrl("");
    setManualTitle("");
    setManualPrice("");
    setManualOldPrice("");
    setExtracting(false);
    setPublishing(null);
    setSelectedDestinations(DEFAULT_DESTINATIONS);
    setPreview(null);
    setCopyText("");
    setWhatsAppCopyVariants(null);
    setSelectedTemplate("medium");
    setCopyLoading(false);
    setCopyFeedback(null);
    setFeedback(null);
    setExtractDebug("");
  };

  const toggleDestination = (destination: keyof PublishDestinations) => {
    setSelectedDestinations((current) => ({
      ...current,
      [destination]: !current[destination],
    }));
  };

  const buildDestinationSummary = () => {
    const labels: string[] = [];
    if (selectedDestinations.site) {
      labels.push(
        selectedSlot === "flash"
          ? "Ofertas Relampago"
          : selectedSlot === "best"
            ? "Melhores Ofertas"
            : "Comparador",
      );
    }
    if (selectedDestinations.telegram) labels.push("Telegram");
    if (selectedDestinations.whatsapp) labels.push("WhatsApp");
    return labels.join(" + ");
  };

  const handleDispatchAction = async (action: DispatchAction) => {
    const url = sourceUrl.trim();
    const manualAffiliate =
      affiliateUrl.trim() || (marketplace === "awin" ? buildManualAwinAffiliateUrl(url) : "");

    if (!preview) {
      setFeedback({
        type: "error",
        text: "Extraia uma URL antes de publicar.",
      });
      return;
    }

    if (!url || !manualAffiliate) {
      setFeedback({
        type: "error",
        text: "URL e Link de Afiliado sÃ£o obrigatÃ³rios para publicar.",
      });
      return;
    }

    setPublishing(action);
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
          price: toNumber(preview.price),
          old_price: toNumber(preview.original_price ?? preview.old_price ?? 0),
          image_url: toCleanText(imageUrl) || preview.image_url || "",
          product_url: preview.product_url || url,
          affiliate_url: manualAffiliate,
          marketplace,
          slot_type: selectedSlot,
          copy_text: copyText,
          channels:
            action === "site"
              ? []
              : action === "telegram"
                ? ["telegram"]
                : ["whatsapp"],
        }),
      });

      const data = await parseApiResponse<PublishResponse>(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao publicar e distribuir oferta.");
      }

      const queued = Number(data.distribution?.queued ?? 0);
      const skipped = Number(data.distribution?.skipped ?? 0);
      const baseMessage =
        data.message ?? "Oferta salva e enviada para a fila de disparo!";

      setFeedback({
        type: "success",
        text:
          action === "site"
            ? `Enviado para: ${selectedSlot === "flash" ? "Ofertas RelÃ¢mpago" : selectedSlot === "best" ? "Melhores Ofertas" : "Comparador"} âœ…`
            : queued > 0
              ? `${baseMessage} Jobs enfileirados: ${queued}${skipped ? ` | Ignorados: ${skipped}` : ""}. Esta acao nao publica no site; para aparecer na vitrine, clique em "Aprovar no Radar (Site)".`
              : `${baseMessage} Esta acao nao publica no site; para aparecer na vitrine, clique em "Aprovar no Radar (Site)".`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Erro ao publicar e distribuir oferta.",
      });
    } finally {
      setPublishing(null);
    }
  };

  const handlePublishSelected = async () => {
    const url = sourceUrl.trim();
    const manualAffiliate =
      affiliateUrl.trim() || (marketplace === "awin" ? buildManualAwinAffiliateUrl(url) : "");

    if (!preview) {
      setFeedback({
        type: "error",
        text: "Extraia ou monte um preview antes de publicar.",
      });
      return;
    }

    if (!selectedDestinations.site && !selectedDestinations.telegram && !selectedDestinations.whatsapp) {
      setFeedback({
        type: "error",
        text: "Selecione pelo menos um destino: Site, Telegram ou WhatsApp.",
      });
      return;
    }

    const selectedCount = [
      selectedDestinations.site,
      selectedDestinations.telegram,
      selectedDestinations.whatsapp,
    ].filter(Boolean).length;

    if (selectedCount === 1) {
      if (selectedDestinations.site) {
        await handleDispatchAction("site");
        return;
      }
      if (selectedDestinations.telegram) {
        await handleDispatchAction("telegram");
        return;
      }
      if (selectedDestinations.whatsapp) {
        await handleDispatchAction("whatsapp");
        return;
      }
    }

    if (!url || !manualAffiliate) {
      setFeedback({
        type: "error",
        text: "URL e Link de Afiliado sao obrigatorios para publicar.",
      });
      return;
    }

    setPublishing("selected");
    setFeedback(null);

    try {
      const accessToken = await getAccessToken();
      const channels = [
        selectedDestinations.telegram ? "telegram" : null,
        selectedDestinations.whatsapp ? "whatsapp" : null,
      ].filter(Boolean);

      const response = await fetch("/api/admin/extrator/dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: preview.title,
          price: toNumber(preview.price),
          old_price: toNumber(preview.original_price ?? preview.old_price ?? 0),
          image_url: toCleanText(imageUrl) || preview.image_url || "",
          product_url: preview.product_url || url,
          affiliate_url: manualAffiliate,
          marketplace,
          slot_type: selectedSlot,
          copy_text: copyText,
          channels,
          publish_to_site: selectedDestinations.site,
        }),
      });

      const data = await parseApiResponse<PublishResponse>(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Erro ao publicar oferta.");
      }

      const queued = Number(data.distribution?.queued ?? 0);
      const skipped = Number(data.distribution?.skipped ?? 0);
      const destinations = buildDestinationSummary();

      setFeedback({
        type: "success",
        text:
          queued > 0
            ? `Oferta enviada para ${destinations}. Jobs enfileirados: ${queued}${skipped ? ` | Ignorados: ${skipped}` : ""}.`
            : `Oferta enviada para ${destinations} com sucesso.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Erro ao publicar oferta.",
      });
    } finally {
      setPublishing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-navy">Central de Oferta</h1>
        <p className="text-sm text-rs-muted">
          Extraia, valide e publique ofertas com distribuiÃ§Ã£o para WhatsApp e Telegram.
        </p>
        {isEditing ? (
          <p className="mt-2 text-sm font-semibold text-[#9e6a18]">
            Editando uma oferta jÃ¡ aprovada/postada no site.
          </p>
        ) : null}
      </div>

      <section className="rounded-xl border border-rs-border bg-white p-5">
        <div className="grid gap-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Regra de publicaÃ§Ã£o</p>
            <p className="mt-1">
              Toda oferta exibida no site precisa ter <strong>link de afiliado</strong>.
              Sem <code>affiliate_url</code>, o card nÃ£o aparece nas vitrines pÃºblicas.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["mercadolivre", "amazon", "awin"] as Marketplace[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMarketplace(item)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  marketplace === item
                    ? "bg-navy text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                {MARKETPLACE_LABEL[item]}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              URL do produto
            </label>
            <input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder={
                marketplace === "amazon"
                  ? "URL Amazon (https://www.amazon.com.br/dp/ASIN...)"
                  : marketplace === "awin"
                    ? "URL completa do produto ou link AWIN (https://www.awin1.com/cread.php?... ou https://pt.aliexpress.com/...)"
                  : "URL Mercado Livre (https://www.mercadolivre.com.br/.../p/MLB... ou .../up/MLBU...)"
              }
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange"
            />
            <p className="text-xs text-slate-500">
              {marketplace === "awin"
                ? "Na AWIN, esta URL Ã© usada como referÃªncia do produto; o link de afiliado abaixo serÃ¡ usado no card e na copy."
                : "Usada apenas para extrair tÃ­tulo, imagem e preÃ§o do produto."}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Link de afiliado{" "}
              <span className="text-red-600">
                {marketplace === "awin" ? "(gerado pela API ou obrigatÃ³rio no manual)" : "(obrigatÃ³rio)"}
              </span>
            </label>
            <input
              value={affiliateUrl}
              onChange={(event) => setAffiliateUrl(event.target.value)}
              placeholder={
                marketplace === "amazon"
                  ? "Cole aqui seu link afiliado da Amazon"
                  : marketplace === "awin"
                    ? "A API AWIN preenche este campo; se for manual, cole aqui o link awin1.com"
                  : "Cole aqui seu link afiliado do Mercado Livre"
              }
              className="h-11 w-full rounded-lg border-2 border-amber-300 bg-amber-50 px-3 text-sm outline-none focus:border-orange"
            />
            <p className="text-xs text-slate-500">
              Esse Ã© o link final usado no card, na copy e nas pÃ¡ginas pÃºblicas.
            </p>
          </div>

          <div
            className={`grid gap-3 rounded-lg p-3 md:grid-cols-3 ${
              marketplace === "awin"
                ? "border border-sky-100 bg-sky-50"
                : "border border-slate-200 bg-slate-50"
            }`}
          >
              <div className="space-y-1 md:col-span-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Nome do produto
                </label>
                <input
                  value={manualTitle}
                  onChange={(event) => setManualTitle(event.target.value)}
                  placeholder="Nome completo do produto"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  PreÃ§o atual
                </label>
                <input
                  value={manualPrice}
                  onChange={(event) => setManualPrice(event.target.value)}
                  placeholder="Ex: 129,90"
                  inputMode="decimal"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  PreÃ§o antigo
                </label>
                <input
                  value={manualOldPrice}
                  onChange={(event) => setManualOldPrice(event.target.value)}
                  placeholder="Opcional"
                  inputMode="decimal"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange"
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Fluxo manual
                </p>
                <p className="rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                  Primeiro tente <strong>Buscar na API AWIN</strong>. Use estes campos manuais apenas se o produto nÃ£o for encontrado no feed.
                </p>
              </div>
            </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              URL da imagem
            </label>
            <input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder={
                marketplace === "awin"
                  ? "URL da imagem do produto AWIN"
                  : "URL da imagem (preenchida automaticamente apÃ³s extraÃ§Ã£o)"
              }
              className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting || loadingExisting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-navy px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-fit"
            >
              {extracting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {extracting ? "Extraindo..." : marketplace === "awin" ? "Buscar na API AWIN" : "Extrair URL"}
            </button>

            {marketplace === "awin" ? (
              <>
                <button
                  type="button"
                  onClick={handleGenerateAwinAffiliate}
                  disabled={extracting || loadingExisting}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:w-fit"
                >
                  Gerar link afiliado AWIN
                </button>
              </>
            ) : null}

            <button
              type="button"
              onClick={handleManualPreview}
              disabled={extracting || loadingExisting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:w-fit"
            >
              Gerar preview manual
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={extracting || publishing !== null || savingEdit || deletingOffer}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:w-fit"
            >
              Limpar
            </button>
          </div>

            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleSaveEdit()}
                  disabled={extracting || publishing !== null || savingEdit || deletingOffer || loadingExisting}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-fit"
                >
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {savingEdit ? "Salvando..." : "Salvar alteraÃ§Ãµes"}
                </button>

                <button
                  type="button"
                  onClick={() => void handleDeleteOffer()}
                  disabled={extracting || publishing !== null || savingEdit || deletingOffer || loadingExisting}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-fit"
                >
                  {deletingOffer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deletingOffer ? "Excluindo..." : "Excluir oferta"}
                </button>
              </>
            ) : null}

            {extractDebug ? (
              <p className="text-xs text-slate-500">{extractDebug}</p>
            ) : null}
            {loadingExisting ? (
              <p className="text-xs text-slate-500">Carregando dados da oferta para ediÃ§Ã£o...</p>
            ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-rs-border bg-white p-5">
        <h2 className="text-lg font-semibold text-navy">Preview de publicaÃ§Ã£o</h2>

        {!preview ? (
          <p className="mt-3 text-sm text-rs-muted">
            Use a extraÃ§Ã£o por URL para carregar foto, tÃ­tulo, preÃ§o e desconto. Para AWIN, preencha os campos manuais e gere o preview.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex gap-4">
              {toCleanText(imageUrl) || preview.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={toCleanText(imageUrl) || preview.image_url}
                  alt={preview.title}
                  className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] text-rs-muted">
                  Sem imagem
                </div>
              )}

              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-navy">{preview.title}</p>
                <p className="text-xs text-rs-muted">
                  Marketplace: {MARKETPLACE_LABEL[marketplace]}
                </p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-2xl font-bold text-navy">
                    {formatBRL(toNumber(preview.price))}
                  </p>
                  {toNumber(preview.original_price ?? preview.old_price ?? 0) >
                  toNumber(preview.price) ? (
                    <span className="text-sm text-rs-muted line-through">
                      {formatBRL(
                        toNumber(preview.original_price ?? preview.old_price ?? 0),
                      )}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-rs-muted">
                  Desconto estimado: {discountPct}%
                </p>
                <p className={`text-xs font-semibold ${priceScore.color}`}>
                  Temperatura da oferta: {priceScore.label}
                </p>
              </div>
            </div>            <div className="rounded-lg border border-rs-border bg-slate-50 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-rs-muted">
                  Copy Inteligente (WhatsApp/Telegram)
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (!preview) return;
                    setCopyLoading(true);
                    void generateWhatsAppCopyFromPreview({
                      preview,
                      affiliateUrl: getOfferUrl(preview, affiliateUrl.trim()),
                      marketplace,
                    })
                      .then((generated) => {
                        setWhatsAppCopyVariants(generated);
                        setSelectedTemplate("medium");
                        setCopyText(generated.medium);
                        setCopyFeedback(null);
                      })
                      .catch((error) => {
                        setFeedback({
                          type: "error",
                          text:
                            error instanceof Error
                              ? error.message
                              : "Falha ao gerar copy inteligente.",
                        });
                      })
                      .finally(() => {
                        setCopyLoading(false);
                      });
                  }}
                  disabled={copyLoading || !preview}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {copyLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  🔥 Gerar Copy
                </button>
              </div>

              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Hook
                </p>
                <p className="mt-1 text-sm font-semibold text-amber-950">
                  {whatsappCopyVariants?.hook || "A copy inteligente aparece aqui após a geração."}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { key: "short" as const, label: "Curta" },
                  { key: "medium" as const, label: "Média" },
                  { key: "long" as const, label: "Longa" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(tab.key);
                      setCopyText(whatsappCopyVariants?.[tab.key] ?? "");
                    }}
                    className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                      selectedTemplate === tab.key
                        ? "bg-slate-800 text-white"
                        : "bg-white text-slate-700 ring-1 ring-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <textarea
                value={copyText}
                onChange={(event) => {
                  const value = event.target.value;
                  setCopyText(value);
                  setWhatsAppCopyVariants((current) =>
                    current ? { ...current, [selectedTemplate]: value } : current,
                  );
                }}
                rows={10}
                placeholder="A copy inteligente será gerada aqui."
                className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm leading-6 text-slate-800 outline-none focus:border-orange"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white"
                >
                  <Copy className="h-4 w-4" />
                  Copiar
                </button>
                <button
                  type="button"
                  onClick={handleCopyWithImage}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
                >
                  <MessageSquare className="h-4 w-4" />
                  Copiar com imagem
                </button>
                {copyFeedback ? (
                  <span className="text-xs font-semibold text-green-700">{copyFeedback}</span>
                ) : null}
              </div>
            </div>

            <div className="mt-8 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy">
                <span aria-hidden="true">ðŸŽ¯</span>
                Onde essa oferta vai aparecer no Radar Smart?
              </h3>
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Selecione os destinos abaixo. Agora voce pode enviar a mesma oferta para
                Site, Telegram e WhatsApp em uma unica acao.
              </p>

              <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                {SLOT_OPTIONS.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setSelectedSlot(slot.id)}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                      selectedSlot === slot.id
                        ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md"
                        : "border-white bg-white text-gray-500 hover:border-gray-200"
                    }`}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {slot.icon}
                    </span>
                    <span className="text-center text-xs font-semibold uppercase">
                      {slot.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => toggleDestination("site")}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 py-4 font-bold transition-all ${
                    selectedDestinations.site
                      ? "border-green-600 bg-green-50 text-green-700"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Site
                </button>

                <button
                  type="button"
                  onClick={() => toggleDestination("telegram")}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 py-4 font-bold transition-all ${
                    selectedDestinations.telegram
                      ? "border-sky-500 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  <Send className="h-4 w-4" />
                  Telegram
                </button>

                <button
                  type="button"
                  onClick={() => toggleDestination("whatsapp")}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 py-4 font-bold transition-all ${
                    selectedDestinations.whatsapp
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  <MessageSquare className="h-4 w-4" />
                  WhatsApp
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handlePublishSelected()}
                  disabled={publishing !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-5 py-3 text-sm font-bold text-white shadow-lg transition-all hover:bg-slate-800 disabled:opacity-60"
                >
                  {publishing === "selected" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {publishing === "selected" ? "Publicando..." : "Publicar selecionados"}
                </button>
                <span className="text-sm text-slate-500">
                  Destinos atuais: {buildDestinationSummary() || "nenhum"}
                </span>
              </div>

              <StoryGeneratorButton
                title={preview.title}
                imageUrl={toCleanText(imageUrl) || preview.image_url || null}
                price={toNumber(preview.price)}
                oldPrice={toNumber(preview.original_price ?? preview.old_price ?? 0) || null}
              />
            </div>
          </div>
        )}
      </section>

      {feedback ? (
        <section
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : feedback.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {feedback.text}
        </section>
      ) : null}
    </div>
  );
}

