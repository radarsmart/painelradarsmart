"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Loader2, MousePointerClick } from "lucide-react";

import { supabase } from "@/lib/supabase";

type AwinAnalytics = {
  summary: {
    totalOffers: number;
    activeOffers: number;
    totalClicks: number;
    clicksToday: number;
    clicks7d: number;
    topSource: string;
  };
  topOffers: Array<{
    id: string;
    title: string;
    price: number;
    slot_type: string;
    status: string;
    curations_status: string;
    published_at: string;
    click_count: number;
    affiliate_url: string;
  }>;
  sourceBreakdown: Array<{
    source: string;
    clicks: number;
  }>;
  recentClicks: Array<{
    id: string;
    offer_id: string;
    title: string;
    source: string;
    created_at: string;
  }>;
  commission: {
    available: boolean;
    periodStart: string;
    periodEnd: string;
    advertisers: Array<{
      advertiserId: string;
      advertiserName: string;
      clicks: number;
      pendingCount: number;
      pendingValue: number;
      pendingCommission: number;
      confirmedCount: number;
      confirmedValue: number;
      confirmedCommission: number;
      declinedCount: number;
      declinedValue: number;
      declinedCommission: number;
      totalCommission: number;
    }>;
    totals: {
      clicks: number;
      pendingCommission: number;
      confirmedCommission: number;
      declinedCommission: number;
    };
    error: string | null;
  };
  notes: string[];
  error?: string;
};

async function getAccessToken() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }
  return token;
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export default function AwinAnalyticsPage() {
  const [data, setData] = useState<AwinAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/admin/awin/analytics", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await response.json()) as AwinAnalytics;
      if (!response.ok) {
        throw new Error(payload.error || "Falha ao carregar analytics AWIN.");
      }
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Falha ao carregar analytics AWIN.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const summary = data?.summary;

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div>
        <Link
          href="/admin/awin"
          className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-navy"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para AWIN Hub
        </Link>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
          <BarChart3 className="text-[#9e6a18]" />
          AWIN Analytics
        </h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Cliques e ofertas medidos pelo Radar Smart. Comissao e venda vem direto da API de relatorios da AWIN.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-3xl bg-white p-6 text-sm font-semibold text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando analytics AWIN...
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
            <MetricCard label="Ofertas AWIN" value={summary.totalOffers} />
            <MetricCard label="Ativas" value={summary.activeOffers} />
            <MetricCard label="Cliques totais" value={summary.totalClicks} />
            <MetricCard label="Cliques hoje" value={summary.clicksToday} />
            <MetricCard label="Cliques 7 dias" value={summary.clicks7d} />
            <MetricCard label="Origem lider" value={summary.topSource} />
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-black text-[#1A1A1A]">Comissao real (AWIN)</h2>
              {data.commission.available ? (
                <span className="text-xs font-semibold text-slate-500">
                  {formatDate(data.commission.periodStart)} - {formatDate(data.commission.periodEnd)}
                </span>
              ) : null}
            </div>

            {!data.commission.available ? (
              <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Nao foi possivel consultar a comissao agora: {data.commission.error}
              </p>
            ) : (
              <>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <MetricCard label="Cliques (AWIN)" value={data.commission.totals.clicks} />
                  <MetricCard
                    label="Comissao confirmada"
                    value={formatBRL(data.commission.totals.confirmedCommission)}
                  />
                  <MetricCard
                    label="Comissao pendente"
                    value={formatBRL(data.commission.totals.pendingCommission)}
                  />
                </div>

                <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Loja</th>
                        <th className="px-4 py-3">Cliques</th>
                        <th className="px-4 py-3">Pendente</th>
                        <th className="px-4 py-3">Confirmado</th>
                        <th className="px-4 py-3">Recusado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.commission.advertisers.length ? (
                        data.commission.advertisers.map((row) => (
                          <tr key={row.advertiserId}>
                            <td className="px-4 py-3 font-bold text-slate-900">{row.advertiserName}</td>
                            <td className="px-4 py-3">{row.clicks}</td>
                            <td className="px-4 py-3 text-amber-700">
                              {row.pendingCount > 0 ? `${formatBRL(row.pendingCommission)} (${row.pendingCount})` : "-"}
                            </td>
                            <td className="px-4 py-3 font-semibold text-emerald-700">
                              {row.confirmedCount > 0 ? `${formatBRL(row.confirmedCommission)} (${row.confirmedCount})` : "-"}
                            </td>
                            <td className="px-4 py-3 text-red-600">
                              {row.declinedCount > 0 ? `${formatBRL(row.declinedCommission)} (${row.declinedCount})` : "-"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                            Nenhuma loja AWIN com clique registrado nesse periodo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  &quot;Pendente&quot; ainda pode ser recusado pela loja de origem — so &quot;confirmado&quot; e comissao garantida.
                </p>
              </>
            )}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-[#1A1A1A]">Ofertas AWIN mais clicadas</h2>
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Oferta</th>
                      <th className="px-4 py-3">Preco</th>
                      <th className="px-4 py-3">Bloco</th>
                      <th className="px-4 py-3">Cliques</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.topOffers.length ? (
                      data.topOffers.map((offer) => (
                        <tr key={offer.id}>
                          <td className="px-4 py-3">
                            <p className="line-clamp-2 font-bold text-slate-900">{offer.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatDate(offer.published_at)}</p>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-700">{formatBRL(offer.price)}</td>
                          <td className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                            {offer.slot_type || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                              <MousePointerClick className="h-3 w-3" />
                              {offer.click_count}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                          Nenhuma oferta AWIN registrada ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black text-[#1A1A1A]">Origem dos cliques</h2>
                <div className="mt-5 space-y-3">
                  {data.sourceBreakdown.length ? (
                    data.sourceBreakdown.map((item) => (
                      <div key={item.source} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <span className="text-sm font-bold text-slate-700">{item.source}</span>
                        <span className="text-sm font-black text-navy">{item.clicks}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Sem cliques AWIN registrados ainda.</p>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                <p className="font-black">Sobre os plug-ins</p>
                <p className="mt-2">
                  O Radar mede cliques internos. adMission, Bounceless Tracking, Convert-a-Link,
                  TRENDii e wecantrack geram dados nos paineis da AWIN, TRENDii ou wecantrack.
                </p>
              </div>
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
