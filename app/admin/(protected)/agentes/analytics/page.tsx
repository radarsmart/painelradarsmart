"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Loader2, MousePointerClick } from "lucide-react";

import { supabase } from "@/lib/supabase";

type AgentPerformance = {
  agentId: string;
  name: string;
  source: string;
  active: boolean;
  lastRunAt: string | null;
  queued: number;
  sent: number;
  failed: number;
  offersCreated: number;
  clicks: number;
  conversionRate: number;
};

type NichePerformance = {
  niche: string;
  queued: number;
  sent: number;
  failed: number;
  offersCreated: number;
  clicks: number;
  conversionRate: number;
};

type TopOffer = {
  id: string;
  title: string;
  price: number;
  clickCount: number;
  marketplace: string;
  agentName: string;
  createdAt: string | null;
};

type AgentAnalytics = {
  summary: {
    totalAgents: number;
    activeAgents: number;
    totalQueued: number;
    totalSent: number;
    totalFailed: number;
    totalClicks: number;
  };
  byAgent: AgentPerformance[];
  byNiche: NichePerformance[];
  topOffers: TopOffer[];
  days: number;
  error?: string;
};

const SOURCE_LABEL: Record<string, string> = {
  awin: "AWIN",
  lomadee: "Lomadee",
  shopee: "Shopee",
  amazon: "Amazon",
  mercadolivre: "Mercado Livre",
};

const RANGE_OPTIONS = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
];

async function getAccessToken() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }
  return token;
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
    parsed,
  );
}

export default function AgentesAnalyticsPage() {
  const [data, setData] = useState<AgentAnalytics | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async (range: number) => {
    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/admin/agentes/analytics?days=${range}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as AgentAnalytics;
      if (!response.ok) {
        throw new Error(payload.error || "Falha ao carregar performance dos agentes.");
      }
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Falha ao carregar performance dos agentes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics(days);
  }, [days, loadAnalytics]);

  const summary = data?.summary;

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div>
        <Link
          href="/admin/agentes"
          className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-navy"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Agentes de Vendas
        </Link>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
              <BarChart3 className="text-orange" />
              Performance dos Agentes
            </h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Envios, falhas e cliques por agente e por nicho de grupo.
            </p>
          </div>
          <div className="flex gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDays(option.value)}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  days === option.value ? "bg-navy text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-3xl bg-white p-6 text-sm font-semibold text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando performance dos agentes...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {summary && !loading ? (
        <>
          <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Agentes" value={summary.totalAgents} />
            <MetricCard label="Ativos" value={summary.activeAgents} />
            <MetricCard label="Enfileirados" value={summary.totalQueued} />
            <MetricCard label="Enviados" value={summary.totalSent} />
            <MetricCard label="Falhas" value={summary.totalFailed} />
            <MetricCard label="Cliques" value={summary.totalClicks} />
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-[#1A1A1A]">Performance por Agente</h2>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Agente</th>
                    <th className="px-4 py-3">Loja</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ofertas</th>
                    <th className="px-4 py-3">Enviados</th>
                    <th className="px-4 py-3">Falhas</th>
                    <th className="px-4 py-3">Cliques</th>
                    <th className="px-4 py-3">Conversao</th>
                    <th className="px-4 py-3">Ultimo envio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byAgent.length ? (
                    data.byAgent.map((agent) => (
                      <tr key={agent.agentId}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/agentes/${agent.agentId}`}
                            className="font-bold text-navy hover:underline"
                          >
                            {agent.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {SOURCE_LABEL[agent.source] ?? agent.source}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                              agent.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {agent.active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-700">{agent.offersCreated}</td>
                        <td className="px-4 py-3 font-bold text-slate-700">{agent.sent}</td>
                        <td className="px-4 py-3 font-bold text-red-600">{agent.failed}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                            <MousePointerClick className="h-3 w-3" />
                            {agent.clicks}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-700">{agent.conversionRate}%</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(agent.lastRunAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                        Nenhum agente com envios no periodo selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-[#1A1A1A]">Performance por Nicho</h2>
            <p className="mt-1 text-sm text-slate-500">
              Nicho vem do campo &quot;niche&quot; configurado nos grupos (post_targets) — cadastre nos grupos
              pra essa visao ficar completa.
            </p>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nicho</th>
                    <th className="px-4 py-3">Ofertas</th>
                    <th className="px-4 py-3">Enviados</th>
                    <th className="px-4 py-3">Falhas</th>
                    <th className="px-4 py-3">Cliques</th>
                    <th className="px-4 py-3">Conversao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byNiche.length ? (
                    data.byNiche.map((item) => (
                      <tr key={item.niche}>
                        <td className="px-4 py-3 font-bold text-navy">{item.niche}</td>
                        <td className="px-4 py-3 font-bold text-slate-700">{item.offersCreated}</td>
                        <td className="px-4 py-3 font-bold text-slate-700">{item.sent}</td>
                        <td className="px-4 py-3 font-bold text-red-600">{item.failed}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                            <MousePointerClick className="h-3 w-3" />
                            {item.clicks}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-700">{item.conversionRate}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        Nenhum envio por nicho no periodo selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-[#1A1A1A]">Ofertas mais clicadas (dos Agentes)</h2>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Oferta</th>
                    <th className="px-4 py-3">Agente</th>
                    <th className="px-4 py-3">Preco</th>
                    <th className="px-4 py-3">Cliques</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.topOffers.length ? (
                    data.topOffers.map((offer) => (
                      <tr key={offer.id}>
                        <td className="px-4 py-3">
                          <p className="line-clamp-2 font-bold text-slate-900">{offer.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(offer.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{offer.agentName}</td>
                        <td className="px-4 py-3 font-bold text-slate-700">{formatBRL(offer.price)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                            <MousePointerClick className="h-3 w-3" />
                            {offer.clickCount}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                        Nenhuma oferta de agente registrada ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-[#1A1A1A]">{value}</p>
    </div>
  );
}
