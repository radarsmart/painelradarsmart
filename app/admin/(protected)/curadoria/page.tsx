import Link from "next/link";
import { revalidatePath } from "next/cache";
import CuradoriaCopyButton from "@/components/admin/CuradoriaCopyButton";
import StoryGeneratorButton from "@/components/admin/StoryGeneratorButton";
import { dispatchLegacyOffer } from "@/lib/distribution/legacy-dispatch";
import { supabaseAdmin } from "@/lib/supabase";
import { formatBRL } from "@/lib/formatters";

export const dynamic = "force-dynamic";

type OfferSlot = "flash" | "best" | "comparator";
type MarketplaceFilter = "all" | "amazon" | "mercadolivre" | "shopee" | "awin";

type OfferRow = {
  id: string;
  title: string | null;
  marketplace: string | null;
  image_url: string | null;
  affiliate_url?: string | null;
  product_url?: string | null;
  price: number | string | null;
  old_price: number | string | null;
  click_count: number | null;
  clicks_count?: number | null;
  cliques?: number | null;
  clicks?: number | null;
  slot_type: OfferSlot | null;
  status: string | null;
  updated_at?: string | null;
};

type HealthRow = {
  status: string | null;
  curations_status: string | null;
  affiliate_url: string | null;
  product_url: string | null;
};

type HealthStats = {
  active: number;
  cleaned: number;
  broken: number;
};

type OffersQueryResult = {
  data: OfferRow[];
  error: { message?: string | null } | null;
  supportsSlots: boolean;
  supportsClicks: boolean;
};

function pickFirstText(
  offer: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = toText(offer[key]);
    if (value) return value;
  }
  return null;
}

