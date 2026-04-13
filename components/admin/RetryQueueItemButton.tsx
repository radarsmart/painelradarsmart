"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supabase } from "@/lib/supabase";

type RetryResponse = {
  success?: boolean;
  message?: string;
  error?: string;
};

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default function RetryQueueItemButton({
  id,
  disabled,
}: {
  id: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleRetry = async () => {
    if (disabled) return;

    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/admin/queue/retry", {
        method: "POST",
        headers,
        body: JSON.stringify({ id }),
      });

      const payload = (await response.json().catch(() => ({}))) as RetryResponse;

      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || payload.message || "Falha ao reprocessar job.");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Falha ao reprocessar job.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRetry}
      disabled={disabled || busy || isPending}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
      title="Tentar novamente"
    >
      <RotateCcw size={14} />
      {busy || isPending ? "Reprocessando..." : "Retry"}
    </button>
  );
}
