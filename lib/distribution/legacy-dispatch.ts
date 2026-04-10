import { supabaseAdmin } from "@/lib/supabase";

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
  "id,title,brand,category,marketplace,seller_name,price,original_price,discount_pct,currency,image_url,best_image_url,affiliate_url,product_url,manual_copy,raw";
const SEND_WINDOW_START_HOUR = 8;
const SEND_WINDOW_END_HOUR = 22;
const SEND_INTERVAL_MINUTES = 20;
const SEND_TIMEZONE = "America/Sao_Paulo";

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

function toPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildFallbackAdText(offer: Record<string, unknown>, channel: DistributionChannel): string {
  const title = toText(offer.title) ?? "Oferta do dia";
  const price = toPositiveNumber(offer.price);
  const originalPrice = toPositiveNumber(offer.original_price);
  const discountPct = toPositiveNumber(offer.discount_pct);

  const priceLine =
    price !== null
      ? originalPrice !== null && originalPrice > price && discountPct !== null
        ? `De R$ ${formatBRL(originalPrice)} por R$ ${formatBRL(price)} (${Math.round(discountPct)}% OFF)`
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

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getTimeZoneParts(date: Date, timeZone = SEND_TIMEZONE): TimeZoneParts {
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

function getTimeZoneOffsetMinutes(date: Date, timeZone = SEND_TIMEZONE): number {
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
  timeZone = SEND_TIMEZONE,
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

function nextWindowStart(date: Date, timeZone = SEND_TIMEZONE): Date {
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
      hour: SEND_WINDOW_START_HOUR,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

function clampToSendWindow(date: Date, timeZone = SEND_TIMEZONE): Date {
  const local = getTimeZoneParts(date, timeZone);

  if (local.hour < SEND_WINDOW_START_HOUR) {
    return dateFromTimeZoneParts(
      {
        year: local.year,
        month: local.month,
        day: local.day,
        hour: SEND_WINDOW_START_HOUR,
        minute: 0,
        second: 0,
      },
      timeZone,
    );
  }

  if (local.hour >= SEND_WINDOW_END_HOUR) {
    return nextWindowStart(date, timeZone);
  }

  return date;
}

function alignToNextInterval(date: Date, timeZone = SEND_TIMEZONE): Date {
  const local = getTimeZoneParts(date, timeZone);
  const remainder = local.minute % SEND_INTERVAL_MINUTES;
  const deltaMinutes =
    remainder === 0 && local.second === 0 ? SEND_INTERVAL_MINUTES : SEND_INTERVAL_MINUTES - remainder;

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

async function getNextScheduledAt(channel: DistributionChannel): Promise<string> {
  const now = new Date();
  const { data, error } = await supabaseAdmin.rpc("get_last_scheduled_at", {
    p_channel: channel,
  });

  if (error) {
    throw new Error(`Falha ao calcular proximo horario de fila (${channel}): ${error.message}`);
  }

  const lastScheduled = data ? new Date(String(data)) : now;
  const base = lastScheduled.getTime() > now.getTime() ? lastScheduled : now;
  const windowBase = clampToSendWindow(base);
  const aligned = alignToNextInterval(windowBase);

  return aligned.toISOString();
}

async function buildChannelSchedule(
  channels: DistributionChannel[],
): Promise<Partial<Record<DistributionChannel, string>>> {
  const scheduleEntries = await Promise.all(
    channels.map(async (channel) => [channel, await getNextScheduledAt(channel)] as const),
  );

  return Object.fromEntries(scheduleEntries) as Partial<Record<DistributionChannel, string>>;
}

async function queueDirectlyOnPostQueue(input: {
  offerId: string;
  channels: DistributionChannel[];
  copyByChannel: Partial<Record<DistributionChannel, string>>;
  affiliateUrl?: string | null;
  allowRequeueSameDay: boolean;
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

  const activeTargets = (targets ?? []).filter(
    (target) => target?.id && target?.channel && target?.is_active,
  );
  if (!activeTargets.length) {
    throw new Error("Nenhum target ativo encontrado para os canais selecionados.");
  }

  const channelSchedule = await buildChannelSchedule(input.channels);

  const details: Array<Record<string, unknown>> = [];
  let queued = 0;
  let skipped = 0;
  const link =
    toText(input.affiliateUrl) ??
    toText(offer.affiliate_url) ??
    toText(offer.product_url);

  for (const target of activeTargets) {
    const channel = target.channel as DistributionChannel;
    const scheduledAt = channelSchedule[channel] ?? null;
    let dedupeBucket = todayUtcDate();
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (!Number.isNaN(scheduledDate.getTime())) {
        dedupeBucket = scheduledDate.toISOString().slice(0, 10);
      }
    }
    const payload = {
      ad_text: resolveChannelCopy(offer as Record<string, unknown>, channel, input.copyByChannel),
      offer: {
        id: offer.id,
        title: offer.title ?? null,
        brand: offer.brand ?? null,
        category: offer.category ?? null,
        marketplace: offer.marketplace ?? null,
        seller_name: offer.seller_name ?? null,
        price: offer.price ?? null,
        original_price: offer.original_price ?? null,
        discount_pct: offer.discount_pct ?? null,
        currency: offer.currency ?? "BRL",
        image_url: offer.best_image_url ?? offer.image_url ?? null,
        video_url: null,
        link,
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

export async function dispatchLegacyOffer(
  input: LegacyDispatchInput,
): Promise<LegacyDispatchResult> {
  const offerId = String(input.offerId ?? "").trim();
  if (!offerId) {
    throw new Error("offerId e obrigatorio para distribuicao.");
  }

  const channels = normalizeChannels(input.channels);
  if (!channels.length) {
    throw new Error("Nenhum canal valido selecionado para distribuicao.");
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

  const copyByChannel = normalizeCopyByChannel(input.copyByChannel);
  const allowRequeueSameDay = input.allowRequeueSameDay ?? true;
  const scheduleByChannel = await buildChannelSchedule(channels);
  const payload: Record<string, unknown> = {
    offer_id: offerId,
    channels,
    allow_requeue_same_day: allowRequeueSameDay,
    auto_approve_if_needed: false,
    force_admin_dispatch: true,
    schedule_now: false,
    schedule: scheduleByChannel,
  };

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
        copyByChannel,
        affiliateUrl,
        allowRequeueSameDay,
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

