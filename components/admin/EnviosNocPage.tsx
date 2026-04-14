import { AlertCircle, CheckCircle2, Clock, Send } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import type { ReactNode } from "react";
import DashboardRefreshButton from "@/components/admin/DashboardRefreshButton";
import ClearFailedQueueButton from "@/components/admin/ClearFailedQueueButton";
import DeleteQueueItemButton from "@/components/admin/DeleteQueueItemButton";
import RetryFailedQueueButton from "@/components/admin/RetryFailedQueueButton";
import RetryQueueItemButton from "@/components/admin/RetryQueueItemButton";
import { supabaseAdmin } from "@/lib/supabase";

type QueueRow = {
  id: number;
  offer_id: string;
  channel: string | null;
  target_id: string | null;
  status: string | null;
  last_error: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  attempt_count: number | null;
  payload: {
    target?: {
      name?: string | null;
    };
  } | null;
};

type OfferLookupRow = {
  id: string;
  title: string | null;
  score: number | null;
};

function getSaoPauloDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatQueueDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const todayKey = getSaoPauloDateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getSaoPauloDateKey(yesterday);
  const itemKey = getSaoPauloDateKey(date);

  const timeLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (itemKey === todayKey) return `Hoje, ${timeLabel}`;
  if (itemKey === yesterdayKey) return `Ontem, ${timeLabel}`;

  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  }).format(date);

  return `${dateLabel}, ${timeLabel}`;
}

