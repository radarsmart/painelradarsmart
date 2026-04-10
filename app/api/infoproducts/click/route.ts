import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id: string };
    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    await supabaseAdmin.rpc("increment_infoproduct_clicks", { product_id: id });

    const { data } = await supabaseAdmin
      .from("infoproducts")
      .select("affiliate_url")
      .eq("id", id)
      .single();

    return NextResponse.json({ url: data?.affiliate_url ?? "#" });
  } catch {
    return NextResponse.json({ error: "Erro ao registrar clique" }, { status: 500 });
  }
}
