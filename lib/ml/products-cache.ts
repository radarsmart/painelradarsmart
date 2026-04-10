import { getValidToken, supabaseAdmin } from "@/lib/supabase";

export type MlHubProduct = {
  id: string;
  title: string;
  price: number;
  thumbnail: string;
  permalink: string;
  category_id: string | null;
  sold_quantity: number | null;
  updated_at: string;
};

type MlCacheRow = MlHubProduct;

const ML_PARTNER_ID = "radarsmart";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractMlItemIdFromText(value: unknown): string | null {
  const match = toText(value).toUpperCase().match(/MLB-?\d{6,}/);
  return match ? match[0].replace("MLB-", "MLB") : null;
}

function withPartnerId(permalink: string): string {
  const raw = toText(permalink);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.searchParams.set("partner_id", ML_PARTNER_ID);
    return url.toString();
  } catch {
    return raw;
  }
}

function normalizeThumbnail(value: unknown): string {
  const raw = toText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  return raw;
}

function isStale(updatedAt: string | null | undefined): boolean {
  const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > SIX_HOURS_MS;
}

async function bootstrapCuratedMlIds(limit = 20): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("item_id,external_offer_id,product_url,source_url,marketplace,status")
    .eq("marketplace", "mercadolivre")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Falha ao buscar offers ML para seed: ${error.message}`);
  }

  const ids = new Set<string>();

  for (const row of data ?? []) {
    const candidates = [
      extractMlItemIdFromText((row as Record<string, unknown>).item_id),
      extractMlItemIdFromText((row as Record<string, unknown>).external_offer_id),
      extractMlItemIdFromText((row as Record<string, unknown>).product_url),
      extractMlItemIdFromText((row as Record<string, unknown>).source_url),
    ].filter(Boolean) as string[];

    for (const id of candidates) {
      ids.add(id);
      if (ids.size >= limit) return Array.from(ids);
    }
  }

  return Array.from(ids);
}

async function ensureSeededCache(limit = 20): Promise<string[]> {
  const existing = await supabaseAdmin
    .from("ml_products_cache")
    .select("id")
    .limit(limit);

  if (existing.error) {
    throw new Error(`Falha ao consultar ml_products_cache: ${existing.error.message}`);
  }

  const existingIds = (existing.data ?? [])
    .map((row) => extractMlItemIdFromText((row as Record<string, unknown>).id))
    .filter(Boolean) as string[];

  if (existingIds.length >= limit) {
    return existingIds.slice(0, limit);
  }

  const curatedIds = await bootstrapCuratedMlIds(limit);
  if (!curatedIds.length) {
    return [];
  }

  const rows = curatedIds.map((id) => ({
    id,
    title: "",
    price: 0,
    thumbnail: "",
    permalink: "",
    category_id: null,
    sold_quantity: 0,
    updated_at: new Date(0).toISOString(),
  }));

  const { error: upsertError } = await supabaseAdmin
    .from("ml_products_cache")
    .upsert(rows, { onConflict: "id" });

  if (upsertError) {
    throw new Error(`Falha ao popular ml_products_cache: ${upsertError.message}`);
  }

  return curatedIds;
}

async function fetchItemsByIds(ids: string[]): Promise<MlHubProduct[]> {
  if (!ids.length) return [];

  const token = await getValidToken();
  const results: MlHubProduct[] = [];

  // Timeout de 10 segundos para evitar travamento
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    for (let index = 0; index < ids.length; index += 20) {
      const batch = ids.slice(index, index + 20);
      const endpoint = `https://api.mercadolibre.com/items?ids=${encodeURIComponent(batch.join(","))}`;
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => [])) as Array<Record<string, unknown>>;
      if (!response.ok) {
        throw new Error(`Falha ao consultar /items?ids (HTTP ${response.status}).`);
      }

      for (const item of payload) {
        const body = (item.body ?? {}) as Record<string, unknown>;
        if (Number(item.code) !== 200) continue;

        const id = toText(body.id);
        const title = toText(body.title);
        const price = toNumber(body.price) ?? 0;
        const thumbnail = normalizeThumbnail(body.secure_thumbnail ?? body.thumbnail);
        const permalink = withPartnerId(toText(body.permalink));
        const category_id = toText(body.category_id) || null;
        const sold_quantity = toNumber(body.sold_quantity);

        if (!id || !title || !price || !permalink) continue;

        results.push({
          id,
          title,
          price,
          thumbnail,
          permalink,
          category_id,
          sold_quantity,
          updated_at: new Date().toISOString(),
        });
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  return results;
}

export async function refreshMlProductsCache(limit = 20): Promise<MlHubProduct[]> {
  const ids = await ensureSeededCache(Math.max(limit, 20));
  if (!ids.length) return [];

  const freshRows = await fetchItemsByIds(ids);
  if (!freshRows.length) return [];

  const { error } = await supabaseAdmin
    .from("ml_products_cache")
    .upsert(freshRows, { onConflict: "id" });

  if (error) {
    throw new Error(`Falha ao atualizar ml_products_cache: ${error.message}`);
  }

  return freshRows;
}

export async function getMlProductsFromCache(input?: {
  q?: string;
  limit?: number;
  sort?: string;
  categoryId?: string;
}): Promise<MlHubProduct[]> {
  const limit = Math.max(1, Math.min(Number(input?.limit ?? 10), 20));
  const sort = toText(input?.sort).toLowerCase();
  const q = toText(input?.q).toLowerCase();
  const categoryId = toText(input?.categoryId);

  let query = supabaseAdmin.from("ml_products_cache").select("*");

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (sort === "sold_quantity") {
    query = query.order("sold_quantity", { ascending: false, nullsFirst: false });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  query = query.limit(40);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao ler ml_products_cache: ${error.message}`);
  }

  const rows = (data ?? []) as MlCacheRow[];
  const needsRefresh = !rows.length || rows.some((row) => isStale(row.updated_at));

  let sourceRows = rows;
  if (needsRefresh) {
    try {
      const refreshed = await refreshMlProductsCache(limit);
      sourceRows = refreshed.length ? refreshed : rows;
    } catch (error) {
      // Se refresh falhar (timeout, erro, etc), usar cache existente
      console.warn("Falha ao atualizar ML cache, usando dados antigos:", error);
      sourceRows = rows;
    }
  }

  let filtered = sourceRows;
  if (q) {
    filtered = filtered.filter((row) => row.title.toLowerCase().includes(q));
  }

  if (sort === "sold_quantity") {
    filtered = [...filtered].sort(
      (a, b) => (b.sold_quantity ?? 0) - (a.sold_quantity ?? 0),
    );
  } else {
    filtered = [...filtered].sort(
      (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
  }

  return filtered.slice(0, limit);
}
