"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const MODELS = [
  { id: 1, emoji: "⚡", name: "Problema -> Solucao", cvr: "8-12%" },
  { id: 2, emoji: "📦", name: "ASMR Unboxing", cvr: "6-9%" },
  { id: 3, emoji: "🎭", name: "POV Storytelling", cvr: "10-15%" },
  { id: 4, emoji: "🔥", name: "Review Honesto", cvr: "7-11%" },
  { id: 5, emoji: "⚔️", name: "Comparacao X vs Y", cvr: "9-14%" },
  { id: 6, emoji: "📚", name: "Tutorial", cvr: "5-8%" },
  { id: 7, emoji: "🔄", name: "Trend Hijack", cvr: "4-7%" },
  { id: 8, emoji: "☀️", name: "Day-in-Life", cvr: "6-10%" },
  { id: 9, emoji: "⭐", name: "Social Proof", cvr: "11-16%" },
  { id: 10, emoji: "💰", name: "Duelo de Preco", cvr: "12-18%" },
];

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }
  return token;
}

async function apiFetch(url, init = {}) {
  const token = await getAccessToken();
  console.log("[tiktok] fetch:start", {
    url,
    method: init.method || "GET",
  });
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  console.log("[tiktok] fetch:response", {
    url,
    method: init.method || "GET",
    status: response.status,
    ok: response.ok,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[tiktok] fetch:error", {
      url,
      method: init.method || "GET",
      status: response.status,
      error: json?.error || `Falha na API (${response.status}).`,
    });
    throw new Error(json?.error || `Falha na API (${response.status}).`);
  }
  return json;
}

async function apiFetchInBackground(url, init = {}) {
  const token = await getAccessToken();
  console.log("[tiktok] background:start", {
    url,
    method: init.method || "GET",
  });
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  console.log("[tiktok] background:response", {
    url,
    method: init.method || "GET",
    status: response.status,
    ok: response.ok,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[tiktok] background:error", {
      url,
      method: init.method || "GET",
      status: response.status,
      error: json?.error || `Falha na API (${response.status}).`,
    });
    throw new Error(json?.error || `Falha na API (${response.status}).`);
  }
  return json;
}

