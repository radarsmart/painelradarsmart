import { NextRequest, NextResponse } from "next/server";
import {
  dispatchLegacyOffer,
  type DistributionChannel,
} from "@/lib/distribution/legacy-dispatch";
import { sendPushNotification } from "@/lib/notifications/push";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Marketplace = "mercadolivre" | "amazon";
type OfferSlot = "hero" | "flash" | "best" | "comparator";

type ExtractSuccessResponse = {
  success: true;
  job_id: string;
  offer_id?: string | null;
  offer_status?: string | null;
  needs_review?: boolean;
  preview?: Record<string, unknown>;
  extracted?: Record<string, unknown>;
};

type ExtractErrorResponse = {
  error?: string;
  job_id?: string | null;
  details?: unknown;
};

async function parseResponsePayload(
  response: Response,
): Promise<ExtractSuccessResponse | ExtractErrorResponse> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as ExtractSuccessResponse | ExtractErrorResponse;
  } catch {
    return {
      error: raw || `Resposta invalida da rota de extracao (HTTP ${response.status}).`,
    };
  }
}

function normalizeMarketplace(value: unknown): Marketplace | null {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (normalized === "mercadolivre" || normalized === "amazon") {
    return normalized;
  }
  return null;
}

function normalizeOfferSlot(value: unknown): OfferSlot | null {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (
    normalized === "hero" ||
    normalized === "flash" ||
    normalized === "best" ||
    normalized === "comparator"
  ) {
    return normalized;
  }
  return null;
}

function normalizeChannels(value: unknown): DistributionChannel[] {
  if (!Array.isArray(value) || !value.length) {
    return ["telegram", "whatsapp"];
  }
  const channels = Array.from(
    new Set(value.map((item) => String(item ?? "").toLowerCase().trim())),
  );
  const filtered = channels.filter(
    (channel): channel is DistributionChannel =>
      channel === "telegram" || channel === "whatsapp",
  );
  return filtered.length ? filtered : ["telegram", "whatsapp"];
}

function normalizeCopyByChannel(body: {
  ad_text?: unknown;
  ad_text_by_channel?: unknown;
}): Partial<Record<DistributionChannel, string>> {
  const map = body.ad_text_by_channel;
  const adTextByChannel: Partial<Record<DistributionChannel, string>> = {};

  if (map && typeof map === "object") {
    for (const channel of ["telegram", "whatsapp"] as const) {
      const value = String(
        (map as Record<string, unknown>)[channel] ?? "",
      ).trim();
      if (value) adTextByChannel[channel] = value;
    }
  }

  if (Object.keys(adTextByChannel).length) return adTextByChannel;

  const fallbackText = String(body.ad_text ?? "").trim();
  if (fallbackText) {
    return {
      telegram: fallbackText,
      whatsapp: fallbackText,
    };
  }

  return {};
}

function resolveSiteBaseUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    req.nextUrl.origin
  ).replace(/\/$/, "");
}

