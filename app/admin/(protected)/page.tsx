import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Send,
  ShoppingCart,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import AutoFlushEliteButton from "@/components/admin/AutoFlushEliteButton";
import DashboardRefreshButton from "@/components/admin/DashboardRefreshButton";
import TabelaOfertas from "@/components/admin/TabelaOfertas";
import ResetOffersButton from "@/components/admin/ResetOffersButton";
import { formatBRL } from "@/lib/formatters";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type OfferRow = {
  id: string;
  title: string;
  marketplace: string | null;
  image_url: string | null;
  price: number | null;
  status: string | null;
  discount_pct: number | null;
  created_at: string | null;
  raw_data?: unknown;
};

type QueueRow = {
  status: string | null;
  scheduled_at: string | null;
};

type MomentumRow = {
  id: string;
  title: string | null;
  marketplace: string | null;
  category: string | null;
  image_url: string | null;
  momentum: number | null;
};

type TrafficSuggestion = {
  id: string;
  title: string;
  price: number;
  score: number;
  marketplace: string;
  reason: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getSaoPauloDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hasFreeShippingSignal(rawData: unknown, title: string): boolean {
  const rawStr = JSON.stringify(rawData ?? {}).toLowerCase();
  const titleStr = title.toLowerCase();
  return (
    rawStr.includes("free_shipping") ||
    rawStr.includes("shipping_free") ||
    rawStr.includes("envio gratis") ||
    rawStr.includes("frete gratis") ||
    rawStr.includes("full") ||
    rawStr.includes("prime") ||
    titleStr.includes("frete gratis")
  );
}

function demandScore(title: string): number {
  const text = title.toLowerCase();
  let score = 0;

  const highDemand = [
    "iphone",
    "samsung",
    "xiaomi",
    "smart tv",
    "notebook",
    "monitor gamer",
    "air fryer",
    "fone bluetooth",
    "ps5",
    "smartwatch",
  ];

  for (const keyword of highDemand) {
    if (text.includes(keyword)) score += 2;
  }

  const mediumDemand = [
    "cafeteira",
    "aspirador",
    "microondas",
    "liquidificador",
    "mouse",
    "teclado",
    "cadeira",
  ];

  for (const keyword of mediumDemand) {
    if (text.includes(keyword)) score += 1;
  }

  return clamp(score, 0, 5);
}

function trafficPotential(offer: OfferRow): TrafficSuggestion {
  const title = String(offer.title ?? "").trim();
  const marketplace = String(offer.marketplace ?? "outro");
  const price = Number(offer.price ?? 0);
  const discount = Number(offer.discount_pct ?? 0);
  const freeShipping = hasFreeShippingSignal(offer.raw_data, title);

  let score = 0;
  score += freeShipping ? 5 : 1;
  score += demandScore(title);
  if (discount >= 40) score += 2;
  else if (discount >= 20) score += 1;
  if (marketplace.toLowerCase().includes("amazon")) score += 1;
  if (price > 3000) score -= 1;

  score = clamp(score, 0, 10);

  return {
    id: offer.id,
    title,
    price,
    score,
    marketplace,
    reason: freeShipping ? "Frete gratis + alta busca" : "Alta busca nacional",
  };
}

function formatDelta(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? "Base inicial do dia" : "Sem variacao relevante";
  }

  const delta = ((current - previous) / previous) * 100;
  const prefix = delta >= 0 ? "+" : "";
  return `${prefix}${delta.toFixed(0)}% em relacao a ontem`;
}

function MetricCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {title}
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#1A1A1A]">
            {value}
          </p>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>
        <div className="rounded-xl bg-slate-100 p-2.5">{icon}</div>
      </div>
    </section>
  );
}

