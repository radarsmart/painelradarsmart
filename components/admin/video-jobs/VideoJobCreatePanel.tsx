"use client";

import { CheckCircle2, Clapperboard, Loader2, Play, Upload } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

type CreateVideoJobResponse = {
  status?: string;
  jobId?: string;
  videoUrl?: string;
  error?: string;
};

type CreateVideoJobPayload = {
  productName: string;
  description: string;
  price?: string;
  sourceImageUrl?: string;
  targetAudience?: string;
  platform: "tiktok" | "reels" | "shorts" | "generic";
  durationSeconds: number;
  publish: boolean;
  bucket: string;
};

const STEPS = [
  {
    title: "1. Produto",
    description: "Informe nome, beneficio principal e preco. O produto precisa aparecer cedo no criativo.",
    icon: Clapperboard,
  },
  {
    title: "2. Imagem",
    description: "Cole uma URL publica da imagem do produto. Sem imagem, o pipeline usa fallback do provider.",
    icon: CheckCircle2,
  },
  {
    title: "3. Render",
    description: "O sistema gera texto, monta o video 9:16 e registra cada status no job.",
    icon: Play,
  },
  {
    title: "4. Publish",
    description: "Com publish ativo, o MP4 vai para o Supabase Storage e aparece no detalhe do job.",
    icon: Upload,
  },
];

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default function VideoJobCreatePanel({
  onCreated,
}: {
  onCreated: (result: { jobId: string; videoUrl?: string }) => void;
}) {
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [platform, setPlatform] = useState<CreateVideoJobPayload["platform"]>("tiktok");
  const [durationSeconds, setDurationSeconds] = useState(8);
  const [publish, setPublish] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createJob() {
    setError(null);

    const payload: CreateVideoJobPayload = {
      productName: productName.trim(),
      description: description.trim(),
      price: price.trim() || undefined,
      sourceImageUrl: sourceImageUrl.trim() || undefined,
      targetAudience: targetAudience.trim() || undefined,
      platform,
      durationSeconds,
      publish,
      bucket: "ugc-videos",
    };

    if (!payload.productName || !payload.description) {
      setError("Preencha nome do produto e descricao.");
      return;
    }

    setCreating(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/ai/video/full-pipeline", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as CreateVideoJobResponse;

      if (!response.ok || !result.jobId) {
        throw new Error(result.error || "Falha ao criar video.");
      }

      onCreated({ jobId: result.jobId, videoUrl: result.videoUrl });
      setProductName("");
      setDescription("");
      setPrice("");
      setSourceImageUrl("");
      setTargetAudience("");
      setDurationSeconds(8);
      setPublish(true);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Falha ao criar video.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div className="max-w-2xl">
          <h2 className="text-lg font-black text-slate-950">Criar video no Video Jobs</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use este fluxo para gerar um MP4 vertical, publicar no Storage e acompanhar o job pela tabela.
          </p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
          O render pode levar alguns minutos. Nao feche a aba ate o job ser criado.
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-rs-gold shadow-sm">
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-sm font-black text-slate-900">{step.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Nome do produto
          </span>
          <input
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            placeholder="Ex: Mini aspirador portatil"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Preco
          </span>
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="Ex: R$ 49,90"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
          />
        </label>

        <label className="block lg:col-span-2">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Descricao curta
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Beneficio principal, problema que resolve e contexto da oferta."
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
          />
        </label>

        <label className="block lg:col-span-2">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            URL da imagem do produto
          </span>
          <input
            value={sourceImageUrl}
            onChange={(event) => setSourceImageUrl(event.target.value)}
            placeholder="https://..."
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
          />
        </label>

        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Publico
          </span>
          <input
            value={targetAudience}
            onChange={(event) => setTargetAudience(event.target.value)}
            placeholder="Ex: quem quer organizar casa pequena"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Canal
            </span>
            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value as CreateVideoJobPayload["platform"])}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
            >
              <option value="tiktok">TikTok</option>
              <option value="reels">Reels</option>
              <option value="shorts">Shorts</option>
              <option value="generic">Generico</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Duracao
            </span>
            <input
              type="number"
              min={6}
              max={30}
              value={durationSeconds}
              onChange={(event) => setDurationSeconds(Number(event.target.value))}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
            />
          </label>

          <label className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={publish}
              onChange={(event) => setPublish(event.target.checked)}
              className="h-4 w-4 accent-rs-gold"
            />
            Publish
          </label>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Depois de criar, abra o detalhe do job para assistir o MP4 e copiar a URL publicada.
        </p>
        <button
          type="button"
          onClick={() => void createJob()}
          disabled={creating}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-rs-gold px-5 py-3 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {creating ? "Criando video..." : "Criar video"}
        </button>
      </div>
    </section>
  );
}
