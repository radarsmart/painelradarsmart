"use client";

import { AlertTriangle } from "lucide-react";

import type { CommercialJobApiView } from "@/lib/commercial-video/jobs/commercial-job-view";

type Reason = { category: string; text: string };

// So RECOMBINA motivos que ja existem no runnerResult (elegibilidade de
// cena, asset ausente, guardrail de custo, narration quality) - nunca
// inventa uma mensagem generica no lugar do motivo real do backend.
function collectReasons(job: CommercialJobApiView): Reason[] {
  const reasons: Reason[] = [];

  if (job.status === "FAILED") {
    reasons.push({ category: "Erro", text: job.error?.message ?? "Erro desconhecido." });
    return reasons;
  }

  const result = job.runnerResult;
  if (!result) return reasons;

  for (const scene of result.scenes) {
    if (scene.eligibility !== "ELIGIBLE" && scene.eligibility !== "SKIPPED") {
      reasons.push({
        category: `Cena ${scene.sceneId} (${scene.purpose})`,
        text: scene.eligibilityReason ?? scene.eligibility,
      });
    }
    if (scene.existingAsset?.status === "MISSING_ASSET") {
      reasons.push({
        category: `Cena ${scene.sceneId} (${scene.purpose})`,
        text: scene.existingAsset.rejectionReason ?? "Mídia ausente.",
      });
    }
  }

  if (result.videoCostGuard.status !== "OK") {
    reasons.push({ category: "Custo de vídeo", text: result.videoCostGuard.reason ?? result.videoCostGuard.status });
  }
  if (result.ttsCostGuard.status !== "OK") {
    reasons.push({ category: "Custo de voz", text: result.ttsCostGuard.reason ?? result.ttsCostGuard.status });
  }

  if (result.narrationQualityResult && result.narrationQualityResult.status !== "PASS") {
    for (const reasonText of result.narrationQualityResult.reasons) {
      reasons.push({ category: "Narração", text: reasonText });
    }
  }

  return reasons;
}

export function CommercialJobBlockingReasons({ job }: { job: CommercialJobApiView }) {
  if (job.status !== "BLOCKED" && job.status !== "FAILED") return null;

  const reasons = collectReasons(job);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-red-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {job.status === "FAILED" ? "Este comercial falhou." : "Este comercial ainda não pode ser gerado."}
      </div>
      {reasons.length ? (
        <ul className="mt-3 space-y-1.5">
          {reasons.map((reason, index) => (
            <li key={index} className="text-xs text-red-700">
              <span className="font-semibold">{reason.category}:</span> {reason.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-red-700">Nenhum motivo detalhado disponível.</p>
      )}
    </div>
  );
}
