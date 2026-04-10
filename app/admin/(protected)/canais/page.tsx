"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type WhatsAppStatusResponse = {
  ok?: boolean;
  error?: string;
  status?: string;
  session?: string;
  checked_at?: string;
  message?: string;
  qr_code?: string | null;
  token_generated?: boolean;
  connection?: Record<string, unknown> | null;
  session_status?: Record<string, unknown> | null;
};

type TelegramStatusResponse = {
  ok?: boolean;
  error?: string;
  status?: string;
  checked_at?: string;
  message?: string;
  bot?: Record<string, unknown> | null;
  webhook?: Record<string, unknown> | null;
  response?: Record<string, unknown> | null;
};

function statusTone(status?: string) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "connected") {
    return {
      label: "Conectado",
      className: "bg-emerald-100 text-emerald-700",
    };
  }
  if (normalized === "qr_pending" || normalized === "qrcode") {
    return {
      label: "QR pendente",
      className: "bg-amber-100 text-amber-700",
    };
  }
  return {
    label: "Desconectado",
    className: "bg-red-100 text-red-700",
  };
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
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

function StatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
        {title}
      </span>
      <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

export default function AdminChannelsPage() {
  const [whatsApp, setWhatsApp] = useState<WhatsAppStatusResponse | null>(null);
  const [telegram, setTelegram] = useState<TelegramStatusResponse | null>(null);
  const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
  const [loadingTelegram, setLoadingTelegram] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [globalInfo, setGlobalInfo] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramTestLoading, setTelegramTestLoading] = useState(false);

  async function loadWhatsApp() {
    setLoadingWhatsApp(true);
    try {
      const payload = await adminFetch<WhatsAppStatusResponse>("/api/admin/channels/whatsapp");
      setWhatsApp(payload);
    } catch (error) {
      setWhatsApp({ error: error instanceof Error ? error.message : "Falha ao ler WhatsApp." });
    } finally {
      setLoadingWhatsApp(false);
    }
  }

  async function loadTelegram() {
    setLoadingTelegram(true);
    try {
      const payload = await adminFetch<TelegramStatusResponse>("/api/admin/channels/telegram");
      setTelegram(payload);
    } catch (error) {
      setTelegram({ error: error instanceof Error ? error.message : "Falha ao ler Telegram." });
    } finally {
      setLoadingTelegram(false);
    }
  }

  async function handleWhatsAppAction(action: "connect" | "reconnect" | "qrcode" | "new-qr") {
    setGlobalError("");
    setGlobalInfo("");
    setLoadingWhatsApp(true);
    try {
      const payload = await adminFetch<WhatsAppStatusResponse>("/api/admin/channels/whatsapp", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setWhatsApp(payload);
      if (payload.message) setGlobalInfo(payload.message);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Falha ao acionar WhatsApp.");
    } finally {
      setLoadingWhatsApp(false);
    }
  }

  async function handleTelegramTest() {
    setGlobalError("");
    setGlobalInfo("");
    setTelegramTestLoading(true);
    try {
      const payload = await adminFetch<TelegramStatusResponse>("/api/admin/channels/telegram", {
        method: "POST",
        body: JSON.stringify({
          action: "test",
          chat_id: telegramChatId.trim(),
          text: "Radar Smart: teste manual do painel de canais.",
        }),
      });
      setTelegram((prev) => ({ ...(prev ?? {}), ...payload }));
      setGlobalInfo(payload.message || "Teste do Telegram enviado.");
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Falha ao testar Telegram.");
    } finally {
      setTelegramTestLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([loadWhatsApp(), loadTelegram()]);
  }, []);

  const whatsAppBadge = useMemo(() => statusTone(whatsApp?.status), [whatsApp?.status]);
  const telegramBadge = useMemo(() => statusTone(telegram?.status), [telegram?.status]);

  return (
    <div className="min-h-screen space-y-8 bg-[#F5F1ED] p-6 pt-6 md:p-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <ShieldCheck className="text-[#9e6a18]" />
            Canais
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Controle operacional do WhatsApp e do Telegram usados na distribuicao.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void Promise.all([loadWhatsApp(), loadTelegram()])}
          disabled={loadingWhatsApp || loadingTelegram}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw
            className={`h-4 w-4 ${loadingWhatsApp || loadingTelegram ? "animate-spin" : ""}`}
          />
          Atualizar status
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          title="WhatsApp"
          value={whatsAppBadge.label}
          color={whatsApp?.status === "connected" ? "text-emerald-600" : "text-amber-600"}
        />
        <StatCard
          title="Telegram"
          value={telegramBadge.label}
          color={telegram?.status === "connected" ? "text-emerald-600" : "text-red-600"}
        />
        <StatCard
          title="Ultima verificacao"
          value={formatDateTime(
            whatsApp?.checked_at && telegram?.checked_at
              ? whatsApp.checked_at > telegram.checked_at
                ? whatsApp.checked_at
                : telegram.checked_at
              : whatsApp?.checked_at ?? telegram?.checked_at,
          )}
          color="text-[#1A1A1A]"
        />
      </div>

      {globalError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {globalError}
        </div>
      ) : null}

      {!globalError && globalInfo ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
          {globalInfo}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-[#1A1A1A]">
                <MessageCircle className="text-emerald-600" />
                WhatsApp
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Sessao do WPPConnect usada para enviar ao grupo.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${whatsAppBadge.className}`}
            >
              {whatsAppBadge.label}
            </span>
          </div>

          {whatsApp?.error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {whatsApp.error}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Sessao
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {whatsApp?.session || "-"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Ultima verificacao
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {formatDateTime(whatsApp?.checked_at)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>
              <strong>Status bruto:</strong>{" "}
              {String(whatsApp?.session_status?.status ?? whatsApp?.status ?? "-")}
            </p>
            <p className="mt-1">
              <strong>Token:</strong>{" "}
              {whatsApp?.token_generated ? "gerado dinamicamente" : "estatico ou ja existente"}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleWhatsAppAction("connect")}
              disabled={loadingWhatsApp}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-black disabled:opacity-60"
            >
              {loadingWhatsApp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              Conectar
            </button>
            <button
              type="button"
              onClick={() => void handleWhatsAppAction("reconnect")}
              disabled={loadingWhatsApp}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              Reconectar
            </button>
            <button
              type="button"
              onClick={() => void handleWhatsAppAction("qrcode")}
              disabled={loadingWhatsApp}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
            >
              <QrCode className="h-4 w-4" />
              Gerar novo QR
            </button>
          </div>

          {whatsApp?.qr_code ? (
            <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <p className="mb-3 text-sm font-semibold text-amber-800">
                Escaneie o QR Code no WhatsApp para reconectar a sessao.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={whatsApp.qr_code}
                alt="QR Code do WhatsApp"
                className="mx-auto h-64 w-64 rounded-2xl bg-white p-3 shadow-sm"
              />
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-[#1A1A1A]">
                <Send className="text-sky-600" />
                Telegram
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Healthcheck do bot e envio de teste opcional.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${telegramBadge.className}`}
            >
              {telegramBadge.label}
            </span>
          </div>

          {telegram?.error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {telegram.error}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Bot
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {telegram?.bot?.username
                  ? `@${String(telegram.bot.username)}`
                  : String(telegram?.bot?.first_name ?? "-")}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Ultima verificacao
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {formatDateTime(telegram?.checked_at)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>
              <strong>Webhook pendente:</strong>{" "}
              {String(telegram?.webhook?.pending_update_count ?? 0)}
            </p>
            <p className="mt-1">
              <strong>ID do bot:</strong> {String(telegram?.bot?.id ?? "-")}
            </p>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-800">Enviar teste manual</p>
            <p className="mt-1 text-sm text-slate-500">
              Informe um chat ID do Telegram para testar o bot a partir do painel.
            </p>
            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={telegramChatId}
                onChange={(event) => setTelegramChatId(event.target.value)}
                placeholder="Ex: -1001234567890"
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
              <button
                type="button"
                onClick={() => void handleTelegramTest()}
                disabled={telegramTestLoading || !telegramChatId.trim()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-5 text-sm font-bold text-white transition hover:bg-black disabled:opacity-60"
              >
                {telegramTestLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar teste
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-slate-800">Como operar este painel</p>
            <ul className="mt-2 space-y-1">
              <li>1. Se o WhatsApp cair, use primeiro <strong>Reconectar</strong>.</li>
              <li>2. Se continuar offline, use <strong>Gerar novo QR</strong> e escaneie no celular.</li>
              <li>3. Evite reconexao forcada periodica; o correto e agir quando o status sair de conectado.</li>
              <li>4. No Telegram, o teste manual valida bot, permissao e destino real.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
