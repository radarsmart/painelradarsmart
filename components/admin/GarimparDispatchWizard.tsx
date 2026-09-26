"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Send, Sparkles } from "lucide-react";

import { formatBRL } from "@/lib/formatters";
import { supabase } from "@/lib/supabase-browser";
import { GARIMPAR_SELECTION_KEY } from "@/components/admin/GarimparQueueList";

type Marketplace = "mercadolivre" | "amazon" | "shopee" | "aliexpress" | "awin";

type WizardOffer = {
  id: string;
  title: string;
  price: number;
  old_price: number | null;
  image_url: string | null;
  marketplace: Marketplace;
  product_url: string;
  affiliate_url: string;
  pix_price: number | null;
  cash_price: number | null;
  card_price: number | null;
  installment_count: number | null;
  installment_amount: number | null;
  installment_interest_free: boolean | null;
  coupon_code: string | null;
  coupon_description: string | null;
};

type CopyVariantKey = "hook" | "short" | "medium" | "long";
type WhatsAppCopyVariants = Record<CopyVariantKey, string>;
type SlotType = "flash" | "best" | "comparator";

type DispatchOutcome = {
  offerId: string;
  ok: boolean;
  message: string;
};

const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  mercadolivre: "Mercado Livre",
  amazon: "Amazon",
  shopee: "Shopee",
  aliexpress: "AliExpress",
  awin: "AWIN",
};

const VARIANT_LABELS: Array<{ key: CopyVariantKey; label: string }> = [
  { key: "hook", label: "Gancho" },
  { key: "short", label: "Curto" },
  { key: "medium", label: "Medio" },
  { key: "long", label: "Longo" },
];

const STEPS = [
  { key: "ofertas", label: "Ofertas" },
  { key: "mensagem", label: "Mensagem" },
  { key: "destinos", label: "Destinos" },
] as const;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getOfferHeadlinePrice(offer: WizardOffer): { price: number; suffix: string } {
  if (offer.pix_price && offer.pix_price <= offer.price + 0.01) {
    return { price: offer.pix_price, suffix: " no PIX" };
  }
  if (offer.cash_price && offer.cash_price <= offer.price + 0.01) {
    return { price: offer.cash_price, suffix: " a vista" };
  }
  return { price: offer.price, suffix: " no PIX" };
}

function buildPaymentLines(offer: WizardOffer): string[] {
  const headline = getOfferHeadlinePrice(offer);
  const lines = [`Por: *${formatBRL(headline.price)}*${headline.suffix}`];

  if (offer.installment_count && offer.installment_amount) {
    const suffix = offer.installment_interest_free ? " sem juros" : "";
    lines.push(
      `ou ${offer.installment_count}x de ${formatBRL(offer.installment_amount)} no cartão de crédito${suffix}`,
    );
  } else if (offer.card_price && Math.abs(offer.card_price - headline.price) >= 0.01) {
    lines.push(`ou 1x de ${formatBRL(offer.card_price)} no cartão de crédito`);
  }

  return lines;
}

function buildFallbackCopy(offer: WizardOffer): string {
  const hasOldPrice = (offer.old_price ?? 0) > offer.price;
  const lines = [
    `*${offer.title}*`,
    "",
    hasOldPrice ? `De: ~~${formatBRL(offer.old_price ?? 0)}~~` : null,
    ...buildPaymentLines(offer),
    "",
    `👉 ${offer.affiliate_url || offer.product_url}`,
  ];
  return lines.filter((line) => line !== null).join("\n");
}

