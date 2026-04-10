import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  getAwinAutomationConfig,
  saveAwinAutomationConfig,
} from "@/lib/awin/automation-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const config = await getAwinAutomationConfig();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha ao carregar configuracao AWIN.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const config = await saveAwinAutomationConfig(body);
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha ao salvar configuracao AWIN.",
      },
      { status: 500 },
    );
  }
}
