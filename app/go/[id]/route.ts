import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const param = toText(params.id);
  const source = toText(request.nextUrl.searchParams.get("source")) || "go_redirect";
  if (!param) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Link curto (short_code, ex.: "aB3xY7") ou o uuid completo da oferta —
  // aceita os dois pra manter compatibilidade com links ja enviados antes.
  const lookupColumn = UUID_PATTERN.test(param) ? "id" : "short_code";

  const { data: offer, error } = await supabaseAdmin
    .from("offers")
    .select("id,affiliate_url,click_count")
    .eq(lookupColumn, param)
    .maybeSingle();

  const affiliateUrl = toText(offer?.affiliate_url);
  if (error || !offer || !affiliateUrl) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const offerId = String(offer.id);
  const nextClickCount = Number(offer?.click_count ?? 0) + 1;

  void Promise.allSettled([
    supabaseAdmin.from("clicks").insert({
      offer_id: offerId,
      type: "product_click",
      source,
    }),
    supabaseAdmin
      .from("offers")
      .update({ click_count: nextClickCount })
      .eq("id", offerId),
  ]);

  return NextResponse.redirect(affiliateUrl);
}
