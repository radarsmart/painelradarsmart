"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

export default function ResetOffersButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    const confirmed = window.confirm(
      "Tem certeza que deseja apagar TODAS as ofertas? Esta acao nao pode ser desfeita.",
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch("/api/admin/offers/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "all" }),
      });

      const payload = (await response.json()) as { error?: string; deleted?: number };
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao limpar ofertas.");
      }

      window.alert(`Reset concluido. ${payload.deleted ?? 0} ofertas removidas.`);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erro ao limpar ofertas.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={loading}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      {loading ? "Limpando..." : "LIMPAR TODAS AS OFERTAS"}
    </button>
  );
}

