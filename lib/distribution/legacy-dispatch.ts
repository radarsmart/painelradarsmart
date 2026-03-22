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
  const payload: Record<string, unknown> = {
    offer_id: offerId,
    channels,
    allow_requeue_same_day: true,
    auto_approve_if_needed: true,
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
    throw new Error(errorMessage);
  }

  const workerResponse = (invokeResult.data ??
    {}) as WorkerProcessOfferResponse;

  const workerTriggers: LegacyDispatchResult["workerTriggers"] = [];
  for (const channel of channels) {
    if (channel === "telegram") {
      const { data, error } = await supabaseAdmin.rpc(
        "invoke_worker_send_telegram",
      );
      workerTriggers.push({
        channel,
        invoked: !error,
        error: error?.message,
        response: data ?? null,
      });
      continue;
    }

    const { data, error } = await supabaseAdmin.rpc(
      "invoke_worker_send_whatsapp",
    );
    workerTriggers.push({
      channel,
      invoked: !error,
      error: error?.message,
      response: data ?? null,
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

