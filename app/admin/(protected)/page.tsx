import Link from "next/link";
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

  const reason = freeShipping
    ? "Frete gratis + alta busca"
    : "Alta busca nacional";

  return {
    id: offer.id,
    title,
    price,
    score,
    marketplace,
    reason,
  };
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "active" | "inactive";
}) {
  const toneClass =
    tone === "active"
      ? "text-emerald-600"
      : tone === "inactive"
        ? "text-slate-600"
        : "text-[#9e6a18]";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id,title,marketplace,image_url,price,status,discount_pct,created_at,raw_data")
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    throw new Error(`Falha ao carregar ofertas: ${error.message}`);
  }

  const offers = ((data ?? []) as OfferRow[]).map((item) => ({
    ...item,
    marketplace: item.marketplace ?? "outro",
    status: item.status ?? "active",
  }));

  const activeCount = offers.filter((item) => item.status === "active").length;
  const inactiveCount = Math.max(offers.length - activeCount, 0);
  const simulatedClicks = activeCount * 37 + inactiveCount * 11;

  const todayKey = getSaoPauloDateKey(new Date());
  const todayOffers = offers.filter((item) => {
    if (!item.created_at) return false;
    return getSaoPauloDateKey(new Date(item.created_at)) === todayKey;
  });

  const topTrafficSuggestions = todayOffers
    .map(trafficPotential)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return (
    <div className="space-y-6 bg-slate-50 p-1">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black text-[#22223B]">Gerenciamento de Ofertas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Painel operacional para ativar, pausar e ajustar ofertas no ar.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/ofertas/nova"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#9e6a18] px-5 text-sm font-bold text-white transition hover:brightness-110"
          >
            + CADASTRAR NOVA OFERTA
          </Link>
          <ResetOffersButton />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Ofertas Ativas" value={activeCount} tone="active" />
        <StatCard label="Ofertas Inativas" value={inactiveCount} tone="inactive" />
        <StatCard label="Total de Cliques (Simulado)" value={simulatedClicks} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-[#22223B]">Sugestão de Tráfego</h2>
        <p className="mt-1 text-sm text-slate-500">
          Top 3 produtos de hoje com maior potencial de venda nacional.
        </p>
        <div className="mt-4 space-y-2">
          {topTrafficSuggestions.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#22223B]">{item.title}</p>
                <p className="text-xs text-slate-500">
                  {item.reason} · {item.marketplace}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[#22223B]">{formatBRL(item.price)}</p>
                <p className="text-xs font-semibold text-[#9e6a18]">Score {item.score}/10</p>
              </div>
            </div>
          ))}
          {!topTrafficSuggestions.length ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
              Ainda nao ha ofertas de hoje para sugerir campanhas.
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-[#22223B]">Lista de ofertas</h2>
        <TabelaOfertas initialOffers={offers} />
      </section>
    </div>
  );
}
