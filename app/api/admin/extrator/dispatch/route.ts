import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { sanitizeMarketplaceUrl } from "@/lib/amazon";
import {
  dispatchLegacyOffer,
  type DistributionChannel,
} from "@/lib/distribution/legacy-dispatch";
import {
  classifyOfferCategory,
  computeDiscountPct,
  computeProfitPotential,
} from "@/lib/radar-sniper";
import { salvarOferta, supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Marketplace = "amazon" | "mercadolivre";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMarketplace(value: unknown): Marketplace | null {
  const normalized = toText(value).toLowerCase();
  if (normalized === "amazon" || normalized === "mercadolivre") {
    return normalized;
  }
  return null;
}

function normalizeChannels(value: unknown): DistributionChannel[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => toText(item).toLowerCase())
        .filter(
          (item): item is DistributionChannel => item === "telegram" || item === "whatsapp",
        ),
    ),
  );
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as {
      title?: unknown;
      price?: unknown;
      old_price?: unknown;
      image_url?: unknown;
      product_url?: unknown;
      affiliate_url?: unknown;
      marketplace?: unknown;
      raw_data?: unknown;
      copy_text?: unknown;
      score?: unknown;
      channels?: unknown;
    };

    const title = toText(body.title);
    const price = toNumber(body.price);
    const oldPrice = toNumber(body.old_price);
    const marketplace = normalizeMarketplace(body.marketplace);
    const productUrl = toText(body.product_url);
    const affiliateUrl = sanitizeMarketplaceUrl(
      toText(body.affiliate_url) || productUrl,
      marketplace ?? undefined,
      { fallbackUrl: productUrl },
    );
    const imageUrl = toText(body.image_url);
    const copyText = toText(body.copy_text);
    const channels = normalizeChannels(body.channels);

    if (!marketplace) {
      return NextResponse.json(
        { error: "marketplace invalido. Use amazon ou mercadolivre." },
        { status: 400 },
      );
    }

    if (!title || !productUrl || price <= 0) {
      return NextResponse.json(
        { error: "title, product_url e price sao obrigatorios para o despacho." },
        { status: 400 },
      );
    }

    const discountPct = computeDiscountPct(price, oldPrice, null);
    const score =
      toNumber(body.score) ||
      computeProfitPotential({
        title,
        marketplace,
        price,
        oldPrice,
        discountPct,
        raw: body.raw_data,
      });
    const category = classifyOfferCategory(title);
    const categorySlug = category
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    const externalOfferId = `${marketplace}:${productUrl}`;
    const existingOffer = await supabaseAdmin
      .from("offers")
      .select("id")
      .eq("external_offer_id", externalOfferId)
      .maybeSingle();

    if (existingOffer.error) {
      return NextResponse.json({ error: existingOffer.error.message }, { status: 500 });
    }

    const rawData =
      body.raw_data && typeof body.raw_data === "object" ? body.raw_data : {};
    const saveResult = await salvarOferta({
      id: existingOffer.data?.id,
      title,
      product_url: productUrl,
      affiliate_url: affiliateUrl,
      image_url: imageUrl || null,
      marketplace,
      platform: marketplace,
      category,
      category_name: category,
      category_slug: categorySlug,
      price,
      old_price: oldPrice || null,
      original_price: oldPrice || null,
      discount_pct: discountPct,
      discount_percent: discountPct,
      external_offer_id: externalOfferId,
      status: "active",
      curations_status: "approved",
      source: "manual_sniper",
      currency: "BRL",
      raw_data: rawData,
      score,
    });

    if (saveResult.error || !saveResult.data) {
      return NextResponse.json(
        { error: saveResult.error?.message ?? "Falha ao salvar oferta." },
        { status: 500 },
      );
    }

    if (!channels.length) {
      return NextResponse.json({
        success: true,
        offer_id: String(saveResult.data.id),
        message: "Oferta aprovada no Radar e pronta para a vitrine.",
      });
    }

    const copyByChannel =
      copyText && channels.length
        ? Object.fromEntries(channels.map((channel) => [channel, copyText]))
        : undefined;

    const dispatch = await dispatchLegacyOffer({
      offerId: String(saveResult.data.id),
      affiliateUrl,
      channels,
      copyByChannel,
      allowRequeueSameDay: false,
    });

    return NextResponse.json({
      success: true,
      offer_id: String(saveResult.data.id),
      message: "Oferta aprovada e enviada para o pipeline de distribuicao.",
      distribution: dispatch,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao despachar oferta do extrator.",
      },
      { status: 500 },
    );
  }
}
