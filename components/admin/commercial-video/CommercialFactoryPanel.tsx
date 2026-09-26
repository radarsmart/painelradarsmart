"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Factory, Loader2, Lock } from "lucide-react";

import { supabase } from "@/lib/supabase-browser";
import type { CommercialJobApiView } from "@/lib/commercial-video/jobs/commercial-job-view";
import { CommercialJobProgress } from "@/components/admin/commercial-video/CommercialJobProgress";
import { CommercialJobBlockingReasons } from "@/components/admin/commercial-video/CommercialJobBlockingReasons";
import { CommercialJobCostSummary } from "@/components/admin/commercial-video/CommercialJobCostSummary";
import { CommercialJobScenes } from "@/components/admin/commercial-video/CommercialJobScenes";
import { CommercialJobNarration } from "@/components/admin/commercial-video/CommercialJobNarration";
import { CommercialJobTraceability } from "@/components/admin/commercial-video/CommercialJobTraceability";
import { CommercialJobHistory } from "@/components/admin/commercial-video/CommercialJobHistory";
import { CommercialReviewApproval } from "@/components/admin/commercial-video/CommercialReviewApproval";

// Mesmo padrao ja usado em CreativeAiDashboard.tsx - nenhum sistema de
// auth novo, so o token de sessao do Supabase.
async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function chooseDefaultJob(jobs: CommercialJobApiView[]): CommercialJobApiView | null {
  return (
    jobs.find((job) => job.status === "COMPLETED" && job.runnerResult) ??
    jobs.find((job) => job.runnerResult) ??
    jobs[0] ??
    null
  );
}

export function CommercialFactoryPanel({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const [maxVideoCredits, setMaxVideoCredits] = useState("1000");
  const [maxTtsCredits, setMaxTtsCredits] = useState("500");
  const [creating, setCreating] = useState(false);
  const [refreshingJob, setRefreshingJob] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentJob, setCurrentJob] = useState<CommercialJobApiView | null>(null);
  const [history, setHistory] = useState<CommercialJobApiView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admin/creative-ai/commercial-jobs?campaignId=${encodeURIComponent(campaignId)}&limit=20`,
        { headers },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao carregar histórico de jobs.");
      const jobs = (json.jobs ?? []) as CommercialJobApiView[];
      setHistory(jobs);
      setCurrentJob((selected) => {
        if (selected?.campaignId === campaignId) {
          return jobs.find((job) => job.id === selected.id) ?? chooseDefaultJob(jobs);
        }
        return chooseDefaultJob(jobs);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar histórico de jobs.");
    } finally {
      setLoadingHistory(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handlePrepare() {
    setCreating(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/creative-ai/commercial-jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          campaignId,
          mode: "DRY_RUN",
          maxVideoCredits: Number(maxVideoCredits) || null,
          maxTtsCredits: Number(maxTtsCredits) || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao preparar o comercial.");
      setCurrentJob(json.job);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao preparar o comercial.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRefreshCurrentJob() {
    if (!currentJob) return;
    setRefreshingJob(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/commercial-jobs/${currentJob.id}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao atualizar status do job.");
      setCurrentJob(json.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar status do job.");
    } finally {
      setRefreshingJob(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2">
        <Factory className="h-5 w-5 text-[#9E6A18]" />
        <h2 className="text-lg font-bold text-[#1A1A1A]">Fábrica de Vídeos Comerciais</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Campanha: <span className="font-semibold text-[#1A1A1A]">{campaignName}</span>
      </p>

      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
        DRY RUN — nenhum crédito será consumido
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Limites de custo</p>

          <label className="block text-xs text-slate-600">
            Máximo de créditos de vídeo
            <input
              type="number"
              value={maxVideoCredits}
              onChange={(event) => setMaxVideoCredits(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#1A1A1A]"
            />
          </label>

          <label className="block text-xs text-slate-600">
            Máximo de créditos de voz
            <input
              type="number"
              value={maxTtsCredits}
              onChange={(event) => setMaxTtsCredits(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#1A1A1A]"
            />
          </label>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handlePrepare}
              disabled={creating}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#9E6A18] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Factory className="h-4 w-4" />}
              Preparar Comercial
            </button>

            <button
              type="button"
              disabled
              title="Execução real será habilitada após validação dos limites de segurança."
              className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-5 text-sm font-semibold text-slate-500"
            >
              <Lock className="h-4 w-4" />
              Gerar Comercial
            </button>
          </div>
        </div>

        <CommercialJobHistory
          jobs={history}
          selectedJobId={currentJob?.id}
          onSelect={setCurrentJob}
          onRefresh={loadHistory}
          loading={loadingHistory}
        />
      </div>

      {currentJob ? (
        <div className="mt-6 space-y-5 border-t border-slate-100 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">job: {currentJob.id}</p>
            <button
              type="button"
              onClick={handleRefreshCurrentJob}
              disabled={refreshingJob}
              className="text-xs font-semibold text-[#9E6A18] disabled:opacity-50"
            >
              {refreshingJob ? "Atualizando..." : "Atualizar status"}
            </button>
          </div>

          <CommercialJobProgress
            status={currentJob.status}
            currentStage={currentJob.currentStage}
            progressPercent={currentJob.progressPercent}
          />

          <CommercialJobBlockingReasons job={currentJob} />

          <CommercialJobCostSummary job={currentJob} />

          {currentJob.runnerResult ? (
            <>
              <CommercialReviewApproval
                job={currentJob}
                onJobUpdated={(job) => {
                  setCurrentJob(job);
                  loadHistory();
                }}
                getAuthHeaders={getAuthHeaders}
                onError={setError}
              />
              <CommercialJobScenes scenes={currentJob.runnerResult.scenes} />
              <CommercialJobNarration result={currentJob.runnerResult} />
            </>
          ) : null}

          {currentJob.traceability ? <CommercialJobTraceability traceability={currentJob.traceability} /> : null}
        </div>
      ) : null}
    </section>
  );
}
