import { supabaseAdmin } from "@/lib/supabase";
import {
  getDistributionFlags,
  type DistributionFlags,
} from "@/lib/distribution/feature-flags";
import { shouldEnforceOpportunityGate } from "@/lib/opportunity-engine/feature-flags";
import { evaluatePublishingGate } from "@/lib/opportunity-engine/publishing-gate-service";
import { buildOfferPresentation, resolveOfferPricing } from "@/lib/offers/pricing";
import { ensureOfferShortCode } from "@/lib/offers/short-link";

function resolveSiteBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured || "https://radarsmart.com.br").replace(/\/$/, "");
}

// Link rastreado (radarsmart.com.br/go/{codigo}) em vez do link de afiliado
// cru, pra cliques vindos dos grupos de WhatsApp/Telegram contarem como sinal
// de interesse no site (mesmo tracking usado pelos agentes automaticos).
async function buildTrackedLink(offerId: string, fallback: string): Promise<string> {
  try {
    const shortCode = await ensureOfferShortCode(supabaseAdmin, offerId);
    return shortCode ? `${resolveSiteBaseUrl()}/go/${shortCode}` : fallback;
  } catch {
    return fallback;
  }
}

function replaceLinkInCopy(copy: string, rawLink: string, trackedLink: string): string {
  if (!copy || !rawLink || rawLink === trackedLink) return copy;
  return copy.split(rawLink).join(trackedLink);
}

export type DistributionChannel = "telegram" | "whatsapp";

type WorkerProcessOfferResponse = {
  inserted?: number;
  skipped?: number;
  details?: Array<Record<string, unknown>>;
  success?: boolean;
  error?: string;
};

export type LegacyDispatchInput = {
  offerId: string;
  affiliateUrl?: string | null;
  channels?: DistributionChannel[];
  copyByChannel?: Partial<Record<DistributionChannel, string>>;
  allowRequeueSameDay?: boolean;
  scheduleNow?: boolean;
};

export type LegacyDispatchResult = {
  ok: boolean;
  channels: DistributionChannel[];
  queued: number;
  skipped: number;
  details: Array<Record<string, unknown>>;
  workerResponse: WorkerProcessOfferResponse;
  workerTriggers: Array<{
    channel: DistributionChannel;
    invoked: boolean;
    error?: string;
    response?: unknown;
  }>;
};

const DEFAULT_CHANNELS: DistributionChannel[] = ["telegram", "whatsapp"];
const DIRECT_QUEUE_OFFER_SELECT =
  "id,title,brand,category,marketplace,seller_name,price,regular_price,old_price,original_price,price_old,discount_pct,discount_percent,currency,image_url,best_image_url,affiliate_url,product_url,manual_copy,raw,coupon_code,coupon_description,pix_price,cash_price,card_price,shipping_cost,installment_count,installment_amount,installment_interest_free,payment_information_original";
const PUBLISHING_GATE_OFFER_SELECT =
  "id,title,status,price,affiliate_url,product_url,expires_at,pix_price,cash_price,card_price,shipping_cost,installment_count,installment_amount,installment_interest_free";
const DEFAULT_SEND_WINDOW_START_MINUTES = 7 * 60 + 30; // 07:30
const DEFAULT_SEND_WINDOW_END_MINUTES = 22 * 60 + 30; // 22:30
const DEFAULT_SEND_INTERVAL_MINUTES = 15;
const DEFAULT_SEND_TIMEZONE = "America/Sao_Paulo";

// Aceita "HH:MM" (ex.: "07:30"); qualquer coisa invalida cai no default.
function parseTimeToMinutes(value: string | undefined, fallback: number): number {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return hour * 60 + minute;
}

function normalizeChannels(
  channels: DistributionChannel[] | undefined,
): DistributionChannel[] {
  if (!channels?.length) return DEFAULT_CHANNELS;
  const deduped = Array.from(new Set(channels));
  return deduped.filter(
    (channel): channel is DistributionChannel =>
      channel === "telegram" || channel === "whatsapp",
  );
}

function normalizeCopyByChannel(
  copyByChannel: Partial<Record<DistributionChannel, string>> | undefined,
): Partial<Record<DistributionChannel, string>> {
  if (!copyByChannel) return {};
  const normalized: Partial<Record<DistributionChannel, string>> = {};

  for (const channel of ["telegram", "whatsapp"] as const) {
    const value = String(copyByChannel[channel] ?? "").trim();
    if (value) normalized[channel] = value;
  }

  return normalized;
}

