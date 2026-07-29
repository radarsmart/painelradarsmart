"use client";

import { useEffect, useMemo, useState } from "react";
import { Clapperboard, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import VideoJobCreatePanel from "./VideoJobCreatePanel";
import VideoJobDrawer from "./VideoJobDrawer";
import VideoJobFilters from "./VideoJobFilters";
import VideoJobKpiCards from "./VideoJobKpiCards";
import VideoJobsTable from "./VideoJobsTable";
import type { AiVideoJob, VideoJobFiltersState, VideoJobsResponse, VideoJobsKpis } from "./types";

const EMPTY_KPIS: VideoJobsKpis = {
  jobsToday: 0,
  published: 0,
  failed: 0,
  averageRenderSeconds: null,
};

const INITIAL_FILTERS: VideoJobFiltersState = {
  search: "",
  status: "all",
  provider: "all",
  period: "7d",
  errorOnly: false,
};

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function buildQuery(filters: VideoJobFiltersState): string {
  const params = new URLSearchParams();
  params.set("search", filters.search);
  params.set("status", filters.status);
  params.set("provider", filters.provider);
  params.set("period", filters.period);
  params.set("errorOnly", String(filters.errorOnly));
  return params.toString();
}

export default function VideoJobsDashboard() {
  const [filters, setFilters] = useState<VideoJobFiltersState>(INITIAL_FILTERS);
  const [jobs, setJobs] = useState<AiVideoJob[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [kpis, setKpis] = useState<VideoJobsKpis>(EMPTY_KPIS);
  const [selectedJob, setSelectedJob] = useState<AiVideoJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedJobFresh = useMemo(() => {
    if (!selectedJob) return null;
    return jobs.find((job) => job.id === selectedJob.id) ?? selectedJob;
  }, [jobs, selectedJob]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadJobs();
    }, 250);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/criativos/video-jobs?${buildQuery(filters)}`, {
        headers,
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as VideoJobsResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Falha ao carregar jobs de video.");
      }

      setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
      setProviders(Array.isArray(payload.providers) ? payload.providers : []);
      setKpis(payload.kpis ?? EMPTY_KPIS);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar jobs.");
    } finally {
      setLoading(false);
    }
  }

  async function retryJob(job: AiVideoJob) {
    if (job.status !== "failed" || retryingJobId) return;

    setRetryingJobId(job.id);
    setMessage(null);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/admin/criativos/video-jobs/retry", {
        method: "POST",
        headers,
        body: JSON.stringify({ jobId: job.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        retryJobId?: string;
        attemptNumber?: number;
        error?: string;
      };

      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || "Falha ao reprocessar job.");
      }

      setMessage(
        `Retry criado: tentativa ${payload.attemptNumber ?? "-"} (${String(payload.retryJobId ?? "").slice(0, 8) || "novo job"}).`,
      );
      await loadJobs();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Falha ao reprocessar job.");
    } finally {
      setRetryingJobId(null);
    }
  }

  return (
    <div className="min-h-screen space-y-6 bg-[#F5F1ED] p-6 md:p-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <Clapperboard className="text-rs-gold" />
            Video Jobs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitoramento operacional do pipeline de videos da Radar Smart.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadJobs()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </div>

      {message ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <VideoJobCreatePanel
        onCreated={(result) => {
          setMessage(
            `Video criado: job ${result.jobId.slice(0, 8)}${result.videoUrl ? " com MP4 publicado." : "."}`,
          );
          void loadJobs();
        }}
      />

      <VideoJobKpiCards kpis={kpis} />
      <VideoJobFilters filters={filters} providers={providers} onChange={setFilters} />

      <div className="relative">
        {loading ? (
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando
            </span>
          </div>
        ) : null}
        <VideoJobsTable
          jobs={jobs}
          retryingJobId={retryingJobId}
          onSelect={setSelectedJob}
          onRetry={retryJob}
        />
      </div>

      <VideoJobDrawer
        job={selectedJobFresh}
        retrying={Boolean(selectedJobFresh && retryingJobId === selectedJobFresh.id)}
        onClose={() => setSelectedJob(null)}
        onRetry={retryJob}
      />
    </div>
  );
}
