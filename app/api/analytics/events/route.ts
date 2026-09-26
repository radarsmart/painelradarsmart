import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set([
  "impression",
  "view",
  "click",
  "affiliate_click",
  "order",
  "purchase",
  "conversion",
]);

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 500) : null;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const eventType = toText(body.event_type ?? body.eventType)?.toLowerCase() ?? "";
    const offerId = toText(body.offer_id ?? body.offerId);

    if (!ALLOWED_EVENTS.has(eventType)) {
      return NextResponse.json({ error: "event_type invalido." }, { status: 400 });
    }
    if (!offerId && eventType !== "view") {
      return NextResponse.json({ error: "offer_id obrigatorio." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("analytics_events").insert({
      offer_id: offerId,
      canonical_product_id: toText(body.canonical_product_id ?? body.canonicalProductId),
      publication_id: toText(body.publication_id ?? body.publicationId),
      campaign_id: toText(body.campaign_id ?? body.campaignId),
      event_type: eventType,
      channel: toText(body.channel),
      source: toText(body.source),
      session_id: toText(body.session_id ?? body.sessionId),
      quantity: toNumber(body.quantity),
      revenue: toNumber(body.revenue),
      commission: toNumber(body.commission),
      currency: toText(body.currency) ?? "BRL",
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      user_agent: toText(req.headers.get("user-agent")),
      referrer: toText(req.headers.get("referer")),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao registrar evento." },
      { status: 500 },
    );
  }
}
