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
    const agents = await listActiveSalesAgents();
    const now = new Date();
    const eligible = agents.filter((agent) => isAgentEligibleNow(agent, now));

    // Roda um agente por vez (nao em paralelo): agentes de Mercado Livre
    // compartilham a mesma pagina/contexto do navegador local (Playwright), e
    // rodar dois ao mesmo tempo faz um navigate() cancelar o outro
    // (net::ERR_ABORTED). Sequencial evita essa disputa pelo mesmo recurso.
    const runs: Array<{
      agentId: string;
      agentName: string;
      result: Awaited<ReturnType<typeof runSalesAgent>> | { success: false; message: string };
    }> = [];

    for (const agent of eligible) {
      try {
        const result = await runSalesAgent(agent.id);
        runs.push({ agentId: agent.id, agentName: agent.name, result });
      } catch (agentError) {
        runs.push({
          agentId: agent.id,
          agentName: agent.name,
          result: {
            success: false,
            message:
              agentError instanceof Error
                ? agentError.message
                : "Falha desconhecida ao rodar o agente.",
          },
        });
      }
    }

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
