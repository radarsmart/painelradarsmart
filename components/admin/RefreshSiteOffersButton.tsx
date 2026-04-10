"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type RefreshSummary = {
  processed: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  errors: number;
};

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export default function RefreshSiteOffersButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<RefreshSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/cron/public-offers-refresh", {
        method: "POST",
        headers,
        body: JSON.stringify({
          limit: 120,
          mode: "all",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | ({ error?: string } & Partial<RefreshSummary>)
        | undefined;

      if (!response.ok) {
        throw new Error(payload?.error || "Falha ao atualizar os precos do site.");
      }

      setSummary({
        processed: Number(payload?.processed ?? 0),
        updated: Number(payload?.updated ?? 0),
        unchanged: Number(payload?.unchanged ?? 0),
        deactivated: Number(payload?.deactivated ?? 0),
        errors: Number(payload?.errors ?? 0),
      });

      router.refresh();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Falha ao atualizar os precos do site.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 md:items-end">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Atualizando precos..." : "Atualizar precos agora"}
      </button>

      {summary ? (
        <p className="text-right text-xs text-slate-500">
          Processadas {summary.processed} ofertas. Atualizadas {summary.updated}, sem mudanca{" "}
          {summary.unchanged}, desativadas {summary.deactivated}, erros {summary.errors}.
        </p>
      ) : null}

      {error ? (
        <p className="text-right text-xs font-medium text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
