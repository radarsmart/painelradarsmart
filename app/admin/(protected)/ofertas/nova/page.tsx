"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Link2, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";

type Marketplace = "mercadolivre" | "amazon";
type OfferSlot = "hero" | "flash" | "best" | "comparator";

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
    layer_used?: "rainforest" | "zenscrape" | "official" | "container";
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

type Feedback = {
  type: "success" | "error" | "info";
  text: string;
};

type CopyTemplateKey = "aida" | "urgencia" | "social" | "tecnico";

const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  mercadolivre: "Mercado Livre",
  amazon: "Amazon",
};

const SLOT_OPTIONS: Array<{ id: OfferSlot; label: string; icon: string }> = [
  { id: "hero", label: "Banner Video (Hero)", icon: "🎬" },
  { id: "flash", label: "Oferta Relampago", icon: "⚡" },
  { id: "best", label: "Melhores Ofertas", icon: "🏆" },
  { id: "comparator", label: "Comparador", icon: "📊" },
];

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toCleanText(value: unknown): string {
  return String(value ?? "").trim();
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
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

function buildAidaCopy(
  preview: ExtractPreview | null,
  affiliateUrl: string,
): string {
  if (!preview) return "";

  const price = toNumber(preview.price);
  const oldPrice = toNumber(preview.original_price ?? preview.old_price ?? 0);
  const discount = Number(preview.discount_pct ?? 0);
  const hasOldPrice = oldPrice > 0 && oldPrice > price;

  const oldLine = hasOldPrice ? `\n❌ De: ${formatBRL(oldPrice)}` : "";
  const discountLine = discount > 0 ? ` (${Math.round(discount)}% de DESCONTO!)` : "";

  return [
    "🚨 *ALERTA DE OFERTA IMPERDIVEL!* 🚨",
    preview.title,
    "",
    `${oldLine}\n✅ *Por apenas: ${formatBRL(price)}*${discountLine}`.trim(),
    "",
    "🔥 *Por que voce precisa disso agora?*",
    "Essa e uma daquelas oportunidades que esgotam em minutos. Qualidade premium pelo menor preco dos ultimos meses.",
    "",
    "👉 *Garanta o seu antes que acabe:*",
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
      "🚨 *ESTOQUE BAIXO!*",
      "",
      `*${preview.title}*`,
      "",
      `🔥 Por apenas: *${formatBRL(toNumber(preview.price))}*`,
      "",
      "O preço caiu agora e pode subir a qualquer momento! Aproveite antes que esgote.",
      "",
      `👉 Link: ${getOfferUrl(preview, affiliateUrl)}`,
    ].join("\n");
  },
  social: (preview, affiliateUrl) => {
    if (!preview) return "";

    return [
      "⭐ *O MAIS VENDIDO!*",
      "",
      `*${preview.title}*`,
      "",
      `💰 *${formatBRL(toNumber(preview.price))}*`,
      "",
      "Este item é o campeão de vendas na categoria hoje. Quem comprou, aprovou!",
      "",
      `👉 Garanta o seu: ${getOfferUrl(preview, affiliateUrl)}`,
    ].join("\n");
  },
  tecnico: (preview, affiliateUrl) => {
    if (!preview) return "";

    const oldPrice = getOldPrice(preview);
    const hasOldPrice = oldPrice > toNumber(preview.price);

    return [
      "✅ *MENOR PREÇO DETECTADO!*",
      "",
      `*${preview.title}*`,
      "",
      hasOldPrice ? `📉 De: ~~${formatBRL(oldPrice)}~~` : null,
      `🔥 Por: *${formatBRL(toNumber(preview.price))}*`,
      "",
      "Análise do Radar Smart: Este é o melhor momento de compra dos últimos 30 dias.",
      "",
      `👉 Link: ${getOfferUrl(preview, affiliateUrl)}`,
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

function getPriceScore(price: number, oldPrice: number) {
  if (price <= 0 || oldPrice <= price) {
    return { label: "🥉 BRONZE", color: "text-orange-600" };
  }

  const discount = ((oldPrice - price) / oldPrice) * 100;

  if (discount >= 40) return { label: "💎 OURO", color: "text-yellow-600" };
  if (discount >= 20) return { label: "🥈 PRATA", color: "text-gray-500" };
  return { label: "🥉 BRONZE", color: "text-orange-600" };
}

export default function AdminNovaOfertaPage() {
  const [marketplace, setMarketplace] = useState<Marketplace>("mercadolivre");
  const [selectedSlot, setSelectedSlot] = useState<OfferSlot>("best");
  const [sourceUrl, setSourceUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState<ExtractPreview | null>(null);
  const [copyText, setCopyText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<CopyTemplateKey>("aida");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [extractDebug, setExtractDebug] = useState<string>("");

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
      return;
    }
    setCopyText(buildCopyByTemplate(selectedTemplate, preview, affiliateUrl.trim()));
  }, [preview, affiliateUrl, selectedTemplate]);

  const priceScore = useMemo(
    () => getPriceScore(toNumber(preview?.price), getOldPrice(preview)),
    [preview],
  );

  const getAccessToken = async (): Promise<string> => {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }
    return token;
  };

  const handleExtract = async () => {
    const url = sourceUrl.trim();
    const manualAffiliate = affiliateUrl.trim();

    if (!url) {
      setFeedback({ type: "error", text: "Informe a URL da oferta para extracao." });
      return;
    }

    if (!manualAffiliate) {
      setFeedback({
        type: "error",
        text: "Informe o Seu Link de Afiliado antes de extrair.",
      });
      return;
    }

    setExtracting(true);
    setFeedback(null);
    setCopyFeedback(null);
    setExtractDebug("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          url,
          affiliate_url: manualAffiliate,
          marketplace,
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
      const imageWarning =
        result.missing_fields?.includes("image_url") ||
        result.debug_info?.missing_fields?.includes("image_url")
          ? " | imagem ausente"
          : "";

      setExtractDebug(
        `Engine: ${engineUsed} | Camada: ${layerUsed} | Missing: ${missingFields} | ${latency}ms${imageWarning}${errorHint ? ` | Erro: ${errorHint}` : ""}`,
      );

      setPreview(nextPreview);
      setFeedback({
        type: result.status === "partial_failure" ? "info" : "success",
        text:
          result.status === "partial_failure"
            ? `Extracao parcial (${MARKETPLACE_LABEL[marketplace]}). Revise os campos antes de publicar.`
            : `Extracao concluida (${MARKETPLACE_LABEL[marketplace]}). Revise o preview antes de publicar.`,
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
      setCopyFeedback("Copy copiada para a area de transferencia.");
    } catch {
      setCopyFeedback("Nao foi possivel copiar automaticamente.");
    }
  };

  const handleFinalPublish = async () => {
    const url = sourceUrl.trim();
    const manualAffiliate = affiliateUrl.trim();

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
        text: "URL e Link de Afiliado sao obrigatorios para publicar.",
      });
      return;
    }

    setPublishing(true);
    setFeedback(null);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/distribution/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          marketplace,
          url,
          affiliate_url: manualAffiliate,
          slot_type: selectedSlot,
          channels: ["telegram", "whatsapp"],
          ad_text: copyText,
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
          queued > 0
            ? `${baseMessage} Bloco: ${selectedSlot}. Jobs enfileirados: ${queued}${skipped ? ` | Ignorados: ${skipped}` : ""}.`
            : `${baseMessage} Bloco: ${selectedSlot}.`,
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
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-navy">Central de Nova Oferta</h1>
        <p className="text-sm text-rs-muted">
          Extraia, valide e publique ofertas com distribuicao para WhatsApp e Telegram.
        </p>
      </div>

      <section className="rounded-xl border border-rs-border bg-white p-5">
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {(["mercadolivre", "amazon"] as Marketplace[]).map((item) => (
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

          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder={
              marketplace === "amazon"
                ? "URL Amazon (https://www.amazon.com.br/dp/ASIN...)"
                : "URL Mercado Livre (https://www.mercadolivre.com.br/.../p/MLB...)"
            }
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange"
          />

          <input
            value={affiliateUrl}
            onChange={(event) => setAffiliateUrl(event.target.value)}
            placeholder="Seu Link de Afiliado (obrigatorio)"
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange"
          />

          <input
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="URL da imagem (preenchida automaticamente após extração)"
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-orange"
          />

          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-navy px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-fit"
          >
            {extracting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {extracting ? "Extraindo..." : "Extrair URL"}
          </button>

          {extractDebug ? (
            <p className="text-xs text-slate-500">{extractDebug}</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-rs-border bg-white p-5">
        <h2 className="text-lg font-semibold text-navy">Preview de publicacao</h2>

        {!preview ? (
          <p className="mt-3 text-sm text-rs-muted">
            Use a extracao por URL para carregar foto, titulo, preco e desconto.
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
            </div>

            <div className="rounded-lg border border-rs-border bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rs-muted">
                Copy da Oferta (AIDA)
              </p>
              <textarea
                value={copyText}
                onChange={(event) => setCopyText(event.target.value)}
                rows={10}
                className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm leading-6 text-slate-800 outline-none focus:border-orange"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTemplate("urgencia")}
                  className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                    selectedTemplate === "urgencia"
                      ? "bg-red-500 text-white"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  🔥 Urgência
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTemplate("social")}
                  className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                    selectedTemplate === "social"
                      ? "bg-blue-500 text-white"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  ⭐ Social
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTemplate("tecnico")}
                  className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                    selectedTemplate === "tecnico"
                      ? "bg-green-600 text-white"
                      : "bg-green-50 text-green-700"
                  }`}
                >
                  📊 Análise
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTemplate("aida")}
                  className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                    selectedTemplate === "aida"
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-200"
                  }`}
                >
                  AIDA
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white"
                >
                  <Copy className="h-4 w-4" />
                  Copiar Copy
                </button>
                {copyFeedback ? (
                  <span className="text-xs text-rs-muted">{copyFeedback}</span>
                ) : null}
              </div>
            </div>

            <div className="mt-8 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy">
                <span aria-hidden="true">🎯</span>
                Onde essa oferta vai aparecer no Radar Smart?
              </h3>

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

              <button
                type="button"
                onClick={handleFinalPublish}
                disabled={publishing}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-4 font-bold text-white shadow-lg transition-all hover:bg-green-700 disabled:opacity-60"
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {publishing
                  ? "Publicando no site e enviando canais..."
                  : `Publicar no Site (${selectedSlot.toUpperCase()}) e Enviar Canais`}
              </button>
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