function getConfiguredDestinationIds(
  channel: DistributionChannel,
  flags: DistributionFlags,
): string[] {
  if (channel === "telegram") {
    return flags.channels.telegram.chats;
  }
  return flags.channels.whatsapp.groups;
}

function getDistributionTargetsFromFlags(flags: DistributionFlags): Record<string, unknown> {
  return {
    telegram: {
      enabled: flags.channels.telegram.enabled,
      chat_ids: flags.channels.telegram.chats,
    },
    whatsapp: {
      enabled: flags.channels.whatsapp.enabled,
      group_ids: flags.channels.whatsapp.groups,
    },
    instagram: {
      enabled: flags.channels.instagram.enabled,
      post_as_reel: flags.channels.instagram.post_as_reel,
    },
  };
}

async function readInvokeError(error: unknown): Promise<string> {
  const err = error as {
    message?: string;
    context?: { status?: number; response?: Response };
  };
  const base = String(err?.message ?? "Falha ao invocar worker-process-offer");
  const status = err?.context?.status;
  const response = err?.context?.response;

  if (!response) {
    return status ? `${base} (HTTP ${status})` : base;
  }

  try {
    const text = await response.text();
    if (text) {
      return status
        ? `${base} (HTTP ${status}): ${text.slice(0, 500)}`
        : `${base}: ${text.slice(0, 500)}`;
    }
  } catch {
    // noop
  }

  return status ? `${base} (HTTP ${status})` : base;
}

function isApprovalGateError(error: unknown, errorMessage: string): boolean {
  const err = error as {
    context?: { status?: number };
  };

  if ((err?.context?.status ?? 0) === 409) {
    return true;
  }

  return errorMessage.includes("Oferta nao esta aprovada");
}

function formatBRL(value: number | null): string {
  if (!value || !Number.isFinite(value)) return "0,00";
  return value.toFixed(2).replace(".", ",");
}

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function buildChannelPaymentBlock(offer: Record<string, unknown>): string | null {
  const presentation = buildOfferPresentation({
    price: offer.price,
    regular_price: offer.regular_price ?? offer.price,
    pix_price: offer.pix_price,
    cash_price: offer.cash_price,
    card_price: offer.card_price,
    shipping_cost: offer.shipping_cost,
    installment_count: offer.installment_count,
    installment_amount: offer.installment_amount,
    installment_interest_free: offer.installment_interest_free,
    payment_information_original: offer.payment_information_original,
    currency: offer.currency,
  });

  const hasSpecificPaymentInfo =
    Boolean(offer.pix_price) ||
    Boolean(offer.cash_price) ||
    Boolean(offer.card_price) ||
    Boolean(offer.installment_count && offer.installment_amount) ||
    /pix|\d+\s*[x×]\s*(?:de\s*)?(?:r\$\s*)?\d/i.test(
      String(offer.payment_information_original ?? "").toLowerCase(),
    );

  const shouldBuildPaymentBlock = hasSpecificPaymentInfo || Boolean(presentation.payment_summary);
  if (!shouldBuildPaymentBlock || !presentation.payment_summary) return null;

  const lines = presentation.payment_summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  return lines.join("\n");
}

function copyAlreadyHasPaymentDetails(copy: string): boolean {
  const normalized = copy.toLowerCase();
  return (
    normalized.includes(" no pix") ||
    normalized.includes("pix") ||
    /\b\d{1,2}\s*[x×]\s*(?:de\s*)?(?:r\$\s*)?\d/i.test(normalized) ||
    normalized.includes("sem juros") ||
    normalized.includes("cartao") ||
    normalized.includes("cartão")
  );
}

function buildChannelCouponBlock(offer: Record<string, unknown>): string | null {
  const code = toText(offer.coupon_code);
  if (!code) return null;

  const description = toText(offer.coupon_description);
  return [`Cupom: ${code}`, description].filter(Boolean).join("\n");
}

function copyAlreadyHasCoupon(copy: string, offer: Record<string, unknown>): boolean {
  const normalized = copy.toLowerCase();
  const code = toText(offer.coupon_code)?.toLowerCase();
  return normalized.includes("cupom") || Boolean(code && normalized.includes(code));
}

function appendDetailsBlockBeforeLink(copy: string, detailsBlock: string): string {
  const trimmed = copy.trim();
  const urlMatches = Array.from(trimmed.matchAll(/https?:\/\/\S+/g));
  if (!urlMatches.length) {
    return `${trimmed}\n\n${detailsBlock}`.trim();
  }

  const last = urlMatches[urlMatches.length - 1];
  const index = last.index ?? -1;
  if (index < 0) return `${trimmed}\n\n${detailsBlock}`.trim();

  const before = trimmed.slice(0, index).trimEnd();
  const after = trimmed.slice(index).trimStart();
  return `${before}\n\n${detailsBlock}\n\n${after}`.trim();
}

