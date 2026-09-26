import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CampaignTarget = {
  group_id: string;
  position: number | null;
  member_limit: number | null;
  joined_count: number | null;
  is_active: boolean | null;
  whatsapp_groups?: {
    invite_url?: string | null;
    is_active?: boolean | null;
  } | null;
};

type CampaignRow = {
  id: string;
  current_index: number | null;
  total_clicks: number | null;
  total_members_joined: number | null;
  group_campaign_targets?: CampaignTarget[] | null;
};

function fallbackUrl(req: NextRequest) {
  const envUrl =
    process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL ||
    process.env.NEXT_PUBLIC_TELEGRAM_URL ||
    "";
  if (envUrl) return envUrl;
  return new URL("/grupo", req.url).toString();
}

function hashIp(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const slug = String(params.slug ?? "").trim();
  if (!slug) return NextResponse.redirect(fallbackUrl(req), 302);

  const { data: campaign, error } = await supabaseAdmin
    .from("group_campaigns")
    .select("id,current_index,status,total_clicks,total_members_joined,group_campaign_targets(*, whatsapp_groups(invite_url,is_active))")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (error || !campaign) {
    return NextResponse.redirect(fallbackUrl(req), 302);
  }

  const campaignRow = campaign as CampaignRow;
  const targets = (campaignRow.group_campaign_targets ?? [])
    .filter((target: CampaignTarget) => {
      const inviteUrl = String(target.whatsapp_groups?.invite_url ?? "").trim();
      const limit = Number(target.member_limit ?? 0);
      const joined = Number(target.joined_count ?? 0);
      return (
        target.is_active !== false &&
        target.whatsapp_groups?.is_active !== false &&
        inviteUrl.startsWith("http") &&
        (limit <= 0 || joined < limit)
      );
    })
    .sort((a: CampaignTarget, b: CampaignTarget) => Number(a.position ?? 0) - Number(b.position ?? 0));

  if (!targets.length) {
    return NextResponse.redirect(fallbackUrl(req), 302);
  }

  const currentIndex = Number(campaignRow.current_index ?? 0);
  const picked = targets[currentIndex % targets.length];
  const inviteUrl = String(picked.whatsapp_groups?.invite_url ?? "").trim();

  await Promise.all([
    supabaseAdmin
      .from("group_campaigns")
      .update({
        current_index: (currentIndex + 1) % targets.length,
        total_clicks: Number(campaignRow.total_clicks ?? 0) + 1,
        total_members_joined: Number(campaignRow.total_members_joined ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignRow.id),
    supabaseAdmin
      .from("group_campaign_targets")
      .update({ joined_count: Number(picked.joined_count ?? 0) + 1 })
      .eq("campaign_id", campaignRow.id)
      .eq("group_id", picked.group_id),
    supabaseAdmin.from("group_join_events").insert({
      campaign_id: campaignRow.id,
      group_id: picked.group_id,
      source: req.nextUrl.searchParams.get("utm_source") || req.nextUrl.searchParams.get("source") || null,
      user_agent: req.headers.get("user-agent"),
      ip_hash: hashIp(req.headers.get("x-forwarded-for") || ""),
    }),
  ]);

  return NextResponse.redirect(inviteUrl, 302);
}
