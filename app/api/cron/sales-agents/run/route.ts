import { NextRequest, NextResponse } from "next/server";

import { listActiveSalesAgents } from "@/lib/sales-agents/agent-store";
import { isAgentEligibleNow } from "@/lib/sales-agents/scheduling";
import { runSalesAgent } from "@/lib/sales-agents/run-agent";
import { fetchAwinAdvertiserFeedProducts } from "@/lib/awin/client";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Agentes pausados automaticamente (ex.: feed da fonte fora do ar) guardam o
// motivo em auto_paused_reason. A cada tick, faz 1 sondagem barata por motivo
// distinto e reativa todos os agentes daquele grupo assim que a fonte voltar
// — assim ninguem precisa lembrar de reativar manualmente depois de uma
// instabilidade externa.
async function resumeAutoPausedAgents(): Promise<
  Array<{ reason: string; resumed: string[]; stillDown?: boolean }>
> {
  const { data: pausedAgents } = await supabaseAdmin
    .from("sales_agents")
    .select("id,name,advertiser_id,auto_paused_reason")
    .eq("active", false)
    .not("auto_paused_reason", "is", null);

  if (!pausedAgents?.length) return [];

  const byReason = new Map<string, typeof pausedAgents>();
  for (const agent of pausedAgents) {
    const reason = String(agent.auto_paused_reason);
    byReason.set(reason, [...(byReason.get(reason) ?? []), agent]);
  }

  const summary: Array<{ reason: string; resumed: string[]; stillDown?: boolean }> = [];

  for (const [reason, group] of byReason) {
    if (reason !== "awin_feed_500") continue; // unico motivo automatico existente por enquanto

    const probeAdvertiserId = group.find((a) => a.advertiser_id)?.advertiser_id;
    if (!probeAdvertiserId) continue;

    try {
      await fetchAwinAdvertiserFeedProducts({ advertiserId: probeAdvertiserId, page: 1 });
      const ids = group.map((a) => a.id);
      await supabaseAdmin
        .from("sales_agents")
        .update({ active: true, auto_paused_reason: null })
        .in("id", ids);
      summary.push({ reason, resumed: group.map((a) => a.name) });
    } catch {
      summary.push({ reason, resumed: [], stillDown: true });
    }
  }

  return summary;
}

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
    const resumed = await resumeAutoPausedAgents();

    const agents = await listActiveSalesAgents();
    const now = new Date();
    const eligible = agents.filter((agent) => isAgentEligibleNow(agent, now));

    // Limite GLOBAL de 1 anuncio por rodada (nao por agente): com varios
    // agentes ativos, cada um so respeitando o proprio intervalo, dava pra
    // varios ficarem elegiveis no mesmo tick e disparar juntos — o grupo
    // recebia varias mensagens em sequencia rapida. Como o cron ja roda a
    // cada 15min, processar so o mais "atrasado" (menor last_run_at) garante
    // 1 envio a cada 15min no total, revezando de forma justa entre agentes.
    const sortedByOldest = [...eligible].sort((a, b) => {
      const aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
      const bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
      return aTime - bTime;
    });

    // Cascata: se o agente mais atrasado nao despachar nada (fonte fora do ar,
    // erro, sem candidato novo), tenta o proximo mais atrasado dentro do MESMO
    // tick, em vez de so tentar 1 e deixar o cronometro do grupo parado ate o
    // proximo ciclo. So para quando um agente realmente enfileira algo (queued
    // > 0) ou quando a lista de elegiveis acaba. Teto de seguranca pra nao
    // estourar o tempo maximo da funcao se muitas fontes caírem juntas.
    const MAX_ATTEMPTS_PER_TICK = 8;

    const runs: Array<{
      agentId: string;
      agentName: string;
      result: Awaited<ReturnType<typeof runSalesAgent>> | { success: false; message: string };
    }> = [];

    for (const agent of sortedByOldest.slice(0, MAX_ATTEMPTS_PER_TICK)) {
      try {
        const result = await runSalesAgent(agent.id);
        runs.push({ agentId: agent.id, agentName: agent.name, result });
        if ("queued" in result && result.queued > 0) break;
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
      resumedAutoPaused: resumed,
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
