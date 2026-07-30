"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Save,
  Settings2,
  TestTube2,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

type SortType = "discount" | "price_asc" | "price_desc";
type SlotType = "flash" | "best" | "comparator";
type ProductAction = "staged" | "skipped" | "error" | "would_stage" | "would_skip";

type AutomationConfig = {
  id: string;
  search: string;
  organizationIds: string;
  sort: SortType;
  limit: number;
  slotType: SlotType;
  priceMin: number;
  priceMax: number | null;
  active: boolean;
  updatedAt: string | null;
  lastRunAt: string | null;
  lastRunResult: AutomationRunResult | null;
};

type AutomationRunProduct = {
  name: string;
  price: number;
  link?: string;
  action: ProductAction;
  offer_id?: string;
  reason?: string;
  error?: string;
};

type AutomationRunResult = {
  success?: boolean;
  dryRun?: boolean;
  active?: boolean;
  search?: string | null;
  organizationIds?: string | null;
  sort?: SortType;
  slotType?: SlotType;
  priceMin?: number;
  priceMax?: number | null;
  requested?: number;
  available?: number;
  considered?: number;
  wouldStage?: number;
  wouldSkip?: number;
  staged?: number;
  skipped?: number;
  errors?: number;
  products?: AutomationRunProduct[];
  executed_at?: string;
  error?: string;
  logError?: string;
};

type ConfigForm = {
  search: string;
  organizationIds: string;
  sort: SortType;
  limit: string;
  slotType: SlotType;
  priceMin: string;
  priceMax: string;
  active: boolean;
};

const DEFAULT_FORM: ConfigForm = {
  search: "",
  organizationIds: "",
  sort: "discount",
  limit: "10",
  slotType: "flash",
  priceMin: "0",
  priceMax: "",
  active: false,
};

const SORT_OPTIONS: Array<{ value: SortType; label: string }> = [
  { value: "discount", label: "Maior desconto" },
  { value: "price_asc", label: "Menor preco" },
  { value: "price_desc", label: "Maior preco" },
];

const SLOT_OPTIONS: Array<{ value: SlotType; label: string }> = [
  { value: "flash", label: "Relampago" },
  { value: "best", label: "Melhores" },
  { value: "comparator", label: "Comparador" },
];

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return "Nunca executado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function actionLabel(action: ProductAction) {
  const labels: Record<ProductAction, string> = {
    staged: "Na curadoria",
    skipped: "Ignorado",
    error: "Erro",
    would_stage: "Iria para curadoria",
    would_skip: "Ignoraria",
  };
  return labels[action] ?? action;
}

function actionClass(action: ProductAction) {
  if (action === "staged" || action === "would_stage") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (action === "error") {
    return "bg-red-50 text-red-700";
  }
  return "bg-amber-50 text-amber-700";
}

function configToForm(config: AutomationConfig): ConfigForm {
  return {
    search: config.search || "",
    organizationIds: config.organizationIds || "",
    sort: config.sort || DEFAULT_FORM.sort,
    limit: String(config.limit || DEFAULT_FORM.limit),
    slotType: config.slotType || DEFAULT_FORM.slotType,
    priceMin: String(config.priceMin ?? DEFAULT_FORM.priceMin),
    priceMax: config.priceMax === null || config.priceMax === undefined ? "" : String(config.priceMax),
    active: Boolean(config.active),
  };
}

function formToPayload(form: ConfigForm) {
  return {
    search: form.search.trim(),
    organizationIds: form.organizationIds.trim(),
    sort: form.sort,
    limit: Number(form.limit) || 10,
    slotType: form.slotType,
    priceMin: Number(form.priceMin) || 0,
    priceMax: form.priceMax.trim() ? Number(form.priceMax) : null,
    active: form.active,
  };
}

