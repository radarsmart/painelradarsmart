"use client";

import type { CommercialGenerationResult } from "@/lib/commercial-video/runner/types";

export function CommercialJobNarration({ result }: { result: CommercialGenerationResult }) {
  const plan = result.narrationPlan;
  if (!plan) return null;

  // Nome de exibicao vem do proprio resultado (traceability) - nunca
  // hardcoded aqui (ver GAROTA_RADAR_VOICE_PROFILE, unica fonte real).
  const voiceEntry = result.traceability.find((entry) => entry.voiceProfileVoiceName);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[#1A1A1A]">Narração</h3>
        <span className="text-xs text-slate-500">
          Voz:{" "}
          <span className="font-semibold text-[#9E6A18]">
            Garota Radar{voiceEntry?.voiceProfileVoiceName ? ` — ${voiceEntry.voiceProfileVoiceName}` : ""}
          </span>
        </span>
      </div>

      <div className="space-y-2">
        {plan.scenes.map((scene) => (
          <div key={scene.sceneId} className="rounded-lg border border-slate-100 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
              <span className="font-bold text-slate-600">{scene.purpose}</span>
              <span>{scene.status}</span>
              <span>{scene.text?.length ?? 0} caracteres</span>
            </div>
            <p className="mt-1 text-sm text-[#1A1A1A]">
              {scene.text ?? <span className="italic text-slate-400">Sem narração (silêncio)</span>}
            </p>
            {scene.reason ? <p className="mt-1 text-xs text-red-600">{scene.reason}</p> : null}
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        Total: {plan.totalCharacters} caracteres · {plan.estimatedCredits} créditos estimados (TTS)
      </p>
    </div>
  );
}