function enrichCopyWithPaymentDetails(
  copy: string,
  offer: Record<string, unknown>,
): string {
  const paymentBlock = buildChannelPaymentBlock(offer);
  const couponBlock = buildChannelCouponBlock(offer);
  const details = [
    paymentBlock && !copyAlreadyHasPaymentDetails(copy) ? paymentBlock : null,
    couponBlock && !copyAlreadyHasCoupon(copy, offer) ? couponBlock : null,
  ].filter(Boolean);

  if (!details.length) return copy;
  return appendDetailsBlockBeforeLink(copy, details.join("\n"));
}

function buildFallbackAdText(offer: Record<string, unknown>, channel: DistributionChannel): string {
  const title = toText(offer.title) ?? "Oferta do dia";
  const { price, oldPrice, discountPct } = resolveOfferPricing(offer);
  const paymentSummary = buildChannelPaymentBlock(offer);

  const priceLine =
    paymentSummary
      ? paymentSummary
      : price > 0
      ? oldPrice !== null && oldPrice > price && discountPct > 0
        ? `De R$ ${formatBRL(oldPrice)} por R$ ${formatBRL(price)} (${Math.round(discountPct)}% OFF)`
        : `Hoje por R$ ${formatBRL(price)}`
      : "Condicao especial por tempo limitado";

  const actionLine =
    channel === "whatsapp"
      ? "Toque no link de compra e garanta agora."
      : "Toque em Comprar agora antes que acabe.";

  return ["OPORTUNIDADE DO DIA", title, priceLine, actionLine].join("\n");
}

function resolveChannelCopy(
  offer: Record<string, unknown>,
  channel: DistributionChannel,
  copyByChannel: Partial<Record<DistributionChannel, string>>,
): string {
  const manualCopy =
    offer.manual_copy && typeof offer.manual_copy === "object"
      ? (offer.manual_copy as Record<string, unknown>)
      : {};

  return (
    toText(copyByChannel[channel]) ??
    toText(manualCopy[channel]) ??
    toText(manualCopy.telegram) ??
    toText(manualCopy.whatsapp) ??
    buildFallbackAdText(offer, channel)
  );
}

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getTimeZoneParts(date: Date, timeZone = DEFAULT_SEND_TIMEZONE): TimeZoneParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

// Dia local (Brasilia por padrao) usado como "dedupe_bucket" — antes usava o
// dia em UTC, que vira de data as 21:00 (horario local) e nao a meia-noite,
// destoando da janela de envio e da cota diaria pensadas em horario local.
export function todayLocalDate(timeZone = DEFAULT_SEND_TIMEZONE, date = new Date()): string {
  const { year, month, day } = getTimeZoneParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone = DEFAULT_SEND_TIMEZONE): number {
  const local = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );

  return Math.round((asUtc - date.getTime()) / 60000);
}

function dateFromTimeZoneParts(
  parts: TimeZoneParts,
  timeZone = DEFAULT_SEND_TIMEZONE,
): Date {
  const baseUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  let adjusted = baseUtc;
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMinutes(new Date(adjusted), timeZone);
    const next = baseUtc - offset * 60 * 1000;
    if (Math.abs(next - adjusted) < 1000) {
      adjusted = next;
      break;
    }
    adjusted = next;
  }

  return new Date(adjusted);
}

