import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, error } = await supabaseAdmin
      .from("offers")
      .insert(body)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ offer: data });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Erro interno" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("offers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ offer: data });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Erro interno" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("offers").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Erro interno" },
      { status: 500 },
    );
  }
}
