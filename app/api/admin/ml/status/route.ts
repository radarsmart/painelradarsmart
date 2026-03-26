import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MLStatusResponse = {
  hasToken: boolean;
  expiresAt: string | null;
  isExpired: boolean;
  minutesRemaining: number;
};

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("mercadolivre_auth")
      .select("expires_at")
      .eq("id", "default")
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Falha ao consultar status ML: ${error.message}`);
    }

    const hasToken = Boolean(data?.expires_at);
    const expiresAt = data?.expires_at ?? null;
    const now = Date.now();
    const expiresTimestamp = expiresAt ? Date.parse(expiresAt) : NaN;
    const isExpired = Number.isFinite(expiresTimestamp) ? expiresTimestamp <= now : true;
    const minutesRemaining = Number.isFinite(expiresTimestamp)
      ? Math.max(0, Math.floor((expiresTimestamp - now) / (1000 * 60)))
      : 0;

    const response: MLStatusResponse = {
      hasToken,
      expiresAt,
      isExpired,
      minutesRemaining,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao verificar status do Mercado Livre.",
      },
      { status: 500 },
    );
  }
}