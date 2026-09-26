// ============================================================
// RADAR SMART - Edge Function: worker-process-offer (SECURE)
// Responsabilidade (orquestrador):
//  1) Valida oferta aprovada
//  2) Chama ai-smart-analyzer (score/compliance/insights)
//  3) Chama ai-copy-generator (ad_text)
//  4) Monta payload e insere jobs em public.post_queue (fila Ãºnica)
// SeguranÃ§a: exige header x-internal-key = INTERNAL_API_KEY
//
// ObservaÃ§Ãµes importantes:
// - post_queue.target_id deve apontar para post_targets.id (text)
// - worker-send-telegram/whatsapp consomem post_queue e resolvem target em post_targets
// - Para local: rode com --env-file supabase/functions/.env
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAffiliateUrl } from "./affiliate-builder.ts";
import { buildTrackedLink } from "./tracked-link.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // PROD: troque pelo domÃ­nio do Admin
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

// ----------------------------
// SECURITY GATE
// Aceita: x-internal-key OU JWT vÃ¡lido do Supabase (admin frontend)
// ----------------------------
function isAuthorized(req: Request): boolean {
  // 1) Chave interna (chamadas entre Edge Functions)
  const internalKey = Deno.env.get("INTERNAL_API_KEY");
  const provided = req.headers.get("x-internal-key");
  if (internalKey && provided === internalKey) return true;

  // 2) JWT do Supabase (chamadas do frontend admin via supabase.functions.invoke)
  //    O gateway do Supabase jÃ¡ valida o JWT antes de chegar aqui
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return !!token && token.length > 20;
}

