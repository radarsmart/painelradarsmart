import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { ensureGarotaRadarPersona } from "@/lib/brand-character/garota-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Idempotente: se a persona "garota-radar" ja existir, nao cria duplicata
 * (checagem por slug + UNIQUE no banco como ultima defesa). Nao altera
 * nenhuma outra persona alem de retirar o status de oficial de uma
 * eventual persona oficial anterior.
 */
export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const { created, persona } = await ensureGarotaRadarPersona();
    return NextResponse.json({ success: true, created, persona });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao preparar a Garota Radar." },
      { status: 500 },
    );
  }
}
