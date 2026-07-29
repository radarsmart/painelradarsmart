import { ExternalLink, RotateCcw, X } from "lucide-react";
import type { AiVideoJob } from "./types";
import VideoJobStatusBadge from "./VideoJobStatusBadge";

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function VideoJobDrawer({
  job,
  retrying,
  onClose,
  onRetry,
}: {
  job: AiVideoJob | null;
  retrying: boolean;
  onClose: () => void;
  onRetry: (job: AiVideoJob) => void;
}) {
  if (!job) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Fechar detalhe"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <VideoJobStatusBadge status={job.status} />
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                Tentativa {job.attempt_number ?? 1}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-black text-slate-950">
              {job.product_name || "Job de video"}
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{job.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">Criado</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{formatDate(job.created_at)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">Atualizado</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{formatDate(job.updated_at)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">Provider</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">
                {job.providers.length ? job.providers.join(" / ") : "-"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">Job original</p>
              <p className="mt-2 truncate font-mono text-xs text-slate-800">
                {job.original_job_id || "-"}
              </p>
            </div>
          </section>

          {job.error ? (
            <section className="rounded-2xl border border-red-100 bg-red-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-500">Erro</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-red-700">{job.error}</p>
            </section>
          ) : null}

          {job.published_url ? (
            <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-600">
                Video publicado
              </p>
              <div className="mt-3 overflow-hidden rounded-2xl bg-slate-950">
                <video
                  controls
                  playsInline
                  preload="metadata"
                  className="mx-auto aspect-[9/16] max-h-[520px] w-full bg-slate-950 object-contain"
                  src={job.published_url}
                />
              </div>
              <a
                href={job.published_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-2 break-all text-sm font-semibold text-emerald-700 hover:underline"
              >
                {job.published_url}
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
                Preview do video
              </p>
              <p className="mt-2 text-sm text-slate-600">
                O player aparece aqui quando o job chega em published e possui URL publica no Supabase Storage.
              </p>
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-black text-slate-900">Trilha de eventos</h3>
            <div className="space-y-3">
              {job.status_events.map((event, index) => (
                <div key={`${event.status}-${event.at}-${index}`} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-slate-900">{event.status || "-"}</p>
                    <p className="text-xs text-slate-500">{formatDate(event.at)}</p>
                  </div>
                  {event.detail ? <p className="mt-1 text-sm text-slate-600">{event.detail}</p> : null}
                  {event.error ? <p className="mt-2 text-sm text-red-600">{event.error}</p> : null}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-black text-slate-900">Metadados</h3>
            <JsonBlock value={{ input: job.input, output: job.output }} />
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-5">
          <p className="text-xs text-slate-500">
            Retry cria uma nova execucao vinculada ao job original.
          </p>
          <button
            type="button"
            onClick={() => onRetry(job)}
            disabled={job.status !== "failed" || retrying}
            className="inline-flex items-center gap-2 rounded-xl bg-rs-gold px-4 py-3 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            <RotateCcw className={retrying ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Retry
          </button>
        </div>
      </aside>
    </div>
  );
}
