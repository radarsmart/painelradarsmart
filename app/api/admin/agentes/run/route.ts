import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { runSalesAgent } from "@/lib/sales-agents/run-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = toText(body.id);

  if (!id) {
    return NextResponse.json({ error: "id do agente e obrigatorio." }, { status: 400 });
  }

  try {
    const result = await runSalesAgent(id);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao rodar o agente." },
      { status: 500 },
    );
  }
}
