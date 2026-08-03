"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── Constantes ────────────────────────────────────────────────────────────────

const MODELS = [
  { id: 1, emoji: "⚡", name: "Problema → Solução", cvr: "8-12%", template: "Hook Choque" },
  { id: 2, emoji: "📦", name: "ASMR Unboxing", cvr: "6-9%", template: "Storytelling" },
  { id: 3, emoji: "🎭", name: "POV Storytelling", cvr: "10-15%", template: "Storytelling" },
  { id: 4, emoji: "🔥", name: "Review Honesto", cvr: "7-11%", template: "Storytelling" },
  { id: 5, emoji: "⚔️", name: "Comparação X vs Y", cvr: "9-14%", template: "Comparação" },
  { id: 6, emoji: "📚", name: "Tutorial", cvr: "5-8%", template: "Storytelling" },
  { id: 7, emoji: "🔄", name: "Trend Hijack", cvr: "4-7%", template: "Hook Choque" },
  { id: 8, emoji: "☀️", name: "Day-in-Life", cvr: "6-10%", template: "Storytelling" },
  { id: 9, emoji: "⭐", name: "Social Proof", cvr: "11-16%", template: "Hook Choque" },
  { id: 10, emoji: "💰", name: "Duelo de Preço", cvr: "12-18%", template: "Comparação" },
];

const STATUS_LABELS = {
  pending: { label: "Aguardando", color: "text-slate-400", dot: "bg-slate-400" },
  script_generating: { label: "Gerando roteiro...", color: "text-blue-400", dot: "bg-blue-400" },
  script_done: { label: "Roteiro pronto", color: "text-blue-300", dot: "bg-blue-300" },
  script_failed: { label: "Falha no roteiro", color: "text-red-400", dot: "bg-red-400" },
  audio: { label: "Gerando narração...", color: "text-purple-400", dot: "bg-purple-400" },
  processing: { label: "Processando...", color: "text-yellow-400", dot: "bg-yellow-400" },
  rendering_video: { label: "Renderizando vídeo...", color: "text-orange-400", dot: "bg-orange-400" },
  video_uploading: { label: "Enviando MP4...", color: "text-orange-300", dot: "bg-orange-300" },
  completed: { label: "Concluído ✓", color: "text-emerald-400", dot: "bg-emerald-400" },
  failed: { label: "Falhou", color: "text-red-400", dot: "bg-red-400" },
};

function getStatusInfo(status) {
  return STATUS_LABELS[status] ?? { label: status, color: "text-slate-400", dot: "bg-slate-400" };
}

// ─── API Helpers ───────────────────────────────────────────────────────────────

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    if (typeof window !== "undefined" && (
      window.location.hostname === "localhost" || 
      window.location.hostname === "127.0.0.1"
    )) {
      return "local-dev-token";
    }
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  return token;
}

async function apiFetch(url, init = {}) {
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

async function apiFetchBackground(url, init = {}) {
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

// ─── Sub-componentes ───────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#C9973A]/80">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({ label, value, onChange, placeholder = "", type = "text" }) {
  return (
    <Field label={label}>
      <input
        type={type}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#C9973A]/60 focus:bg-white/8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}

function Textarea({ label, value, onChange, placeholder = "", rows = 3 }) {
  return (
    <Field label={label}>
      <textarea
        rows={rows}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#C9973A]/60"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <select
        className="w-full rounded-xl border border-white/10 bg-[#0A0F1E] px-4 py-2.5 text-sm text-white outline-none transition focus:border-[#C9973A]/60"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecione...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </Field>
  );
}

function StatusDot({ status, animated = false }) {
  const info = getStatusInfo(status);
  const isActive = !["completed", "failed", "pending"].includes(status);
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`inline-block h-2 w-2 rounded-full ${info.dot} ${isActive || animated ? "animate-pulse" : ""}`}
      />
      <span className={`text-xs font-medium ${info.color}`}>{info.label}</span>
    </span>
  );
}

function LogPanel({ logs }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <div
      ref={ref}
      className="max-h-52 overflow-auto rounded-xl bg-black/40 p-3 font-mono text-xs"
    >
      {logs.length === 0 ? (
        <p className="text-white/30">Aguardando logs...</p>
      ) : (
        logs.map((log, idx) => (
          <div
            key={`${log.time}-${idx}`}
            className={
              log.type === "error"
                ? "text-red-400"
                : log.type === "success"
                  ? "text-emerald-400"
                  : "text-white/60"
            }
          >
            <span className="text-white/30">[{log.time}]</span> {log.message}
          </div>
        ))
      )}
    </div>
  );
}

