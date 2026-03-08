import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const offerId = String(body.offerId ?? "");
    const source = String(body.source ?? "site");

    if (!offerId) {
      return NextResponse.json({ error: "offerId obrigatório" }, { status: 400 });
    }

    const { error } = await supabase
      .from("clicks")
      .insert({ offer_id: offerId, type: "product_click", source });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Erro interno" },
      { status: 500 },
    );
  }
}
