import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanEnv(value?: string): string {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\\r|\\n/g, "");
}

function looksLikeGatewayError(status: number, raw: string): boolean {
  const text = String(raw ?? "").toLowerCase();
  return (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    text.includes("<!doctype") ||
    text.includes("<html") ||
    text.includes("bad gateway") ||
    text.includes("gateway timeout")
  );
}

function unavailablePayload(status: number) {
  return {
    ok: false,
    status: "unavailable",
    code: "WHATSAPP_SERVICE_UNAVAILABLE",
    degraded: true,
    error: `Servico de WhatsApp indisponivel no momento (${status}). Tente novamente em instantes.`,
  };
}

async function callEdgeFunction(body: Record<string, unknown>) {
  const supabaseUrl =
    cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRole = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json(
      { error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/channel-whatsapp-control`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const rawError = String(payload.error ?? payload.message ?? "");

      if (looksLikeGatewayError(response.status, rawError)) {
        return NextResponse.json(unavailablePayload(response.status), { status: response.status });
      }

      return NextResponse.json(payload, { status: response.status });
    }

    const text = await response.text().catch(() => "");
    if (looksLikeGatewayError(response.status, text)) {
      return NextResponse.json(unavailablePayload(response.status), { status: response.status });
    }

    return NextResponse.json(
      { error: text || "Erro desconhecido na Edge Function." },
      { status: response.status },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao conectar com o servico de canais: ${err instanceof Error ? err.message : "Erro desconhecido"}` },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  return callEdgeFunction({ action: "status" });
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "").trim().toLowerCase();
  if (!["status", "connect", "reconnect", "qrcode", "new-qr"].includes(action)) {
    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  }

  return callEdgeFunction({ action });
}
