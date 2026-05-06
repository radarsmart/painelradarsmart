import { ExternalLink, Eye, RotateCcw } from "lucide-react";
import type { AiVideoJob } from "./types";
import VideoJobStatusBadge from "./VideoJobStatusBadge";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getResultLabel(job: AiVideoJob): string {
  if (job.published_url) return "MP4 publicado";
  if (job.error) return "Erro persistido";
  if (job.render_seconds !== null) return `Render ${job.render_seconds}s`;
  return "-";
}

export default function VideoJobsTable({
  jobs,
  retryingJobId,
  onSelect,
  onRetry,
}: {
  jobs: AiVideoJob[];
  retryingJobId: string | null;
  onSelect: (job: AiVideoJob) => void;
  onRetry: (job: AiVideoJob) => void;
}) {
  if (!jobs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        Nenhum job encontrado para os filtros atuais.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            <tr>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Produto</th>
              <th className="px-5 py-4">Provider</th>
              <th className="px-5 py-4">Criado em</th>
              <th className="px-5 py-4">Ultimo evento</th>
              <th className="px-5 py-4">Resultado</th>
              <th className="px-5 py-4 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <tr key={job.id} className="transition hover:bg-slate-50/70">
                <td className="px-5 py-4">
                  <VideoJobStatusBadge status={job.status} />
                </td>
                <td className="max-w-xs px-5 py-4">
                  <p className="truncate font-semibold text-slate-900">
                    {job.product_name || "Produto sem titulo"}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-400">
                    {job.original_job_id ? `Retry de ${job.original_job_id.slice(0, 8)}` : job.id}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Tentativa {job.attempt_number ?? 1}
                  </p>
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">
                  {job.providers.length ? job.providers.join(" / ") : "-"}
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">
                  {formatDate(job.created_at)}
                </td>
                <td className="max-w-xs px-5 py-4">
                  <p className="truncate text-xs font-semibold text-slate-700">
                    {job.last_event?.detail || job.last_event?.status || "-"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {formatDate(job.last_event?.at ?? null)}
                  </p>
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">
                  {job.published_url ? (
                    <a
                      href={job.published_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                    >
                      {getResultLabel(job)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    getResultLabel(job)
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(job)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Detalhe
                    </button>
                    {job.status === "failed" ? (
                      <button
                        type="button"
                        onClick={() => onRetry(job)}
                        disabled={retryingJobId === job.id}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        <RotateCcw className={retryingJobId === job.id ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                        Retry
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
