import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = toText(params.id);
  const source = toText(request.nextUrl.searchParams.get("source")) || "go_redirect";
  if (!id) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const { data: offer, error } = await supabaseAdmin
    .from("offers")
    .select("affiliate_url,click_count")
    .eq("id", id)
    .maybeSingle();

  const affiliateUrl = toText(offer?.affiliate_url);
  if (error || !affiliateUrl) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const nextClickCount = Number(offer?.click_count ?? 0) + 1;

  void Promise.allSettled([
    supabaseAdmin.from("clicks").insert({
      offer_id: id,
      type: "product_click",
      source,
    }),
    supabaseAdmin
      .from("offers")
      .update({ click_count: nextClickCount })
      .eq("id", id),
  ]);

  return NextResponse.redirect(affiliateUrl);
}
