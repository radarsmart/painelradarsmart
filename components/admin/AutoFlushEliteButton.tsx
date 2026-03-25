"use client";

import { Flame, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type FlushResponse = {
  success?: boolean;
  message?: string;
  queued?: number;
  processed?: number;
  skipped?: number;
  failed?: number;
  error?: string;
};

export default function AutoFlushEliteButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const busy = isSubmitting || isPending;

  const handleAutoFlush = async () => {
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/distribution/elite-flush", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const payload = (await response.json().catch(() => ({}))) as FlushResponse;

      if (!response.ok || payload.success === false) {
        throw new Error(
          payload.error || payload.message || "Falha ao executar o Auto-Flush de Elite.",
        );
      }

      setFeedback(
        payload.message ||
          `${payload.processed ?? 0} ofertas processadas, ${payload.queued ?? 0} jobs enfileirados.`,
      );

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Falha ao executar o Auto-Flush de Elite.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleAutoFlush}
        disabled={busy}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-[#FFC300] px-4 py-2 font-bold text-black shadow-lg shadow-amber-500/20 transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Flame size={18} fill="black" />
        )}
        {busy ? "Despachando Elite..." : "Despachar Elite (Auto-Flush)"}
      </button>

      {feedback ? (
        <p className="max-w-[320px] text-xs text-slate-500">{feedback}</p>
      ) : null}
    </div>
  );
}