export default function TikTokVideoSystem() {
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productDiscount, setProductDiscount] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productBenefits, setProductBenefits] = useState("");
  const [productPain, setProductPain] = useState("");
  const [competitorName, setCompetitorName] = useState("");
  const [competitorPrice, setCompetitorPrice] = useState("");
  const [shopUrl, setShopUrl] = useState("");
  const [selectedModels, setSelectedModels] = useState([1, 5, 10]);
  const [voices, setVoices] = useState([]);
  const [voiceRegistry, setVoiceRegistry] = useState({
    default_voice_id: "",
    voices: [],
  });
  const [voiceId, setVoiceId] = useState("");
  const [savingVoiceDefault, setSavingVoiceDefault] = useState(false);
  const [savingVoiceRegister, setSavingVoiceRegister] = useState(false);
  const [newVoiceId, setNewVoiceId] = useState("");
  const [newVoiceName, setNewVoiceName] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [avatars, setAvatars] = useState([]);
  const [briefingId, setBriefingId] = useState("");
  const [jobs, setJobs] = useState([]);
  const [overallStatus, setOverallStatus] = useState("pending");
  const [progress, setProgress] = useState("0%");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const intervalRef = useRef(null);

  const addLog = useCallback((message, type = "info") => {
    setLogs((prev) => [
      ...prev,
      { message, type, time: new Date().toLocaleTimeString("pt-BR") },
    ]);
  }, []);

  const canGenerate = useMemo(
    () =>
      Boolean(
        productName &&
          productPrice &&
          productBenefits &&
          productPain &&
          avatarId &&
          selectedModels.length,
      ),
    [productName, productPrice, productBenefits, productPain, avatarId, selectedModels],
  );

  const loadVoices = useCallback(async () => {
    try {
      const data = await apiFetch("/api/tiktok-engine/voices");
      if (!data?.voices?.length) return;
      setVoices(data.voices);
      setVoiceRegistry(data.registry ?? { default_voice_id: "", voices: [] });
      const defaultVoiceId =
        data.default_voice_id ||
        data.registry?.default_voice_id ||
        data.voices[0].voice_id;
      if (!voiceId) setVoiceId(defaultVoiceId);
    } catch (error) {
      addLog(error instanceof Error ? error.message : "Falha ao carregar vozes.", "error");
    }
  }, [addLog, voiceId]);

  const setVoiceAsDefault = useCallback(async () => {
    if (!voiceId) return;
    setSavingVoiceDefault(true);
    try {
      const selectedVoice = voices.find((voice) => voice.voice_id === voiceId);
      const data = await apiFetch("/api/tiktok-engine/voices", {
        method: "PATCH",
        body: JSON.stringify({
          default_voice_id: voiceId,
          register_voices: selectedVoice
            ? [
                {
                  voice_id: selectedVoice.voice_id,
                  name: selectedVoice.name,
                  active: true,
                },
              ]
            : undefined,
        }),
      });
      setVoiceRegistry(data.registry ?? voiceRegistry);
      addLog("Voz padrao atualizada com sucesso.", "success");
    } catch (error) {
      addLog(error instanceof Error ? error.message : "Falha ao definir voz padrao.", "error");
    } finally {
      setSavingVoiceDefault(false);
    }
  }, [addLog, voiceId, voices, voiceRegistry]);

  const registerVoiceId = useCallback(async () => {
    const value = newVoiceId.trim();
    if (!value) {
      addLog("Informe um voice_id para cadastrar.", "error");
      return;
    }
    setSavingVoiceRegister(true);
    try {
      const data = await apiFetch("/api/tiktok-engine/voices", {
        method: "PATCH",
        body: JSON.stringify({
          register_voices: [
            { voice_id: value, name: newVoiceName.trim() || undefined, active: true },
          ],
        }),
      });
      setVoiceRegistry(data.registry ?? voiceRegistry);
      setNewVoiceId("");
      setNewVoiceName("");
      addLog("voice_id cadastrado no registry.", "success");
    } catch (error) {
      addLog(error instanceof Error ? error.message : "Falha ao cadastrar voice_id.", "error");
    } finally {
      setSavingVoiceRegister(false);
    }
  }, [addLog, newVoiceId, newVoiceName, voiceRegistry]);

  const loadAvatars = useCallback(async () => {
    try {
      const data = await apiFetch("/api/tiktok-engine/avatars");
      const list = data?.avatars ?? [];
      setAvatars(list);
      if (!avatarId && list[0]?.avatar_id) setAvatarId(list[0].avatar_id);
    } catch (error) {
      addLog(error instanceof Error ? error.message : "Falha ao carregar avatares.", "error");
    }
  }, [addLog, avatarId]);

  useEffect(() => {
    void loadVoices();
    void loadAvatars();
  }, [loadVoices, loadAvatars]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const fetchStatus = useCallback(
    async (id) => {
      let data;
      try {
        data = await apiFetch(`/api/tiktok-engine/status/${id}`);
      } catch (error) {
        addLog(error instanceof Error ? error.message : "Erro ao consultar status.", "error");
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
        addLog(
          `Pipeline finalizado com status: ${data.overall_status}`,
          data.overall_status === "completed" ? "success" : "error",
        );
      }
    },
    [addLog, stopPolling],
  );

  const startGeneration = useCallback(async () => {
    stopPolling();
    setRunning(true);
    setLogs([]);
    setJobs([]);
    setBriefingId("");
    setProgress("0%");
    setOverallStatus("pending");
    addLog("Iniciando pipeline...");

    const payload = {
      product_name: productName,
      product_price: productPrice,
      product_discount: productDiscount,
      product_category: productCategory,
      product_benefits: productBenefits,
      product_pain: productPain,
      competitor_name: competitorName,
      competitor_price: competitorPrice,
      shop_url: shopUrl,
      model_ids: selectedModels,
      voice_id: voiceId || undefined,
      avatar_id: avatarId,
    };

    let data;
    try {
      console.log("[tiktok] calling generate");
      data = await apiFetch("/api/tiktok-engine/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      console.log("[tiktok] generate ok", data?.briefing_id, data);
    } catch (error) {
      console.error("[tiktok] generate failed", error);
      setRunning(false);
      addLog(error instanceof Error ? error.message : "Erro ao iniciar geracao.", "error");
      return;
    }

    setBriefingId(data.briefing_id);
    addLog(data?.message ?? "Briefing criado.", "success");

    void (async () => {
      try {
        addLog("Executando pipeline em background...");
        console.log("[tiktok] calling run", `/api/tiktok-engine/run/${data.briefing_id}`);
        await apiFetchInBackground(`/api/tiktok-engine/run/${data.briefing_id}`, {
          method: "POST",
        });
        console.log("[tiktok] run ok", data.briefing_id);
      } catch (error) {
        console.error("[tiktok] run failed", error);
        addLog(
          error instanceof Error ? error.message : "Falha ao executar pipeline.",
          "error",
        );
      }
    })();

    try {
      await fetchStatus(data.briefing_id);
    } catch {
      // fetchStatus ja registra erro e interrompe o polling se necessario
    }

    intervalRef.current = setInterval(() => {
      void fetchStatus(data.briefing_id);
    }, 8000);
  }, [
    addLog,
    avatarId,
    competitorName,
    competitorPrice,
    fetchStatus,
    productBenefits,
    productCategory,
    productDiscount,
    productName,
    productPain,
    productPrice,
    selectedModels,
    shopUrl,
    stopPolling,
    voiceId,
  ]);

  const toggleModel = (id) => {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((modelId) => modelId !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">TikTok Shop Video Engine</h2>
        <p className="text-sm text-slate-500">
          Backend seguro: OpenAI + ElevenLabs + HeyGen via /api/tiktok-engine/*
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input label="Produto *" value={productName} onChange={setProductName} />
          <Input label="Preco *" value={productPrice} onChange={setProductPrice} />
          <Input label="Desconto" value={productDiscount} onChange={setProductDiscount} />
          <Input label="Categoria" value={productCategory} onChange={setProductCategory} />
          <Input label="Concorrente" value={competitorName} onChange={setCompetitorName} />
          <Input
            label="Preco concorrente"
            value={competitorPrice}
            onChange={setCompetitorPrice}
          />
          <Input label="URL TikTok Shop" value={shopUrl} onChange={setShopUrl} />
        </div>
        <Textarea label="Beneficios *" value={productBenefits} onChange={setProductBenefits} />
        <Textarea label="Dor principal *" value={productPain} onChange={setProductPain} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Select
              label="Voz ElevenLabs"
              value={voiceId}
              onChange={setVoiceId}
              options={voices.map((voice) => ({
                value: voice.voice_id,
                label: voice.name ?? voice.voice_id,
              }))}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void setVoiceAsDefault()}
                disabled={!voiceId || savingVoiceDefault}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingVoiceDefault ? "Salvando..." : "Definir como padrao"}
              </button>
              <span className="text-xs text-slate-500">
                Padrao atual: {voiceRegistry?.default_voice_id || "nao definido"}
              </span>
            </div>
          </div>

          <Select
            label="Avatar HeyGen *"
            value={avatarId}
            onChange={setAvatarId}
            options={avatars.map((avatar) => ({
              value: avatar.avatar_id,
              label: avatar.avatar_name ?? avatar.avatar_id,
            }))}
          />
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Cadastro manual de voice_id
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="voice_id"
              value={newVoiceId}
              onChange={(event) => setNewVoiceId(event.target.value)}
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="Nome opcional"
              value={newVoiceName}
              onChange={(event) => setNewVoiceName(event.target.value)}
            />
            <button
              type="button"
              onClick={() => void registerVoiceId()}
              disabled={savingVoiceRegister}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingVoiceRegister ? "Salvando..." : "Cadastrar"}
            </button>
          </div>
          {voiceRegistry?.voices?.length ? (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-slate-500">Vozes cadastradas:</p>
              <div className="max-h-28 space-y-1 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700">
                {voiceRegistry.voices.map((voice) => (
                  <div key={voice.voice_id}>
                    {voice.voice_id}
                    {voice.name ? ` - ${voice.name}` : ""}
                    {voice.voice_id === voiceRegistry.default_voice_id ? " (padrao)" : ""}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium">
          Modelos ({selectedModels.length} selecionados)
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {MODELS.map((model) => {
            const selected = selectedModels.includes(model.id);
            return (
              <button
                key={model.id}
                className={`rounded-xl border p-3 text-left transition ${
                  selected
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
                onClick={() => toggleModel(model.id)}
                type="button"
              >
                <div className="font-medium">
                  {model.emoji} {model.name}
                </div>
                <div className="text-xs text-slate-500">CVR {model.cvr}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            Status: <span className="font-semibold">{overallStatus}</span> - Progresso:{" "}
            <span className="font-semibold">{progress}</span>
            {briefingId ? (
              <span className="ml-2 text-xs text-slate-500">({briefingId})</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void startGeneration()}
            disabled={!canGenerate || running}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Gerando..." : "Gerar videos"}
          </button>
        </div>
      </div>

      {jobs.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="mb-3 text-sm font-medium">Jobs</p>
          <div className="space-y-2">
            {jobs.map((job) => (
              <div key={job.job_id} className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-medium">{job.model_name}</div>
                <div className="text-xs text-slate-500">status: {job.status}</div>
                {job.script_title ? (
                  <div className="mt-1 text-xs text-slate-600">
                    script: {job.script_title}
                  </div>
                ) : null}
                {job.video_url ? (
                  <a
                    href={job.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-blue-600"
                  >
                    Baixar MP4
                  </a>
                ) : null}
                {job.error ? <div className="mt-1 text-xs text-red-600">{job.error}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-2 text-sm font-medium">Logs</p>
        <div className="max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-200">
          {logs.map((log, idx) => (
            <div
              key={`${log.time}-${idx}`}
              className={
                log.type === "error"
                  ? "text-red-300"
                  : log.type === "success"
                    ? "text-green-300"
                    : "text-slate-200"
              }
            >
              [{log.time}] {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Textarea({ label, value, onChange }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <textarea
        className="min-h-[90px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione...</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
