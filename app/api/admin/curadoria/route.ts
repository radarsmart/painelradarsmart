import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CuradoriaAction = "publish" | "publish_batch" | "archive" | "prepare_group";
type DestinationBlock = "flash" | "day" | "blog";

type OfferRow = {
  id: string;
  title: string | null;
  marketplace: string | null;
  image_url?: string | null;
  price: number | null;
  old_price: number | null;
  discount_pct: number | null;
  discount_percent: number | null;
  category?: string | null;
  category_name?: string | null;
  product_url: string | null;
  affiliate_url: string | null;
  raw_data?: unknown;
  manual_copy: unknown;
  status: string | null;
  curations_status: string | null;
};

const SELECT_OFFER_FIELDS =
  "id,title,marketplace,image_url,price,old_price,discount_pct,discount_percent,category,category_name,product_url,affiliate_url,raw_data,manual_copy,status,curations_status";

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeAction(value: unknown): CuradoriaAction | null {
  const action = String(value ?? "")
    .toLowerCase()
    .trim();
  if (
    action === "publish" ||
    action === "publish_batch" ||
    action === "archive" ||
    action === "prepare_group"
  ) {
    return action;
  }
  return null;
}

function normalizeDestinationBlock(value: unknown): DestinationBlock {
  const block = String(value ?? "")
    .toLowerCase()
    .trim();
  if (block === "flash" || block === "day" || block === "blog") return block;
  return "day";
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extractAmazonAsin(url: string): string | null {
  const normalized = url.toLowerCase();
  const patterns = [/\/dp\/([a-z0-9]{10})/i, /\/gp\/product\/([a-z0-9]{10})/i];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

function normalizeMercadoLivreUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.delete("matt_tool");
    return parsed.toString();
  } catch {
    return url;
  }
}

function resolveOfficialAffiliateUrl(offer: OfferRow): string {
  const marketplace = String(offer.marketplace ?? "")
    .toLowerCase()
    .trim();
  const productUrl =
    normalizeBaseUrl(offer.product_url) ?? normalizeBaseUrl(offer.affiliate_url) ?? "";
  const currentAffiliate = normalizeBaseUrl(offer.affiliate_url) ?? productUrl;

  if (!productUrl && !currentAffiliate) return "";

  if (marketplace.includes("amazon")) {
    const tag =
      process.env.FRANETO_AMAZON_AFFILIATE_TAG?.trim() ||
      process.env.AMAZON_AFFILIATE_TAG?.trim() ||
      process.env.AMAZON_STORE_ID?.trim() ||
      "radarsmart202-20";
    const base = productUrl || currentAffiliate;
    if (!tag) return base;

    const asin = extractAmazonAsin(base);
    if (asin) {
      return `https://www.amazon.com.br/dp/${asin}?tag=${encodeURIComponent(tag)}`;
    }

    try {
      const parsed = new URL(base);
      parsed.hash = "";
      parsed.searchParams.set("tag", tag);
      return parsed.toString();
    } catch {
      return `${base}${base.includes("?") ? "&" : "?"}tag=${encodeURIComponent(tag)}`;
    }
  }

  if (marketplace.includes("mercado")) {
    const mattId =
      process.env.FRANETO_ML_AFFILIATE_ID?.trim() ||
      process.env.ML_AFFILIATE_ID?.trim() ||
      "";
    const base = normalizeMercadoLivreUrl(productUrl || currentAffiliate);
    if (!mattId) return base;
    try {
      const parsed = new URL(base);
      parsed.searchParams.set("matt_tool", mattId);
      return parsed.toString();
    } catch {
      return `${base}${base.includes("?") ? "&" : "?"}matt_tool=${encodeURIComponent(mattId)}`;
    }
  }

  if (marketplace.includes("shopee")) {
    const prefix = process.env.FRANETO_SHOPEE_AFFILIATE_PREFIX?.trim() || "";
    const base = productUrl || currentAffiliate;
    if (prefix) return `${prefix}${encodeURIComponent(base)}`;
    return base;
  }

  const genericTemplate = process.env.FRANETO_DEFAULT_AFFILIATE_URL?.trim() || "";
  if (genericTemplate && genericTemplate.includes("{url}")) {
    return genericTemplate.replace("{url}", encodeURIComponent(productUrl || currentAffiliate));
  }

  return productUrl || currentAffiliate;
}

