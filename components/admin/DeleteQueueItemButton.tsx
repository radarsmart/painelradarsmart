"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supabase } from "@/lib/supabase";

type DeleteResponse = {
  success?: boolean;
  message?: string;
  error?: string;
};

export default function DeleteQueueItemButton({
  id,
  disabled,
}: {
  id: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const getAuthHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const handleDelete = async () => {
    if (disabled) return;

    const confirmed = window.confirm(`Excluir o job #${id} da fila?`);
    if (!confirmed) return;

    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/admin/queue", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ id }),
      });

      const payload = (await response.json().catch(() => ({}))) as DeleteResponse;
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || payload.message || "Falha ao excluir job.");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Falha ao excluir job da fila.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={disabled || busy || isPending}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
      title="Excluir da fila"
    >
      <Trash2 size={14} />
      {busy || isPending ? "Excluindo..." : "Excluir"}
    </button>
  );
}