export default function LomadeeAutomationPanel() {
  const [form, setForm] = useState<ConfigForm>(DEFAULT_FORM);
  const [lastResult, setLastResult] = useState<AutomationRunResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState("config");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [confirmPublication, setConfirmPublication] = useState(false);

  const runSummary = useMemo(() => lastResult ?? null, [lastResult]);

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
    const payload = (await response.json().catch(() => ({}))) as T & {
      ok?: boolean;
      error?: string;
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Falha na automacao Lomadee.");
    }

    return payload;
  }

  async function loadConfig() {
    setLoading("config");
    setError("");
    setFeedback("");

    try {
      const payload = await fetchJson<{ config: AutomationConfig }>("/api/lomadee/automation/config");
      setForm(configToForm(payload.config));
      setLastResult(payload.config.lastRunResult ?? null);
      setLastRunAt(payload.config.lastRunAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar configuracao Lomadee.");
    } finally {
      setLoading("");
    }
  }

  async function saveConfig(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading("save");
    setError("");
    setFeedback("");

    try {
      const payload = await fetchJson<{ config: AutomationConfig }>("/api/lomadee/automation/config", {
        method: "PUT",
        body: JSON.stringify(formToPayload(form)),
      });
      setForm(configToForm(payload.config));
      setLastResult(payload.config.lastRunResult ?? lastResult);
      setLastRunAt(payload.config.lastRunAt ?? lastRunAt);
      setFeedback("Configuracao Lomadee salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configuracao Lomadee.");
    } finally {
      setLoading("");
    }
  }

  async function runAutomation(dryRun: boolean) {
    setLoading(dryRun ? "dry-run" : "publish");
    setError("");
    setFeedback("");

    try {
      const result = await fetchJson<AutomationRunResult>("/api/lomadee/automation/run", {
        method: "POST",
        body: JSON.stringify({
          ...formToPayload(form),
          dryRun,
        }),
      });
      setLastResult(result);
      setLastRunAt(result.executed_at ?? new Date().toISOString());
      const wouldStage = result.wouldStage ?? 0;
      const staged = result.staged ?? 0;
      setFeedback(
        dryRun
          ? `Teste concluido: ${wouldStage} iriam para a curadoria e ${result.wouldSkip ?? 0} seriam ignorados.`
          : `Envio concluido: ${staged} enviados para curadoria, ${result.skipped ?? 0} ignorados, ${result.errors ?? 0} erros.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar automacao Lomadee.");
    } finally {
      setLoading("");
      setConfirmPublication(false);
    }
  }

  useEffect(() => {
    void loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
          <Settings2 className="text-orange" />
          Automacao Lomadee
        </h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Configure criterios, rode testes e envie candidatos Lomadee para aprovacao na curadoria.
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

      <form onSubmit={(event) => void saveConfig(event)} className="rounded-3xl border border-rs-border bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy">Configuracao</h2>
            <p className="text-sm text-slate-500">
              Default seguro: dry-run ativo e limite 10. Nada vai ao site sem aprovacao manual.
            </p>
          </div>
          {form.active ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              <AlertTriangle className="h-4 w-4" />
              Envio para curadoria ativo
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Dry-run ativo
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Palavra-chave</span>
            <input
              value={form.search}
              onChange={(event) => setForm((current) => ({ ...current, search: event.target.value }))}
              placeholder="Todos os produtos"
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">IDs de lojista</span>
            <input
              value={form.organizationIds}
              onChange={(event) => setForm((current) => ({ ...current, organizationIds: event.target.value }))}
              placeholder="Opcional"
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Ordenacao</span>
            <select
              value={form.sort}
              onChange={(event) => setForm((current) => ({ ...current, sort: event.target.value as SortType }))}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Limite por rodada</span>
            <input
              type="number"
              min={1}
              max={100}
              value={form.limit}
              onChange={(event) => setForm((current) => ({ ...current, limit: event.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Bloco de destino</span>
            <select
              value={form.slotType}
              onChange={(event) => setForm((current) => ({ ...current, slotType: event.target.value as SlotType }))}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-orange"
            >
              {SLOT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Preco minimo BRL</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.priceMin}
              onChange={(event) => setForm((current) => ({ ...current, priceMin: event.target.value }))}
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
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
              placeholder="Sem limite"
            />
          </label>

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Modo</span>
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-navy">
                  {form.active ? "Enviar para curadoria" : "Dry-run (teste)"}
                </p>
                <p className={form.active ? "text-sm text-red-700" : "text-sm text-slate-500"}>
                  {form.active
                    ? "Modo ativo - o cron cria candidatos na curadoria. O site ainda exige sua aprovacao manual."
                    : "Modo seguro - o cron apenas simula a execucao."}
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                className="h-6 w-6 accent-orange"
              />
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={Boolean(loading)}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-sm font-bold text-white disabled:opacity-60"
        >
          {loading === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configuracao
        </button>
      </form>

      <section className="rounded-3xl border border-rs-border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-navy">Execucao manual</h2>
        <p className="mt-1 text-sm text-slate-500">
          Teste sempre antes de ativar o envio para curadoria. O teste nunca cria nem publica ofertas.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runAutomation(true)}
            disabled={Boolean(loading)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:opacity-60"
          >
            {loading === "dry-run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
            Executar teste agora
          </button>
          <button
            type="button"
            onClick={() => setConfirmPublication(true)}
            disabled={Boolean(loading) || !form.active}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Enviar para curadoria agora
          </button>
        </div>
        {!form.active ? (
          <p className="mt-3 text-xs font-semibold text-amber-700">
            Para criar candidatos manualmente, primeiro ative Enviar para curadoria e salve a configuracao.
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-rs-border bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-bold text-navy">Ultimo resultado</h2>
            <p className="text-sm text-slate-500">{formatDateTime(lastRunAt || runSummary?.executed_at)}</p>
          </div>
          {runSummary?.dryRun ? (
            <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Dry-run</span>
          ) : runSummary ? (
            <span className="rounded-full bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Real</span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Curadoria</p>
            <p className="mt-2 text-3xl font-black text-emerald-700">
              {runSummary?.staged ?? runSummary?.wouldStage ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Skipped</p>
            <p className="mt-2 text-3xl font-black text-amber-700">
              {runSummary?.skipped ?? runSummary?.wouldSkip ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-red-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">Errors</p>
            <p className="mt-2 text-3xl font-black text-red-700">{runSummary?.errors ?? 0}</p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Preco</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(runSummary?.products ?? []).length > 0 ? (
                (runSummary?.products ?? []).map((product, index) => (
                  <tr key={`${product.name}-${index}`}>
                    <td className="max-w-xl px-4 py-3 font-semibold text-navy">
                      <p className="line-clamp-2">{product.name}</p>
                      {product.reason || product.error ? (
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {product.reason || product.error}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-bold text-navy">{formatBRL(product.price)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${actionClass(product.action)}`}>
                        {actionLabel(product.action)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                    Nenhuma execucao registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {confirmPublication ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-navy">Confirmar envio para curadoria</h3>
            <p className="mt-2 text-sm text-slate-600">
              Isso vai criar ate {form.limit || 10} candidatos na Curadoria Geral com destino sugerido em {SLOT_OPTIONS.find((item) => item.value === form.slotType)?.label}.
              Nada sera publicado no site sem sua aprovacao manual. Confirmar?
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setConfirmPublication(false)}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void runAutomation(false)}
                className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white"
              >
                Confirmar envio
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
