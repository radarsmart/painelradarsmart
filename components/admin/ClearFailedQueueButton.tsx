"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ClearResponse = {
  success?: boolean;
  deleted?: number;
  message?: string;
  error?: string;
};

export default function ClearFailedQueueButton({
  failedCount,
}: {
  failedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleClear = async () => {
    if (!failedCount) return;

    const confirmed = window.confirm(
      `Remover ${failedCount} falha(s) da fila de postagens?`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await fetch("/api/admin/queue/clear-failures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const payload = (await response.json().catch(() => ({}))) as ClearResponse;

      if (!response.ok || payload.success === false) {
        throw new Error(
          payload.error || payload.message || "Falha ao limpar erros da fila.",
        );
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Falha ao limpar erros da fila.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClear}
      disabled={!failedCount || busy || isPending}
      className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
    >
      {busy || isPending ? "Limpando..." : "Limpar Falhas"}
    </button>
  );
}