function nextWindowStart(
  date: Date,
  timeZone = DEFAULT_SEND_TIMEZONE,
  startMinutes = DEFAULT_SEND_WINDOW_START_MINUTES,
): Date {
  const local = getTimeZoneParts(date, timeZone);
  const midday = dateFromTimeZoneParts(
    {
      year: local.year,
      month: local.month,
      day: local.day,
      hour: 12,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
  const tomorrowMidday = new Date(midday.getTime() + 24 * 60 * 60 * 1000);
  const tomorrow = getTimeZoneParts(tomorrowMidday, timeZone);

  return dateFromTimeZoneParts(
    {
      year: tomorrow.year,
      month: tomorrow.month,
      day: tomorrow.day,
      hour: Math.floor(startMinutes / 60),
      minute: startMinutes % 60,
      second: 0,
    },
    timeZone,
  );
}

// Ofertas cujo horario calculado passaria do fim da janela (ex.: 22:30) sao
// automaticamente empurradas pro inicio da proxima janela (ex.: 07:30 do dia
// seguinte), seguindo a fila — nunca mandadas fora do horario permitido.
function clampToSendWindow(
  date: Date,
  timeZone = DEFAULT_SEND_TIMEZONE,
  startMinutes = DEFAULT_SEND_WINDOW_START_MINUTES,
  endMinutes = DEFAULT_SEND_WINDOW_END_MINUTES,
): Date {
  const local = getTimeZoneParts(date, timeZone);
  const localMinutes = local.hour * 60 + local.minute;

  if (localMinutes < startMinutes) {
    return dateFromTimeZoneParts(
      {
        year: local.year,
        month: local.month,
        day: local.day,
        hour: Math.floor(startMinutes / 60),
        minute: startMinutes % 60,
        second: 0,
      },
      timeZone,
    );
  }

  if (localMinutes >= endMinutes) {
    return nextWindowStart(date, timeZone, startMinutes);
  }

  return date;
}

function alignToNextInterval(
  date: Date,
  timeZone = DEFAULT_SEND_TIMEZONE,
  intervalMinutes = DEFAULT_SEND_INTERVAL_MINUTES,
): Date {
  const local = getTimeZoneParts(date, timeZone);
  const remainder = local.minute % intervalMinutes;
  const deltaMinutes =
    remainder === 0 && local.second === 0
      ? intervalMinutes
      : intervalMinutes - remainder;

  const aligned = new Date(date.getTime() + deltaMinutes * 60 * 1000);
  const alignedLocal = getTimeZoneParts(aligned, timeZone);

  return dateFromTimeZoneParts(
    {
      year: alignedLocal.year,
      month: alignedLocal.month,
      day: alignedLocal.day,
      hour: alignedLocal.hour,
      minute: alignedLocal.minute,
      second: 0,
    },
    timeZone,
  );
}

export async function getNextScheduledAt(
  channel: DistributionChannel,
  flags?: DistributionFlags,
): Promise<string> {
  const timezone = flags?.scheduling.timezone || DEFAULT_SEND_TIMEZONE;
  const intervalMinutes =
    flags?.scheduling.delay_between_posts_minutes || DEFAULT_SEND_INTERVAL_MINUTES;
  const startMinutes = parseTimeToMinutes(
    flags?.scheduling.send_window_start,
    DEFAULT_SEND_WINDOW_START_MINUTES,
  );
  const endMinutes = parseTimeToMinutes(
    flags?.scheduling.send_window_end,
    DEFAULT_SEND_WINDOW_END_MINUTES,
  );

  const now = new Date();
  const { data, error } = await supabaseAdmin.rpc("get_last_scheduled_at", {
    p_channel: channel,
  });

  if (error) {
    throw new Error(`Falha ao calcular proximo horario de fila (${channel}): ${error.message}`);
  }

  const lastScheduled = data ? new Date(String(data)) : now;
  const base = lastScheduled.getTime() > now.getTime() ? lastScheduled : now;
  const windowBase = clampToSendWindow(base, timezone, startMinutes, endMinutes);
  const aligned = alignToNextInterval(windowBase, timezone, intervalMinutes);

  return aligned.toISOString();
}

async function buildChannelSchedule(
  channels: DistributionChannel[],
  flags: DistributionFlags,
  scheduleNow = false,
): Promise<Partial<Record<DistributionChannel, string>>> {
  if (scheduleNow) {
    const now = new Date().toISOString();
    return Object.fromEntries(channels.map((channel) => [channel, now])) as Partial<
      Record<DistributionChannel, string>
    >;
  }

  const scheduleEntries = await Promise.all(
    channels.map(
      async (channel) => [channel, await getNextScheduledAt(channel, flags)] as const,
    ),
  );

  return Object.fromEntries(scheduleEntries) as Partial<Record<DistributionChannel, string>>;
}

async function assertOpportunityGateApproved(offerId: string): Promise<void> {
  if (!shouldEnforceOpportunityGate()) return;

  const { data, error } = await supabaseAdmin
    .from("offers")
    .select(PUBLISHING_GATE_OFFER_SELECT)
    .eq("id", offerId)
    .single();

  if (error || !data) {
    throw new Error(`Falha ao carregar oferta para Publishing Gate: ${error?.message ?? "nao encontrada"}`);
  }

  const gate = evaluatePublishingGate(data as Record<string, unknown>);
  console.info("[OpportunityEngine] publishing_gate", {
    offer_id: offerId,
    status: gate.status,
    reasons: gate.reasons,
    warnings: gate.warnings,
  });

  if (gate.status !== "APPROVED") {
    throw new Error(`Publishing Gate bloqueou a oferta: ${[...gate.reasons, ...gate.warnings].join(" | ")}`);
  }
}

async function queueDirectlyOnPostQueue(input: {
  offerId: string;
  channels: DistributionChannel[];
  copyByChannel: Partial<Record<DistributionChannel, string>>;
  flags: DistributionFlags;
  affiliateUrl?: string | null;
  allowRequeueSameDay: boolean;
  scheduleNow?: boolean;
}): Promise<LegacyDispatchResult> {
  const { data: offer, error: offerError } = await supabaseAdmin
    .from("offers")
    .select(DIRECT_QUEUE_OFFER_SELECT)
    .eq("id", input.offerId)
    .single();

  if (offerError || !offer) {
    throw new Error(
      `Falha ao carregar oferta para fila direta: ${offerError?.message ?? "nao encontrada"}`,
    );
  }

  const { data: targets, error: targetsError } = await supabaseAdmin
    .from("post_targets")
    .select("id,channel,name,external_id,is_active")
    .in("channel", input.channels)
    .eq("is_active", true);

  if (targetsError) {
    throw new Error(`Falha ao carregar post_targets ativos: ${targetsError.message}`);
  }

  const activeTargetsUnfiltered = (targets ?? []).filter(
    (target) => target?.id && target?.channel && target?.is_active,
  );
  const activeTargets = activeTargetsUnfiltered.filter((target) => {
    const channel = target.channel as DistributionChannel;
    const configuredIds = getConfiguredDestinationIds(channel, input.flags);
    if (!configuredIds.length) return true;
    return configuredIds.includes(String(target.external_id ?? "").trim());
  });
  if (!activeTargets.length) {
    throw new Error("Nenhum target ativo encontrado para os canais selecionados.");
  }

  const channelSchedule = await buildChannelSchedule(
    input.channels,
    input.flags,
    input.scheduleNow === true,
  );

  const details: Array<Record<string, unknown>> = [];
  let queued = 0;
  let skipped = 0;
  const rawLink =
    toText(input.affiliateUrl) ??
    toText(offer.affiliate_url) ??
    toText(offer.product_url) ??
    "";
  const link = await buildTrackedLink(input.offerId, rawLink);
  const pricing = resolveOfferPricing(offer as Record<string, unknown>);

  for (const target of activeTargets) {
    const channel = target.channel as DistributionChannel;
    const scheduledAt = channelSchedule[channel] ?? null;
    let dedupeBucket = todayLocalDate();
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (!Number.isNaN(scheduledDate.getTime())) {
        dedupeBucket = todayLocalDate(DEFAULT_SEND_TIMEZONE, scheduledDate);
      }
    }

    const maxPostsPerDay = Number(input.flags.scheduling.max_posts_per_day ?? 0);
    if (maxPostsPerDay > 0) {
      const { count: queuedForDay, error: countError } = await supabaseAdmin
        .from("post_queue")
        .select("id", { count: "exact", head: true })
        .eq("channel", channel)
        .eq("dedupe_bucket", dedupeBucket)
        .in("status", ["queued", "processing", "sent"]);
      if (countError) {
        throw new Error(
          `Falha ao validar limite diario de fila (${channel}): ${countError.message}`,
        );
      }
      if ((queuedForDay ?? 0) >= maxPostsPerDay) {
        skipped += 1;
        details.push({
          channel,
          target_id: target.id,
          action: "skipped",
          reason: "max_posts_per_day_reached",
        });
        continue;
      }
    }

    const ad_text = enrichCopyWithPaymentDetails(
      replaceLinkInCopy(
        resolveChannelCopy(offer as Record<string, unknown>, channel, input.copyByChannel),
        rawLink,
        link,
      ),
      offer as Record<string, unknown>,
    );

    const payload = {
      ad_text,
      offer: {
        id: offer.id,
        title: offer.title ?? null,
        brand: offer.brand ?? null,
        category: offer.category ?? null,
        marketplace: offer.marketplace ?? null,
        seller_name: offer.seller_name ?? null,
        price: pricing.price > 0 ? pricing.price : offer.price ?? null,
        pix_price: offer.pix_price ?? null,
        cash_price: offer.cash_price ?? null,
        card_price: offer.card_price ?? null,
        shipping_cost: offer.shipping_cost ?? null,
        installment_count: offer.installment_count ?? null,
        installment_amount: offer.installment_amount ?? null,
        installment_interest_free: offer.installment_interest_free ?? null,
        original_price: pricing.oldPrice ?? offer.original_price ?? offer.old_price ?? null,
        discount_pct:
          pricing.discountPct > 0
            ? pricing.discountPct
            : offer.discount_pct ?? offer.discount_percent ?? null,
        currency: offer.currency ?? "BRL",
        image_url: offer.best_image_url ?? offer.image_url ?? null,
        video_url: null,
        link,
        coupon_code: offer.coupon_code ?? null,
        coupon_description: offer.coupon_description ?? null,
        raw: offer.raw ?? null,
      },
      analysis: null,
      buttons: link ? [{ text: "Comprar agora", url: link }] : [],
      target: {
        id: target.id,
        name: target.name ?? null,
        external_id: target.external_id ?? null,
        channel,
      },
      created_at: new Date().toISOString(),
    };

    if (!input.allowRequeueSameDay) {
      const { data: exists, error: existsError } = await supabaseAdmin
        .from("post_queue")
        .select("id")
        .eq("offer_id", input.offerId)
        .eq("channel", channel)
        .eq("target_id", target.id)
        .eq("dedupe_bucket", dedupeBucket)
        .limit(1);

      if (existsError) {
        throw new Error(`Falha ao verificar dedupe da fila: ${existsError.message}`);
      }

      if ((exists ?? []).length > 0) {
        skipped += 1;
        details.push({ channel, target_id: target.id, action: "skipped", reason: "already_queued_today" });
        continue;
      }
    }

    const queueRow = {
      offer_id: input.offerId,
      channel,
      target_id: target.id,
      status: "queued",
      attempt_count: 0,
      last_error: null,
      locked_until: null,
      sent_at: null,
      scheduled_at: scheduledAt,
      dedupe_bucket: dedupeBucket,
      payload,
    };

    const { error: insertError } = await supabaseAdmin.from("post_queue").insert(queueRow);
    if (insertError) {
      const isDuplicate = insertError.code === "23505";
      if (isDuplicate && input.allowRequeueSameDay) {
        const { data: existingRow } = await supabaseAdmin
          .from("post_queue")
          .select("id")
          .eq("offer_id", input.offerId)
          .eq("channel", channel)
          .eq("target_id", target.id)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingRow?.id) {
          const { error: requeueError } = await supabaseAdmin
            .from("post_queue")
            .update({
              status: "queued",
              attempt_count: 0,
              last_error: null,
              locked_until: null,
              sent_at: null,
              scheduled_at: scheduledAt,
              payload,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingRow.id);

          if (!requeueError) {
            queued += 1;
            details.push({ channel, target_id: target.id, action: "inserted", mode: "requeue_existing" });
            continue;
          }
        }
      }

      throw new Error(`Falha ao inserir na post_queue (${channel}): ${insertError.message}`);
    }

    queued += 1;
    details.push({ channel, target_id: target.id, action: "inserted", mode: "direct_queue" });
  }

  const workerTriggers: LegacyDispatchResult["workerTriggers"] = [];
  for (const channel of input.channels) {
    workerTriggers.push({
      channel,
      invoked: false,
      response: {
        mode: "scheduled_queue",
        scheduled_at: channelSchedule[channel] ?? null,
      },
    });
  }

  return {
    ok: true,
    channels: input.channels,
    queued,
    skipped,
    details,
    workerResponse: {
      success: true,
      inserted: queued,
      skipped,
      details,
    },
    workerTriggers,
  };
}

export type DispatchToTargetsInput = {
  offerId: string;
  targetIds: string[];
  copyByChannel: Partial<Record<DistributionChannel, string>>;
  agentId: string;
  affiliateUrl?: string | null;
};

export type DispatchToTargetsResult = {
  ok: boolean;
  queued: number;
  skipped: number;
  details: Array<Record<string, unknown>>;
};

export async function dispatchToSpecificTargets(
  input: DispatchToTargetsInput,
): Promise<DispatchToTargetsResult> {
  const flags = await getDistributionFlags();
  if (!flags.distribution_enabled) {
    throw new Error(
      "Distribuicao desativada via feature flag. Ative em /api/admin/distribution/flags.",
    );
  }

  const targetIds = Array.from(new Set(input.targetIds.filter(Boolean)));
  if (!targetIds.length) {
    throw new Error("Nenhum destino informado para o despacho do agente.");
  }

  await assertOpportunityGateApproved(input.offerId);

  const { data: offer, error: offerError } = await supabaseAdmin
    .from("offers")
    .select(DIRECT_QUEUE_OFFER_SELECT)
    .eq("id", input.offerId)
    .single();

  if (offerError || !offer) {
    throw new Error(
      `Falha ao carregar oferta para despacho do agente: ${offerError?.message ?? "nao encontrada"}`,
    );
  }

  const { data: targets, error: targetsError } = await supabaseAdmin
    .from("post_targets")
    .select("id,channel,name,external_id,is_active")
    .in("id", targetIds)
    .eq("is_active", true);

  if (targetsError) {
    throw new Error(`Falha ao carregar destinos do agente: ${targetsError.message}`);
  }

  const activeTargets = (targets ?? []).filter((target) => target?.id && target?.channel);
  if (!activeTargets.length) {
    throw new Error("Nenhum destino ativo encontrado para os grupos selecionados no agente.");
  }

  const rawLink =
    toText(input.affiliateUrl) ?? toText(offer.affiliate_url) ?? toText(offer.product_url) ?? "";
  const link = await buildTrackedLink(input.offerId, rawLink);
  const pricing = resolveOfferPricing(offer as Record<string, unknown>);
  const dedupeBucket = todayLocalDate();
  const nowIso = new Date().toISOString();

  const details: Array<Record<string, unknown>> = [];
  let queued = 0;
  let skipped = 0;

  for (const target of activeTargets) {
    const channel = target.channel as DistributionChannel;
    const adText = toText(input.copyByChannel[channel]);

    if (!adText) {
      skipped += 1;
      details.push({
        channel,
        target_id: target.id,
        action: "skipped",
        reason: "missing_copy_for_channel",
      });
      continue;
    }

    const { data: exists, error: existsError } = await supabaseAdmin
      .from("post_queue")
      .select("id")
      .eq("offer_id", input.offerId)
      .eq("channel", channel)
      .eq("target_id", target.id)
      .eq("dedupe_bucket", dedupeBucket)
      .limit(1);

    if (existsError) {
      throw new Error(`Falha ao verificar duplicidade na fila: ${existsError.message}`);
    }

    if ((exists ?? []).length > 0) {
      skipped += 1;
      details.push({
        channel,
        target_id: target.id,
        action: "skipped",
        reason: "already_queued_today",
      });
      continue;
    }

    const payload = {
      ad_text: enrichCopyWithPaymentDetails(
        replaceLinkInCopy(adText, rawLink, link),
        offer as Record<string, unknown>,
      ),
      offer: {
        id: offer.id,
        title: offer.title ?? null,
        brand: offer.brand ?? null,
        category: offer.category ?? null,
        marketplace: offer.marketplace ?? null,
        seller_name: offer.seller_name ?? null,
        price: pricing.price > 0 ? pricing.price : offer.price ?? null,
        pix_price: offer.pix_price ?? null,
        cash_price: offer.cash_price ?? null,
        card_price: offer.card_price ?? null,
        shipping_cost: offer.shipping_cost ?? null,
        installment_count: offer.installment_count ?? null,
        installment_amount: offer.installment_amount ?? null,
        installment_interest_free: offer.installment_interest_free ?? null,
        original_price: pricing.oldPrice ?? offer.original_price ?? offer.old_price ?? null,
        discount_pct:
          pricing.discountPct > 0
            ? pricing.discountPct
            : offer.discount_pct ?? offer.discount_percent ?? null,
        currency: offer.currency ?? "BRL",
        image_url: offer.best_image_url ?? offer.image_url ?? null,
        video_url: null,
        link,
        coupon_code: offer.coupon_code ?? null,
        coupon_description: offer.coupon_description ?? null,
        raw: offer.raw ?? null,
      },
      analysis: null,
      buttons: link ? [{ text: "Comprar agora", url: link }] : [],
      target: {
        id: target.id,
        name: target.name ?? null,
        external_id: target.external_id ?? null,
        channel,
      },
      created_at: nowIso,
    };

    const { error: insertError } = await supabaseAdmin.from("post_queue").insert({
      offer_id: input.offerId,
      channel,
      target_id: target.id,
      agent_id: input.agentId,
      status: "queued",
      attempt_count: 0,
      last_error: null,
      locked_until: null,
      sent_at: null,
      scheduled_at: nowIso,
      dedupe_bucket: dedupeBucket,
      payload,
    });

    if (insertError) {
      throw new Error(`Falha ao inserir na post_queue (${channel}): ${insertError.message}`);
    }

    queued += 1;
    details.push({ channel, target_id: target.id, action: "inserted" });
  }

  return { ok: true, queued, skipped, details };
}

export async function dispatchLegacyOffer(
  input: LegacyDispatchInput,
): Promise<LegacyDispatchResult> {
  const flags = await getDistributionFlags();
  if (!flags.distribution_enabled) {
    throw new Error(
      "Distribuicao desativada via feature flag. Ative em /api/admin/distribution/flags.",
    );
  }

  const offerId = String(input.offerId ?? "").trim();
  if (!offerId) {
    throw new Error("offerId e obrigatorio para distribuicao.");
  }

  const requestedChannels = normalizeChannels(input.channels);
  if (!requestedChannels.length) {
    throw new Error("Nenhum canal valido selecionado para distribuicao.");
  }
  const channels = requestedChannels.filter((channel) => {
    if (channel === "telegram") return flags.channels.telegram.enabled;
    if (channel === "whatsapp") return flags.channels.whatsapp.enabled;
    return false;
  });
  if (!channels.length) {
    throw new Error(
      "Nenhum canal habilitado nas feature flags para a distribuicao solicitada.",
    );
  }

  const affiliateUrl = String(input.affiliateUrl ?? "").trim();
  if (affiliateUrl) {
    // Prioridade ao link manual digitado pelo usuario.
    const { error: updateError } = await supabaseAdmin
      .from("offers")
      .update({
        affiliate_url: affiliateUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", offerId);

    if (updateError) {
      throw new Error(
        `Falha ao priorizar affiliate_url manual: ${updateError.message}`,
      );
    }
  }

  await assertOpportunityGateApproved(offerId);

  let copyByChannel = normalizeCopyByChannel(input.copyByChannel);
  if (Object.keys(copyByChannel).length > 0) {
    const { data: offerForCopy, error: offerForCopyError } = await supabaseAdmin
      .from("offers")
      .select(DIRECT_QUEUE_OFFER_SELECT)
      .eq("id", offerId)
      .maybeSingle();

    if (offerForCopyError) {
      console.warn("[distribution] failed to enrich channel copy with payment details", {
        offerId,
        error: offerForCopyError.message,
      });
    } else if (offerForCopy) {
      copyByChannel = Object.fromEntries(
        Object.entries(copyByChannel).map(([channel, copy]) => [
          channel,
          enrichCopyWithPaymentDetails(copy, offerForCopy as Record<string, unknown>),
        ]),
      ) as Partial<Record<DistributionChannel, string>>;
    }
  }
  const allowRequeueSameDay = input.allowRequeueSameDay ?? true;
  const scheduleNow = input.scheduleNow === true;
  const scheduleByChannel = await buildChannelSchedule(channels, flags, scheduleNow);
  const payload: Record<string, unknown> = {
    offer_id: offerId,
    channels,
    allow_requeue_same_day: allowRequeueSameDay,
    auto_approve_if_needed: false,
    force_admin_dispatch: true,
    schedule_now: scheduleNow,
    distribution_targets: getDistributionTargetsFromFlags(flags),
  };

  if (!scheduleNow) {
    payload.schedule = scheduleByChannel;
  }

  if (Object.keys(copyByChannel).length > 0) {
    payload.skip_ai = true;
    payload.ad_text_by_channel = copyByChannel;
  }

  const invokeResult = await supabaseAdmin.functions.invoke(
    "worker-process-offer",
    { body: payload },
  );

  if (invokeResult.error) {
    const errorMessage = await readInvokeError(invokeResult.error);
    if (isApprovalGateError(invokeResult.error, errorMessage)) {
      return queueDirectlyOnPostQueue({
        offerId,
        channels,
        flags,
        copyByChannel,
        affiliateUrl,
        allowRequeueSameDay,
        scheduleNow,
      });
    }
    throw new Error(errorMessage);
  }

  const workerResponse = (invokeResult.data ??
    {}) as WorkerProcessOfferResponse;

  const workerTriggers: LegacyDispatchResult["workerTriggers"] = [];
  for (const channel of channels) {
    workerTriggers.push({
      channel,
      invoked: false,
      response: {
        mode: "scheduled_queue",
        scheduled_at: scheduleByChannel[channel] ?? null,
      },
    });
  }

  return {
    ok: workerResponse.success !== false,
    channels,
    queued: Number(workerResponse.inserted ?? 0),
    skipped: Number(workerResponse.skipped ?? 0),
    details: Array.isArray(workerResponse.details) ? workerResponse.details : [],
    workerResponse,
    workerTriggers,
  };
}
