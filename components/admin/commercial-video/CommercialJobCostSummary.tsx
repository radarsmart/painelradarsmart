"use client";

import { AlertTriangle } from "lucide-react";

import { formatBRL } from "@/lib/formatters";
import type { CommercialJobApiView } from "@/lib/commercial-video/jobs/commercial-job-view";

export function CommercialJobCostSummary({ job }: { job: CommercialJobApiView }) {
  const { costSummary } = job;
  const unknownComponents = job.runnerResult?.costPreview.unknownCurrencyComponents ?? [];

  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <h3 className="text-sm font-bold text-[#1A1A1A]">Estimativa de custo</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Vídeo</p>
          <p className="mt-1 text-sm text-[#1A1A1A]">{costSummary.estimatedVideoCredits ?? 0} créditos</p>
          <p className="text-xs text-slate-500">
            {costSummary.knownCostBRL !== null ? formatBRL(costSummary.knownCostBRL) : "custo em R$ não confirmado"}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Voz (TTS)</p>
          <p className="mt-1 text-sm text-[#1A1A1A]">{costSummary.estimatedTtsCredits ?? 0} créditos</p>
          <p className="text-xs text-slate-500">taxa crédito → R$ não confirmada</p>
        </div>
      </div>

      {costSummary.costHasUnknownComponents ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-semibold">Há componentes cujo custo em moeda ainda não foi confirmado.</p>
            {unknownComponents.length ? (
              <ul className="mt-1.5 space-y-1 text-amber-700">
                {unknownComponents.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
