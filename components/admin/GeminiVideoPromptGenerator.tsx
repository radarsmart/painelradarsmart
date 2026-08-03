"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Check, Copy, Download, Loader2, Sparkles } from "lucide-react";

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

type VideoScene = {
  label: string;
  durationHint: string;
  prompt: string;
};

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
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [productName, setProductName] = useState("");
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

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
    setScenes([]);
    setCopiedIndex(null);
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
      setScenes(data.scenes ?? []);
      setProductName(data.productName ?? "");
      setProductImageUrl(data.imageUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar prompt.");
    } finally {
      setGenerating(false);
    }
  }, [selectedOfferId, format, lighting, angle]);

  const copyScene = useCallback(async (index: number, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 2000);
  }, []);

  return (
    <div className="min-h-screen flex-1 space-y-6 bg-[#0A0F1E] p-8 pt-6 text-white">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <Sparkles className="text-emerald-400" />
          Gerador de Prompt para Video (Gemini)
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">
          Escolhe uma oferta real do catalogo, a IA escreve o roteiro em cenas curtas (o Gemini corta a
          fala se o vídeo passar de ~10s) prontas pra colar uma de cada vez no Gemini. Depois é só juntar
          os clipes em ordem no CapCut e postar manualmente no Instagram/TikTok.
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
              "Gerar roteiro em cenas"
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

      {scenes.length ? (
        <>
          {productImageUrl ? (
            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-amber-300">
                Imagem real do produto — anexe no Gemini
              </h2>
              <p className="mb-3 text-xs text-amber-100/70">
                O Gemini não sabe qual é o produto de verdade só pelo texto — baixe essa imagem e anexe
                ela ao gerar cada cena (2 e 3, onde o produto aparece), senão a IA inventa um produto genérico.
              </p>
              <div className="flex items-center gap-4">
                <Image
                  src={productImageUrl}
                  alt={productName}
                  width={72}
                  height={72}
                  className="h-18 w-18 rounded-xl border border-white/10 object-cover"
                  unoptimized
                />
                <a
                  href={productImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar imagem do produto
                </a>
              </div>
            </section>
          ) : null}

          <section className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-400">
              3. Cenas prontas — {productName}
            </h2>
            {scenes.map((scene, index) => (
              <div key={scene.label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-white">{scene.label}</p>
                    <p className="text-xs text-white/40">Duração alvo: {scene.durationHint}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyScene(index, scene.prompt)}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                  >
                    {copiedIndex === index ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedIndex === index ? "Copiado!" : "Copiar cena"}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={scene.prompt}
                  rows={8}
                  className="w-full rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-sm text-white/90 outline-none"
                />
              </div>
            ))}
            <p className="text-xs text-white/40">
              Cola cada cena separadamente na seção &quot;Vídeos&quot; do Gemini (não no chat geral), gera
              um clipe por cena, e depois junta os clipes em ordem no CapCut.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
