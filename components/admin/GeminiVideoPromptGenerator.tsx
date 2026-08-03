"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";

import { supabase } from "@/lib/supabase";

type CandidateOffer = {
  id: string;
  title: string;
  price: number;
  discountPct: number;
  marketplace: string;
  imageUrl: string | null;
};

type PromptOption = { slug: string; label: string; description: string };

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }
  return token;
}

async function apiFetch(url: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error || `Falha na API (${response.status}).`);
  return json;
}

export default function GeminiVideoPromptGenerator() {
  const [offers, setOffers] = useState<CandidateOffer[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [productName, setProductName] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [formatOptions, setFormatOptions] = useState<PromptOption[]>([]);
  const [lightingOptions, setLightingOptions] = useState<PromptOption[]>([]);
  const [angleOptions, setAngleOptions] = useState<PromptOption[]>([]);
  const [format, setFormat] = useState("");
  const [lighting, setLighting] = useState("");
  const [angle, setAngle] = useState("");

  const loadOffers = useCallback(async () => {
    setLoadingOffers(true);
    setError("");
    try {
      const data = await apiFetch("/api/tiktok-engine/gemini-prompt");
      setOffers(data.offers ?? []);
      setFormatOptions(data.formatOptions ?? []);
      setLightingOptions(data.lightingOptions ?? []);
      setAngleOptions(data.angleOptions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar ofertas.");
    } finally {
      setLoadingOffers(false);
    }
  }, []);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  const generatePrompt = useCallback(async () => {
    if (!selectedOfferId) return;
    setGenerating(true);
    setError("");
    setPrompt("");
    setCopied(false);
    try {
      const data = await apiFetch("/api/tiktok-engine/gemini-prompt", {
        method: "POST",
        body: JSON.stringify({
          offer_id: selectedOfferId,
          format: format || undefined,
          lighting: lighting || undefined,
          angle: angle || undefined,
        }),
      });
      setPrompt(data.prompt ?? "");
      setProductName(data.productName ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar prompt.");
    } finally {
      setGenerating(false);
    }
  }, [selectedOfferId, format, lighting, angle]);

  const copyPrompt = useCallback(async () => {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [prompt]);

  return (
    <div className="min-h-screen flex-1 space-y-6 bg-[#0A0F1E] p-8 pt-6 text-white">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <Sparkles className="text-emerald-400" />
          Gerador de Prompt para Video (Gemini)
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">
          Escolhe uma oferta real do catalogo, a IA escreve o prompt do video (cena, beneficios, preco,
          CTA) pronto pra colar no Gemini/Veo. Voce gera o video la e posta manualmente no Instagram/TikTok.
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-emerald-400">
          1. Escolha a oferta
        </h2>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-emerald-400/80">
              {loadingOffers ? "Carregando ofertas..." : "Oferta"}
            </span>
            <select
              className="w-full rounded-xl border border-white/10 bg-[#0A0F1E] px-4 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/60"
              value={selectedOfferId}
              onChange={(e) => setSelectedOfferId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.title.slice(0, 60)} — R$ {offer.price.toFixed(2).replace(".", ",")}
                  {offer.discountPct ? ` (${offer.discountPct}% OFF)` : ""} [{offer.marketplace}]
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={generatePrompt}
            disabled={!selectedOfferId || generating}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando...
              </span>
            ) : (
              "Gerar prompt"
            )}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-emerald-400">
          2. Estilo do vídeo (opcional)
        </h2>
        <p className="mb-4 text-xs text-white/40">
          A garota-propaganda da Radar Smart aparece em todo vídeo — escolhe a variação de formato,
          iluminação e ângulo, ou deixa em &quot;Aleatório&quot; pra sortear e dar variedade entre os vídeos.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-emerald-400/80">
              Formato
            </span>
            <select
              className="w-full rounded-xl border border-white/10 bg-[#0A0F1E] px-4 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/60"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="">Aleatório</option>
              {formatOptions.map((opt) => (
                <option key={opt.slug} value={opt.slug}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-emerald-400/80">
              Iluminação
            </span>
            <select
              className="w-full rounded-xl border border-white/10 bg-[#0A0F1E] px-4 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/60"
              value={lighting}
              onChange={(e) => setLighting(e.target.value)}
            >
              <option value="">Aleatório</option>
              {lightingOptions.map((opt) => (
                <option key={opt.slug} value={opt.slug}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-emerald-400/80">
              Ângulo
            </span>
            <select
              className="w-full rounded-xl border border-white/10 bg-[#0A0F1E] px-4 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/60"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
            >
              <option value="">Aleatório</option>
              {angleOptions.map((opt) => (
                <option key={opt.slug} value={opt.slug}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {prompt ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-400">
              3. Prompt pronto — {productName}
            </h2>
            <button
              type="button"
              onClick={copyPrompt}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado!" : "Copiar prompt"}
            </button>
          </div>
          <textarea
            readOnly
            value={prompt}
            rows={16}
            className="w-full rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-sm text-white/90 outline-none"
          />
          <p className="mt-3 text-xs text-white/40">
            Cola esse texto no Gemini (gemini.google.com) ou no Google AI Studio, na opcao de gerar video.
          </p>
        </section>
      ) : null}
    </div>
  );
}