function JobCard({ job }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-[#C9973A]/30">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{job.model_name}</span>
            {job.hook_variation_index !== undefined && (
              <span className="rounded-full bg-[#C9973A]/20 px-2 py-0.5 text-xs font-medium text-[#C9973A]">
                Hook #{job.hook_variation_index + 1}
              </span>
            )}
          </div>
          {job.script_title && (
            <p className="mt-0.5 text-xs text-white/50 line-clamp-1">{job.script_title}</p>
          )}
          {job.hook_variation_text && (
            <p className="mt-1 text-xs italic text-white/40">
              &ldquo;{job.hook_variation_text}&rdquo;
            </p>
          )}
        </div>
        <StatusDot status={job.status} animated />
      </div>

      {job.status === "completed" && job.video_url && (
        <div className="mt-3">
          <video
            src={job.video_url}
            controls
            playsInline
            className="w-full rounded-lg"
            style={{ maxHeight: 320, aspectRatio: "9/16", objectFit: "cover" }}
          />
          <div className="mt-2 flex gap-2">
            <a
              href={job.video_url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-lg bg-[#C9973A] py-2 text-center text-xs font-bold text-[#0A0F1E] transition hover:brightness-110"
            >
              ⬇ Baixar MP4
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(job.video_url)}
              className="rounded-lg border border-[#C9973A]/40 px-3 py-2 text-xs font-semibold text-[#C9973A] transition hover:bg-[#C9973A]/10"
            >
              Copiar URL
            </button>
          </div>
        </div>
      )}

      {job.error && (
        <p className="mt-2 rounded-lg bg-red-900/30 px-3 py-2 text-xs text-red-300">
          ⚠ {job.error}
        </p>
      )}

      {/* Log steps accordion */}
      {job.log_steps?.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="text-xs text-white/40 hover:text-white/70 transition"
          >
            {expanded ? "▲ Ocultar" : "▼ Ver"} {job.log_steps.length} etapa(s)
          </button>
          {expanded && (
            <div className="mt-2 space-y-1">
              {job.log_steps.map((step, idx) => (
                <div
                  key={`${step.step}-${idx}`}
                  className={`flex items-start gap-2 text-xs ${step.ok ? "text-white/60" : "text-red-400"}`}
                >
                  <span>{step.ok ? "✓" : "✗"}</span>
                  <span className="font-semibold">{step.step}</span>
                  <span className="flex-1 text-white/40 truncate">{step.detail}</span>
                  <span className="shrink-0 text-white/25">
                    {new Date(step.ts).toLocaleTimeString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ──────────────────────────────────────────────────────

export default function TikTokVideoSystem() {
  // ── Form
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productDiscount, setProductDiscount] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productBenefits, setProductBenefits] = useState("");
  const [productPain, setProductPain] = useState("");
  const [competitorName, setCompetitorName] = useState("");
  const [competitorPrice, setCompetitorPrice] = useState("");
  const [shopUrl, setShopUrl] = useState("");
  const [productImageUrls, setProductImageUrls] = useState("");
  const [selectedModels, setSelectedModels] = useState([1, 5, 9]);
  const [hookCount, setHookCount] = useState(1);
  const [videoProvider, setVideoProvider] = useState("remotion");
  // ── Voice / Avatar
  const [voices, setVoices] = useState([]);
  const [voiceRegistry, setVoiceRegistry] = useState({ default_voice_id: "", voices: [] });
  const [voiceId, setVoiceId] = useState("");
  const [savingVoiceDefault, setSavingVoiceDefault] = useState(false);
  const [avatarId] = useState("");
  // ── Preencher a partir de oferta real
  const [realOffers, setRealOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [fillingFromOffer, setFillingFromOffer] = useState(false);
  // ── Pipeline
  const [activeTab, setActiveTab] = useState("form");
  const [briefingId, setBriefingId] = useState("");
  const [jobs, setJobs] = useState([]);
  const [overallStatus, setOverallStatus] = useState("pending");
  const [progress, setProgress] = useState("0%");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const intervalRef = useRef(null);

  const addLog = useCallback((message, type = "info") => {
    setLogs((prev) => [...prev, { message, type, time: new Date().toLocaleTimeString("pt-BR") }]);
  }, []);

  const canGenerate = useMemo(
    () => Boolean(productName && productPrice && productBenefits && productPain && selectedModels.length),
    [productName, productPrice, productBenefits, productPain, selectedModels],
  );

  // ── Carregar vozes e avatares
  const loadVoices = useCallback(async () => {
    try {
      const data = await apiFetch("/api/tiktok-engine/voices");
      if (!data?.voices?.length) return;
      setVoices(data.voices);
      setVoiceRegistry(data.registry ?? { default_voice_id: "", voices: [] });
      const def = data.default_voice_id || data.registry?.default_voice_id || data.voices[0].voice_id;
      if (!voiceId) setVoiceId(def);
    } catch (e) {
      addLog(e instanceof Error ? e.message : "Falha ao carregar vozes.", "error");
    }
  }, [addLog, voiceId]);

  useEffect(() => { void loadVoices(); }, [loadVoices]);

  // ── Carregar ofertas reais (pra nao ter que digitar produto do zero)
  const loadRealOffers = useCallback(async () => {
    setLoadingOffers(true);
    try {
      const data = await apiFetch("/api/tiktok-engine/offer-briefing");
      setRealOffers(data.offers ?? []);
    } catch (e) {
      addLog(e instanceof Error ? e.message : "Falha ao carregar ofertas reais.", "error");
    } finally {
      setLoadingOffers(false);
    }
  }, [addLog]);

  useEffect(() => { void loadRealOffers(); }, [loadRealOffers]);

  const fillFromSelectedOffer = useCallback(async () => {
    if (!selectedOfferId) return;
    setFillingFromOffer(true);
    try {
      const data = await apiFetch("/api/tiktok-engine/offer-briefing", {
        method: "POST",
        body: JSON.stringify({ offer_id: selectedOfferId }),
      });
      const b = data.briefing ?? {};
      setProductName(b.product_name ?? "");
      setProductPrice(b.product_price ?? "");
      setProductDiscount(b.product_discount ?? "");
      setProductCategory(b.product_category ?? "");
      setProductBenefits(b.product_benefits ?? "");
      setProductPain(b.product_pain ?? "");
      setCompetitorName(b.competitor_name ?? "");
      setCompetitorPrice(b.competitor_price ?? "");
      setShopUrl(b.shop_url ?? "");
      setProductImageUrls((b.product_image_urls ?? []).join("\n"));
      addLog("Campos preenchidos com a oferta real selecionada.", "success");
    } catch (e) {
      addLog(e instanceof Error ? e.message : "Falha ao preencher a partir da oferta.", "error");
    } finally {
      setFillingFromOffer(false);
    }
  }, [addLog, selectedOfferId]);

  // ── Polling de status
  const stopPolling = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const fetchStatus = useCallback(async (id) => {
    let data;
    try {
      data = await apiFetch(`/api/tiktok-engine/status/${id}`);
    } catch (e) {
      addLog(e instanceof Error ? e.message : "Erro ao consultar status.", "error");
      setRunning(false);
      stopPolling();
      return;
    }
    setJobs(data.jobs ?? []);
    setOverallStatus(data.overall_status ?? "processing");
    setProgress(data.progress ?? "0%");
    if (["completed", "failed", "partial_failed"].includes(data.overall_status)) {
      setRunning(false);
      stopPolling();
      addLog(`Pipeline finalizado: ${data.overall_status}`, data.overall_status === "completed" ? "success" : "error");
      setActiveTab("jobs");
    }
  }, [addLog, stopPolling]);

  // ── Salvar voz padrão
  const setVoiceAsDefault = useCallback(async () => {
    if (!voiceId) return;
    setSavingVoiceDefault(true);
    try {
      const selectedVoice = voices.find((v) => v.voice_id === voiceId);
      const data = await apiFetch("/api/tiktok-engine/voices", {
        method: "PATCH",
        body: JSON.stringify({
          default_voice_id: voiceId,
          register_voices: selectedVoice ? [{ voice_id: selectedVoice.voice_id, name: selectedVoice.name, active: true }] : undefined,
        }),
      });
      setVoiceRegistry(data.registry ?? voiceRegistry);
      addLog("Voz padrão atualizada.", "success");
    } catch (e) {
      addLog(e instanceof Error ? e.message : "Falha ao definir voz padrão.", "error");
    } finally { setSavingVoiceDefault(false); }
  }, [addLog, voiceId, voices, voiceRegistry]);

  // ── Iniciar geração
  const startGeneration = useCallback(async () => {
    stopPolling();
    setRunning(true);
    setLogs([]);
    setJobs([]);
    setBriefingId("");
    setProgress("0%");
    setOverallStatus("pending");
    addLog(`Iniciando pipeline: ${selectedModels.length} modelo(s) × ${hookCount} hook(s)...`);

    const payload = {
      product_name: productName,
      product_price: productPrice,
      product_discount: productDiscount || undefined,
      product_category: productCategory || undefined,
      product_benefits: productBenefits,
      product_pain: productPain,
      competitor_name: competitorName || undefined,
      competitor_price: competitorPrice || undefined,
      shop_url: shopUrl || undefined,
      product_image_urls: productImageUrls.split("\n").map((u) => u.trim()).filter(Boolean),
      model_ids: selectedModels,
      hook_count: hookCount,
      voice_id: voiceId || undefined,
      avatar_id: avatarId || undefined,
      video_provider: videoProvider,
    };

    let data;
    try {
      data = await apiFetch("/api/tiktok-engine/generate", { method: "POST", body: JSON.stringify(payload) });
    } catch (e) {
      setRunning(false);
      addLog(e instanceof Error ? e.message : "Erro ao iniciar geração.", "error");
      return;
    }

    setBriefingId(data.briefing_id);
    addLog(data?.message ?? "Briefing criado.", "success");
    setActiveTab("jobs");

    void (async () => {
      try {
        addLog("Executando pipeline em background...");
        await apiFetchBackground(`/api/tiktok-engine/run/${data.briefing_id}`, { method: "POST" });
      } catch (e) {
        addLog(e instanceof Error ? e.message : "Falha ao executar pipeline.", "error");
      }
    })();

    try { await fetchStatus(data.briefing_id); } catch { /* handled inside */ }
    intervalRef.current = setInterval(() => { void fetchStatus(data.briefing_id); }, 7000);
  }, [
    addLog, avatarId, competitorName, competitorPrice, fetchStatus, hookCount,
    productBenefits, productCategory, productDiscount, productImageUrls,
    productName, productPain, productPrice, selectedModels, shopUrl,
    stopPolling, videoProvider, voiceId,
  ]);

  const toggleModel = (id) => {
    setSelectedModels((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
  };

  const estimatedVideos = selectedModels.length * hookCount;
  const completedJobs = jobs.filter((j) => j.status === "completed").length;

  // ── Tabs
  const tabs = [
    { id: "form", label: "Briefing" },
    { id: "jobs", label: `Jobs ${jobs.length > 0 ? `(${completedJobs}/${jobs.length})` : ""}` },
    { id: "logs", label: "Logs" },
  ];

  return (
    <div
      className="min-h-screen p-6"
      style={{ background: "linear-gradient(135deg, #0A0F1E 0%, #0f1829 60%, #0A0F1E 100%)" }}
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">
          TikTok Shop{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(90deg, #C9973A, #e8b84b)" }}
          >
            Video Engine
          </span>
        </h1>
        <p className="mt-1 text-sm text-white/50">
          OpenAI + ElevenLabs + Remotion — formato nativo TikTok Shop 9:16
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-[#C9973A] text-[#0A0F1E]"
                : "text-white/60 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ABA: BRIEFING ─────────────────────────────────────────────────────── */}
      {activeTab === "form" && (
        <div className="space-y-5">
          {/* Gerar a partir de oferta real */}
          <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-emerald-400">
              Gerar a partir de uma oferta real
            </h2>
            <p className="mb-4 text-xs text-white/50">
              Escolhe uma oferta que ja esta no site/grupo — preco, desconto e imagem vem do catalogo,
              e a IA preenche beneficios/dor do cliente. Bem mais rapido que digitar tudo do zero.
            </p>
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <Select
                  label={loadingOffers ? "Carregando ofertas..." : "Oferta"}
                  value={selectedOfferId}
                  onChange={setSelectedOfferId}
                  options={realOffers.map((o) => ({
                    value: o.id,
                    label: `${o.title.slice(0, 60)} — R$ ${o.price.toFixed(2).replace(".", ",")}${o.discountPct ? ` (${o.discountPct}% OFF)` : ""} [${o.marketplace}]`,
                  }))}
                />
              </div>
              <button
                type="button"
                onClick={fillFromSelectedOffer}
                disabled={!selectedOfferId || fillingFromOffer}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {fillingFromOffer ? "Preenchendo..." : "Preencher com esta oferta"}
              </button>
            </div>
          </section>

          {/* Produto */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#C9973A]">
              Dados do Produto
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Nome do Produto *" value={productName} onChange={setProductName} placeholder="Ex: Câmera de Ação 4K" />
              <Input label="Preço *" value={productPrice} onChange={setProductPrice} placeholder="Ex: 149,90" />
              <Input label="Desconto" value={productDiscount} onChange={setProductDiscount} placeholder="Ex: 40% OFF" />
              <Input label="Categoria" value={productCategory} onChange={setProductCategory} placeholder="Ex: Eletrônicos" />
              <Input label="Concorrente" value={competitorName} onChange={setCompetitorName} placeholder="Nome do concorrente" />
              <Input label="Preço do Concorrente" value={competitorPrice} onChange={setCompetitorPrice} placeholder="Ex: 299,00" />
              <div className="md:col-span-2">
                <Input label="URL TikTok Shop" value={shopUrl} onChange={setShopUrl} placeholder="https://..." />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Textarea
                label="Benefícios do Produto *"
                value={productBenefits}
                onChange={setProductBenefits}
                placeholder="1. Durável&#10;2. Fácil de usar&#10;3. Ótimo custo-benefício"
                rows={4}
              />
              <Textarea
                label="Dor Principal do Cliente *"
                value={productPain}
                onChange={setProductPain}
                placeholder="Câmera cara, bateria ruim, complicada de usar..."
                rows={4}
              />
            </div>
            <div className="mt-4">
              <Textarea
                label="URLs de Imagem do Produto (1 por linha)"
                value={productImageUrls}
                onChange={setProductImageUrls}
                placeholder="https://imagem1.jpg&#10;https://imagem2.jpg"
                rows={2}
              />
            </div>
          </section>

          {/* Modelos */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-[#C9973A]">
              Modelos de Vídeo
            </h2>
            <p className="mb-4 text-xs text-white/40">
              {selectedModels.length} selecionado(s). Template visual gerado automaticamente por modelo.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MODELS.map((model) => {
                const selected = selectedModels.includes(model.id);
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => toggleModel(model.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      selected
                        ? "border-[#C9973A]/70 bg-[#C9973A]/10"
                        : "border-white/10 bg-white/3 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">
                        {model.emoji} {model.name}
                      </span>
                      {selected && (
                        <span className="rounded-full bg-[#C9973A] px-1.5 text-xs font-bold text-[#0A0F1E]">✓</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-white/40">CVR {model.cvr}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
                        {model.template}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Config */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#C9973A]">
              Configuração de Geração
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Select
                label="Provider de Vídeo"
                value={videoProvider}
                onChange={setVideoProvider}
                options={[
                  { value: "remotion", label: "Remotion (padrão)" },
                  { value: "heygen", label: "HeyGen (fallback)" },
                ]}
              />
              <Select
                label="Voz ElevenLabs"
                value={voiceId}
                onChange={setVoiceId}
                options={voices.map((v) => ({ value: v.voice_id, label: v.name ?? v.voice_id }))}
              />
              <Field label="Variações de Hook por Modelo">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={hookCount}
                    onChange={(e) => setHookCount(Number(e.target.value))}
                    className="flex-1 accent-[#C9973A]"
                  />
                  <span className="w-6 text-center text-sm font-bold text-[#C9973A]">{hookCount}</span>
                </div>
                <p className="mt-1 text-xs text-white/40">
                  Gerará {estimatedVideos} vídeo(s) no total
                </p>
              </Field>
            </div>

            {/* Voz padrão */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void setVoiceAsDefault()}
                disabled={!voiceId || savingVoiceDefault}
                className="rounded-lg border border-[#C9973A]/40 px-3 py-1.5 text-xs font-semibold text-[#C9973A] transition hover:bg-[#C9973A]/10 disabled:opacity-40"
              >
                {savingVoiceDefault ? "Salvando..." : "Definir como padrão"}
              </button>
              <span className="text-xs text-white/30">
                Atual: {voiceRegistry?.default_voice_id || "não definido"}
              </span>
            </div>
          </section>

          {/* Botão Gerar */}
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-white/50">
              {estimatedVideos} vídeo(s) estimado(s) com {selectedModels.length} modelo(s) × {hookCount} hook(s)
            </div>
            <button
              type="button"
              onClick={() => void startGeneration()}
              disabled={!canGenerate || running}
              className="rounded-xl px-8 py-3 text-sm font-black text-[#0A0F1E] transition disabled:opacity-40 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #C9973A, #e8b84b)",
                boxShadow: "0 0 40px rgba(201,151,58,0.4)",
              }}
            >
              {running ? "⏳ Gerando..." : "🎬 Gerar Vídeos"}
            </button>
          </div>
        </div>
      )}

      {/* ── ABA: JOBS ──────────────────────────────────────────────────────────── */}
      {activeTab === "jobs" && (
        <div className="space-y-4">
          {briefingId && (
            <div className="rounded-xl border border-[#C9973A]/30 bg-[#C9973A]/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#C9973A]/70">Briefing ativo</p>
                  <p className="font-mono text-xs text-white/60">{briefingId}</p>
                </div>
                <div className="text-right">
                  <StatusDot status={overallStatus} animated={running} />
                  <p className="mt-1 text-2xl font-black text-white">{progress}</p>
                </div>
              </div>
              {/* Barra de progresso */}
              <div className="mt-3 h-1.5 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#C9973A] transition-all duration-1000"
                  style={{ width: progress }}
                />
              </div>
            </div>
          )}

          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
              <p className="text-4xl">🎬</p>
              <p className="mt-2 text-sm text-white/40">
                {running ? "Iniciando jobs..." : "Nenhum job ainda. Crie um briefing na aba Briefing."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {jobs.map((job) => (
                <JobCard key={job.job_id} job={job} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ABA: LOGS ──────────────────────────────────────────────────────────── */}
      {activeTab === "logs" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white/60">Pipeline Logs</h2>
            <button
              type="button"
              onClick={() => setLogs([])}
              className="text-xs text-white/30 hover:text-white/60 transition"
            >
              Limpar
            </button>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <LogPanel logs={logs} />
          </div>
        </div>
      )}
    </div>
  );
}
