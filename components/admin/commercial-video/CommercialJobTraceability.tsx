"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { CommercialGenerationResult } from "@/lib/commercial-video/runner/types";

// So os campos que REALMENTE existem no traceability hoje (ver
// RunnerTraceabilityEntry) - nunca inventa provider/model/generationId
// que so existiriam depois de um EXECUTE real (fora do escopo desta V1).
export function CommercialJobTraceability({
  traceability,
}: {
  traceability: CommercialGenerationResult["traceability"];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-100">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left text-sm font-bold text-[#1A1A1A]"
      >
        <span>Detalhes técnicos</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {open ? (
        <div className="space-y-2 border-t border-slate-100 p-4">
          {traceability.map((entry) => (
            <div key={entry.sceneId} className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">
                {entry.sceneId} · {entry.purpose}
              </p>
              <p>estratégia: {entry.productGenerationStrategy ?? "—"}</p>
              <p>
                provider: {entry.selectedProvider} ({entry.providerStatus ?? "—"})
              </p>
              <p>asset: {entry.existingAssetSource ?? "—"}</p>
              <p>narração: {entry.narrationStatus}</p>
              <p>
                créditos: vídeo {entry.estimatedVideoCredits ?? "—"} · voz {entry.estimatedTtsCredits}
              </p>
            </div>
          ))}
          <p className="pt-1 text-[10px] text-slate-400">
            provider/model/generationId reais só existem depois de uma execução real (EXECUTE) - ainda não
            implementada.
          </p>
        </div>
      ) : null}
    </div>
  );
}
