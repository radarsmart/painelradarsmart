import { NextRequest, NextResponse } from "next/server";
import { salvarOferta, supabaseAdmin } from "@/lib/supabase";
import { classifyOfferCategory } from "@/lib/radar-sniper";
import { requireAdmin } from "@/lib/admin-auth";

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOfferPayload(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  const productUrl = String(body.product_url ?? "").trim();

  if (!title) throw new Error("Campo title obrigatorio");
  if (!productUrl) throw new Error("Campo product_url obrigatorio");

  const marketplace = String(body.marketplace ?? "outro").toLowerCase();
  const autoCategory = classifyOfferCategory(title);
  const category = String(body.category ?? autoCategory).trim() || autoCategory;
  const categorySlug = category.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const status = String(body.status ?? "active").toLowerCase();
  const curationsStatus =
    String(body.curations_status ?? "").trim() ||
    (status === "active" ? "approved" : "inbox");
  const price = toNumber(body.price);
  const oldPrice = toNumber(body.old_price ?? body.original_price);
  const discountPct =
    oldPrice && price && oldPrice > price
      ? Math.round(((oldPrice - price) / oldPrice) * 100)
      : toNumber(body.discount_pct) ?? 0;
  const expiresAtRaw = String(body.expires_at ?? "").trim();
  const expiresAtDate = expiresAtRaw ? new Date(expiresAtRaw) : null;
  const expiresAt =
    expiresAtDate && !Number.isNaN(expiresAtDate.getTime())
      ? expiresAtDate.toISOString()
      : null;
  const isFlash =
    typeof body.is_flash === "boolean" ? body.is_flash : false;
  const isFeatured =
    typeof body.is_featured === "boolean" ? body.is_featured : false;

  return {
    id: typeof body.id === "string" ? body.id : undefined,
    title,
    product_url: productUrl,
    affiliate_url: String(body.affiliate_url ?? productUrl).trim(),
    image_url: String(body.image_url ?? "").trim() || null,
    marketplace,
    platform: marketplace,
    category,
    category_name: category,
    category_slug: categorySlug,
    price: price ?? 0,
    old_price: oldPrice,
    original_price: oldPrice,
    discount_pct: discountPct,
    discount_percent: discountPct,
    external_offer_id:
      String(body.external_offer_id ?? "").trim() ||
      `${marketplace}:${productUrl}`,
    status,
    curations_status: curationsStatus,
    source: String(body.source ?? "manual_admin").toLowerCase(),
    currency: String(body.currency ?? "BRL").toUpperCase(),
    is_flash: isFlash,
    is_featured: isFeatured,
    expires_at: expiresAt,
    rating: toNumber(body.rating),
    review_count: toNumber(body.review_count),
    seller_name: String(body.seller_name ?? "").trim() || null,
    raw_data:
      typeof body.raw_data === "object" && body.raw_data !== null
        ? body.raw_data
        : {},
  };
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
    const body = (await req.json()) as Record<string, unknown>;
    const payload = normalizeOfferPayload(body);
    const { data, error } = await salvarOferta(payload);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ offer: data });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Erro interno" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const { id, ...updates } = (await req.json()) as Record<string, unknown>;
    if (!id) {
      return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
    }

    const normalizedUpdates: Record<string, unknown> = { ...updates };
    if (typeof normalizedUpdates.is_active === "boolean" && !normalizedUpdates.status) {
      normalizedUpdates.status = normalizedUpdates.is_active
        ? "active"
        : "inactive";
    }
    normalizedUpdates.updated_at = new Date().toISOString();

    let { data, error } = await supabaseAdmin
      .from("offers")
      .update(normalizedUpdates)
      .eq("id", id)
      .select()
      .single();

    // Compatibilidade com bancos onde "is_active" ainda nao existe.
    if (error && Object.prototype.hasOwnProperty.call(normalizedUpdates, "is_active")) {
      const fallbackUpdates = { ...normalizedUpdates };
      delete fallbackUpdates.is_active;
      const fallback = await supabaseAdmin
        .from("offers")
        .update(fallbackUpdates)
        .eq("id", id)
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ offer: data });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Erro interno" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) {
      return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("offers").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Erro interno" },
      { status: 500 },
    );
  }
}
