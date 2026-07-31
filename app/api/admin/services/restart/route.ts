import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getServicesStatus,
  restartService,
  type ServiceName,
} from "@/lib/scraping/control-server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isServiceName(value: unknown): value is ServiceName {
  return value === "whatsapp" || value === "ml-session";
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const status = await getServicesStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar status dos servicos locais.",
      },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => ({}))) as { service?: unknown };
  if (!isServiceName(body.service)) {
    return NextResponse.json(
      { error: "service deve ser 'whatsapp' ou 'ml-session'." },
      { status: 400 },
    );
  }

  try {
    const result = await restartService(body.service);
    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao reiniciar servico local.",
      },
      { status: 502 },
    );
  }
}
