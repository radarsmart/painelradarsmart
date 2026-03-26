import Link from "next/link";
import { revalidatePath } from "next/cache";
import CuradoriaCopyButton from "@/components/admin/CuradoriaCopyButton";
import StoryGeneratorButton from "@/components/admin/StoryGeneratorButton";
import { supabaseAdmin } from "@/lib/supabase";
import { formatBRL } from "@/lib/formatters";

export const dynamic = "force-dynamic";

type OfferSlot = "hero" | "flash" | "best" | "comparator";

type OfferRow = {
  id: string;
  title: string | null;
  image_url: string | null;
  price: number | string | null;
  old_price: number | string | null;
  click_count: number | null;
  slot_type: OfferSlot | null;
  status: string | null;
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

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isArchivedOffer(row: HealthRow): boolean {
  return toText(row.status) === "archived" || toText(row.curations_status) === "archived";
}

function isBrokenOffer(row: HealthRow): boolean {
  return !toText(row.affiliate_url) && !toText(row.product_url);
}

function getSlotBadge(slot: string | null) {
  if (slot === "hero") {
    return "bg-purple-600 text-white";
  }
  if (slot === "flash") {
    return "bg-orange-500 text-white";
  }
  if (slot === "comparator") {
    return "bg-sky-500 text-white";
  }
  return "bg-gray-200 text-gray-700";
}

function getNextSlot(slot: string | null): OfferSlot {
  if (slot === "hero") return "flash";
  if (slot === "flash") return "best";
  if (slot === "best") return "comparator";
  return "hero";
}

function hasMissingColumnError(error: { message?: string | null } | null, column: string): boolean {
  const message = toText(error?.message).toLowerCase();
  return message.includes(column.toLowerCase());
}

async function fetchCuradoriaOffers(): Promise<OffersQueryResult> {
  const primaryResponse = await supabaseAdmin
    .from("offers")
    .select("id,title,image_url,price,old_price,click_count,slot_type,status")
    .order("click_count", { ascending: false })
    .limit(50);

  if (!primaryResponse.error) {
    return {
      data: ((primaryResponse.data ?? []) as OfferRow[]) ?? [],
      error: null,
      supportsSlots: true,
      supportsClicks: true,
    };
  }

  const supportsClicks = !hasMissingColumnError(primaryResponse.error, "click_count");
  const supportsSlots = !hasMissingColumnError(primaryResponse.error, "slot_type");

  const fallbackColumns = ["id", "title", "image_url", "price", "old_price", "status"];
  if (supportsClicks) fallbackColumns.push("click_count");
  if (supportsSlots) fallbackColumns.push("slot_type");

  let fallbackQuery = supabaseAdmin
    .from("offers")
    .select(fallbackColumns.join(","))
    .limit(50);

  if (supportsClicks) {
    fallbackQuery = fallbackQuery.order("click_count", { ascending: false });
  } else {
    fallbackQuery = fallbackQuery.order("created_at", { ascending: false });
  }

  const fallbackResponse = await fallbackQuery;
  if (fallbackResponse.error) {
    return {
      data: [],
      error: fallbackResponse.error,
      supportsSlots,
      supportsClicks,
    };
  }

  const rows = (fallbackResponse.data ?? []) as unknown as Array<Record<string, unknown>>;
  const normalized = rows.map(
    (offer) =>
      ({
        id: toText(offer.id),
        title: toText(offer.title) || null,
        image_url: toText(offer.image_url) || null,
        price: offer.price ?? null,
        old_price: offer.old_price ?? null,
        click_count: supportsClicks ? toNumber(offer.click_count) : null,
        slot_type: supportsSlots ? (toText(offer.slot_type) as OfferSlot | "") || null : null,
        status: toText(offer.status) || null,
      }) as OfferRow,
  );

  return {
    data: normalized,
    error: null,
    supportsSlots,
    supportsClicks,
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

function HealthDashboard({ stats }: { stats: HealthStats }) {
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Ofertas Ativas
        </span>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-black text-blue-600">{stats.active}</span>
          <span className="mb-1 text-xs font-bold text-green-500">↑ Saudavel</span>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
          Faxinadas (24h)
        </span>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-black text-orange-500">{stats.cleaned}</span>
          <span className="mb-1 text-xs font-medium text-gray-400">Automatico</span>
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

export default async function CuradoriaGeralPage() {
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
    return <div className="p-10 text-red-500">Erro ao carregar o banco de dados.</div>;
  }

  const safeOffers = offersResponse.data ?? [];
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Curadoria Radar Smart 🛰️
          </h1>
          <p className="text-gray-500">
            Gere o inventario e a distribuicao de ofertas no teu ecossistema.
          </p>
        </div>

        <div className="flex gap-4">
          <span className="rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-700">
            {activeCount} Ofertas Ativas
          </span>
        </div>
      </div>

      <HealthDashboard stats={stats} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {safeOffers.map((offer) => {
          const currentSlot = offersResponse.supportsSlots
            ? toText(offer.slot_type) || "best"
            : "best";
          const isActive = toText(offer.status) !== "inactive";
          const clickCount = offersResponse.supportsClicks ? toNumber(offer.click_count) : 0;

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

              <h3 className="mb-3 h-10 line-clamp-2 text-sm font-bold text-gray-800 transition-colors group-hover:text-blue-600">
                {offer.title || "Oferta sem titulo"}
              </h3>

              <div className="mb-4 flex items-center justify-between rounded-2xl bg-gray-50 p-3">
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 line-through">
                    {toNumber(offer.old_price) > 0 ? formatBRL(toNumber(offer.old_price)) : "-"}
                  </span>
                  <span className="text-lg font-black text-green-600">
                    {formatBRL(toNumber(offer.price))}
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
