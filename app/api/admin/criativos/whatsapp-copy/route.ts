import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { generateWhatsAppCopy, type OfferCopyInput } from "@/lib/copy/whatsapp-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeInput(body: Record<string, unknown>): OfferCopyInput {
  const title = toText(body.title);
  const affiliateUrl = toText(body.affiliate_url ?? body.affiliateUrl);
  const marketplace = toText(body.marketplace);
  const price = toNumber(body.price);

  if (!title) {
    throw new Error("title é obrigatório.");
  }

  if (!affiliateUrl) {
    throw new Error("affiliate_url é obrigatório.");
  }

  if (!marketplace) {
    throw new Error("marketplace é obrigatório.");
  }

  if (price === null || price <= 0) {
    throw new Error("price inválido.");
  }

  return {
    title,
    price,
    original_price: toNumber(body.original_price ?? body.originalPrice) ?? undefined,
    discount_pct: toNumber(body.discount_pct ?? body.discountPct) ?? undefined,
    coupon_code: toText(body.coupon_code ?? body.couponCode) || undefined,
    coupon_discount: toNumber(body.coupon_discount ?? body.couponDiscount) ?? undefined,
    affiliate_url: affiliateUrl,
    image_url: toText(body.image_url ?? body.imageUrl) || undefined,
    category: toText(body.category) || undefined,
    marketplace,
    rating: toNumber(body.rating) ?? undefined,
    reviews_count: toNumber(body.reviews_count ?? body.reviewsCount) ?? undefined,
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function buildFallbackCopy(offer: OfferCopyInput) {
  const hook = `🎯 Oferta em destaque para ${offer.title}!`;

  const originalPrice =
    typeof offer.original_price === "number" && offer.original_price > offer.price
      ? offer.original_price
      : null;
  const discountPct =
    typeof offer.discount_pct === "number" && offer.discount_pct > 0
      ? Math.round(offer.discount_pct)
      : originalPrice
        ? Math.round(((originalPrice - offer.price) / originalPrice) * 100)
        : null;

  const priceBlock = originalPrice
    ? [
        `💰 De: ~${formatCurrency(originalPrice)}~`,
        `✅ Por: *${formatCurrency(offer.price)}*`,
        `🔥 Desconto: ${discountPct}%`,
      ].join("\n")
    : `✅ Por: *${formatCurrency(offer.price)}*`;

  const base = [
    hook,
    "",
    `📦 *${offer.title}*`,
    "",
    priceBlock,
    "",
    "👍 Aproveite enquanto está disponível!",
    "Não perca essa oportunidade! Clique aqui:",
    offer.affiliate_url,
  ].join("\n");

  return {
    hook,
    short: base,
    medium: base,
    long: base,
    warning:
      "IA indisponível no momento. Copy gerada com fallback básico para você editar.",
  };
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const offer = normalizeInput(body);
    const copy = await generateWhatsAppCopy(offer);

    return NextResponse.json({
      short: copy.short,
      medium: copy.medium,
      long: copy.long,
      hook: copy.hook,
    });
  } catch (error) {
    try {
      const offer = normalizeInput(body);
      const fallback = buildFallbackCopy(offer);
      return NextResponse.json(fallback, { status: 200 });
    } catch {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Falha ao gerar copy do WhatsApp.",
        },
        { status: 500 },
      );
    }
  }
}
