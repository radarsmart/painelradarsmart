"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Loader2, Play, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  awin: "AWIN",
  lomadee: "Lomadee",
  shopee: "Shopee",
  amazon: "Amazon",
  mercadolivre: "Mercado Livre",
};

type SalesAgent = {
  id: string;
  name: string;
  source: string;
  active: boolean;
  targetIds: string[];
  lastRunAt: string | null;
  lastRunResult: { message?: string; queued?: number } | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Nunca executado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function AdminAgentesPage() {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState("initial");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

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

  async function loadAgents() {
    setLoading("initial");
    setError("");
    try {
      const payload = await fetchJson<{ agents: SalesAgent[] }>("/api/admin/agentes/manage");
      setAgents(payload.agents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar agentes.");
    } finally {
      setLoading("");
    }
  }

  useEffect(() => {
    void loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleActive(agent: SalesAgent) {
    setLoading(`toggle:${agent.id}`);
    setError("");
    try {
      await fetchJson("/api/admin/agentes/manage", {
        method: "POST",
        body: JSON.stringify({ id: agent.id, active: !agent.active }),
      });
      await loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar agente.");
    } finally {
      setLoading("");
    }
  }

  async function runNow(agent: SalesAgent) {
    setLoading(`run:${agent.id}`);
    setError("");
    setFeedback("");
    try {
      const payload = await fetchJson<{ result: { message: string } }>("/api/admin/agentes/run", {
        method: "POST",
        body: JSON.stringify({ id: agent.id }),
      });
      setFeedback(`${agent.name}: ${payload.result.message}`);
      await loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao rodar o agente.");
    } finally {
      setLoading("");
    }
  }

  async function removeAgent(agent: SalesAgent) {
    if (!window.confirm(`Excluir o agente "${agent.name}"? Essa acao nao pode ser desfeita.`)) {
      return;
    }
    setLoading(`delete:${agent.id}`);
    setError("");
    try {
      await fetchJson(`/api/admin/agentes/manage?id=${encodeURIComponent(agent.id)}`, {
        method: "DELETE",
      });
      await loadAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir agente.");
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <Bot className="text-orange" />
            Agentes de Vendas com IA
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Cada agente busca ofertas, gera copy com IA e publica sozinho nos grupos escolhidos.
          </p>
        </div>
        <Link
          href="/admin/agentes/novo"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange px-5 text-sm font-bold text-white"
        >
          <Plus className="h-4 w-4" />
          Criar Agente
        </Link>
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

      <section className="overflow-hidden rounded-3xl border border-rs-border bg-white shadow-sm">
        {loading === "initial" ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando agentes...
          </div>
        ) : agents.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Nenhum agente criado ainda. Clique em &quot;Criar Agente&quot; para comecar.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Loja</th>
                <th className="px-4 py-3">Grupos</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ultimo envio</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td className="px-4 py-3 font-semibold text-navy">
                    <Link href={`/admin/agentes/${agent.id}`} className="hover:underline">
                      {agent.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{SOURCE_LABEL[agent.source] ?? agent.source}</td>
                  <td className="px-4 py-3 text-slate-600">{agent.targetIds.length}</td>
                  <td className="px-4 py-3">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={agent.active}
                        onChange={() => void toggleActive(agent)}
                        disabled={loading === `toggle:${agent.id}`}
                        className="h-5 w-5 accent-orange"
                      />
                      <span className="text-xs font-bold uppercase text-slate-600">
                        {agent.active ? "Ativo" : "Inativo"}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(agent.lastRunAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void runNow(agent)}
                        disabled={loading === `run:${agent.id}`}
                        className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {loading === `run:${agent.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Rodar agora
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAgent(agent)}
                        disabled={loading === `delete:${agent.id}`}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
