import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const projectId = toText(req.nextUrl.searchParams.get("projectId"));
    const assetType = toText(req.nextUrl.searchParams.get("assetType"));

    if (!projectId) {
      return NextResponse.json({ error: "projectId é obrigatório." }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("ugc_project_assets")
      .select(
        "id,project_id,creative_id,asset_type,provider,bucket_name,storage_path,public_url,mime_type,size_bytes,status,metadata,created_by_email,created_at,updated_at",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (assetType) {
      query = query.eq("asset_type", assetType);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ assets: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao carregar assets do projeto.",
      },
      { status: 500 },
    );
  }
}
