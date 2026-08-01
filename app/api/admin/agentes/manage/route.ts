import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  createSalesAgent,
  deleteSalesAgent,
  getSalesAgent,
  listSalesAgents,
  updateSalesAgent,
} from "@/lib/sales-agents/agent-store";

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

  const id = toText(req.nextUrl.searchParams.get("id"));

  try {
    if (id) {
      const agent = await getSalesAgent(id);
      if (!agent) {
        return NextResponse.json({ error: "Agente nao encontrado." }, { status: 404 });
      }
      return NextResponse.json({ agent });
    }

    const agents = await listSalesAgents();
    return NextResponse.json({ agents });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar agentes." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = toText(body.id);

  try {
    const agent = id ? await updateSalesAgent(id, body) : await createSalesAgent(body);
    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar agente." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const id = toText(req.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id e obrigatorio." }, { status: 400 });
  }

  try {
    await deleteSalesAgent(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao excluir agente." },
      { status: 500 },
    );
  }
}
