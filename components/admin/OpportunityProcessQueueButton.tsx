"use client";

import { useState } from "react";
import { Play } from "lucide-react";

export default function OpportunityProcessQueueButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function processQueue() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process_jobs", limit: 10 }),
      });
      const payload = (await response.json()) as {
        error?: string;
        succeeded?: number;
        failed?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao processar fila.");
      setMessage(`${payload.succeeded ?? 0} avaliadas, ${payload.failed ?? 0} falhas.`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao processar fila.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <button
        type="button"
        onClick={processQueue}
        disabled={loading}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-[#C9973A] hover:text-[#9e6a18] disabled:cursor-wait disabled:opacity-60"
      >
        <Play className="h-4 w-4" />
        {loading ? "Processando..." : "Processar fila"}
      </button>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
