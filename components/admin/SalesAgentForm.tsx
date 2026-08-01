"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, Loader2, Play, Save } from "lucide-react";

import { supabase } from "@/lib/supabase";

type SalesAgentSource = "awin" | "lomadee" | "shopee" | "amazon" | "mercadolivre";
type SalesAgentTextMode = "ai" | "custom";

const SOURCE_OPTIONS: Array<{ value: SalesAgentSource; label: string }> = [
  { value: "awin", label: "AWIN" },
  { value: "lomadee", label: "Lomadee" },
  { value: "shopee", label: "Shopee" },
  { value: "amazon", label: "Amazon" },
  { value: "mercadolivre", label: "Mercado Livre" },
];

const TEMPLATE_TAGS = [
  "{nome_produto}",
  "{preco}",
  "{preco_original}",
  "{desconto}",
  "{loja}",
  "{link}",
];

type SalesAgent = {
  id: string;
  name: string;
  source: SalesAgentSource;
  advertiserId: string | null;
  searchQuery: string | null;
  category: string | null;
  priceMin: number | null;
  priceMax: number | null;
  minDiscountPct: number;
  aavFilterEnabled: boolean;
  aiImageEnabled: boolean;
  aiInstructions: string | null;
  textMode: SalesAgentTextMode;
  customTextTemplate: string | null;
  aiImagePrompt: string | null;
  sendWindowStartHour: number;
  sendWindowStartMinute: number;
  sendWindowEndHour: number;
  sendWindowEndMinute: number;
  timezone: string;
  maxSendsPerDay: number;
  minIntervalMinutes: number;
  active: boolean;
  lastRunAt: string | null;
  lastRunResult: AgentRunResult | null;
  targetIds: string[];
};

type AgentRunResult = {
  success: boolean;
  message: string;
  candidatesFound: number;
  candidatesConsidered: number;
  queued: number;
  staged: number;
  skipped: number;
  errors: number;
  offers: Array<{ offerId: string; title: string; queued: number; skipped: number }>;
  details: Array<{ title: string; action: string; reason?: string; error?: string }>;
  executedAt: string;
};

type TargetOption = {
  id: string;
  channel: string;
  name: string;
  external_id: string;
  niche: string | null;
  is_active: boolean;
};

type FormState = {
  name: string;
  source: SalesAgentSource;
  advertiserId: string;
  searchQuery: string;
  category: string;
  priceMin: string;
  priceMax: string;
  minDiscountPct: string;
  aavFilterEnabled: boolean;
  aiImageEnabled: boolean;
  aiInstructions: string;
  textMode: SalesAgentTextMode;
  customTextTemplate: string;
  aiImagePrompt: string;
  sendWindowStartHour: string;
  sendWindowStartMinute: string;
  sendWindowEndHour: string;
  sendWindowEndMinute: string;
  timezone: string;
  maxSendsPerDay: string;
  minIntervalMinutes: string;
  active: boolean;
  targetIds: string[];
};

const DEFAULT_FORM: FormState = {
  name: "",
  source: "awin",
  advertiserId: "",
  searchQuery: "",
  category: "",
  priceMin: "",
  priceMax: "",
  minDiscountPct: "0",
  aavFilterEnabled: true,
  aiImageEnabled: false,
  aiInstructions: "",
  textMode: "ai",
  customTextTemplate: "",
  aiImagePrompt: "",
  sendWindowStartHour: "8",
  sendWindowStartMinute: "0",
  sendWindowEndHour: "22",
  sendWindowEndMinute: "0",
  timezone: "America/Sao_Paulo",
  maxSendsPerDay: "10",
  minIntervalMinutes: "20",
  active: false,
  targetIds: [],
};

