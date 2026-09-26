import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { CENTRAL_OFERTA_ROLE, OFFER_WORKFLOW_ROLES } from "@/lib/admin-permissions";
import { sanitizeMarketplaceUrl } from "@/lib/amazon";
import {
  dispatchLegacyOffer,
  type DistributionChannel,
} from "@/lib/distribution/legacy-dispatch";
import { buildSiteManualCopyOverride } from "@/lib/offers/site-visibility";
import {
  classifyOfferCategory,
  computeProfitPotential,
} from "@/lib/radar-sniper";
import { normalizePaymentTerms, resolveOfferPricing } from "@/lib/offers/pricing";
import { salvarOferta, supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Marketplace = "amazon" | "mercadolivre" | "shopee" | "lomadee" | "awin" | "tiktokshop" | "aliexpress";
const DEFAULT_OFFER_TTL_HOURS = 48;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMarketplace(value: unknown): Marketplace | null {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "amazon" ||
    normalized === "mercadolivre" ||
    normalized === "shopee" ||
    normalized === "lomadee" ||
    normalized === "awin" ||
    normalized === "tiktokshop" ||
    normalized === "aliexpress"
  ) {
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

function computeExpiresAt(hours = DEFAULT_OFFER_TTL_HOURS): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function getMissingColumnFromError(message: string): string | null {
  const singleQuoted = message.match(/Could not find the '([^']+)' column/i);
  if (singleQuoted?.[1]) return singleQuoted[1];

  const doubleQuoted = message.match(/column "([^"]+)"/i);
  if (doubleQuoted?.[1]) return doubleQuoted[1];

  return null;
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req, { allowRoles: OFFER_WORKFLOW_ROLES });
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }
  // Colaborador (central_oferta) so monta ofertas — nunca publica no site
  // nem dispara pros grupos, mesmo que a requisicao peca isso. A oferta
  // sempre entra como rascunho (status inactive / curations_status
  // channel_ready), disponivel pra um admin revisar e publicar depois.
  const isCollaborator = adminGuard.role === CENTRAL_OFERTA_ROLE;

  try {
    const body = (await req.json()) as {
      title?: unknown;
      price?: unknown;
      old_price?: unknown;
      original_price?: unknown;
      discount_pct?: unknown;
      discount_percent?: unknown;
      image_url?: unknown;
      product_url?: unknown;
      affiliate_url?: unknown;
      marketplace?: unknown;
      slot_type?: unknown;
      raw_data?: unknown;
      copy_text?: unknown;
      score?: unknown;
      channels?: unknown;
      hub_offer_id?: unknown;
      publish_to_site?: unknown;
      schedule_now?: unknown;
      pix_price?: unknown;
      cash_price?: unknown;
      card_price?: unknown;
      shipping_cost?: unknown;
      installment_count?: unknown;
      installment_amount?: unknown;
      installment_interest_free?: unknown;
      payment_information_original?: unknown;
      coupon_code?: unknown;
      coupon_description?: unknown;
    };
    const bodyRecord = body as Record<string, unknown>;
    const hasBodyField = (key: string) =>
      Object.prototype.hasOwnProperty.call(bodyRecord, key);

    const title = toText(body.title);
    const pricing = resolveOfferPricing({
      price: body.price,
      old_price: body.old_price,
      original_price: body.original_price,
      discount_pct: body.discount_pct,
      discount_percent: body.discount_percent,
    });
    const price = pricing.price;
    const oldPrice = pricing.oldPrice ?? 0;
    const marketplace = normalizeMarketplace(body.marketplace);
    const productUrl = toText(body.product_url);
    const manualAffiliateUrl = toText(body.affiliate_url);
    const affiliateUrl =
      marketplace === "shopee" || marketplace === "tiktokshop"
        ? manualAffiliateUrl || productUrl
        : manualAffiliateUrl ||
          sanitizeMarketplaceUrl(
            productUrl,
            marketplace ?? undefined,
            { fallbackUrl: productUrl },
          );
    const imageUrl = toText(body.image_url);
    const requestedChannels = isCollaborator ? [] : normalizeChannels(body.channels);
    const copyText = toText(body.copy_text);
    const slotType = toText(body.slot_type);
    const hubOfferId = toText(body.hub_offer_id);
    const publishToSite = isCollaborator ? false : Boolean(body.publish_to_site);
    const isSiteApproval = publishToSite;
    const scheduleNow = isCollaborator ? false : Boolean(body.schedule_now);

    if (!marketplace) {
      return NextResponse.json(
        { error: "marketplace invalido. Use amazon, mercadolivre, shopee, lomadee, awin, tiktokshop ou aliexpress." },
        { status: 400 },
      );
    }

    if (!title || !productUrl || price <= 0) {
      return NextResponse.json(
        { error: "title, product_url e price sao obrigatorios para o despacho." },
        { status: 400 },
      );
    }

    const validSlots = ["flash", "best", "comparator"];
    if (isSiteApproval && (!slotType || !validSlots.includes(slotType))) {
      return NextResponse.json(
        { error: `slot_type invalido. Use: ${validSlots.join(", ")}` },
        { status: 400 },
      );
    }

    const discountPct = pricing.discountPct;
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
      .select("id,manual_copy,status,curations_status,slot_type,published_at,pix_price,cash_price,card_price,shipping_cost,installment_count,installment_amount,installment_interest_free,payment_information_original,coupon_code,coupon_description")
      .eq("external_offer_id", externalOfferId)
      .maybeSingle();

    if (existingOffer.error) {
      return NextResponse.json({ error: existingOffer.error.message }, { status: 500 });
    }

    const existingOfferData = (existingOffer.data ?? {}) as Record<string, unknown>;
    const preserveNumberField = (key: string) =>
      hasBodyField(key) ? toNumber(bodyRecord[key]) || null : existingOfferData[key] ?? null;
    const preserveShippingCost = () =>
      hasBodyField("shipping_cost")
        ? body.shipping_cost === 0 || body.shipping_cost === "0"
          ? 0
          : toNumber(body.shipping_cost) || null
        : existingOfferData.shipping_cost ?? null;
    const preserveBooleanField = (key: string) =>
      hasBodyField(key)
        ? typeof bodyRecord[key] === "boolean"
          ? bodyRecord[key]
          : null
        : existingOfferData[key] ?? null;
    const preserveTextField = (key: string) =>
      hasBodyField(key) ? toText(bodyRecord[key]) || null : existingOfferData[key] ?? null;
    const preservedPaymentFields = {
      pix_price: preserveNumberField("pix_price"),
      cash_price: preserveNumberField("cash_price"),
      card_price: preserveNumberField("card_price"),
      shipping_cost: preserveShippingCost(),
      installment_count: preserveNumberField("installment_count"),
      installment_amount: preserveNumberField("installment_amount"),
      installment_interest_free: preserveBooleanField("installment_interest_free"),
      payment_information_original: preserveTextField("payment_information_original"),
    };
    const payment = normalizePaymentTerms({
      price,
      regular_price: price,
      ...preservedPaymentFields,
    });
    const hasCardInfo =
      preservedPaymentFields.card_price !== null ||
      Boolean(payment.installments && payment.installment_value);

    const rawData =
      body.raw_data && typeof body.raw_data === "object" ? body.raw_data : {};
    const now = new Date().toISOString();
    const shouldPublishOnSite = isSiteApproval;
    const existingStatus = toText(existingOffer.data?.status).toLowerCase();
    const existingCurationStatus = toText(
      existingOffer.data?.curations_status,
    ).toLowerCase();
    const preservePublishedSiteState =
      !shouldPublishOnSite &&
      existingStatus === "active" &&
      existingCurationStatus === "approved";
    const effectiveSlotType =
      slotType ||
      (preservePublishedSiteState
        ? toText(existingOffer.data?.slot_type).toLowerCase()
        : "");
    const offerStatus =
      shouldPublishOnSite || preservePublishedSiteState ? "active" : "inactive";
    const curationStatus = shouldPublishOnSite
      ? "approved"
      : preservePublishedSiteState
        ? "approved"
        : "channel_ready";
    const manualCopy = shouldPublishOnSite
      ? buildSiteManualCopyOverride(
          existingOffer.data?.manual_copy,
          (slotType as "flash" | "best" | "comparator") || "best",
          now,
        )
      : preservePublishedSiteState
        ? existingOffer.data?.manual_copy
        : undefined;

    const offerPayload: Record<string, unknown> = {
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
      regular_price: price,
      pix_price: payment.pix_price,
      cash_price: payment.cash_price,
      card_price: hasCardInfo ? payment.card_price : null,
      shipping_cost: payment.shipping_cost,
      installment_count: payment.installments,
      installment_amount: payment.installment_value,
      installment_interest_free: payment.interest_free,
      payment_information_original: payment.payment_information_original,
      coupon_code: preserveTextField("coupon_code"),
      coupon_description: preserveTextField("coupon_description"),
      old_price: oldPrice || null,
      original_price: oldPrice || null,
      discount_pct: discountPct,
      discount_percent: discountPct,
      external_offer_id: externalOfferId,
      slot_type: effectiveSlotType || null,
      is_flash: effectiveSlotType === "flash",
      is_featured: effectiveSlotType === "best",
      status: offerStatus,
      curations_status: curationStatus,
      published_at: shouldPublishOnSite
        ? now
        : preservePublishedSiteState
          ? existingOffer.data?.published_at || now
          : null,
      expires_at: computeExpiresAt(),
      source: "manual_sniper",
      currency: "BRL",
      raw_data: rawData,
      score,
      manual_copy: manualCopy,
    };

    const payloadToSave = { ...offerPayload };
    let saveResult = await salvarOferta(payloadToSave);

    while (saveResult.error) {
      const missingColumn = getMissingColumnFromError(saveResult.error.message);
      if (!missingColumn || !(missingColumn in payloadToSave)) {
        break;
      }

      delete payloadToSave[missingColumn];
      saveResult = await salvarOferta(payloadToSave);
    }

    if (saveResult.error || !saveResult.data) {
      return NextResponse.json(
        { error: saveResult.error?.message ?? "Falha ao salvar oferta." },
        { status: 500 },
      );
    }

    const offerId = String(saveResult.data.id);
    const { data: approvedOffer, error: approveError } = await supabaseAdmin
      .from("offers")
      .update({
        curations_status: curationStatus,
        status: offerStatus,
        manual_copy: manualCopy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", offerId)
      .select("id,curations_status,status")
      .single();

    if (approveError) {
      return NextResponse.json(
        { error: `Falha ao aprovar oferta antes da fila: ${approveError.message}` },
        { status: 500 },
      );
    }

    const effectiveCurationStatus = String(approvedOffer?.curations_status ?? "").toLowerCase();
    const approvalDidNotStick = shouldPublishOnSite && effectiveCurationStatus !== "approved";

    revalidatePath("/");
    revalidatePath("/ofertas");
    revalidatePath("/admin/curadoria");
    revalidatePath("/admin/amazon");

    if (publishToSite) {
      if (approvalDidNotStick) {
        return NextResponse.json(
          {
            error:
              "A oferta nao ficou com curations_status=approved antes de entrar na fila.",
            curations_status: approvedOffer?.curations_status ?? null,
          },
          { status: 409 },
        );
      }
    }

    if (requestedChannels.length === 0) {
      if (hubOfferId) {
        await supabaseAdmin
          .from("hub_offers")
          .update({
            affiliate_url_manual: affiliateUrl || null,
            selected_for_distribution: true,
            updated_at: now,
          })
          .eq("id", hubOfferId);
      }

      return NextResponse.json({
        success: true,
        offer_id: offerId,
        offer_status: offerStatus || "inactive",
        needs_review: false,
        distribution: { queued: 0, skipped: 0 },
        message: publishToSite
          ? "Oferta aprovada no site com sucesso."
          : "Oferta salva sem canais selecionados.",
      });
    }

    const copyByChannel = copyText
      ? requestedChannels.reduce<Partial<Record<DistributionChannel, string>>>(
          (acc, channel) => {
            acc[channel] = copyText;
            return acc;
          },
          {},
        )
      : undefined;

    let dispatch: Awaited<ReturnType<typeof dispatchLegacyOffer>>;
    try {
      dispatch = await dispatchLegacyOffer({
        offerId,
        affiliateUrl,
        channels: requestedChannels,
        copyByChannel,
        allowRequeueSameDay: true,
        scheduleNow,
      });
    } catch (dispatchError) {
      const message =
        dispatchError instanceof Error
          ? dispatchError.message
          : "Falha ao enfileirar distribuicao.";
      const isFlagError =
        message.toLowerCase().includes("feature flag") ||
        message.toLowerCase().includes("distribuicao desativada");
      return NextResponse.json(
        { error: message },
        { status: isFlagError ? 403 : 500 },
      );
    }

    if (hubOfferId) {
      await supabaseAdmin
        .from("hub_offers")
        .update({
          affiliate_url_manual: affiliateUrl || null,
          selected_for_distribution: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", hubOfferId);
    }

    return NextResponse.json({
      success: true,
      offer_id: offerId,
      message:
        dispatch.queued > 0
          ? publishToSite
            ? "Oferta aprovada no site e enviada para a fila dos canais."
            : "Oferta aprovada e enviada para o pipeline de distribuicao."
          : dispatch.skipped > 0
            ? "Oferta processada, mas nenhum novo job foi inserido na fila."
            : "Oferta processada com sucesso.",
      warning: approvalDidNotStick
        ? "Aprovacao editoral nao persistiu em offers, mas o enqueue administrativo foi executado pelo fallback."
        : null,
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