function statusBadge(status: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();

  if (normalized === "sent") {
    return {
      label: "ENVIADO",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (normalized === "failed") {
    return {
      label: "FALHA",
      className: "bg-red-100 text-red-700",
    };
  }

  if (normalized === "processing") {
    return {
      label: "PROCESSANDO",
      className: "bg-sky-100 text-sky-700",
    };
  }

  if (normalized === "skipped") {
    return {
      label: "IGNORADO",
      className: "bg-slate-200 text-slate-600",
    };
  }

  return {
    label: "AGENDADO",
    className: "bg-amber-100 text-amber-700",
  };
}

function QueueStatCard({
  title,
  value,
  color,
  icon,
  description,
}: {
  title: string;
  value: number;
  color: string;
  icon: ReactNode;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">
          {title}
        </p>
        <p className={`mt-1 text-3xl font-black ${color}`}>{value}</p>
        {description ? (
          <p className="mt-2 text-xs text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="rounded-xl bg-gray-50 p-3 text-gray-400">{icon}</div>
    </div>
  );
}

export default async function EnviosNocPage() {
  noStore();

  const { data: queueData, error: queueError } = await supabaseAdmin
    .from("post_queue")
    .select(
      "id,offer_id,channel,target_id,status,last_error,scheduled_at,sent_at,created_at,updated_at,attempt_count,payload",
    )
    .order("id", { ascending: false })
    .limit(200);

  if (queueError) {
    throw new Error(`Falha ao carregar fila: ${queueError.message}`);
  }

  const queueItems = (queueData ?? []) as QueueRow[];
  const offerIds = Array.from(
    new Set(queueItems.map((item) => item.offer_id).filter(Boolean)),
  );

  let offerMap = new Map<string, OfferLookupRow>();
  if (offerIds.length) {
    const { data: offerRows } = await supabaseAdmin
      .from("offers")
      .select("id,title,score")
      .in("id", offerIds);

    offerMap = new Map(
      ((offerRows ?? []) as OfferLookupRow[]).map((offer) => [offer.id, offer]),
    );
  }

  const failedCount = queueItems.filter(
    (item) => String(item.status ?? "").toLowerCase() === "failed",
  ).length;
  const failedWhatsappCount = queueItems.filter(
    (item) =>
      String(item.status ?? "").toLowerCase() === "failed" &&
      String(item.channel ?? "").toLowerCase() === "whatsapp",
  ).length;

  const todayKey = getSaoPauloDateKey(new Date());
  const processedTodayCount = queueItems.filter((item) => {
    const status = String(item.status ?? "").toLowerCase();
    if (!["sent", "failed", "processing"].includes(status)) return false;
    const baseDate = item.updated_at ?? item.sent_at ?? item.created_at;
    if (!baseDate) return false;
    return getSaoPauloDateKey(new Date(baseDate)) === todayKey;
  }).length;
  const sentTodayCount = queueItems.filter((item) => {
    if (String(item.status ?? "").toLowerCase() !== "sent" || !item.sent_at) {
      return false;
    }
    return getSaoPauloDateKey(new Date(item.sent_at)) === todayKey;
  }).length;
  const latestActivity = queueItems[0];
  const latestActivityLabel = latestActivity
    ? `${String(latestActivity.channel ?? "canal").toUpperCase()} #${latestActivity.id} - ${statusBadge(latestActivity.status).label}`
    : "Sem atividade recente";

  const now = new Date();
  const saoPauloHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  const withinWindow = saoPauloHour >= 8 && saoPauloHour < 22;

  return (
    <div className="min-h-screen space-y-8 bg-[#F5F1ED] p-6 pt-6 md:p-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <Send className="text-emerald-600" /> Centro de Distribuicao (NOC)
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitoramento de filas, disparos e saude dos robos de postagem.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardRefreshButton />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-blue-600 px-6 py-4 text-white shadow-lg shadow-blue-600/20">
        <div className="flex items-center gap-3">
          <Clock className={withinWindow ? "animate-pulse" : ""} />
          <div>
            <p className="text-sm font-bold">
              {withinWindow ? "Janela de Disparo Ativa" : "Fora da Janela de Disparo"}
            </p>
            <p className="text-[10px] uppercase tracking-widest opacity-80">
              08:00 - 22:00 (America/Sao_Paulo)
            </p>
          </div>
        </div>
        <div className="hidden text-right md:block">
          <p className="text-xs italic font-medium">
            &quot;Mantenha a frequencia para dominar o algoritmo.&quot;
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <QueueStatCard
          title="Postados Hoje"
          value={sentTodayCount}
          color="text-emerald-600"
          icon={<CheckCircle2 size={20} />}
          description="Jobs com envio concluido hoje."
        />
        <QueueStatCard
          title="Processados Hoje"
          value={processedTodayCount}
          color="text-sky-600"
          icon={<Send size={20} />}
          description={latestActivityLabel}
        />
        <QueueStatCard
          title="Erros Criticos"
          value={failedCount}
          color="text-red-600"
          icon={<AlertCircle size={20} />}
          description="Falhas nao entram em 'Na Fila'."
        />
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-50 bg-white px-6 py-5">
          <div>
            <h2 className="font-bold text-[#1A1A1A]">Fila de Postagens Recentes</h2>
            <p className="mt-1 text-xs text-slate-500">
              Ordenada pelo ID mais recente da fila para refletir os ultimos envios criados.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RetryFailedQueueButton
              failedCount={failedWhatsappCount}
              channel="whatsapp"
            />
            <ClearFailedQueueButton failedCount={failedCount} />
          </div>
        </div>

        {queueItems.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-6 py-4">ID / Canal</th>
                  <th className="px-6 py-4">Oferta</th>
                  <th className="px-6 py-4">Agendamento</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {queueItems.map((item) => {
                  const offer = offerMap.get(item.offer_id);
                  const badge = statusBadge(item.status);
                  const scheduleLabel =
                    String(item.status ?? "").toLowerCase() === "sent"
                      ? formatQueueDateTime(item.sent_at)
                      : formatQueueDateTime(item.scheduled_at ?? item.created_at);
                  const errorLabel =
                    item.last_error?.trim() ||
                    (item.attempt_count && item.attempt_count > 0
                      ? `Tentativas: ${item.attempt_count}`
                      : "Sem erro detalhado");

                  return (
                    <tr
                      key={item.id}
                      className="group transition-colors hover:bg-gray-50/50"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-gray-400">#{item.id}</span>
                          <span className="text-[10px] font-bold uppercase text-sky-600">
                            {item.channel ?? "Canal"}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-xs px-6 py-4">
                        <p className="truncate font-semibold text-[#1A1A1A]">
                          {offer?.title ?? "Oferta nao encontrada"}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          Score IA: {Number(offer?.score ?? 0).toFixed(1)}
                          {item.payload?.target?.name ? ` - ${item.payload.target.name}` : ""}
                        </p>
                        {String(item.status ?? "").toLowerCase() === "failed" ? (
                          <p className="mt-1 text-[11px] text-red-600">
                            {item.last_error?.trim() || "Falha sem detalhe persistido"}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600">
                        {scheduleLabel}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className="inline-flex rounded-lg p-2 text-gray-400 transition-colors group-hover:text-red-600"
                            title={errorLabel}
                          >
                            <AlertCircle size={16} />
                          </span>
                          {String(item.status ?? "").toLowerCase() === "failed" ? (
                            <RetryQueueItemButton id={item.id} />
                          ) : null}
                          <DeleteQueueItemButton id={item.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Nenhum job encontrado na fila de postagens.
          </div>
        )}
      </div>
    </div>
  );
}
