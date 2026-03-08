import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const canal = String(body.canal ?? "whatsapp");
    const origem = String(body.origem ?? "site");

    const { error } = await supabase
      .from("grupo_membros")
      .insert({ canal, origem });

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