// ----------------------------
// MAIN
// ----------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!isAuthorized(req)) return json(401, { error: "Unauthorized" });

  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const offer_id = body?.offer_id as string | undefined;

    // opcional: filtrar canais especÃ­ficos
    // ex: ["telegram"] ou ["telegram","whatsapp"]
    const channels = (body?.channels as string[] | undefined) ?? ["telegram"];
    const scheduleNow = body?.schedule_now === false ? false : true;
    // Auto-approve before queueing by default (backward-compatible with older frontends).
    // To disable explicitly, send: auto_approve_if_needed = false
    const autoApproveIfNeeded = body?.auto_approve_if_needed !== false;
    const forceAdminDispatch = body?.force_admin_dispatch === true;
    // Manual/repost flows may need a second queue row on the same UTC day.
    const allowRequeueSameDay = body?.allow_requeue_same_day === true;
    // Manual create/repost can skip heavy AI calls and use provided copy.
    const skipAi = body?.skip_ai === true;
    const adTextByChannel =
      body?.ad_text_by_channel && typeof body.ad_text_by_channel === "object"
        ? (body.ad_text_by_channel as Record<string, string | null | undefined>)
        : null;
    // opcional: agendar por canal (ISO string). Ex:
    // { telegram: "2026-02-09T15:30:00.000Z", whatsapp: "2026-02-09T15:45:00.000Z" }
    const schedule = (body?.schedule && typeof body.schedule === "object") ? (body.schedule as Record<string, string | null | undefined>) : null;

    if (!offer_id) return json(400, { error: "offer_id e obrigatorio" });
    if (!Array.isArray(channels) || channels.length === 0) return json(400, { error: "channels invalido" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const internalKey = Deno.env.get("INTERNAL_API_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Missing Supabase envs" });

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1) Buscar oferta + validaÃ§Ã£o de aprovaÃ§Ã£o
    const offerSelect =
      "id,item_id,title,brand,price,currency,original_price,discount_pct,product_url,affiliate_url,image_url,best_image_url,video_url,category,marketplace,seller_name,curations_status,status,ai_analysis,manual_copy,raw,short_code";

    let { data: offer, error: offerError } = await supabase
      .from("offers")
      .select(offerSelect)
      .eq("id", offer_id)
      .single();

    if (offerError || !offer) {
      return json(404, { error: "Oferta nao encontrada", details: offerError?.message ?? null });
    }

    if (String(offer.curations_status || "").toLowerCase() !== "approved" && autoApproveIfNeeded) {
      const { data: approvedOffer, error: approveErr } = await supabase
        .from("offers")
        .update({
          curations_status: "approved",
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", offer_id)
        .select(offerSelect)
        .single();

      if (!approveErr && approvedOffer) {
        offer = approvedOffer;
      }
    }

    if (
      String(offer.curations_status || "").toLowerCase() !== "approved" &&
      !forceAdminDispatch
    ) {
      return json(409, {
        error: "Oferta nao esta aprovada",
        curations_status: offer.curations_status ?? null,
        status: offer.status ?? null,
        auto_approve_if_needed: autoApproveIfNeeded,
      });
    }

    if (forceAdminDispatch && String(offer.curations_status || "").toLowerCase() !== "approved") {
      offer = {
        ...offer,
        curations_status: "approved",
        status: String(offer.status || "").toLowerCase() === "active" ? offer.status : "active",
      };
    }

    let workingOffer: any = { ...offer };
    let livePriceRefreshed = false;
    let livePriceRefreshError: string | null = null;

    // Best-effort live refresh before generating copy/queue:
    // keeps ad economics aligned with marketplace page at enqueue time.
    const refreshUrl =
      toNonEmptyString(workingOffer?.product_url) ??
      toNonEmptyString(workingOffer?.affiliate_url);
    if (refreshUrl) {
      try {
        const refreshed = await callFunction({
          supabaseUrl,
          fn: "extract-product-info",
          serviceRoleKey,
          internalKey,
          payload: {
            url: refreshUrl,
            force_item_id: toNonEmptyString(workingOffer?.item_id),
          },
        });

        const extracted = refreshed?.data ?? null;
        const refreshedPrice = toPositiveMoney(extracted?.price);
        if (refreshedPrice !== null) {
          const refreshedOriginalRaw = toPositiveMoney(extracted?.original_price);
          const refreshedOriginal =
            refreshedOriginalRaw !== null && refreshedOriginalRaw > refreshedPrice
              ? refreshedOriginalRaw
              : null;
          const refreshedDiscountRaw = Number(extracted?.discount_pct);
          const refreshedDiscount =
            Number.isFinite(refreshedDiscountRaw)
              ? Math.max(0, Math.min(100, Math.round(refreshedDiscountRaw)))
              : refreshedOriginal !== null
                ? Math.round((1 - refreshedPrice / refreshedOriginal) * 100)
                : null;

          workingOffer = {
            ...workingOffer,
            title: toNonEmptyString(extracted?.title) ?? workingOffer.title,
            price: refreshedPrice,
            original_price: refreshedOriginal,
            discount_pct: refreshedDiscount,
            image_url: toNonEmptyString(extracted?.image_url) ?? workingOffer.image_url,
            best_image_url:
              toNonEmptyString(extracted?.image_url) ?? workingOffer.best_image_url,
            product_url:
              toNonEmptyString(extracted?.product_url) ?? workingOffer.product_url,
          };

          await supabase
            .from("offers")
            .update({
              title: workingOffer.title,
              price: workingOffer.price,
              original_price: workingOffer.original_price,
              discount_pct: workingOffer.discount_pct,
              image_url: workingOffer.image_url,
              product_url: workingOffer.product_url,
              updated_at: new Date().toISOString(),
            })
            .eq("id", offer_id);

          if (workingOffer.price !== null && workingOffer.price !== undefined) {
            await supabase.from("offer_price_history").insert({
              offer_id,
              price: workingOffer.price,
              original_price: workingOffer.original_price ?? null,
              source: "worker-process-offer",
            });
          }

          livePriceRefreshed = true;
        }
      } catch (e) {
        livePriceRefreshError = (e as Error).message ?? String(e);
      }
    }

    // 2) Rodar IA: smart analyzer (score/compliance/insights)
    // 3) Rodar IA: copy generator (ad_text)
    // Nota: chamamos suas Edge Functions internas com:
    // - Authorization Bearer (service_role) para passar pelo gateway
    // - apikey (service_role) para padrÃ£o Supabase
    // - x-internal-key para seu gate
    let aiSmart: any = null;
    let aiCopy: any = null;
    let aiSmartError: string | null = null;
    let aiCopyError: string | null = null;

    if (!skipAi) {
      try {
        aiSmart = await callFunction({
          supabaseUrl,
          fn: "ai-smart-analyzer",
          serviceRoleKey,
          internalKey,
          payload: { offer_id },
        });
      } catch (e) {
        aiSmartError = (e as Error).message ?? String(e);
      }

      try {
        aiCopy = await callFunction({
          supabaseUrl,
          fn: "ai-copy-generator",
          serviceRoleKey,
          internalKey,
          payload: { offer_id, channel: channels[0] ?? "telegram" },
        });
      } catch (e) {
        aiCopyError = (e as Error).message ?? String(e);
      }
    }

    // 4) Buscar targets ativos por canal
    const { data: targets, error: targetsError } = await supabase
      .from("post_targets")
      .select("id,channel,name,external_id,is_active")
      .in("channel", channels)
      .eq("is_active", true);

    if (targetsError) {
      return json(500, { error: "Erro ao buscar targets", details: targetsError.message });
    }

    const activeTargets = (targets ?? []).filter((t) => t?.id && t?.channel);

    if (activeTargets.length === 0) {
      return json(409, { error: "Nenhum target ativo para os canais solicitados", channels });
    }

    // 5) Inserir jobs na fila (com dedupe por dia)
    // scheduled_at = null â†’ disponÃ­vel imediatamente para claim

    // Gera link de afiliado tagueado (Amazon, Magalu, ML, Awin, etc.)
    const affiliateLink = await buildAffiliateUrl(workingOffer, supabase);
    // Link rastreado radarsmart.com.br/go/{codigo} usado no botao/copy em vez
    // do link de afiliado cru — conta clique do grupo como sinal de interesse.
    const trackedLink = await buildTrackedLink(workingOffer, supabase);
    const offerAiText = toNonEmptyString((workingOffer as any)?.ai_analysis?.ad_text);
    const offerAiByChannel =
      (workingOffer as any)?.ai_analysis?.ad_text_by_channel &&
      typeof (workingOffer as any).ai_analysis.ad_text_by_channel === "object"
        ? ((workingOffer as any).ai_analysis.ad_text_by_channel as Record<
          string,
          string | null | undefined
        >)
        : null;
    const aiCopyText = toNonEmptyString(aiCopy?.ad_text);
    const manualCopyMap =
      (workingOffer as any)?.manual_copy &&
      typeof (workingOffer as any).manual_copy === "object"
        ? ((workingOffer as any).manual_copy as Record<string, string | null | undefined>)
        : null;

    let inserted = 0;
    let skipped = 0;
    const details: Array<{ channel: string; target_id: string; action: "inserted" | "skipped"; reason?: string }> = [];

    for (const t of activeTargets) {
      const channel = String(t.channel);
      const target_id = String(t.id);

      // If an explicit schedule was provided, apply it per-channel.
      // Otherwise, keep the default behavior (scheduled_at null = can be claimed immediately).
      const scheduledAt: string | null =
        schedule && typeof schedule[channel] === "string" && String(schedule[channel]).trim()
          ? String(schedule[channel]).trim()
          : (scheduleNow ? null : null);

      // Dedupe bucket should follow the scheduled day if provided (helps scheduled queues).
      let dedupeBucket = isoDateUTC(new Date()); // YYYY-MM-DD (UTC)
      if (scheduledAt) {
        const d = new Date(scheduledAt);
        if (!Number.isNaN(d.getTime())) dedupeBucket = isoDateUTC(d);
      }

      if (!allowRequeueSameDay) {
        // Dedupe simples: se jÃ¡ existe job do mesmo offer+channel+target no mesmo dia, pula
        const { data: exists, error: existsError } = await supabase
          .from("post_queue")
          .select("id,status")
          .eq("offer_id", offer_id)
          .eq("channel", channel)
          .eq("target_id", target_id)
          .eq("dedupe_bucket", dedupeBucket)
          .limit(1);

        if (existsError) {
          // se falhar dedupe, nÃ£o arrisca duplicar: pula
          skipped++;
          details.push({ channel, target_id, action: "skipped", reason: "dedupe_check_failed" });
          continue;
        }

        if (exists && exists.length > 0) {
          skipped++;
          details.push({ channel, target_id, action: "skipped", reason: "already_queued_today" });
          continue;
        }
      }

      const providedAdText =
        toNonEmptyString(adTextByChannel?.[channel]) ??
        (channel === "whatsapp"
          ? toNonEmptyString(adTextByChannel?.telegram)
          : null) ??
        (channel === "telegram"
          ? toNonEmptyString(adTextByChannel?.whatsapp)
          : null);

      const offerAiChannelText =
        toNonEmptyString(offerAiByChannel?.[channel]) ??
        (channel === "whatsapp"
          ? toNonEmptyString(offerAiByChannel?.telegram)
          : null) ??
        (channel === "telegram"
          ? toNonEmptyString(offerAiByChannel?.whatsapp)
          : null);

      const channelAdText =
        providedAdText ??
        toNonEmptyString(manualCopyMap?.[channel]) ??
        toNonEmptyString(manualCopyMap?.telegram) ??
        toNonEmptyString(manualCopyMap?.whatsapp) ??
        aiCopyText ??
        offerAiChannelText ??
        offerAiText ??
        buildFallbackAdText(workingOffer, channel);

      const payloadBase = buildQueuePayload(
        workingOffer,
        channelAdText,
        aiSmart?.analysis,
        affiliateLink,
        trackedLink,
      );

      // Some environments have a unique constraint on dedupe fields.
      // If manual requeue is allowed, retry with shifted dedupe_bucket.
      let insertedRow = false;
      let lastInsertError: { code?: string | null } | null = null;
      let finalInsertErrorReason = "";

      for (let attempt = 0; attempt < (allowRequeueSameDay ? 8 : 1); attempt++) {
        const bucketCandidate =
          attempt === 0 ? dedupeBucket : isoDateUTC(addDaysUtcDate(dedupeBucket, attempt));

        const queueRow: Record<string, unknown> = {
          offer_id,
          channel,
          target_id,
          status: "queued",
          attempt_count: 0,
          last_error: null,
          locked_until: null,
          sent_at: null,
          scheduled_at: scheduledAt,
          dedupe_bucket: bucketCandidate,
          payload: {
            ...payloadBase,
            // alvo/roteamento
            target: {
              id: t.id,
              name: t.name ?? null,
              external_id: t.external_id ?? null,
              channel,
            },
          },
        };

        const { error: insertError } = await supabase.from("post_queue").insert(queueRow);
        if (!insertError) {
          insertedRow = true;
          break;
        }

        lastInsertError = insertError as any;
        finalInsertErrorReason = `insert_failed:${insertError.code ?? "err"}`;

        if (!(allowRequeueSameDay && insertError.code === "23505")) {
          break;
        }
      }

      if (!insertedRow) {
        // Some DBs enforce unique(offer_id, channel, target_id).
        // In manual requeue mode, update/requeue the existing row instead of failing.
        if (allowRequeueSameDay && lastInsertError?.code === "23505") {
          const { data: existingRow } = await supabase
            .from("post_queue")
            .select("id")
            .eq("offer_id", offer_id)
            .eq("channel", channel)
            .eq("target_id", target_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingRow?.id) {
            const { error: requeueErr } = await supabase
              .from("post_queue")
              .update({
                status: "queued",
                attempt_count: 0,
                last_error: null,
                locked_until: null,
                sent_at: null,
                scheduled_at: scheduledAt,
                payload: {
                  ...payloadBase,
                  target: {
                    id: t.id,
                    name: t.name ?? null,
                    external_id: t.external_id ?? null,
                    channel,
                  },
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingRow.id);

            if (!requeueErr) {
              inserted++;
              details.push({ channel, target_id, action: "inserted" });
              continue;
            }
            skipped++;
            details.push({
              channel,
              target_id,
              action: "skipped",
              reason: `requeue_existing_failed:${requeueErr.code ?? "err"}`,
            });
            continue;
          }
        }

        skipped++;
        details.push({ channel, target_id, action: "skipped", reason: finalInsertErrorReason || `insert_failed:${lastInsertError?.code ?? "err"}` });
        continue;
      }

      inserted++;
      details.push({ channel, target_id, action: "inserted" });
    }

    return json(200, {
      success: true,
      offer_id,
      channels,
      targets_total: activeTargets.length,
      link_used:
        affiliateLink ||
        toNonEmptyString((workingOffer as any)?.affiliate_url) ||
        toNonEmptyString((workingOffer as any)?.product_url) ||
        null,
      inserted,
      skipped,
      // note: when schedule is provided, dedupe_bucket may differ per job
      latency_ms: Date.now() - startedAt,
      ai: {
        skipped: skipAi,
        smart_analyzer_ok: !!aiSmart,
        copy_ok: !!aiCopy,
        smart_analyzer_error: aiSmartError,
        copy_error: aiCopyError,
      },
      live_refresh: {
        attempted: !!refreshUrl,
        refreshed: livePriceRefreshed,
        error: livePriceRefreshError,
      },
      details,
    });
  } catch (err) {
    console.error("Erro no worker-process-offer:", err);
    return json(500, { error: "Erro interno", message: (err as Error).message ?? String(err) });
  }
});

// ============================================================
// Helpers
// ============================================================

async function callFunction(opts: {
  supabaseUrl: string;
  fn: string;
  serviceRoleKey: string;
  internalKey?: string | null;
  payload: Record<string, unknown>;
}) {
  const url = `${opts.supabaseUrl}/functions/v1/${opts.fn}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Passa no gateway (se verify_jwt estiver habilitado na funÃ§Ã£o)
      Authorization: `Bearer ${opts.serviceRoleKey}`,
      apikey: opts.serviceRoleKey,
    };
    if (opts.internalKey) {
      // Chave interna opcional (mantÃ©m compatibilidade com funÃ§Ãµes protegidas por x-internal-key).
      headers["x-internal-key"] = opts.internalKey;
    }

    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(opts.payload),
    });

    const text = await res.text().catch(() => "");
    const data = text ? safeJson(text) : null;

    if (!res.ok) {
      throw new Error(`callFunction ${opts.fn} failed: ${res.status} ${text}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildQueuePayload(
  offer: any,
  ad_text: string | null,
  analysis: any | undefined,
  affiliateLink?: string | null,
  trackedLink?: string | null,
) {
  const bestImage = offer.best_image_url || offer.image_url || null;
  const rawLink = affiliateLink || offer.affiliate_url || offer.product_url || null;
  const link = trackedLink || rawLink;
  // Se a copy (manual ou de IA) ja embute o link cru como texto, troca pelo
  // link rastreado tambem — nao so no botao.
  const finalAdText =
    ad_text && rawLink && link && rawLink !== link
      ? ad_text.split(rawLink).join(link)
      : ad_text;
  const videoUrl = offer.video_url || null;
  const econ = normalizeOfferEconomics(offer);
  const couponCode = extractCouponCodeFromRaw(offer?.raw);
  const pricingRaw =
    offer?.raw && typeof offer.raw === "object" && offer.raw !== null
      ? (offer.raw as any).pricing ?? {}
      : {};
  const marketplacePaymentCandidate = toPositiveMoney(
    pricingRaw?.marketplace_payment_price ??
      pricingRaw?.mercado_pago_price ??
      pricingRaw?.pix_price ??
      offer?.marketplace_payment_price ??
      offer?.pix_price,
  );
  const marketplacePaymentPrice =
    marketplacePaymentCandidate !== null &&
    econ.price !== null &&
    marketplacePaymentCandidate <= econ.price + 0.01
      ? marketplacePaymentCandidate
      : null;
  const marketplacePaymentDiscountPct = toPercentInt(
    pricingRaw?.marketplace_payment_discount_pct ??
      offer?.marketplace_payment_discount_pct ??
      null,
  );

  return {
    ad_text: finalAdText,
    video_url: videoUrl,
    coupon_code: couponCode,
    marketplace_payment_price: marketplacePaymentPrice,
    marketplace_payment_discount_pct: marketplacePaymentDiscountPct,
    offer: {
      id: offer.id,
      title: offer.title ?? null,
      brand: offer.brand ?? null,
      category: offer.category ?? null,
      marketplace: String(offer.marketplace ?? ""),
      seller_name: offer.seller_name ?? null,
      price: econ.price,
      original_price: econ.originalPrice,
      discount_pct: econ.discountPct,
      savings: econ.savings,
      coupon_code: couponCode,
      marketplace_payment_price: marketplacePaymentPrice,
      marketplace_payment_discount_pct: marketplacePaymentDiscountPct,
      currency: offer.currency ?? "BRL",
      image_url: bestImage,
      video_url: videoUrl,
      link,
      raw: offer?.raw ?? null,
    },
    analysis: analysis ?? null,
    buttons: link ? [{ text: "Comprar agora", url: link }] : [],
    created_at: new Date().toISOString(),
  };
}

function isoDateUTC(d: Date): string {
  // YYYY-MM-DD em UTC (bom para dedupe_bucket)
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysUtcDate(isoDate: string, days: number): Date {
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  const valid = Number.isFinite(base.getTime()) ? base : new Date();
  valid.setUTCDate(valid.getUTCDate() + Number(days || 0));
  return valid;
}

function toNonEmptyString(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

function buildFallbackAdText(offer: any, channel?: string): string {
  const title = toNonEmptyString(offer?.title) ?? "Oferta do dia";
  const econ = normalizeOfferEconomics(offer);
  const couponCode = extractCouponCodeFromRaw(offer?.raw);
  const couponPart = couponCode ? ` | Cupom: ${couponCode}` : "";

  const priceLine =
    econ.price !== null
      ? econ.originalPrice !== null && econ.discountPct !== null && econ.savings !== null
        ? `De R$ ${formatBRL(econ.originalPrice)} por R$ ${formatBRL(econ.price)} (${econ.discountPct}% OFF) | Economia de R$ ${formatBRL(econ.savings)}${couponPart}`
        : `Hoje por R$ ${formatBRL(econ.price)}${couponPart}`
      : "Condicao especial por tempo limitado";

  const actionLine = String(channel || "").toLowerCase() === "whatsapp"
    ? "⚡ Toque no link de compra e garanta agora."
    : "⚡ Toque em Comprar agora antes que acabe.";

  return [
    "🔥 Oportunidade fora do padrão!",
    `✨ ${title}`,
    priceLine,
    actionLine,
  ].join("\n");
}

function normalizeOfferEconomics(offer: any): {
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  savings: number | null;
} {
  const price = toPositiveMoney(offer?.price);
  const originalRaw = toPositiveMoney(offer?.original_price);
  const hasValidOriginal =
    price !== null &&
    originalRaw !== null &&
    originalRaw > price;

  const originalPrice = hasValidOriginal ? originalRaw : null;
  const discountPct =
    originalPrice !== null && price !== null
      ? Math.max(1, Math.round(((originalPrice - price) / originalPrice) * 100))
      : null;
  const savings =
    originalPrice !== null && price !== null
      ? roundMoney(originalPrice - price)
      : null;

  return { price, originalPrice, discountPct, savings };
}

function extractCouponCodeFromRaw(raw: any): string | null {
  const data = raw ?? {};
  const candidates = [
    data?.coupon_code,
    data?.coupon,
    data?.cupom,
    data?.promotion?.coupon_code,
    data?.promotion?.coupon,
    data?.deal?.coupon_code,
    data?.deal?.coupon,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value) continue;
    const compact = value.replace(/[^A-Za-z0-9_-]/g, "");
    if (compact.length >= 3 && compact.length <= 24) {
      return compact.toUpperCase();
    }
  }

  return null;
}

function toPositiveMoney(value: unknown): number | null {
  let s = String(value ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!s) return null;
  if (s.includes(".") && s.includes(",")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const raw = Number(s);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return roundMoney(raw);
}

function toPercentInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded <= 0 || rounded > 100) return null;
  return rounded;
}

function formatBRL(value: number): string {
  return roundMoney(value).toFixed(2).replace(".", ",");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