function formatBRL(value: number | null): string {
  if (value === null) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function buildAidaCopy(offer: OfferRow, affiliateUrl: string): string {
  const title = String(offer.title ?? "Oferta Radar Smart").trim();
  const price = toNumber(offer.price);
  const oldPrice = toNumber(offer.old_price);
  const discount =
    toNumber(offer.discount_percent) ??
    toNumber(offer.discount_pct) ??
    (price && oldPrice && oldPrice > price
      ? Math.round(((oldPrice - price) / oldPrice) * 100)
      : 0);

  const lines = [
    "ALERTA DE OFERTA IMPERDIVEL!",
    title,
    oldPrice && price && oldPrice > price ? `De: ${formatBRL(oldPrice)}` : "",
    `Por apenas: ${formatBRL(price)}`,
    discount > 0 ? `Desconto: ${discount}% OFF` : "",
    "Essa e uma oportunidade com alto potencial de giro e pode acabar rapido.",
    `Garanta agora: ${affiliateUrl}`,
  ];

  return lines.filter(Boolean).join("\n");
}

async function readOffer(offerId: string): Promise<OfferRow> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select(SELECT_OFFER_FIELDS)
    .eq("id", offerId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Oferta nao encontrada.");
  }

  return data as OfferRow;
}

async function readOffersByIds(offerIds: string[]): Promise<OfferRow[]> {
  if (!offerIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select(SELECT_OFFER_FIELDS)
    .in("id", offerIds);

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as OfferRow[];
}

function payloadByDestination(
  block: DestinationBlock,
  offer: OfferRow,
  officialAffiliateUrl: string,
) {
  const now = new Date().toISOString();
  const currentManualCopy = parseJsonObject(offer.manual_copy);
  const manualCopy = {
    ...currentManualCopy,
    destination_block: block,
    curated_at: now,
  };

  return {
    status: "active",
    curations_status: "approved",
    is_flash: block === "flash",
    is_featured: block === "day",
    affiliate_url: officialAffiliateUrl,
    manual_copy: manualCopy,
    updated_at: now,
  };
}

async function updateOfferWithFallback(
  offerId: string,
  updates: Record<string, unknown>,
) {
  const payload = { ...updates };
  let { data, error } = await supabaseAdmin
    .from("offers")
    .update(payload)
    .eq("id", offerId)
    .select(SELECT_OFFER_FIELDS)
    .single();

  if (
    error &&
    (error.message.includes("is_flash") || error.message.includes("is_featured"))
  ) {
    delete payload.is_flash;
    delete payload.is_featured;
    const fallback = await supabaseAdmin
      .from("offers")
      .update(payload)
      .eq("id", offerId)
      .select(SELECT_OFFER_FIELDS)
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  return data as OfferRow;
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const offerId = String(req.nextUrl.searchParams.get("offer_id") ?? "").trim();
    if (!offerId) {
      return NextResponse.json(
        { error: "offer_id obrigatorio." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("offers")
      .select(SELECT_OFFER_FIELDS)
      .eq("id", offerId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Oferta nao encontrada." },
        { status: 404 },
      );
    }

    const offer = data as OfferRow;
    return NextResponse.json({
      success: true,
      suggestion: {
        id: offer.id,
        title: offer.title,
        marketplace: offer.marketplace,
        image_url: offer.image_url ?? null,
        category: offer.category ?? offer.category_name ?? null,
        price: offer.price,
        old_price: offer.old_price,
        discount_pct: offer.discount_percent ?? offer.discount_pct ?? null,
        product_url: offer.product_url,
        affiliate_url: offer.affiliate_url,
        raw_data: offer.raw_data ?? {},
        status: offer.status,
        curations_status: offer.curations_status,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao carregar sugestao da curadoria.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const body = (await req.json()) as {
      action?: unknown;
      offer_id?: unknown;
      offer_ids?: unknown;
      destination_block?: unknown;
      affiliate_url?: unknown;
    };

    const action = normalizeAction(body.action);
    const offerId = String(body.offer_id ?? "").trim();
    const offerIds = Array.isArray(body.offer_ids)
      ? body.offer_ids.map((id) => String(id ?? "").trim()).filter(Boolean)
      : [];
    const destinationBlock = normalizeDestinationBlock(body.destination_block);
    const affiliateOverride = String(body.affiliate_url ?? "").trim();

    if (!action) {
      return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
    }

    if (action !== "publish_batch" && !offerId) {
      return NextResponse.json({ error: "offer_id obrigatorio." }, { status: 400 });
    }

    if (action === "publish" && !affiliateOverride) {
      return NextResponse.json(
        { error: "affiliate_url obrigatorio para aprovar oferta." },
        { status: 400 },
      );
    }

    if (action === "publish_batch") {
      if (!offerIds.length) {
        return NextResponse.json(
          { error: "offer_ids obrigatorio para publish_batch." },
          { status: 400 },
        );
      }

      const offers = await readOffersByIds(offerIds);
      const offerById = new Map(offers.map((offer) => [offer.id, offer]));
      const results: Array<{ id: string; ok: boolean; error?: string }> = [];

      for (const id of offerIds) {
        const offer = offerById.get(id);
        if (!offer) {
          results.push({ id, ok: false, error: "Oferta nao encontrada." });
          continue;
        }

        try {
          const officialAffiliateUrl =
            affiliateOverride || resolveOfficialAffiliateUrl(offer);
          const publishPayload = payloadByDestination(
            destinationBlock,
            offer,
            officialAffiliateUrl,
          );
          await updateOfferWithFallback(id, publishPayload);
          results.push({ id, ok: true });
        } catch (error) {
          results.push({
            id,
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Falha ao aprovar item.",
          });
        }
      }

      const approved = results.filter((result) => result.ok).length;
      const failed = results.length - approved;

      return NextResponse.json({
        success: failed === 0,
        action,
        destination_block: destinationBlock,
        approved_count: approved,
        failed_count: failed,
        results,
      });
    }

    const offer = await readOffer(offerId);
    const officialAffiliateUrl =
      affiliateOverride || resolveOfficialAffiliateUrl(offer);

    if (action === "prepare_group") {
      if (officialAffiliateUrl && officialAffiliateUrl !== offer.affiliate_url) {
        await updateOfferWithFallback(offerId, {
          affiliate_url: officialAffiliateUrl,
          updated_at: new Date().toISOString(),
        });
      }

      return NextResponse.json({
        success: true,
        action,
        offer_id: offerId,
        affiliate_url: officialAffiliateUrl,
        copy_text: buildAidaCopy(offer, officialAffiliateUrl),
      });
    }

    if (action === "archive") {
      const updated = await updateOfferWithFallback(offerId, {
        status: "inactive",
        curations_status: "archived",
        updated_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        action,
        offer: updated,
      });
    }

    const publishPayload = payloadByDestination(
      destinationBlock,
      offer,
      officialAffiliateUrl,
    );
    const updated = await updateOfferWithFallback(offerId, publishPayload);

    return NextResponse.json({
      success: true,
      action,
      destination_block: destinationBlock,
      affiliate_url: officialAffiliateUrl,
      offer: updated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao processar curadoria.",
      },
      { status: 500 },
    );
  }
}
