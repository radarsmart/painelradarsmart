import { NextRequest, NextResponse } from "next/server";

import { listActiveSalesAgents } from "@/lib/sales-agents/agent-store";
import { isAgentEligibleNow } from "@/lib/sales-agents/scheduling";
import { runSalesAgent } from "@/lib/sales-agents/run-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isValidCronSecret(req: NextRequest): boolean {
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const headerToken =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  return String(headerToken).trim() === expected;
}

export async function GET(req: NextRequest) {
  if (!isValidCronSecret(req)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    // eslint-disable-next-line no-console
    console.log("[cron-debug] SUPABASE_URL=", process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 40));
    // eslint-disable-next-line no-console
    console.log(
      "[cron-debug] SERVICE_KEY_LEN=",
      String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").length,
    );
    const { supabaseAdmin: __debugClient } = await import("@/lib/supabase");
    const __rawAll = await __debugClient.from("sales_agents").select("id,name,active");
    // eslint-disable-next-line no-console
    console.log(
      "[cron-debug] raw sales_agents count=",
      __rawAll.data?.length ?? "ERR",
      "error=",
      __rawAll.error?.message ?? null,
      "rows=",
      JSON.stringify(__rawAll.data),
    );

    const __filtered = await __debugClient
      .from("sales_agents")
      .select("id,name,active")
      .eq("active", true);
    // eslint-disable-next-line no-console
    console.log(
      "[cron-debug] filtered eq(active,true) count=",
      __filtered.data?.length ?? "ERR",
      "error=",
      __filtered.error?.message ?? null,
      "rows=",
      JSON.stringify(__filtered.data),
    );

    let agents: Awaited<ReturnType<typeof listActiveSalesAgents>> = [];
    try {
      agents = await listActiveSalesAgents();
      // eslint-disable-next-line no-console
      console.log("[cron-debug] listActiveSalesAgents length=", agents.length);
    } catch (listError) {
      // eslint-disable-next-line no-console
      console.log(
        "[cron-debug] listActiveSalesAgents THREW=",
        listError instanceof Error ? listError.message : String(listError),
      );
      throw listError;
    }
    const now = new Date();
    const eligible = agents.filter((agent) => isAgentEligibleNow(agent, now));

    const results = await Promise.allSettled(
      eligible.map(async (agent) => ({
        agentId: agent.id,
        agentName: agent.name,
        result: await runSalesAgent(agent.id),
      })),
    );

    const runs = results.map((settled, index) => {
      const agent = eligible[index];
      if (settled.status === "fulfilled") {
        return settled.value;
      }
      return {
        agentId: agent.id,
        agentName: agent.name,
        result: {
          success: false,
          message:
            settled.reason instanceof Error
              ? settled.reason.message
              : "Falha desconhecida ao rodar o agente.",
        },
      };
    });

    return NextResponse.json({
      ok: true,
      activeAgents: agents.length,
      eligibleAgents: eligible.length,
      runs,
      executedAt: now.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro no cron dos agentes de vendas.",
      },
      { status: 500 },
    );
  }
}
