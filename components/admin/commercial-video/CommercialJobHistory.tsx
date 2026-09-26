"use client";

import { RefreshCw } from "lucide-react";

import type { CommercialJobApiView } from "@/lib/commercial-video/jobs/commercial-job-view";
import { commercialJobStageLabel } from "@/components/admin/commercial-video/CommercialJobProgress";

export function CommercialJobHistory({
  jobs,
  selectedJobId,
  onSelect,
  onRefresh,
  loading,
}: {
  jobs: CommercialJobApiView[];
  selectedJobId?: string;
  onSelect: (job: CommercialJobApiView) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#1A1A1A]">Histórico de jobs</h3>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9E6A18] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {jobs.length ? (
          jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              data-testid={`commercial-job-${job.id}`}
              onClick={() => onSelect(job)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${
                job.id === selectedJobId ? "border-[#9E6A18] bg-[#9E6A18]/5" : "border-slate-100 hover:bg-slate-50"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[#1A1A1A]">
                  {new Date(job.createdAt).toLocaleString("pt-BR")}
                </p>
                <p className="text-[10px] text-slate-500">
                  {job.mode} · {job.progressPercent}%
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">
                {commercialJobStageLabel(job.status)}
              </span>
            </button>
          ))
        ) : (
          <p className="text-xs text-slate-400">Nenhum job criado ainda para esta campanha.</p>
        )}
      </div>
    </div>
  );
}