function WorkerStatus({
  label,
  status,
  latency,
  tone = "healthy",
}: {
  label: string;
  status: string;
  latency: string;
  tone?: "healthy" | "warning";
}) {
  const dotClass = tone === "warning" ? "bg-amber-400" : "bg-emerald-400";
  const textClass = tone === "warning" ? "text-amber-300" : "text-emerald-300";

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-100">{label}</p>
        <p className="text-xs text-slate-400">{latency}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass} animate-pulse`} />
        <span className={`text-xs font-bold uppercase tracking-wide ${textClass}`}>
          {status}
        </span>
      </div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const [offersResult, queueResult, momentumResult] = await Promise.all([
    supabaseAdmin
      .from("offers")
      .select("id,title,marketplace,image_url,price,status,discount_pct,created_at,raw_data")
      .order("created_at", { ascending: false })
      .limit(120),
    supabaseAdmin
      .from("post_queue")
      .select("status,scheduled_at")
      .order("scheduled_at", { ascending: false })
      .limit(250),
    supabaseAdmin
      .from("radar_smart_rank")
      .select("id,title,marketplace,category,image_url,momentum")
      .order("momentum", { ascending: false })
      .limit(12),
  ]);

  if (offersResult.error) {
    throw new Error(`Falha ao carregar ofertas: ${offersResult.error.message}`);
  }

  const offers = ((offersResult.data ?? []) as OfferRow[]).map((item) => ({
    ...item,
    marketplace: item.marketplace ?? "outro",
    status: item.status ?? "active",
  }));

  const queueItems = (queueResult.data ?? []) as QueueRow[];
  const momentumRows = (momentumResult.data ?? []) as MomentumRow[];

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const todayKey = getSaoPauloDateKey(today);
  const yesterdayKey = getSaoPauloDateKey(yesterday);

  const activeCount = offers.filter((item) => item.status === "active").length;
  const inactiveCount = Math.max(offers.length - activeCount, 0);

  const queuedCount = queueItems.filter(
    (item) => normalizeStatus(item.status) === "queued",
  ).length;
  const failedCount = queueItems.filter(
    (item) => normalizeStatus(item.status) === "failed",
  ).length;

  const sentTodayFromQueue = queueItems.filter((item) => {
    if (!item.scheduled_at) return false;
    const status = normalizeStatus(item.status);
    return (
      getSaoPauloDateKey(new Date(item.scheduled_at)) === todayKey &&
      status !== "queued" &&
      status !== "failed"
    );
  }).length;

  const sentYesterdayFromQueue = queueItems.filter((item) => {
    if (!item.scheduled_at) return false;
    const status = normalizeStatus(item.status);
    return (
      getSaoPauloDateKey(new Date(item.scheduled_at)) === yesterdayKey &&
      status !== "queued" &&
      status !== "failed"
    );
  }).length;

  const todayOffers = offers.filter((item) => {
    if (!item.created_at) return false;
    return getSaoPauloDateKey(new Date(item.created_at)) === todayKey;
  });

  const yesterdayOffers = offers.filter((item) => {
    if (!item.created_at) return false;
    return getSaoPauloDateKey(new Date(item.created_at)) === yesterdayKey;
  });

  const sentToday = sentTodayFromQueue > 0 ? sentTodayFromQueue : todayOffers.length;
  const sentYesterday =
    sentYesterdayFromQueue > 0 ? sentYesterdayFromQueue : yesterdayOffers.length;

  const avgMomentum =
    momentumRows.length > 0
      ? Number(
          (
            momentumRows.reduce(
              (acc, item) => acc + clamp(toNumber(item.momentum) * 100, 0, 100),
              0,
            ) / momentumRows.length
          ).toFixed(1),
        )
      : 0;

  const marketplaceCount = new Set(
    offers.map((item) => String(item.marketplace ?? "outro").toLowerCase()),
  ).size;

  const topTrafficSuggestions = todayOffers
    .map(trafficPotential)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const workerStatus = [
    {
      label: "Fila de distribuicao",
      status: failedCount > 3 ? "Atencao" : "Online",
      latency: `${queuedCount} aguardando disparo`,
      tone: failedCount > 3 ? ("warning" as const) : ("healthy" as const),
    },
    {
      label: "Curadoria comercial",
      status: todayOffers.length > 0 ? "Ativa" : "Estavel",
      latency: `${todayOffers.length} ofertas captadas hoje`,
      tone: "healthy" as const,
    },
    {
      label: "Radar de momentum",
      status: momentumRows.length > 0 ? "Online" : "Sem dados",
      latency: `${avgMomentum}% de momentum medio`,
      tone: momentumRows.length > 0 ? ("healthy" as const) : ("warning" as const),
    },
    {
      label: "Supabase Edge",
      status: offers.length > 0 ? "Online" : "Verificar",
      latency: `${offers.length} ofertas indexadas`,
      tone: offers.length > 0 ? ("healthy" as const) : ("warning" as const),
    },
  ];

  return (
    <div className="min-h-screen space-y-8 bg-[#F5F1ED] p-6 md:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9E6A18]">
            Radar Smart Command
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#1A1A1A] md:text-4xl">
            Central de comando do admin
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Operacao de elite monitorando {marketplaceCount || 1} marketplaces,
            distribuicao e qualidade da curadoria em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DashboardRefreshButton />
          <AutoFlushEliteButton />
          <Link
            href="/admin/ofertas/nova"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#9E6A18] px-5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Nova Oferta
          </Link>
          <ResetOffersButton />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Fila de Envios"
          value={queuedCount}
          description="Aguardando janela de disparo"
          icon={<Send className="h-5 w-5 text-blue-600" />}
        />
        <MetricCard
          title="Enviados Hoje"
          value={sentToday}
          description={formatDelta(sentToday, sentYesterday)}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
        />
        <MetricCard
          title="Falhas de API"
          value={failedCount}
          description="Requer atencao operacional"
          icon={<AlertCircle className="h-5 w-5 text-red-600" />}
        />
        <MetricCard
          title="Momentum Medio"
          value={`${avgMomentum}%`}
          description="Qualidade media do radar comercial"
          icon={<Zap className="h-5 w-5 text-amber-500" />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-7">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 lg:col-span-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[#FFC300]" />
              <h2 className="text-lg font-bold text-[#1A1A1A]">
                Produtos com Alto Momentum
              </h2>
            </div>
            <Link
              href="/admin/ofertas"
              className="text-xs font-semibold text-slate-500 transition hover:text-slate-800"
            >
              Ver todos
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {momentumRows.length ? (
              momentumRows.slice(0, 3).map((item) => {
                const score = clamp(toNumber(item.momentum) * 100, 0, 100).toFixed(1);

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 p-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image_url}
                          alt={item.title ?? "Produto"}
                          className="h-12 w-12 rounded-lg bg-slate-100 object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-slate-100" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1A1A1A]">
                          {item.title ?? "Oferta sem titulo"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.marketplace ?? "Marketplace"} • {item.category ?? "Geral"}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600">{score} Score</p>
                      <p className="text-[11px] text-slate-400">Momentum em alta</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                Ainda nao ha dados de momentum suficientes.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-[#1A1A1A] p-6 text-white shadow-sm lg:col-span-3">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-[#FFC300]" />
            <h2 className="text-lg font-bold">Status da Rede</h2>
          </div>

          <div className="mt-6 space-y-6">
            {workerStatus.map((item) => (
              <WorkerStatus
                key={item.label}
                label={item.label}
                status={item.status}
                latency={item.latency}
                tone={item.tone}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-[#9E6A18]" />
            <h2 className="text-lg font-bold text-[#1A1A1A]">
              Campanhas com maior potencial de trafego
            </h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Prioridade comercial sugerida a partir das ofertas captadas hoje.
          </p>

          <div className="mt-5 space-y-3">
            {topTrafficSuggestions.length ? (
              topTrafficSuggestions.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#1A1A1A]">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.reason} • {item.marketplace}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#1A1A1A]">
                      {formatBRL(item.price)}
                    </p>
                    <p className="text-xs font-semibold text-[#9E6A18]">
                      Score {item.score}/10
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                Ainda nao ha ofertas de hoje para sugerir campanhas.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h2 className="text-lg font-bold text-[#1A1A1A]">Pulso operacional</h2>
          <p className="mt-2 text-sm text-slate-500">
            Leitura rapida do estado atual da operacao.
          </p>

          <div className="mt-5 space-y-3">
            <div className="rounded-xl bg-[#F5F1ED] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Ofertas ativas
              </p>
              <p className="mt-2 text-3xl font-black text-[#1A1A1A]">{activeCount}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Ofertas inativas
              </p>
              <p className="mt-2 text-3xl font-black text-[#1A1A1A]">{inactiveCount}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Captadas hoje
              </p>
              <p className="mt-2 text-3xl font-black text-[#1A1A1A]">
                {todayOffers.length}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[#1A1A1A]">
            Lista de ofertas
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Painel operacional completo para ativar, pausar e ajustar ofertas.
          </p>
        </div>
        <TabelaOfertas initialOffers={offers} />
      </section>
    </div>
  );
}