function formatPushPrice(value: unknown): string {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return "0,00";
  return price.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function callExtractRoute(
  req: NextRequest,
  marketplace: Marketplace,
  url: string,
  affiliateUrl: string,
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  const authorization = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");

  if (authorization) headers.set("authorization", authorization);
  if (cookie) headers.set("cookie", cookie);

  const response = await fetch(new URL("/api/admin/extract", req.nextUrl.origin), {
    method: "POST",
    headers,
    body: JSON.stringify({
      url,
      affiliate_url: affiliateUrl,
      marketplace,
      persist: true,
    }),
    cache: "no-store",
  });

  const json = await parseResponsePayload(response);

  return { response, json };
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
      marketplace?: string;
      url?: string;
      affiliate_url?: string;
      slot_type?: string;
      channels?: unknown;
      ad_text?: unknown;
      ad_text_by_channel?: unknown;
    };

    const marketplace = normalizeMarketplace(body.marketplace);
    const slotType = normalizeOfferSlot(body.slot_type);
    const sourceUrl = String(body.url ?? "").trim();
    const affiliateUrl = String(body.affiliate_url ?? "").trim();
    const channels = normalizeChannels(body.channels);
    const copyByChannel = normalizeCopyByChannel({
      ad_text: body.ad_text,
      ad_text_by_channel: body.ad_text_by_channel,
    });

    if (!marketplace) {
      return NextResponse.json(
        { error: "marketplace invalido. Use mercadolivre ou amazon." },
        { status: 400 },
      );
    }

    if (!sourceUrl) {
      return NextResponse.json(
        { error: "Campo url obrigatorio." },
        { status: 400 },
      );
    }

    if (!affiliateUrl) {
      return NextResponse.json(
        { error: "Campo affiliate_url obrigatorio." },
        { status: 400 },
      );
    }

    const { response: extractResponse, json: extractJson } = await callExtractRoute(
      req,
      marketplace,
      sourceUrl,
      affiliateUrl,
    );

    if (!extractResponse.ok) {
      const extractError = extractJson as ExtractErrorResponse;
      return NextResponse.json(
        {
          error:
            extractError.error ??
            "Falha ao extrair e persistir oferta.",
          extract: extractError,
        },
        { status: extractResponse.status },
      );
    }

    const extracted = extractJson as ExtractSuccessResponse;
    const offerId = String(extracted.offer_id ?? "").trim();
    const offerStatus = String(extracted.offer_status ?? "").toLowerCase();
    const needsReview = Boolean(extracted.needs_review);

    if (!offerId) {
      return NextResponse.json(
        {
          error:
            "Extracao retornou sucesso, mas sem offer_id para distribuicao.",
          extract: extracted,
        },
        { status: 500 },
      );
    }

    if (needsReview || offerStatus === "needs_review") {
      return NextResponse.json({
        success: true,
        queued: false,
        message:
          "Oferta salva em needs_review. Nao foi enviada para os canais.",
        offer_id: offerId,
        offer_status: extracted.offer_status ?? "needs_review",
        needs_review: true,
        extract: extracted,
      });
    }

    const activatePayload: Record<string, unknown> = {
      status: "active",
      curations_status: "approved",
      affiliate_url: affiliateUrl,
      updated_at: new Date().toISOString(),
    };
    if (slotType) {
      activatePayload.slot_type = slotType;
    }

    let { error: activateError } = await supabaseAdmin
      .from("offers")
      .update(activatePayload)
      .eq("id", offerId);

    if (activateError && activateError.message.includes("curations_status")) {
      const fallbackPayload = { ...activatePayload };
      delete fallbackPayload.curations_status;
      const fallback = await supabaseAdmin
        .from("offers")
        .update(fallbackPayload)
        .eq("id", offerId);
      activateError = fallback.error;
    }

    if (activateError) {
      return NextResponse.json(
        {
          error: `Oferta salva, mas falhou ao ativar para vitrine: ${activateError.message}`,
          offer_id: offerId,
          extract: extracted,
        },
        { status: 500 },
      );
    }

    const dispatch = await dispatchLegacyOffer({
      offerId,
      affiliateUrl,
      channels,
      copyByChannel,
    });

    let pushNotification:
      | { ok: boolean; skipped: boolean; status?: number; reason?: string }
      | null = null;

    if (slotType === "flash") {
      const { data: offerForPush } = await supabaseAdmin
        .from("offers")
        .select("title,price")
        .eq("id", offerId)
        .maybeSingle();

      const pushTitle = "⚡ OFERTA RELAMPAGO!";
      const pushBody = `${String(offerForPush?.title ?? "Oferta em destaque")} por apenas R$ ${formatPushPrice(offerForPush?.price)}`;
      const pushUrl = `${resolveSiteBaseUrl(req)}/go/${offerId}`;

      try {
        pushNotification = await sendPushNotification({
          title: pushTitle,
          body: pushBody,
          url: pushUrl,
          icon: "/icon-192x192.png",
        });
      } catch (pushError) {
        console.error("Falha ao disparar push flash:", pushError);
        pushNotification = {
          ok: false,
          skipped: false,
          reason:
            pushError instanceof Error
              ? pushError.message
              : "push_dispatch_failed",
        };
      }
    }

    return NextResponse.json({
      success: true,
      queued: dispatch.queued > 0,
      message:
        dispatch.queued > 0
          ? "Oferta salva e enviada para a fila de disparo!"
          : "Oferta salva, mas nenhum job novo foi enfileirado (dedupe ou regra de fila).",
      offer_id: offerId,
      offer_status: extracted.offer_status ?? "active",
      needs_review: false,
      extract: extracted,
      distribution: dispatch,
      push: pushNotification,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao publicar e distribuir oferta.",
      },
      { status: 500 },
    );
  }
}

