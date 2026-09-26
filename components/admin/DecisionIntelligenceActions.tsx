"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, RefreshCw, Target } from "lucide-react";

type Action = "refresh_outcomes" | "calibrate" | "refresh_and_calibrate";

export default function DecisionIntelligenceActions({ days }: { days: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: Action) {
    setMessage(null);
    const response = await fetch("/api/admin/decision-intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, days, window: "all" }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Falha ao processar Decision Intelligence.");
      return;
    }
    setMessage("Decision Intelligence atualizado.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-navy px-3 text-sm font-semibold text-white disabled:opacity-60"
        disabled={pending}
        onClick={() => run("refresh_outcomes")}
        type="button"
      >
        <RefreshCw className="h-4 w-4" />
        Atualizar outcomes
      </button>
      <button
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-navy disabled:opacity-60"
        disabled={pending}
        onClick={() => run("calibrate")}
        type="button"
      >
        <Target className="h-4 w-4" />
        Calibrar thresholds
      </button>
      <button
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#C9973A] bg-[#fff7e6] px-3 text-sm font-semibold text-[#7a5012] disabled:opacity-60"
        disabled={pending}
        onClick={() => run("refresh_and_calibrate")}
        type="button"
      >
        <Activity className="h-4 w-4" />
        Atualizar + calibrar
      </button>
      {message ? <span className="text-xs font-semibold text-slate-500">{message}</span> : null}
    </div>
  );
}