function agentToForm(agent: SalesAgent): FormState {
  return {
    name: agent.name,
    source: agent.source,
    advertiserId: agent.advertiserId ?? "",
    searchQuery: agent.searchQuery ?? "",
    category: agent.category ?? "",
    priceMin: agent.priceMin === null ? "" : String(agent.priceMin),
    priceMax: agent.priceMax === null ? "" : String(agent.priceMax),
    minDiscountPct: String(agent.minDiscountPct),
    aavFilterEnabled: agent.aavFilterEnabled,
    aiImageEnabled: agent.aiImageEnabled,
    aiInstructions: agent.aiInstructions ?? "",
    textMode: agent.textMode,
    customTextTemplate: agent.customTextTemplate ?? "",
    aiImagePrompt: agent.aiImagePrompt ?? "",
    sendWindowStartHour: String(agent.sendWindowStartHour),
    sendWindowStartMinute: String(agent.sendWindowStartMinute),
    sendWindowEndHour: String(agent.sendWindowEndHour),
    sendWindowEndMinute: String(agent.sendWindowEndMinute),
    timezone: agent.timezone,
    maxSendsPerDay: String(agent.maxSendsPerDay),
    minIntervalMinutes: String(agent.minIntervalMinutes),
    active: agent.active,
    targetIds: agent.targetIds,
  };
}

