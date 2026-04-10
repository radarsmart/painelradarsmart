import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClickBody = {
  landingPageId?: string;
  offerId?: string | null;
  slug?: string;
  ctaType?: string;
  destinationUrl?: string;
  utmParams?: Record<string, string>;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function appendUtmParams(url: string, utmParams: Record<string, string>) {
  const cleanUrl = toText(url);
  if (!cleanUrl) return "";

  try {
    const targetUrl = new URL(cleanUrl);
    for (const [key, value] of Object.entries(utmParams)) {
      if (!key || !value) continue;
      if (!key.toLowerCase().startsWith("utm_")) continue;
      if (!targetUrl.searchParams.has(key)) {
        targetUrl.searchParams.set(key, value);
      }
    }
    return targetUrl.toString();
  } catch {
    return cleanUrl;
  }
}

function extractUtmParams(req: NextRequest, bodyParams?: Record<string, string>) {
  const urlParams = req.nextUrl.searchParams;
  const merged = new Map<string, string>();

  urlParams.forEach((value, key) => {
    if (key.toLowerCase().startsWith("utm_") && value) {
      merged.set(key, value);
    }
  });

  Object.entries(bodyParams ?? {}).forEach(([key, value]) => {
    if (key.toLowerCase().startsWith("utm_") && value) {
      merged.set(key, value);
    }
  });

  return Object.fromEntries(merged.entries());
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ClickBody;
    const landingPageId = toText(body.landingPageId);
    const slug = toText(body.slug);
    const ctaType = toText(body.ctaType) || "unknown";
    const destinationUrl = toText(body.destinationUrl);

    if (!landingPageId || !slug || !destinationUrl) {
      return NextResponse.json(
        { error: "landingPageId, slug e destinationUrl são obrigatórios" },
        { status: 400 },
      );
    }

    const utmParams = extractUtmParams(req, body.utmParams);
    const finalUrl = appendUtmParams(destinationUrl, utmParams);

    const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
    const ipAddress = forwardedFor.split(",")[0]?.trim() || null;

    const { error } = await supabaseAdmin.from("landing_page_clicks").insert({
      landing_page_id: landingPageId,
      offer_id: toText(body.offerId) || null,
      slug,
      cta_type: ctaType,
      destination_url: finalUrl,
      utm_params: utmParams,
      referrer: req.headers.get("referer"),
      user_agent: req.headers.get("user-agent"),
      ip_address: ipAddress,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: finalUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao registrar clique da landing" },
      { status: 500 },
    );
  }
}
