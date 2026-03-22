"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Link2, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";

type Marketplace = "mercadolivre" | "amazon";

type ExtractPreview = {
  title: string;
  price: number;
  original_price?: number;
  old_price?: number;
  discount_pct?: number;
  image_url?: string;
  rating?: number;
  reviews?: number;
  product_url: string;
  affiliate_url: string;
};

type ExtractResponse = {
  success: boolean;
  job_id: string;
  offer_id?: string | null;
  offer_status?: string | null;
  needs_review?: boolean;
  preview: ExtractPreview;
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

const EXTRACT_ROUTE: Record<Marketplace, string> = {
  mercadolivre: "/api/admin/ml/extract",
  amazon: "/api/admin/amazon/extract",
};

const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  mercadolivre: "Mercado Livre",
  amazon: "Amazon",
};

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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

export default function AdminNovaOfertaPage() {
  const [marketplace, setMarketplace] = useState<Marketplace>("mercadolivre");
  const [sourceUrl, setSourceUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState<ExtractPreview | null>(null);
  const [copyText, setCopyText] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

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
    setCopyText(buildAidaCopy(preview, affiliateUrl.trim()));
  }, [preview, affiliateUrl]);

  const getAccessToken = async (): Promise<string> => {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }
    return token;
  };

  const handleExtractPreview = async () => {
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

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(EXTRACT_ROUTE[marketplace], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          url,
          affiliate_url: manualAffiliate,
          persist: false,
        }),
      });

      const data = (await response.json()) as ExtractResponse | { error?: string };
      if (!response.ok) {
        throw new Error(
          (data as { error?: string }).error ??
            "Falha ao extrair a URL informada.",
        );
      }

      const result = data as ExtractResponse;
      setPreview({
        ...result.preview,
        affiliate_url: manualAffiliate,
      });
      setFeedback({
        type: "success",
        text: `Extracao concluida (${MARKETPLACE_LABEL[marketplace]}). Revise o preview antes de publicar.`,
      });
    } catch (error) {
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

  const handlePublishAndDistribute = async () => {
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
          channels: ["telegram", "whatsapp"],
          ad_text: copyText,
        }),
      });

      const data = (await response.json()) as PublishResponse;
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
            ? `${baseMessage} Jobs enfileirados: ${queued}${skipped ? ` | Ignorados: ${skipped}` : ""}.`
            : baseMessage,
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

          <button
            type="button"
            onClick={handleExtractPreview}
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
              {preview.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.image_url}
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

            <button
              type="button"
              onClick={handlePublishAndDistribute}
              disabled={publishing}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rs-green px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-fit"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {publishing
                ? "Publicando e distribuindo..."
                : "Publicar e Enviar para WhatsApp/Telegram"}
            </button>
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