function formToPayload(form: FormState) {
  return {
    name: form.name.trim(),
    source: form.source,
    advertiserId: form.advertiserId.trim() || null,
    searchQuery: form.searchQuery.trim() || null,
    category: form.category.trim() || null,
    priceMin: form.priceMin.trim() ? Number(form.priceMin) : null,
    priceMax: form.priceMax.trim() ? Number(form.priceMax) : null,
    minDiscountPct: Number(form.minDiscountPct) || 0,
    aavFilterEnabled: form.aavFilterEnabled,
    aiImageEnabled: form.aiImageEnabled,
    aiInstructions: form.aiInstructions.trim() || null,
    textMode: form.textMode,
    customTextTemplate: form.customTextTemplate.trim() || null,
    aiImagePrompt: form.aiImagePrompt.trim() || null,
    sendWindowStartHour: Number(form.sendWindowStartHour),
    sendWindowStartMinute: Number(form.sendWindowStartMinute) || 0,
    sendWindowEndHour: Number(form.sendWindowEndHour),
    sendWindowEndMinute: Number(form.sendWindowEndMinute) || 0,
    timezone: form.timezone.trim() || "America/Sao_Paulo",
    maxSendsPerDay: Number(form.maxSendsPerDay) || 10,
    minIntervalMinutes: Number(form.minIntervalMinutes) || 20,
    active: form.active,
    targetIds: form.targetIds,
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return "Nunca executado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = [0, 15, 30, 45];

const STEPS = [
  { key: "name", label: "Nome do Agente" },
  { key: "source", label: "Loja e Busca" },
  { key: "filters", label: "Filtros da Busca" },
  { key: "schedule", label: "Horario de Operacao" },
  { key: "volume", label: "Quantidade e Intervalo" },
  { key: "targets", label: "Grupos de Destino" },
  { key: "ai-text", label: "Orientacoes para a IA" },
  { key: "text-mode", label: "Texto do Envio" },
  { key: "ai-image", label: "Imagem da Divulgacao" },
  { key: "activation", label: "Filtro AAV e Ativacao" },
] as const;

export default function SalesAgentForm({ agentId }: { agentId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AgentRunResult | null>(null);
  const [loading, setLoading] = useState("initial");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [step, setStep] = useState(0);
  const [awinCategories, setAwinCategories] = useState<string[]>([]);

  const groupedTargets = useMemo(() => {
    const groups = new Map<string, TargetOption[]>();
    for (const target of targets) {
      const key = target.niche?.trim() || "Sem nicho";
      const list = groups.get(key) ?? [];
      list.push(target);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [targets]);

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }
    return token;
  }

  async function fetchJson<T>(url: string, init?: RequestInit) {
    const token = await getAccessToken();
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Falha na requisicao.");
    }
    return payload;
  }

  async function loadData() {
    setLoading("initial");
    setError("");

    try {
      const targetsPayload = await fetchJson<{ targets: TargetOption[] }>("/api/admin/post-targets");
      setTargets(targetsPayload.targets ?? []);

      if (agentId) {
        const agentPayload = await fetchJson<{ agent: SalesAgent }>(
          `/api/admin/agentes/manage?id=${encodeURIComponent(agentId)}`,
        );
        setForm(agentToForm(agentPayload.agent));
        setLastRunAt(agentPayload.agent.lastRunAt);
        setLastResult(agentPayload.agent.lastRunResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dados do agente.");
    } finally {
      setLoading("");
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  useEffect(() => {
    if (form.source !== "awin") {
      setAwinCategories([]);
      return;
    }

    let cancelled = false;
    const advertiserId = form.advertiserId.trim() || "18879";

    fetchJson<{ categories?: string[] }>(
      `/api/awin/feed/${encodeURIComponent(advertiserId)}?page=1`,
    )
      .then((payload) => {
        if (!cancelled) setAwinCategories(payload.categories ?? []);
      })
      .catch(() => {
        if (!cancelled) setAwinCategories([]);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.source, form.advertiserId]);

  function toggleTarget(id: string) {
    setForm((current) => ({
      ...current,
      targetIds: current.targetIds.includes(id)
        ? current.targetIds.filter((item) => item !== id)
        : [...current.targetIds, id],
    }));
  }

  function stepBlockingError(stepIndex: number): string | null {
    if (STEPS[stepIndex].key === "name" && !form.name.trim()) {
      return "Informe um nome para o agente antes de continuar.";
    }
    if (STEPS[stepIndex].key === "targets" && !form.targetIds.length) {
      return "Escolha pelo menos 1 grupo/canal de destino antes de continuar.";
    }
    return null;
  }

  function goToStep(nextStep: number) {
    if (nextStep > step) {
      for (let index = step; index < nextStep; index += 1) {
        const blockingError = stepBlockingError(index);
        if (blockingError) {
          setError(blockingError);
          setStep(index);
          return;
        }
      }
    }
    setError("");
    setStep(Math.min(Math.max(nextStep, 0), STEPS.length - 1));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError("Informe um nome para o agente.");
      return;
    }
    if (!form.targetIds.length) {
      setError("Escolha pelo menos 1 grupo/canal de destino.");
      return;
    }

    setLoading("save");
    setError("");
    setFeedback("");

    try {
      const payload = await fetchJson<{ agent: SalesAgent }>("/api/admin/agentes/manage", {
        method: "POST",
        body: JSON.stringify({ id: agentId, ...formToPayload(form) }),
      });
      setFeedback("Agente salvo com sucesso.");
      if (!agentId) {
        router.push(`/admin/agentes/${payload.agent.id}`);
        return;
      }
      setForm(agentToForm(payload.agent));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o agente.");
    } finally {
      setLoading("");
    }
  }

  async function handleRunNow() {
    if (!agentId) return;
    setLoading("run");
    setError("");
    setFeedback("");

    try {
      const payload = await fetchJson<{ result: AgentRunResult }>("/api/admin/agentes/run", {
        method: "POST",
        body: JSON.stringify({ id: agentId }),
      });
      setLastResult(payload.result);
      setLastRunAt(payload.result.executedAt);
      setFeedback(payload.result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao rodar o agente.");
    } finally {
      setLoading("");
    }
  }

  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="min-h-screen flex-1 space-y-6 bg-[#F5F1ED] p-8 pt-6">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
          <Bot className="text-orange" />
          {agentId ? "Editar Agente de Vendas com IA" : "Criar Agente de Vendas com IA"}
        </h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Configure em etapas e deixe o agente trabalhar por voce.
        </p>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}
      {feedback ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
          {feedback}
        </div>
      ) : null}

      <div className="flex gap-1.5">
        {STEPS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            onClick={() => goToStep(index)}
            title={item.label}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              index <= step ? "bg-navy" : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      <section className="rounded-3xl border border-rs-border bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
            {step + 1}
          </span>
          <h2 className="text-xl font-bold text-navy">{currentStep.label}</h2>
        </div>

        {currentStep.key === "name" ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">De um nome para identificar este agente.</p>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex: Agente Moda Feminina"
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
            />
          </div>
        ) : null}

        {currentStep.key === "source" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">De onde o agente deve buscar os produtos para divulgar?</p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Loja</span>
                <select
                  value={form.source}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, source: event.target.value as SalesAgentSource }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange"
                >
                  {SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Advertiser/Organization ID (AWIN/Lomadee)
                </span>
                <input
                  value={form.advertiserId}
                  onChange={(event) => setForm((current) => ({ ...current, advertiserId: event.target.value }))}
                  placeholder="Opcional"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Busca/palavra-chave (Mercado Livre, Shopee)
                </span>
                <input
                  value={form.searchQuery}
                  onChange={(event) => setForm((current) => ({ ...current, searchQuery: event.target.value }))}
                  placeholder="Ex: tenis feminino"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Categoria (AWIN/Lomadee/Amazon)
                </span>
                {form.source === "awin" ? (
                  <select
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange"
                  >
                    <option value="">Todas as categorias</option>
                    {form.category && !awinCategories.includes(form.category) ? (
                      <option value={form.category}>{form.category}</option>
                    ) : null}
                    {awinCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    placeholder="Opcional"
                    className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
                  />
                )}
              </label>
            </div>

            {form.source === "mercadolivre" ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
                <strong>Como funciona:</strong> o agente gera o link oficial de afiliado automaticamente (via a
                sessão logada dos Afiliados do Mercado Livre) para cada produto antes de publicar. Se a geração
                falhar por qualquer motivo (sessão desconectada, etc.), a oferta entra como{" "}
                <strong>rascunho aguardando revisão</strong> na Curadoria em vez de publicar sem rastreamento.
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStep.key === "filters" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Refine quais produtos o agente pode divulgar.</p>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Desconto minimo (%)</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={form.minDiscountPct}
                  onChange={(event) => setForm((current) => ({ ...current, minDiscountPct: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Preco minimo BRL</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceMin}
                  onChange={(event) => setForm((current) => ({ ...current, priceMin: event.target.value }))}
                  placeholder="Sem minimo"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Preco maximo BRL</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceMax}
                  onChange={(event) => setForm((current) => ({ ...current, priceMax: event.target.value }))}
                  placeholder="Sem limite"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
                />
              </label>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
              Filtros muito restritos podem reduzir ou impedir os envios.
            </div>
          </div>
        ) : null}

        {currentStep.key === "schedule" ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Em qual janela de horario o agente pode enviar divulgacoes?</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Inicio</span>
                <div className="flex gap-2">
                  <select
                    value={form.sendWindowStartHour}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, sendWindowStartHour: event.target.value }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange"
                  >
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}h
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.sendWindowStartMinute}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, sendWindowStartMinute: event.target.value }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange"
                  >
                    {MINUTES.map((minute) => (
                      <option key={minute} value={minute}>
                        {String(minute).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Fim</span>
                <div className="flex gap-2">
                  <select
                    value={form.sendWindowEndHour}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, sendWindowEndHour: event.target.value }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange"
                  >
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}h
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.sendWindowEndMinute}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, sendWindowEndMinute: event.target.value }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange"
                  >
                    {MINUTES.map((minute) => (
                      <option key={minute} value={minute}>
                        {String(minute).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500">Fuso horario: {form.timezone}</p>
          </div>
        ) : null}

        {currentStep.key === "volume" ? (
          <div className="space-y-6">
            <div>
              <p className="text-sm text-slate-500">Quantas divulgacoes o agente deve fazer por dia no maximo?</p>
              <div className="mt-3 flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={form.maxSendsPerDay}
                  onChange={(event) => setForm((current) => ({ ...current, maxSendsPerDay: event.target.value }))}
                  className="h-2 flex-1 accent-orange"
                />
                <span className="w-10 text-right text-lg font-bold text-navy">{form.maxSendsPerDay}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">O agente distribuira os envios dentro do horario configurado.</p>
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Intervalo minimo entre envios (minutos)
              </span>
              <input
                type="number"
                min={1}
                max={1440}
                value={form.minIntervalMinutes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, minIntervalMinutes: event.target.value }))
                }
                className="h-11 w-full max-w-xs rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
              />
            </label>
          </div>
        ) : null}

        {currentStep.key === "targets" ? (
          <div>
            <p className="text-sm text-slate-500">
              Para quais grupos/chats o agente deve enviar as divulgacoes? (organizados por nicho, quando
              configurado em Canais)
            </p>

            {targets.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">Nenhum destino cadastrado ainda em post_targets.</p>
            ) : (
              <div className="mt-5 space-y-5">
                {groupedTargets.map(([niche, list]) => (
                  <div key={niche}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{niche}</p>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {list.map((target) => (
                        <label
                          key={target.id}
                          className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${
                            form.targetIds.includes(target.id)
                              ? "border-orange bg-orange/5"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={form.targetIds.includes(target.id)}
                            onChange={() => toggleTarget(target.id)}
                            className="h-5 w-5 accent-orange"
                          />
                          <span>
                            <span className="block font-semibold text-navy">
                              {target.name || target.external_id}
                            </span>
                            <span className="block text-xs uppercase text-slate-500">{target.channel}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {currentStep.key === "ai-text" ? (
          <label className="block space-y-2">
            <span className="text-sm text-slate-500">
              Descreva o que o agente deve priorizar: nicho, tipo de produto, tom de voz etc. (opcional)
            </span>
            <textarea
              value={form.aiInstructions}
              onChange={(event) => setForm((current) => ({ ...current, aiInstructions: event.target.value }))}
              rows={5}
              maxLength={500}
              placeholder="Ex: Produtos de moda feminina, tom animado, foque no publico jovem, evite girias regionais."
              className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-orange"
            />
            <span className="block text-xs text-slate-400">{form.aiInstructions.length}/500 caracteres.</span>
          </label>
        ) : null}

        {currentStep.key === "text-mode" ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Como o agente deve criar o texto das divulgacoes?</p>
            <label
              className={`block cursor-pointer rounded-xl border p-4 ${
                form.textMode === "ai" ? "border-orange bg-orange/5" : "border-slate-200 bg-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={form.textMode === "ai"}
                  onChange={() => setForm((current) => ({ ...current, textMode: "ai" }))}
                  className="h-5 w-5 accent-orange"
                />
                <span>
                  <span className="block text-sm font-bold text-navy">Gerado por IA</span>
                  <span className="block text-xs text-slate-500">
                    A IA cria um texto personalizado com base na orientacao que voce definiu.
                  </span>
                </span>
              </span>
            </label>
            <label
              className={`block cursor-pointer rounded-xl border p-4 ${
                form.textMode === "custom" ? "border-orange bg-orange/5" : "border-slate-200 bg-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={form.textMode === "custom"}
                  onChange={() => setForm((current) => ({ ...current, textMode: "custom" }))}
                  className="h-5 w-5 accent-orange"
                />
                <span>
                  <span className="block text-sm font-bold text-navy">Texto Personalizado</span>
                  <span className="block text-xs text-slate-500">
                    Voce define um template fixo com tags que serao substituidas automaticamente.
                  </span>
                </span>
              </span>
            </label>

            {form.textMode === "custom" ? (
              <div className="space-y-2 pt-2">
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
                  Use as tags abaixo no texto. O marcador <strong>{"{link}"}</strong> sera substituido pelo link de
                  afiliado.
                </div>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          customTextTemplate: `${current.customTextTemplate}${tag}`,
                        }))
                      }
                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-orange hover:text-orange"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
                <textarea
                  value={form.customTextTemplate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, customTextTemplate: event.target.value }))
                  }
                  rows={6}
                  maxLength={1000}
                  placeholder={
                    "Ex: Crie um texto chamativo para {nome_produto}. Preco: R$ {preco} (era R$ {preco_original}, {desconto}% OFF). Loja: {loja}. Compre aqui: {link}"
                  }
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-orange"
                />
                <span className="block text-xs text-slate-400">
                  {form.customTextTemplate.length}/1000 caracteres. Se deixar em branco, o agente usa o texto
                  gerado por IA.
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStep.key === "ai-image" ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Qual imagem o agente deve usar nas divulgacoes?</p>
            <label
              className={`block cursor-pointer rounded-xl border p-4 ${
                !form.aiImageEnabled ? "border-orange bg-orange/5" : "border-slate-200 bg-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={!form.aiImageEnabled}
                  onChange={() => setForm((current) => ({ ...current, aiImageEnabled: false }))}
                  className="h-5 w-5 accent-orange"
                />
                <span>
                  <span className="block text-sm font-bold text-navy">Imagem do Marketplace</span>
                  <span className="block text-xs text-slate-500">Usa a foto original do produto da loja.</span>
                </span>
              </span>
            </label>
            <label
              className={`block cursor-pointer rounded-xl border p-4 ${
                form.aiImageEnabled ? "border-orange bg-orange/5" : "border-slate-200 bg-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={form.aiImageEnabled}
                  onChange={() => setForm((current) => ({ ...current, aiImageEnabled: true }))}
                  className="h-5 w-5 accent-orange"
                />
                <span>
                  <span className="block text-sm font-bold text-navy">Gerada por IA</span>
                  <span className="block text-xs text-slate-500">
                    Transforma a foto do produto numa foto realista de catalogo antes de postar.
                  </span>
                </span>
              </span>
            </label>

            {form.aiImageEnabled ? (
              <label className="block space-y-2 pt-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Prompt customizado (opcional)
                </span>
                <textarea
                  value={form.aiImagePrompt}
                  onChange={(event) => setForm((current) => ({ ...current, aiImagePrompt: event.target.value }))}
                  rows={4}
                  placeholder="Se deixar em branco, usamos o prompt padrao (foto realista, fundo neutro, produto centralizado)."
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-orange"
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {currentStep.key === "activation" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-bold text-navy">Filtro AAV</p>
                <p className="text-xs text-slate-500">
                  Usa o Algoritmo de Aumento de Vendas (radar-sniper) para so considerar produtos com alto
                  potencial de conversao.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.aavFilterEnabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, aavFilterEnabled: event.target.checked }))
                }
                className="h-6 w-6 accent-orange"
              />
            </div>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-bold text-navy">Agente ativo</p>
                <p className="text-xs text-slate-500">
                  Com o cron ligado, o agente roda sozinho respeitando horario e quantidade configurados.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                className="h-6 w-6 accent-orange"
              />
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={Boolean(loading)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white disabled:opacity-60"
              >
                {loading === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {agentId ? "Salvar agente" : "Ativar Agente"}
              </button>

              {agentId ? (
                <button
                  type="button"
                  onClick={() => void handleRunNow()}
                  disabled={Boolean(loading)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {loading === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Rodar agora
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToStep(step - 1)}
          disabled={step === 0}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Anterior
        </button>
        <p className="text-xs font-semibold text-slate-400">
          Passo {step + 1} de {STEPS.length}
        </p>
        <button
          type="button"
          onClick={() => goToStep(step + 1)}
          disabled={isLastStep}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Proximo
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {agentId ? (
        <section className="rounded-3xl border border-rs-border bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-bold text-navy">Ultimo resultado</h2>
              <p className="text-sm text-slate-500">{formatDateTime(lastRunAt)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Enviados</p>
              <p className="mt-2 text-3xl font-black text-emerald-700">{lastResult?.queued ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Aguardando revisao</p>
              <p className="mt-2 text-3xl font-black text-sky-700">{lastResult?.staged ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Ignorados</p>
              <p className="mt-2 text-3xl font-black text-amber-700">{lastResult?.skipped ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-red-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-red-700">Erros</p>
              <p className="mt-2 text-3xl font-black text-red-700">{lastResult?.errors ?? 0}</p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(lastResult?.details ?? []).length > 0 ? (
                  (lastResult?.details ?? []).map((item, index) => (
                    <tr key={`${item.title}-${index}`}>
                      <td className="max-w-xl px-4 py-3 font-semibold text-navy">
                        <p className="line-clamp-2">{item.title}</p>
                        {item.reason || item.error ? (
                          <p className="mt-1 text-xs font-medium text-slate-500">{item.reason || item.error}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold uppercase text-slate-600">{item.action}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-500">
                      Nenhuma execucao registrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
