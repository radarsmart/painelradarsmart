"use client";

import { Loader2 } from "lucide-react";

// So apresentacao - nunca cria um estado novo, so traduz os estados REAIS
// que ja existem em lib/commercial-video/runner/runner-state-machine.ts.
const STAGE_LABELS: Record<string, string> = {
  CREATED: "Criado",
  PREPARING: "Preparando",
  GENERATING_SCENES: "Preparando cenas",
  RESOLVING_ASSETS: "Conferindo mídias",
  BUILDING_NARRATION: "Montando roteiro de voz",
  GENERATING_NARRATION: "Preparando narração",
  COMPOSING_VIDEO: "Montando vídeo",
  MIXING_AUDIO: "Mixando áudio",
  FINALIZING: "Finalizando",
  COMPLETED: "Pronto",
  BLOCKED: "Bloqueado",
  FAILED: "Falhou",
};

const IN_PROGRESS_STAGES = new Set([
  "CREATED",
  "PREPARING",
  "GENERATING_SCENES",
  "RESOLVING_ASSETS",
  "BUILDING_NARRATION",
  "GENERATING_NARRATION",
  "COMPOSING_VIDEO",
  "MIXING_AUDIO",
  "FINALIZING",
]);

export function commercialJobStageLabel(stage: string | null): string {
  if (!stage) return "-";
  return STAGE_LABELS[stage] ?? stage;
}

function statusBadgeClasses(status: string): string {
  if (status === "COMPLETED") return "bg-emerald-100 text-emerald-700";
  if (status === "BLOCKED") return "bg-amber-100 text-amber-700";
  if (status === "FAILED") return "bg-red-100 text-red-700";
  return "bg-blue-100 text-blue-700";
}

function barColorClasses(status: string): string {
  if (status === "FAILED") return "bg-red-500";
  if (status === "BLOCKED") return "bg-amber-500";
  if (status === "COMPLETED") return "bg-emerald-500";
  return "bg-[#9E6A18]";
}

export function CommercialJobProgress({
  status,
  currentStage,
  progressPercent,
}: {
  status: string;
  currentStage: string | null;
  progressPercent: number;
}) {
  const inProgress = IN_PROGRESS_STAGES.has(status);
  const clampedProgress = Math.min(100, Math.max(0, progressPercent));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusBadgeClasses(status)}`}
        >
          {inProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {commercialJobStageLabel(status)}
        </span>
        {currentStage && currentStage !== status ? (
          <span className="text-xs text-slate-500">{commercialJobStageLabel(currentStage)}</span>
        ) : null}
        <span className="text-xs font-semibold text-slate-600">{clampedProgress}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barColorClasses(status)}`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}
