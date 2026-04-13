"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supabase } from "@/lib/supabase";

type RetryFailuresResponse = {
  success?: boolean;
  retried?: number;
  message?: string;
  error?: string;
};

export default function RetryFailedQueueButton({
  failedCount,
  channel = "whatsapp",
}: {
  failedCount: number;
  channel?: "whatsapp" | "telegram";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleRetry = async () => {
    if (!failedCount) return;

    const confirmed = window.confirm(
      `Reprocessar até ${failedCount} falha(s) de ${channel.toUpperCase()}?`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const response = await fetch("/api/admin/queue/retry-failures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ channel, limit: failedCount }),
      });

      const payload = (await response.json().catch(() => ({}))) as RetryFailuresResponse;

      if (!response.ok || payload.success === false) {
        throw new Error(
          payload.error || payload.message || "Falha ao reprocessar falhas da fila.",
        );
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Falha ao reprocessar falhas da fila.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRetry}
      disabled={!failedCount || busy || isPending}
      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
    >
      <RotateCcw size={14} />
      {busy || isPending ? "Reprocessando..." : `Retry ${channel.toUpperCase()}`}
    </button>
  );
}
