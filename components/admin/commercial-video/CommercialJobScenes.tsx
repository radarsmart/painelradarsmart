"use client";

import type { CommercialGenerationResult } from "@/lib/commercial-video/runner/types";

type SceneRunnerPlanLike = CommercialGenerationResult["scenes"][number];

function eligibilityBadgeClasses(eligibility: string): string {
  if (eligibility === "ELIGIBLE") return "bg-emerald-100 text-emerald-700";
  if (eligibility === "SKIPPED") return "bg-slate-100 text-slate-600";
  return "bg-red-100 text-red-700";
}

function assetLabel(scene: SceneRunnerPlanLike): string {
  if (!scene.existingAsset) return "—";
  if (scene.existingAsset.status === "READY") return "Reutilizando mídia existente";
  return "Mídia ausente";
}

export function CommercialJobScenes({ scenes }: { scenes: SceneRunnerPlanLike[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-[#1A1A1A]">Cenas</h3>
      <div className="space-y-2">
        {scenes.map((scene) => (
          <div key={scene.sceneId} className="rounded-xl border border-slate-100 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#1A1A1A] px-2.5 py-1 text-[10px] font-bold text-white">
                {scene.purpose}
              </span>
              {scene.requiresHybridPipeline ? (
                <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[10px] font-bold uppercase text-purple-700">
                  HYBRID
                </span>
              ) : null}
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${eligibilityBadgeClasses(scene.eligibility)}`}
              >
                {scene.eligibility}
              </span>
              <span className="text-[10px] text-slate-400">
                provider: {scene.selectedProvider} ({scene.providerStatus ?? "—"})
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
              <span>asset: {assetLabel(scene)}</span>
              <span>créditos: {scene.estimatedCost.estimatedCredits ?? "sem estimativa"}</span>
            </div>

            {scene.eligibilityReason ? <p className="mt-2 text-xs text-red-600">{scene.eligibilityReason}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
