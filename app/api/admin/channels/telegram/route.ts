import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanEnv(value?: string): string {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\\r|\\n/g, "");
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

  const response = await fetch(`${supabaseUrl}/functions/v1/channel-telegram-control`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
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
  if (!["status", "test"].includes(action)) {
    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  }

  return callEdgeFunction(body);
}
