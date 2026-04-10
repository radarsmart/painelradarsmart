import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CuradoriaOfferRow = {
  id: string;
  external_offer_id?: string | null;
  title: string | null;
  marketplace: string | null;
  price: number | null;
  old_price: number | null;
  discount_pct: number | null;
  discount_percent: number | null;
  rating: number | null;
  review_count: number | null;
  reviews_count: number | null;
  raw_data: unknown;
  image_url: string | null;
  affiliate_url: string | null;
  product_url: string | null;
  status: string | null;
  curations_status: string | null;
  created_at: string | null;
  quality_score?: number | null;
  is_priority?: boolean | null;
};

const SELECT_FIELDS =
  "id,external_offer_id,title,marketplace,price,old_price,discount_pct,discount_percent,rating,review_count,reviews_count,raw_data,image_url,affiliate_url,product_url,status,curations_status,created_at,quality_score,is_priority";
const DEFAULT_DISCOVER_LIMIT = 20;
const INBOX_RETENTION_HOURS = 72;

async function cleanupStaleInboxOffers() {
  const cutoff = new Date(Date.now() - INBOX_RETENTION_HOURS * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("offers")
    .update({
      status: "archived",
      curations_status: "archived",
      updated_at: new Date().toISOString(),
    })
    .or("curations_status.eq.inbox,curations_status.eq.needs_review,status.eq.needs_review,status.eq.pending")
    .lt("created_at", cutoff);

  if (error) {
    throw new Error(`Falha ao limpar inbox antigo: ${error.message}`);
  }
}

async function readInboxOffers(limit = DEFAULT_DISCOVER_LIMIT): Promise<CuradoriaOfferRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select(SELECT_FIELDS)
    .or("curations_status.eq.inbox,curations_status.eq.needs_review,status.eq.needs_review,status.eq.pending")
    .not("status", "eq", "archived")
    .order("quality_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(`Falha ao consultar inbox: ${error.message}`);
  }

  return (data ?? []) as CuradoriaOfferRow[];
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    await cleanupStaleInboxOffers();

    const requestedLimitRaw = Number(
      req.nextUrl.searchParams.get("limit") ?? DEFAULT_DISCOVER_LIMIT,
    );
    const requestedLimit = Math.max(1, Math.min(requestedLimitRaw, 50));
    const existing = await readInboxOffers(requestedLimit);

    return NextResponse.json({
      offers: existing,
      source: "manual_only",
      sniper_disabled: true,
      seeded_count: 0,
      requested_limit: requestedLimit,
      existing_count: existing.length,
      message:
        "Sniper/Discover desativado temporariamente. Use o Radar Builder em /admin/ofertas/nova.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao carregar descobertas de curadoria.",
      },
      { status: 500 },
    );
  }
}
