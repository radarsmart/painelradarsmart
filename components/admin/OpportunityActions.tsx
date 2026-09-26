"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { OPPORTUNITY_BULK_FORM_ID } from "@/components/admin/OpportunityBulkActions";

type OpportunityActionsProps = {
  offerId: string;
  gateStatus: string;
};

export default function OpportunityActions({
  offerId,
  gateStatus,
}: OpportunityActionsProps) {
  const [loading, setLoading] = useState<"evaluate" | "market" | "demand" | "learning" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runAction(action: "evaluate" | "refresh_market_prices" | "refresh_demand" | "refresh_learning") {
    setLoading(
      action === "evaluate"
        ? "evaluate"
        : action === "refresh_market_prices"
          ? "market"
          : action === "refresh_demand"
            ? "demand"
            : "learning",
    );
    setMessage(null);
    try {
      const response = await fetch("/api/admin/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, offer_id: offerId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha na acao.");
      setMessage(
        action === "evaluate"
          ? "Reavaliada."
          : action === "refresh_market_prices"
            ? "Atualizacao de mercado enfileirada."
            : action === "refresh_demand"
              ? "Atualizacao de demanda enfileirada."
              : "Atualizacao de aprendizado enfileirada.",
      );
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na acao.");
    } finally {
      setLoading(null);
    }
  }

  const canPublish = gateStatus === "APPROVED";

  return (
    <div className="flex min-w-[180px] flex-col gap-2">
      <label
        className={`flex items-center gap-2 text-xs font-semibold ${canPublish ? "text-slate-700" : "text-slate-400"}`}
        title={canPublish ? "Selecionar para enviar" : "Publicacao bloqueada pelo gate"}
      >
        <input
          type="checkbox"
          name="offer_ids"
          value={offerId}
          form={OPPORTUNITY_BULK_FORM_ID}
          disabled={!canPublish}
        />
        Selecionar
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => runAction("evaluate")}
          disabled={loading !== null}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 transition hover:border-[#C9973A] hover:text-[#9e6a18] disabled:cursor-wait disabled:opacity-60"
          title="Reavaliar"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading === "evaluate" ? "animate-spin" : ""}`} />
        </button>
        <button
          type="button"
          onClick={() => runAction("refresh_market_prices")}
          disabled={loading !== null}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 transition hover:border-[#C9973A] hover:text-[#9e6a18] disabled:cursor-wait disabled:opacity-60"
          title="Atualizar precos de mercado"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading === "market" ? "animate-spin" : ""}`} />
          Mercado
        </button>
        <button
          type="button"
          onClick={() => runAction("refresh_demand")}
          disabled={loading !== null}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 transition hover:border-[#C9973A] hover:text-[#9e6a18] disabled:cursor-wait disabled:opacity-60"
          title="Atualizar demanda"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading === "demand" ? "animate-spin" : ""}`} />
          Demanda
        </button>
        <button
          type="button"
          onClick={() => runAction("refresh_learning")}
          disabled={loading !== null}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 transition hover:border-[#C9973A] hover:text-[#9e6a18] disabled:cursor-wait disabled:opacity-60"
          title="Atualizar aprendizado"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading === "learning" ? "animate-spin" : ""}`} />
          Aprendizado
        </button>
      </div>
      {message ? <p className="max-w-[180px] text-[11px] text-slate-500">{message}</p> : null}
    </div>
  );
}
