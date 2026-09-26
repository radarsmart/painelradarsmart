import { unstable_noStore as noStore } from "next/cache";
import { AlertTriangle, BarChart3, Gauge, Target } from "lucide-react";

import DecisionIntelligenceActions from "@/components/admin/DecisionIntelligenceActions";
import {
  buildDecisionIntelligenceSummary,
  type DecisionCalibrationSummary,
  type DecisionGroupSummary,
  type ThresholdRecommendation,
} from "@/lib/opportunity-engine/decision-validation-service";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type PageSummary = DecisionCalibrationSummary & {
  snapshot_count: number;
  outcome_count: number;
  pending_count: number;
  insufficient_count: number;
};

function parseDays(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? 30);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 180)) : 30;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return String(Math.round(value));
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-navy">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

function SummaryTable({ title, rows }: { title: string; rows: DecisionGroupSummary[] }) {
  const visibleRows = rows.slice(0, 8);
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-navy">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Segmento</th>
              <th className="px-4 py-3">Amostra</th>
              <th className="px-4 py-3">Decisivos</th>
              <th className="px-4 py-3">Acerto</th>
              <th className="px-4 py-3">Expected</th>
              <th className="px-4 py-3">Actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3 font-semibold text-navy">{row.key}</td>
                  <td className="px-4 py-3 text-slate-600">{row.sample_size}</td>
                  <td className="px-4 py-3 text-slate-600">{row.decisive_count}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{formatPercent(row.hit_rate)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatScore(row.average_expected_value)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatScore(row.average_actual_value)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={6}>
                  Sem dados suficientes nesta janela.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ThresholdTable({ rows }: { rows: ThresholdRecommendation[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-navy">Calibracao de Thresholds</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Threshold</th>
              <th className="px-4 py-3">Amostra</th>
              <th className="px-4 py-3">Acerto</th>
              <th className="px-4 py-3">Actual medio</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.threshold}>
                <td className="px-4 py-3 font-semibold text-navy">{row.threshold}+</td>
                <td className="px-4 py-3 text-slate-600">{row.sample_size}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{formatPercent(row.hit_rate)}</td>
                <td className="px-4 py-3 text-slate-600">{formatScore(row.average_actual_value)}</td>
                <td className="px-4 py-3 text-slate-600">{row.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function loadSummary(days: number): Promise<{ summary: PageSummary | null; error: string | null }> {
  try {
    const summary = await buildDecisionIntelligenceSummary(supabaseAdmin, { days, window: "all" });
    return { summary: summary as PageSummary, error: null };
  } catch (error) {
    return {
      summary: null,
      error: error instanceof Error ? error.message : "Decision Intelligence indisponivel.",
    };
  }
}

export default async function DecisionIntelligencePage({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  const days = parseDays(searchParams.days);
  const { summary, error } = await loadSummary(days);

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#fff7e6] px-3 py-1 text-xs font-bold text-[#7a5012]">
            <Gauge className="h-3.5 w-3.5" />
            OPPORTUNITY_ENGINE_MODE=shadow
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold text-navy">Decision Intelligence</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Validacao das recomendacoes do Opportunity Engine por janela, score, confidence, canal e categoria.
          </p>
        </div>
        <DecisionIntelligenceActions days={days} />
      </header>

      {error ? (
        <section className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-bold">Decision Intelligence ainda nao esta disponivel neste banco.</p>
            <p className="mt-1">{error}</p>
          </div>
        </section>
      ) : null}

      {summary ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Snapshots" value={String(summary.snapshot_count)} helper={`${days} dias`} />
            <MetricCard label="Outcomes" value={String(summary.outcome_count)} helper={`${summary.pending_count} pendentes`} />
            <MetricCard
              label="Acerto geral"
              value={formatPercent(summary.windows[0]?.hit_rate)}
              helper={`${summary.windows[0]?.decisive_count ?? 0} decisoes conclusivas`}
            />
            <MetricCard
              label="Expected vs Actual"
              value={formatScore(summary.expected_vs_actual.average_delta)}
              helper={`Expected ${formatScore(summary.expected_vs_actual.average_expected_value)} / Actual ${formatScore(
                summary.expected_vs_actual.average_actual_value,
              )}`}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <SummaryTable title="Taxa de acerto por faixa de Opportunity Score" rows={summary.score_bucket_accuracy} />
            <SummaryTable title="Taxa de acerto por Confidence" rows={summary.confidence_bucket_accuracy} />
            <SummaryTable title="Performance por janela" rows={summary.windows} />
            <SummaryTable title="Performance por canal" rows={summary.channel_performance} />
            <SummaryTable title="Performance por categoria" rows={summary.category_performance} />
            <SummaryTable title="Performance por categoria + canal" rows={summary.category_channel_performance} />
          </section>

          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <ThresholdTable rows={summary.threshold_recommendations} />
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-navy">
                <Target className="h-4 w-4" />
                Prediction vs Actual
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Expected medio</dt>
                  <dd className="font-bold text-navy">{formatScore(summary.expected_vs_actual.average_expected_value)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Actual medio</dt>
                  <dd className="font-bold text-navy">{formatScore(summary.expected_vs_actual.average_actual_value)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Delta</dt>
                  <dd className="font-bold text-navy">{formatScore(summary.expected_vs_actual.average_delta)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Amostra disponivel</dt>
                  <dd className="font-bold text-navy">{summary.sample_size}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Amostra insuficiente</dt>
                  <dd className="font-bold text-navy">{summary.insufficient_count}</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                Thresholds permanecem apenas como recomendacao enquanto o motor esta em shadow.
              </div>
            </section>
          </div>
        </>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 font-semibold text-navy">Sem dados de decisao carregados.</p>
        </section>
      )}
    </main>
  );
}