export default function GarimparDispatchWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offers, setOffers] = useState<WizardOffer[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [copyByOffer, setCopyByOffer] = useState<Record<string, string>>({});
  const [variantsByOffer, setVariantsByOffer] = useState<Record<string, WhatsAppCopyVariants | null>>({});
  const [variantKeyByOffer, setVariantKeyByOffer] = useState<Record<string, CopyVariantKey>>({});
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [copyGenerated, setCopyGenerated] = useState(false);

  const [destSite, setDestSite] = useState(false);
  const [destTelegram, setDestTelegram] = useState(true);
  const [destWhatsapp, setDestWhatsapp] = useState(true);
  const [slotType, setSlotType] = useState<SlotType>("best");
  const [sendImmediately, setSendImmediately] = useState(false);

  const [dispatching, setDispatching] = useState(false);
  const [results, setResults] = useState<DispatchOutcome[] | null>(null);

  const confirmedOffers = useMemo(
    () => offers.filter((offer) => confirmedIds.has(offer.id)),
    [offers, confirmedIds],
  );

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Faca login novamente.");
    return token;
  }

  useEffect(() => {
    const raw = window.sessionStorage.getItem(GARIMPAR_SELECTION_KEY);
    const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];

    if (!ids.length) {
      setError("Nenhuma oferta selecionada. Volte para a fila e selecione ao menos 1 item.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const token = await getAccessToken();
        const loaded = await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(`/api/admin/offers?id=${encodeURIComponent(id)}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            });
            const payload = (await res.json().catch(() => ({}))) as { offer?: Record<string, unknown>; error?: string };
            if (!res.ok || !payload.offer) return null;
            const offer = payload.offer;
            const marketplace = String(offer.marketplace ?? "").toLowerCase();
            if (
              marketplace !== "mercadolivre" &&
              marketplace !== "amazon" &&
              marketplace !== "shopee" &&
              marketplace !== "aliexpress" &&
              marketplace !== "awin"
            )
              return null;
            const toNullableNumber = (value: unknown) =>
              value !== null && value !== undefined && value !== "" ? toNumber(value) : null;

            return {
              id: String(offer.id),
              title: String(offer.title ?? "Produto sem titulo"),
              price: toNumber(offer.price),
              old_price: offer.old_price !== null && offer.old_price !== undefined ? toNumber(offer.old_price) : null,
              image_url: offer.image_url ? String(offer.image_url) : null,
              marketplace: marketplace as Marketplace,
              product_url: String(offer.product_url ?? ""),
              affiliate_url: String(offer.affiliate_url ?? ""),
              pix_price: toNullableNumber(offer.pix_price),
              cash_price: toNullableNumber(offer.cash_price),
              card_price: toNullableNumber(offer.card_price),
              installment_count: toNullableNumber(offer.installment_count),
              installment_amount: toNullableNumber(offer.installment_amount),
              installment_interest_free:
                typeof offer.installment_interest_free === "boolean" ? offer.installment_interest_free : null,
              coupon_code: offer.coupon_code ? String(offer.coupon_code) : null,
              coupon_description: offer.coupon_description ? String(offer.coupon_description) : null,
            } satisfies WizardOffer;
          }),
        );

        const valid = loaded.filter((item): item is WizardOffer => item !== null);
        setOffers(valid);
        setConfirmedIds(new Set(valid.map((item) => item.id)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar ofertas selecionadas.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleConfirmed(id: string) {
    setConfirmedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generateCopyForAll() {
    setGeneratingCopy(true);
    setError("");
    try {
      const token = await getAccessToken();
      const nextVariants: Record<string, WhatsAppCopyVariants | null> = {};
      const nextCopy: Record<string, string> = {};
      const nextKeys: Record<string, CopyVariantKey> = {};

      await Promise.all(
        confirmedOffers.map(async (offer) => {
          try {
            const res = await fetch("/api/admin/criativos/whatsapp-copy", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                title: offer.title,
                price: offer.price,
                original_price: offer.old_price ?? undefined,
                affiliate_url: offer.affiliate_url || offer.product_url,
                image_url: offer.image_url ?? undefined,
                marketplace: MARKETPLACE_LABEL[offer.marketplace],
                pix_price: offer.pix_price ?? undefined,
                cash_price: offer.cash_price ?? undefined,
                card_price: offer.card_price ?? undefined,
                installment_count: offer.installment_count ?? undefined,
                installment_amount: offer.installment_amount ?? undefined,
                installment_interest_free: offer.installment_interest_free ?? undefined,
                coupon_code: offer.coupon_code ?? undefined,
                coupon_description: offer.coupon_description ?? undefined,
              }),
            });
            const payload = (await res.json().catch(() => ({}))) as Partial<WhatsAppCopyVariants> & { error?: string };
            if (!res.ok || !payload.medium) throw new Error(payload.error || "Falha ao gerar copy.");
            const variants = payload as WhatsAppCopyVariants;
            nextVariants[offer.id] = variants;
            nextKeys[offer.id] = "medium";
            nextCopy[offer.id] = variants.medium;
          } catch {
            nextVariants[offer.id] = null;
            nextCopy[offer.id] = buildFallbackCopy(offer);
          }
        }),
      );

      setVariantsByOffer((prev) => ({ ...prev, ...nextVariants }));
      setVariantKeyByOffer((prev) => ({ ...prev, ...nextKeys }));
      setCopyByOffer((prev) => ({ ...prev, ...nextCopy }));
      setCopyGenerated(true);
    } finally {
      setGeneratingCopy(false);
    }
  }

  function applyVariant(offerId: string, key: CopyVariantKey) {
    const variants = variantsByOffer[offerId];
    if (!variants) return;
    setVariantKeyByOffer((prev) => ({ ...prev, [offerId]: key }));
    setCopyByOffer((prev) => ({ ...prev, [offerId]: variants[key] }));
  }

  function goNext() {
    if (step === 0 && !confirmedOffers.length) {
      setError("Confirme pelo menos 1 oferta antes de continuar.");
      return;
    }
    if (step === 1 && !copyGenerated) {
      setError('Clique em "Gerar mensagens" antes de continuar.');
      return;
    }
    setError("");
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  }

  function goBack() {
    setError("");
    setStep((prev) => Math.max(prev - 1, 0));
  }

  async function handleDispatch() {
    if (!destSite && !destTelegram && !destWhatsapp) {
      setError("Selecione ao menos um destino: Site, Telegram ou WhatsApp.");
      return;
    }

    setDispatching(true);
    setError("");
    const outcomes: DispatchOutcome[] = [];

    try {
      const token = await getAccessToken();
      const channels = [destTelegram ? "telegram" : null, destWhatsapp ? "whatsapp" : null].filter(Boolean);

      for (const offer of confirmedOffers) {
        try {
          const res = await fetch("/api/admin/extrator/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              title: offer.title,
              price: offer.price,
              old_price: offer.old_price ?? 0,
              image_url: offer.image_url ?? "",
              product_url: offer.product_url,
              affiliate_url: offer.affiliate_url || offer.product_url,
              marketplace: offer.marketplace,
              slot_type: destSite ? slotType : undefined,
              copy_text: copyByOffer[offer.id] ?? "",
              channels,
              publish_to_site: destSite,
              schedule_now: sendImmediately,
              // Sem isso, a rota de disparo sobrescreve esses campos com
              // null (ela sempre grava o que vier no corpo) — apagaria o
              // Pix/parcelamento capturado pela extensao no ato do disparo.
              pix_price: offer.pix_price ?? undefined,
              cash_price: offer.cash_price ?? undefined,
              card_price: offer.card_price ?? undefined,
              installment_count: offer.installment_count ?? undefined,
              installment_amount: offer.installment_amount ?? undefined,
              installment_interest_free: offer.installment_interest_free ?? undefined,
              coupon_code: offer.coupon_code ?? undefined,
              coupon_description: offer.coupon_description ?? undefined,
            }),
          });
          const payload = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          outcomes.push({
            offerId: offer.id,
            ok: res.ok,
            message: res.ok ? payload.message ?? "Enviado." : payload.error ?? "Falha ao disparar.",
          });
        } catch (err) {
          outcomes.push({
            offerId: offer.id,
            ok: false,
            message: err instanceof Error ? err.message : "Falha ao disparar.",
          });
        }
      }

      setResults(outcomes);
      window.sessionStorage.removeItem(GARIMPAR_SELECTION_KEY);
    } finally {
      setDispatching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error && !offers.length) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => router.push("/admin/garimpar")}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700"
          >
            Voltar para a fila
          </button>
        </div>
      </div>
    );
  }

  if (results) {
    const successCount = results.filter((item) => item.ok).length;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-lg font-bold text-emerald-800">
            {successCount} de {results.length} oferta(s) disparada(s) com sucesso.
          </p>
        </div>
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {results.map((result) => {
            const offer = offers.find((item) => item.id === result.offerId);
            return (
              <div key={result.offerId} className="flex items-center justify-between gap-3 p-3 text-sm">
                <p className="min-w-0 flex-1 truncate font-medium text-[#22223B]">{offer?.title ?? result.offerId}</p>
                <span className={result.ok ? "text-emerald-700" : "text-red-600"}>{result.message}</span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => router.push("/admin/garimpar")}
          className="rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white"
        >
          Voltar para a fila
        </button>
      </div>
    );
  }

  const currentStep = STEPS[step];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        {STEPS.map((item, index) => (
          <div key={item.key} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                index <= step ? "bg-navy text-white" : "bg-slate-100 text-slate-400"
              }`}
            >
              {index + 1}
            </div>
            <span className={`text-sm font-semibold ${index <= step ? "text-navy" : "text-slate-400"}`}>
              {item.label}
            </span>
            {index < STEPS.length - 1 ? <div className="h-px flex-1 bg-slate-200" /> : null}
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {currentStep.key === "ofertas" ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Confirme quais ofertas seguem para o disparo.</p>
            {offers.map((offer) => (
              <label
                key={offer.id}
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  confirmedIds.has(offer.id) ? "border-navy/30 bg-navy/5" : "border-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={confirmedIds.has(offer.id)}
                  onChange={() => toggleConfirmed(offer.id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={offer.image_url || "/logo.png"}
                  alt={offer.title}
                  className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#22223B]">{offer.title}</p>
                  <p className="text-xs text-slate-500">{MARKETPLACE_LABEL[offer.marketplace]}</p>
                </div>
                <p className="font-mono text-sm font-bold text-[#22223B]">{formatBRL(offer.price)}</p>
              </label>
            ))}
          </div>
        ) : null}

        {currentStep.key === "mensagem" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Mensagem gerada pela IA, no mesmo formato usado hoje na Central de Oferta. Revise e edite antes de
                continuar.
              </p>
              <button
                type="button"
                onClick={() => void generateCopyForAll()}
                disabled={generatingCopy}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {generatingCopy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {copyGenerated ? "Gerar novamente" : "Gerar mensagens"}
              </button>
            </div>

            {confirmedOffers.map((offer) => (
              <div key={offer.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={offer.image_url || "/logo.png"}
                    alt={offer.title}
                    className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
                  />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#22223B]">{offer.title}</p>
                </div>

                {variantsByOffer[offer.id] ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {VARIANT_LABELS.map((variant) => (
                      <button
                        key={variant.key}
                        type="button"
                        onClick={() => applyVariant(offer.id, variant.key)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          variantKeyByOffer[offer.id] === variant.key
                            ? "bg-navy text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {variant.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <textarea
                  value={copyByOffer[offer.id] ?? ""}
                  onChange={(event) =>
                    setCopyByOffer((prev) => ({ ...prev, [offer.id]: event.target.value }))
                  }
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 p-3 font-mono text-xs text-slate-700"
                  placeholder='Clique em "Gerar mensagens" acima.'
                />
              </div>
            ))}
          </div>
        ) : null}

        {currentStep.key === "destinos" ? (
          <div className="space-y-5">
            <p className="text-sm text-slate-500">
              Para onde enviar — os mesmos canais e mecanismo de disparo ja usados na Central de Oferta.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <label
                className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${
                  destSite ? "border-navy/40 bg-navy/5" : "border-slate-200"
                }`}
              >
                <input type="checkbox" checked={destSite} onChange={() => setDestSite((v) => !v)} className="h-4 w-4" />
                Site
              </label>
              <label
                className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${
                  destTelegram ? "border-navy/40 bg-navy/5" : "border-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={destTelegram}
                  onChange={() => setDestTelegram((v) => !v)}
                  className="h-4 w-4"
                />
                Telegram
              </label>
              <label
                className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${
                  destWhatsapp ? "border-navy/40 bg-navy/5" : "border-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={destWhatsapp}
                  onChange={() => setDestWhatsapp((v) => !v)}
                  className="h-4 w-4"
                />
                WhatsApp
              </label>
            </div>

            {destSite ? (
              <label className="block text-sm font-semibold text-slate-600">
                Vitrine do site
                <select
                  value={slotType}
                  onChange={(event) => setSlotType(event.target.value as SlotType)}
                  className="mt-1 h-11 w-full max-w-xs rounded-lg border border-slate-300 px-3 text-sm"
                >
                  <option value="best">Melhores Ofertas</option>
                  <option value="flash">Ofertas Relampago</option>
                  <option value="comparator">Comparador</option>
                </select>
              </label>
            ) : null}

            <label className="flex items-center gap-3 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={sendImmediately}
                onChange={() => setSendImmediately((v) => !v)}
                className="h-4 w-4"
              />
              Enviar imediatamente (ignora o espacamento padrao de 15min)
            </label>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
          Anterior
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white"
          >
            Proximo
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleDispatch()}
            disabled={dispatching}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Disparar
          </button>
        )}
      </div>
    </div>
  );
}
