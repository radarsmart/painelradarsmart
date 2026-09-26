"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Lock, Send, XCircle } from "lucide-react";

import type { CommercialJobApiView } from "@/lib/commercial-video/jobs/commercial-job-view";
import { buildCommercialReviewSummary, canApproveCommercial } from "@/lib/commercial-video/review/commercial-review-state";

type Props = {
  job: CommercialJobApiView;
  onJobUpdated: (job: CommercialJobApiView) => void;
  getAuthHeaders: () => Promise<HeadersInit>;
  onError: (message: string) => void;
};

function statusClasses(status: string): string {
  if (status === "PASS") return "bg-emerald-100 text-emerald-700";
  if (status === "PASS_WITH_OBSERVATIONS") return "bg-amber-100 text-amber-700";
  if (status === "FAIL") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function severityClasses(severity: string): string {
  if (severity === "NON_BLOCKING") return "bg-sky-100 text-sky-700 ring-sky-200";
  if (severity === "BLOCKING") return "bg-amber-100 text-amber-800 ring-amber-200";
  return "bg-red-100 text-red-700 ring-red-200";
}

function formatUsdCents(value: number | null): string {
  if (value === null) return "-";
  return `$${(value / 100).toFixed(2)}`;
}

function costValue(value: number | null, unit: string): string {
  if (value === null) return "-";
  return `${value} ${unit}`;
}

export function CommercialReviewApproval({ job, onJobUpdated, getAuthHeaders, onError }: Props) {
  const [acknowledged, setAcknowledged] = useState(job.review.humanAcknowledgedObservations);
  const [notes, setNotes] = useState(job.review.notes ?? "");
  const [submitting, setSubmitting] = useState<"APPROVE" | "REJECT" | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  const summary = useMemo(() => buildCommercialReviewSummary(job), [job]);
  const approveEnabled = canApproveCommercial(summary, acknowledged) && job.review.status !== "APPROVED";
  const videoSrc = summary.finalVideoUrl?.startsWith("http") ? summary.finalVideoUrl : null;

  async function submit(action: "APPROVE" | "REJECT") {
    setSubmitting(action);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/commercial-jobs/${job.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          action,
          reviewNotes: notes,
          humanAcknowledgedObservations: acknowledged,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao registrar revisao.");
      onJobUpdated(json.job);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Falha ao registrar revisao.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#1A1A1A]">Revisar Comercial</h3>
          <p className="mt-1 text-xs text-slate-500">Aprovacao humana antes de qualquer publicacao.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${statusClasses(summary.qualityStatus)}`}>
          {summary.qualityStatus}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(240px,360px)_1fr]">
        <div className="space-y-3">
          {videoSrc ? (
            <video
              className="aspect-[9/16] w-full rounded-lg bg-black object-contain"
              src={videoSrc}
              controls
              playsInline
            />
          ) : (
            <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg bg-slate-100 p-4 text-center text-xs text-slate-500">
              URL publica do MP4 indisponivel. Caminho local: {summary.finalVideoPath ?? "-"}
            </div>
          )}

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p>
              Pronto para publicacao:{" "}
              <span className={summary.publishReady ? "font-bold text-emerald-700" : "font-bold text-red-700"}>
                {summary.publishReady ? "SIM" : "NAO"}
              </span>
            </p>
            {summary.publishReady ? (
              <p className="mt-1 text-emerald-700">Este comercial atende aos criterios tecnicos e comerciais.</p>
            ) : null}
            {summary.requiresHumanAcknowledgement ? (
              <p className="mt-1 text-amber-700">Ha observacoes nao bloqueantes que precisam da sua confirmacao.</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {summary.scenes.map((scene) => (
              <div key={scene.sceneId} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-[#1A1A1A]">{scene.sceneId}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${statusClasses(scene.quality)}`}>
                    {scene.quality}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">{scene.purpose}</p>
                <p className="text-[11px] text-slate-500">provider: {scene.provider ?? "-"}</p>
                <p className="text-[11px] text-slate-500">asset: {scene.assetSource ?? "-"}</p>
                <p className="text-[11px] text-slate-500">historico: {scene.history}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs font-bold text-[#1A1A1A]">Observacoes</p>
            {summary.observations.length ? (
              <div className="mt-2 space-y-2">
                {summary.observations.map((issue, index) => (
                  <div key={`${issue.sceneId ?? "global"}-${index}`} className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{issue.sceneId ?? "global"}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ring-1 ${severityClasses(issue.severity)}`}>
                        {issue.severity}
                      </span>
                    </div>
                    <p className="mt-1">{issue.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Nenhuma observacao pendente.</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-slate-500">WAN</p>
              <p className="mt-1 text-[#1A1A1A]">{costValue(summary.costs.wanCredits, "credits")}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-slate-500">Kling</p>
              <p className="mt-1 text-[#1A1A1A]">{costValue(summary.costs.klingCredits, "credits")}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-slate-500">HeyGen</p>
              <p className="mt-1 text-[#1A1A1A]">{formatUsdCents(summary.costs.heygenUsdCents)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-slate-500">ElevenLabs</p>
              <p className="mt-1 text-[#1A1A1A]">{costValue(summary.costs.elevenLabsCredits, "credits")}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setTraceOpen((value) => !value)}
            className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left text-xs font-bold text-[#1A1A1A]"
          >
            Como este comercial foi produzido
            {traceOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {traceOpen ? (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {(summary.traceability ?? []).map((entry) => (
                <div key={entry.sceneId} className="rounded-md bg-white p-2">
                  <p className="font-semibold text-slate-700">{entry.sceneId}</p>
                  <p>provider: {entry.selectedProvider}</p>
                  <p>asset: {entry.existingAssetSource ?? "-"}</p>
                  <p>voz: {entry.voiceProfileVoiceName ?? "-"}</p>
                  <p>narracao: {entry.narrationStatus}</p>
                </div>
              ))}
            </div>
          ) : null}

          {summary.requiresHumanAcknowledgement ? (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-300"
              />
              <span>Revisei as observacoes e aprovo este comercial.</span>
            </label>
          ) : null}

          <label className="block text-xs text-slate-600">
            Notas de revisao
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#1A1A1A]"
              placeholder="Opcional"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => submit("APPROVE")}
              disabled={!approveEnabled || submitting !== null}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {job.review.status === "APPROVED" ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
              {job.review.status === "APPROVED" ? "Comercial Aprovado" : "Aprovar Comercial"}
            </button>

            <button
              type="button"
              onClick={() => submit("REJECT")}
              disabled={submitting !== null}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-5 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Solicitar Ajuste
            </button>

            <button
              type="button"
              disabled
              title="Publicacao sera habilitada em etapa posterior."
              className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-5 text-sm font-semibold text-slate-500"
            >
              <Send className="h-4 w-4" />
              Publicar
            </button>
          </div>

          {!summary.publishReady ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Este comercial ainda nao pode ser aprovado.
            </div>
          ) : null}

          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            Aprovar ou rejeitar nao publica, nao chama provider e nao inicia repair automaticamente.
          </div>
        </div>
      </div>
    </div>
  );
}
