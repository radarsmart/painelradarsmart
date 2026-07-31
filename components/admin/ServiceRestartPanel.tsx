"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, Search, ServerCog } from "lucide-react";
import { supabase } from "@/lib/supabase";

type StatusResponse = {
  ok?: boolean;
  whatsapp?: "up" | "down";
  ml_session?: "up" | "down";
  error?: string;
};

type ServiceKey = "whatsapp" | "ml-session";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }
  return token;
}

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Falha na requisicao (${response.status}).`);
  }
  return payload;
}

function StatusBadge({ status }: { status: "up" | "down" | undefined }) {
  if (status === "up") {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
        Online
      </span>
    );
  }
  if (status === "down") {
    return (
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
        Offline
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
      Desconhecido
    </span>
  );
}

export default function ServiceRestartPanel() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [restarting, setRestarting] = useState<ServiceKey | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadStatus() {
    setLoadingStatus(true);
    try {
      const payload = await adminFetch<StatusResponse>("/api/admin/services/restart");
      setStatus(payload);
      setError("");
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Falha ao consultar status.");
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleRestart(service: ServiceKey) {
    setRestarting(service);
    setMessage("");
    setError("");
    try {
      const payload = await adminFetch<{ success?: boolean; message?: string }>(
        "/api/admin/services/restart",
        { method: "POST", body: JSON.stringify({ service }) },
      );
      setMessage(payload.message || "Restart iniciado.");

      // O restart pode levar alguns segundos (o watchdog checa e so reconecta se precisar).
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await sleep(5000);
        await loadStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reiniciar servico.");
    } finally {
      setRestarting(null);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ServerCog className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-black text-slate-900">Servicos locais</h2>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={loadingStatus}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingStatus ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Atualizar status
        </button>
      </div>

      <p className="mb-5 text-sm text-slate-500">
        WhatsApp e a sessao logada do Mercado Livre rodam localmente e podem cair sem aviso.
        Use os botoes abaixo pra reiniciar sem precisar rodar nada manualmente.
      </p>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-bold text-slate-800">WhatsApp</span>
            </div>
            <StatusBadge status={status?.whatsapp} />
          </div>
          <button
            type="button"
            onClick={() => void handleRestart("whatsapp")}
            disabled={restarting !== null}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {restarting === "whatsapp" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Reiniciar WhatsApp
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-bold text-slate-800">Sessao Mercado Livre</span>
            </div>
            <StatusBadge status={status?.ml_session} />
          </div>
          <button
            type="button"
            onClick={() => void handleRestart("ml-session")}
            disabled={restarting !== null}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {restarting === "ml-session" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Reiniciar Sessao ML
          </button>
        </div>
      </div>
    </div>
  );
}