function pickFirstNumber(
  offer: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const raw = offer[key];
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeMarketplaceFilter(value: string | string[] | undefined): MarketplaceFilter {
  const normalized = String(Array.isArray(value) ? value[0] : value ?? "all")
    .trim()
    .toLowerCase();
  if (normalized === "amazon") return "amazon";
  if (normalized === "mercadolivre") return "mercadolivre";
  if (normalized === "shopee") return "shopee";
  if (normalized === "awin") return "awin";
  return "all";
}

function matchesMarketplaceFilter(
  marketplace: string | null | undefined,
  filter: MarketplaceFilter,
) {
  if (filter === "all") return true;
  const value = toText(marketplace).toLowerCase();
  if (filter === "mercadolivre") return value.includes("mercado");
  return value.includes(filter);
}

function marketplaceFilterOptions() {
  return [
    { value: "all", label: "Todos" },
    { value: "amazon", label: "Amazon" },
    { value: "mercadolivre", label: "Mercado Livre" },
    { value: "shopee", label: "Shopee" },
    { value: "awin", label: "AWIN" },
  ] as const;
}

function getMarketplaceBadge(marketplace: string | null) {
  const value = toText(marketplace).toLowerCase();
  if (value.includes("amazon")) {
    return { label: "🟠 Amazon", className: "bg-orange-50 text-orange-700" };
  }
  if (value.includes("mercado")) {
    return { label: "🟡 ML", className: "bg-yellow-50 text-yellow-700" };
  }
  if (value.includes("shopee")) {
    return { label: "🔴 Shopee", className: "bg-red-50 text-red-700" };
  }
  if (value.includes("awin")) {
    return { label: "🟣 AWIN", className: "bg-violet-50 text-violet-700" };
  }
  return { label: marketplace || "Marketplace", className: "bg-slate-100 text-slate-700" };
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSyncTime(value?: string | null): string {
  if (!value) return "Nunca";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(parsed);
}

function computeDiscountPct(price: unknown, oldPrice: unknown): number {
  const current = toNumber(price);
  const previous = toNumber(oldPrice);
  if (current <= 0 || previous <= current) return 0;
  return Math.round(((previous - current) / previous) * 100);
}

function resolveClicks(offer: OfferRow): number {
  return (
    toNumber(offer.click_count) ||
    toNumber(offer.clicks_count) ||
    toNumber(offer.cliques) ||
    toNumber(offer.clicks)
  );
}

function isArchivedOffer(row: HealthRow): boolean {
  return toText(row.status) === "archived" || toText(row.curations_status) === "archived";
}

function isBrokenOffer(row: HealthRow): boolean {
  return !toText(row.affiliate_url) && !toText(row.product_url);
}

function getSlotBadge(slot: string | null) {
  if (slot === "flash") {
    return "bg-orange-500 text-white";
  }
  if (slot === "comparator") {
    return "bg-sky-500 text-white";
  }
  return "bg-gray-200 text-gray-700";
}

function getNextSlot(slot: string | null): OfferSlot {
  if (slot === "flash") return "best";
  if (slot === "best") return "comparator";
  return "flash";
}

async function fetchCuradoriaOffers(): Promise<OffersQueryResult> {
  const queryPlans = [
    { orderBy: "updated_at" },
    { orderBy: "created_at" },
    { orderBy: null },
  ] as const;

  let lastError: { message?: string | null } | null = null;

  for (const plan of queryPlans) {
    let query = supabaseAdmin.from("offers").select("*").limit(50);
    if (plan.orderBy) {
      query = query.order(plan.orderBy, { ascending: false });
    }

    const response = await query;
    if (response.error) {
      lastError = response.error;
      continue;
    }

    const rows = (response.data ?? []) as Array<Record<string, unknown>>;
    const normalized = rows.map(
      (offer) =>
        ({
          id: toText(offer.id),
          title: pickFirstText(offer, ["title", "titulo", "name"]),
          marketplace: pickFirstText(offer, ["marketplace", "store", "loja"]),
          image_url: pickFirstText(offer, ["image_url", "image", "thumbnail", "cover"]),
          affiliate_url: pickFirstText(offer, ["affiliate_url"]),
          product_url: pickFirstText(offer, ["product_url"]),
          price: pickFirstNumber(offer, ["price", "final_price", "preco", "preco_atual"]),
          old_price: pickFirstNumber(offer, [
            "old_price",
            "original_price",
            "price_old",
            "preco_original",
          ]),
          click_count: pickFirstNumber(offer, ["click_count", "clicks_count", "cliques", "clicks"]),
          clicks_count: pickFirstNumber(offer, ["clicks_count"]),
          cliques: pickFirstNumber(offer, ["cliques"]),
          clicks: pickFirstNumber(offer, ["clicks"]),
          slot_type:
            (pickFirstText(offer, ["slot_type"]) as OfferSlot | null) ?? null,
          status: pickFirstText(offer, ["status", "curations_status"]),
          updated_at: pickFirstText(offer, ["updated_at", "created_at"]),
        }) as OfferRow,
    );

    return {
      data: normalized.filter((offer) => Boolean(offer.id)),
      error: null,
      supportsSlots: rows.some((offer) => "slot_type" in offer),
      supportsClicks: rows.some(
        (offer) =>
          "click_count" in offer ||
          "clicks_count" in offer ||
          "cliques" in offer ||
          "clicks" in offer,
      ),
    };
  }

  return {
    data: [],
    error: lastError,
    supportsSlots: false,
    supportsClicks: false,
  };
}

async function fetchHealthRows(last24Hours: string): Promise<HealthRow[]> {
  const primaryResponse = await supabaseAdmin
    .from("offers")
    .select("status,curations_status,affiliate_url,product_url")
    .gte("updated_at", last24Hours)
    .or("status.eq.archived,curations_status.eq.archived");

  if (!primaryResponse.error) {
    return ((primaryResponse.data ?? []) as HealthRow[]) ?? [];
  }

  const fallbackResponse = await supabaseAdmin
    .from("offers")
    .select("status")
    .gte("updated_at", last24Hours)
    .eq("status", "archived");

  if (fallbackResponse.error) {
    return [];
  }

  return (((fallbackResponse.data ?? []) as unknown) as Array<Record<string, unknown>>).map((row) => ({
    status: toText(row.status) || null,
    curations_status: null,
    affiliate_url: null,
    product_url: null,
  }));
}

async function toggleOfferStatus(formData: FormData) {
  "use server";

  const id = toText(formData.get("id"));
  const nextStatus = toText(formData.get("next_status"));
  if (!id || !nextStatus) return;

  await supabaseAdmin.from("offers").update({ status: nextStatus }).eq("id", id);
  revalidatePath("/admin/curadoria");
}

async function rotateOfferSlot(formData: FormData) {
  "use server";

  const id = toText(formData.get("id"));
  const currentSlot = toText(formData.get("current_slot"));
  if (!id) return;

  await supabaseAdmin
    .from("offers")
    .update({ slot_type: getNextSlot(currentSlot || null) })
    .eq("id", id);

  revalidatePath("/admin/curadoria");
}

async function sendOfferToTelegram(formData: FormData) {
  "use server";

  const offerId = toText(formData.get("id"));
  const affiliateUrl = toText(formData.get("affiliate_url"));

  if (!offerId) return;

  await dispatchLegacyOffer({
    offerId,
    affiliateUrl: affiliateUrl || undefined,
    channels: ["telegram"],
    allowRequeueSameDay: false,
  });

  revalidatePath("/admin/curadoria");
}

function HealthDashboard({ stats }: { stats: HealthStats }) {
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Ofertas Ativas
        </span>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-black text-blue-600">{stats.active}</span>
          <span className="mb-1 text-xs font-bold text-green-500">↑ Saudável</span>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Faxinadas (24h)
        </span>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-black text-orange-500">{stats.cleaned}</span>
          <span className="mb-1 text-xs font-medium text-gray-400">Automático</span>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Links Quebrados
        </span>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-black text-red-600">{stats.broken}</span>
          <span className="mb-1 text-xs font-bold text-red-400">Removidos</span>
        </div>
      </div>
    </div>
  );
}

export default async function CuradoriaGeralPage({
  searchParams,
}: {
  searchParams?: { marketplace?: string | string[] };
}) {
  const selectedMarketplace = normalizeMarketplaceFilter(searchParams?.marketplace);
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    offersResponse,
    { count: activeCountExact, error: activeCountError },
    recentHealthRows,
  ] = await Promise.all([
    fetchCuradoriaOffers(),
    supabaseAdmin
      .from("offers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    fetchHealthRows(last24Hours),
  ]);

  if (offersResponse.error) {
    return (
      <div className="p-10 text-red-500">
        Erro ao carregar o banco de dados.
        <div className="mt-2 text-sm text-red-400">
          {offersResponse.error.message || "Falha desconhecida na leitura da tabela offers."}
        </div>
      </div>
    );
  }

  const safeOffers = (offersResponse.data ?? []).filter((offer) =>
    matchesMarketplaceFilter((offer as OfferRow).marketplace ?? null, selectedMarketplace),
  );
  const safeHealthRows = recentHealthRows ?? [];
  const cleanedCount = safeHealthRows.filter((row) => isArchivedOffer(row)).length;
  const brokenCount = safeHealthRows.filter(
    (row) => isArchivedOffer(row) && isBrokenOffer(row),
  ).length;
  const activeCount = activeCountError
    ? safeOffers.filter((offer) => toText(offer.status) === "active").length
    : activeCountExact ?? 0;
  const stats: HealthStats = {
    active: activeCount,
    cleaned: cleanedCount,
    broken: brokenCount,
  };
  const panelSyncedAt = new Date().toISOString();
  const latestOfferUpdatedAt =
    safeOffers
      .map((offer) => toText(offer.updated_at))
      .find(Boolean) || null;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Curadoria Radar Smart 🛰️
          </h1>
          <p className="text-gray-500">
            Gere o inventário e a distribuição de ofertas no seu ecossistema.
          </p>
        </div>

        <div className="flex gap-4">
          <span className="rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-700">
            {activeCount} Ofertas Ativas
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">
            Última atualização: {formatSyncTime(panelSyncedAt)}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">
            Última oferta lida: {formatSyncTime(latestOfferUpdatedAt)}
          </span>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {marketplaceFilterOptions().map((option) => {
          const active = selectedMarketplace === option.value;
          const href =
            option.value === "all"
              ? "/admin/curadoria"
              : `/admin/curadoria?marketplace=${encodeURIComponent(option.value)}`;
          return (
            <Link
              key={option.value}
              href={href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                active
                  ? "bg-[#22223B] text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-[#9E6A18] hover:text-[#9E6A18]"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <HealthDashboard stats={stats} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {safeOffers.map((offer) => {
          const currentSlot = offersResponse.supportsSlots
            ? toText(offer.slot_type) || "best"
            : "best";
          const isActive = toText(offer.status) !== "inactive";
          const clickCount = offersResponse.supportsClicks ? resolveClicks(offer) : 0;
          const discountPct = computeDiscountPct(offer.price, offer.old_price);

          return (
            <div
              key={offer.id}
              className="group rounded-3xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-xl"
            >
              <div className="relative mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={offer.image_url || "/placeholder.svg"}
                  alt={offer.title || "Oferta"}
                  className="h-40 w-full object-contain mix-blend-multiply"
                />
                <div className="absolute right-0 top-0">
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${getSlotBadge(currentSlot)}`}
                  >
                    {currentSlot}
                  </span>
                </div>
              </div>

              <div className="mb-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getMarketplaceBadge((offer as OfferRow).marketplace ?? null).className}`}
                >
                  {getMarketplaceBadge((offer as OfferRow).marketplace ?? null).label}
                </span>
              </div>

              <h3 className="mb-3 h-10 line-clamp-2 text-sm font-bold text-gray-800 transition-colors group-hover:text-blue-600">
                {offer.title || "Oferta sem título"}
              </h3>

              <div className="mb-4 flex items-center justify-between rounded-2xl bg-gray-50 p-3">
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 line-through">
                    {toNumber(offer.old_price) > 0 ? formatBRL(toNumber(offer.old_price)) : "-"}
                  </span>
                  <span className="text-lg font-black text-green-600">
                    {formatBRL(toNumber(offer.price))}
                  </span>
                  <span className="mt-1 text-[11px] font-semibold text-[#9E6A18]">
                    {discountPct > 0 ? `${discountPct}% OFF` : "Sem desconto detectado"}
                  </span>
                </div>

                <div className="text-right">
                  <span className="block text-[10px] uppercase text-gray-400">Cliques</span>
                  <span className="font-bold text-gray-700">{clickCount} 🔥</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-gray-100 pt-2">
                <div className="flex gap-2">
                  <Link
                    href={`/admin/ofertas/nova?id=${offer.id}`}
                    className="flex-1 rounded-xl bg-blue-50 py-2 text-center text-[10px] font-bold text-blue-600 transition-colors hover:bg-blue-100"
                  >
                    EDITAR
                  </Link>

                  <form action={toggleOfferStatus} className="flex-1">
                    <input type="hidden" name="id" value={offer.id} />
                    <input
                      type="hidden"
                      name="next_status"
                      value={isActive ? "inactive" : "active"}
                    />
                    <button
                      type="submit"
                      className={`w-full rounded-xl py-2 text-[10px] font-bold transition-colors ${
                        isActive
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                      }`}
                    >
                      {isActive ? "PAUSAR" : "REATIVAR"}
                    </button>
                  </form>
                </div>

                {offersResponse.supportsSlots ? (
                  <form action={rotateOfferSlot}>
                    <input type="hidden" name="id" value={offer.id} />
                    <input type="hidden" name="current_slot" value={currentSlot} />
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-gray-900 py-2 text-[10px] font-bold text-white transition-all hover:bg-gray-800"
                    >
                      ALTERAR BLOCO NO SITE
                    </button>
                  </form>
                ) : (
                  <div className="w-full rounded-xl bg-gray-100 py-2 text-center text-[10px] font-bold text-gray-500">
                    BLOCO DO SITE INDISPONIVEL NESTE SCHEMA
                  </div>
                )}

                <CuradoriaCopyButton
                  offerId={offer.id}
                  title={offer.title || "Oferta Radar Smart"}
                  price={toNumber(offer.price)}
                />

                <form action={sendOfferToTelegram}>
                  <input type="hidden" name="id" value={offer.id} />
                  <input
                    type="hidden"
                    name="affiliate_url"
                    value={toText(offer.affiliate_url) || toText(offer.product_url)}
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-sky-500 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-sky-600"
                  >
                    Enviar para Telegram
                  </button>
                </form>

                {offer.product_url && (
                  <a
                    href={toText(offer.product_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl bg-yellow-400 py-3 text-center text-sm font-bold text-yellow-900 transition-colors hover:bg-yellow-500"
                  >
                    🔗 Gerar Link Afiliado ML
                  </a>
                )}

                <StoryGeneratorButton
                  title={offer.title || "Oferta Radar Smart"}
                  imageUrl={offer.image_url}
                  price={toNumber(offer.price)}
                  oldPrice={toNumber(offer.old_price)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



