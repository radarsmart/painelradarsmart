import { NextRequest, NextResponse } from "next/server";
import { salvarOferta, supabaseAdmin } from "@/lib/supabase";
import { classifyOfferCategory } from "@/lib/radar-sniper";
import { requireAdmin } from "@/lib/admin-auth";
import { OFFER_OPERATOR_ROLES } from "@/lib/admin-permissions";
import { normalizePaymentTerms } from "@/lib/offers/pricing";
const DEFAULT_OFFER_TTL_HOURS = 48;

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOfferPayload(body: Record<string, unknown>) {
  const now = new Date().toISOString();
  const title = String(body.title ?? "").trim();
  const productUrl = String(body.product_url ?? "").trim();
  const affiliateUrl = String(body.affiliate_url ?? "").trim();

  if (!title) throw new Error("Campo title obrigatorio");
  if (!productUrl) throw new Error("Campo product_url obrigatorio");
  if (!affiliateUrl) throw new Error("Campo affiliate_url obrigatorio");

  const marketplace = String(body.marketplace ?? "outro").toLowerCase();
  const autoCategory = classifyOfferCategory(title);
  const category = String(body.category ?? autoCategory).trim() || autoCategory;
  const categorySlug = category.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const status = String(body.status ?? "inactive").toLowerCase();
  const curationsStatus =
    String(body.curations_status ?? "").trim() ||
    (status === "active" ? "inbox" : "inbox");
  const price = toNumber(body.price);
  const oldPrice = toNumber(body.old_price ?? body.original_price);
  const discountPct =
    oldPrice && price && oldPrice > price
      ? Math.round(((oldPrice - price) / oldPrice) * 100)
      : toNumber(body.discount_pct) ?? 0;
  const expiresAtRaw = String(body.expires_at ?? "").trim();
  const expiresAtDate = expiresAtRaw ? new Date(expiresAtRaw) : null;
  const expiresAtDefault = new Date(
    Date.now() + DEFAULT_OFFER_TTL_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const expiresAt =
    expiresAtDate && !Number.isNaN(expiresAtDate.getTime())
      ? expiresAtDate.toISOString()
      : status === "active"
        ? expiresAtDefault
        : null;
  const isFlash =
    typeof body.is_flash === "boolean" ? body.is_flash : false;
  const isFeatured =
    typeof body.is_featured === "boolean" ? body.is_featured : false;
  const payment = normalizePaymentTerms({
    price: price ?? 0,
    regular_price: price ?? 0,
    pix_price: body.pix_price,
    cash_price: body.cash_price,
    card_price: body.card_price,
    shipping_cost: body.shipping_cost,
    installment_count: body.installment_count,
    installment_amount: body.installment_amount,
    installment_interest_free: body.installment_interest_free,
    payment_information_original: body.payment_information_original,
  });
  const hasCardInfo =
    toNumber(body.card_price) !== null ||
    Boolean(payment.installments && payment.installment_value);

  return {
    id: typeof body.id === "string" ? body.id : undefined,
    title,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
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
    published_at: status === "active" && curationsStatus === "approved" ? now : null,
    expires_at: expiresAt,
    rating: toNumber(body.rating),
    review_count: toNumber(body.review_count),
    seller_name: String(body.seller_name ?? "").trim() || null,
    pix_price: payment.pix_price,
    cash_price: payment.cash_price,
    card_price: hasCardInfo ? payment.card_price : null,
    shipping_cost: payment.shipping_cost,
    installment_count: payment.installments,
    installment_amount: payment.installment_value,
    installment_interest_free: payment.interest_free,
    payment_information_original: payment.payment_information_original,
    raw_data:
      typeof body.raw_data === "object" && body.raw_data !== null
        ? body.raw_data
        : {},
  };
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req, { allowRoles: OFFER_OPERATOR_ROLES });
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

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req, { allowRoles: OFFER_OPERATOR_ROLES });
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  const id = String(req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("offers")
    .select(
      "id,title,product_url,affiliate_url,image_url,marketplace,price,old_price,original_price,discount_pct,slot_type,status,curations_status,seller_name,rating,review_count,raw_data,pix_price,cash_price,card_price,shipping_cost,installment_count,installment_amount,installment_interest_free,payment_information_original,coupon_code,coupon_description",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Oferta nao encontrada" }, { status: 404 });
  }

  return NextResponse.json({ offer: data });
}

export async function PATCH(req: NextRequest) {
  const adminGuard = await requireAdmin(req, { allowRoles: OFFER_OPERATOR_ROLES });
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
    const now = new Date();
    const nowIso = now.toISOString();
    if (normalizedUpdates.status === "active" && !normalizedUpdates.expires_at) {
      normalizedUpdates.expires_at = new Date(
        now.getTime() + DEFAULT_OFFER_TTL_HOURS * 60 * 60 * 1000,
      ).toISOString();
    }
    if (normalizedUpdates.status === "active" && !normalizedUpdates.published_at) {
      normalizedUpdates.published_at = nowIso;
    }
    normalizedUpdates.updated_at = nowIso;

    const paymentKeys = [
      "price",
      "regular_price",
      "pix_price",
      "cash_price",
      "card_price",
      "shipping_cost",
      "installment_count",
      "installment_amount",
      "installment_interest_free",
      "payment_information_original",
    ];
    const touchesPayment = paymentKeys.some((key) =>
      Object.prototype.hasOwnProperty.call(normalizedUpdates, key),
    );
    if (touchesPayment) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("offers")
        .select("price,regular_price,pix_price,cash_price,card_price,shipping_cost,installment_count,installment_amount,installment_interest_free,payment_information_original")
        .eq("id", id)
        .maybeSingle();

      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }

      const mergedPayment = {
        ...(existing ?? {}),
        ...normalizedUpdates,
      };
      const referencePrice =
        toNumber(mergedPayment.price) ?? toNumber(mergedPayment.regular_price);
      if (referencePrice !== null && referencePrice > 0) {
        const normalizedPayment = normalizePaymentTerms({
          ...mergedPayment,
          price: referencePrice,
          regular_price: referencePrice,
        });
        const hasUpdatedCardInfo =
          toNumber(mergedPayment.card_price) !== null ||
          Boolean(normalizedPayment.installments && normalizedPayment.installment_value);

        normalizedUpdates.pix_price = normalizedPayment.pix_price;
        normalizedUpdates.cash_price = normalizedPayment.cash_price;
        normalizedUpdates.card_price = hasUpdatedCardInfo ? normalizedPayment.card_price : null;
        normalizedUpdates.shipping_cost = normalizedPayment.shipping_cost;
        normalizedUpdates.installment_count = normalizedPayment.installments;
        normalizedUpdates.installment_amount = normalizedPayment.installment_value;
        normalizedUpdates.installment_interest_free = normalizedPayment.interest_free;
        normalizedUpdates.payment_information_original = normalizedPayment.payment_information_original;
      }
    }

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
  const adminGuard = await requireAdmin(req, { allowRoles: OFFER_OPERATOR_ROLES });
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
