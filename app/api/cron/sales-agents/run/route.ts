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
    .select("id,name,advertiser_id,auto_paused_reason,auto_paused_until")
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
    // ml_affiliate_rate_limited: sem sondagem ativa (sondar a pagina
    // bloqueada de novo cedo demais so estenderia o bloqueio do lado do ML)
    // — so reativa quando o cooldown gravado em auto_paused_until passar.
    if (reason === "ml_affiliate_rate_limited") {
      const ready = group.filter((a) => {
        const until = a.auto_paused_until ? Date.parse(String(a.auto_paused_until)) : 0;
        return Number.isFinite(until) && until > 0 && until <= Date.now();
      });
      if (!ready.length) {
        summary.push({ reason, resumed: [], stillDown: true });
        continue;
      }
      await supabaseAdmin
        .from("sales_agents")
        .update({ active: true, auto_paused_reason: null, auto_paused_until: null })
        .in(
          "id",
          ready.map((a) => a.id),
        );
      summary.push({ reason, resumed: ready.map((a) => a.name) });
      continue;
    }

    if (reason !== "awin_feed_500") continue; // demais motivos nao tem sondagem automatica

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

// Distribuicao alvo do grupo por categoria, baseada em como grandes perfis de
// ofertas (Pelando, Promobit) organizam o mix do dia — nao e um horario fixo
// por categoria (isso quebraria a resiliencia da cascata acima), so garante
// que ao longo do dia o grupo nao fique enviesado pra uma unica categoria.
const CONTENT_CATEGORY_QUOTA: Record<string, number> = {
  eletronicos: 30,
  moda: 20,
  casa: 15,
  beleza: 10,
  esportes: 10,
  supermercado: 10,
  outros: 5,
};

// Brasil nao observa horario de verao desde 2019, entao UTC-3 e fixo.
const BRASILIA_OFFSET_HOURS = 3;

function getStartOfTodayInBrasiliaAsUtc(): Date {
  const now = new Date();
  const shifted = new Date(now.getTime() - BRASILIA_OFFSET_HOURS * 60 * 60 * 1000);
  const startOfDayShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  return new Date(startOfDayShifted + BRASILIA_OFFSET_HOURS * 60 * 60 * 1000);
}

async function getTodayDispatchCountByCategory(
  agentCategoryById: Map<string, string>,
): Promise<Map<string, number>> {
  const startOfDay = getStartOfTodayInBrasiliaAsUtc();

  const { data } = await supabaseAdmin
    .from("post_queue")
    .select("agent_id")
    .gte("created_at", startOfDay.toISOString());

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ agent_id: string | null }>) {
    const category = (row.agent_id && agentCategoryById.get(row.agent_id)) || "outros";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
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
    // cada 15min, processar so o mais "atrasado" garante 1 envio a cada
    // 15min no total.
    //
    // Dentro disso, prioriza a categoria mais "devendo" em relacao a cota do
    // dia (CONTENT_CATEGORY_QUOTA) — ex.: se eletronicos ja passou de 30% do
    // enviado hoje, um agente de moda parado ha menos tempo passa na frente
    // de um agente de eletronicos parado ha mais tempo. Empate (mesmo deficit
    // de cota, ex.: dia comecando do zero) usa o mais atrasado como criterio.
    const agentCategoryById = new Map(
      agents.map((agent) => [agent.id, agent.contentCategory || "outros"]),
    );
    const dispatchedTodayByCategory = await getTodayDispatchCountByCategory(agentCategoryById);
    const totalDispatchedToday = [...dispatchedTodayByCategory.values()].reduce(
      (sum, n) => sum + n,
      0,
    );

    function categoryDeficit(category: string): number {
      const targetShare = (CONTENT_CATEGORY_QUOTA[category] ?? CONTENT_CATEGORY_QUOTA.outros) / 100;
      const currentShare = totalDispatchedToday > 0
        ? (dispatchedTodayByCategory.get(category) ?? 0) / totalDispatchedToday
        : 0;
      return targetShare - currentShare;
    }

    const sortedByOldest = [...eligible].sort((a, b) => {
      const deficitDiff =
        categoryDeficit(a.contentCategory || "outros") -
        categoryDeficit(b.contentCategory || "outros");
      if (Math.abs(deficitDiff) > 0.001) return -deficitDiff; // maior deficit primeiro

      const aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
      const bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
      return aTime - bTime;
    });

    // Cascata: se o agente mais atrasado nao despachar nada (fonte fora do ar,
    // erro, sem candidato novo), tenta o proximo mais atrasado dentro do MESMO
    // tick, em vez de so tentar 1 e deixar o cronometro do grupo parado ate o
    // proximo ciclo. So para quando um agente realmente enfileira algo (queued
    // > 0) ou quando a lista de elegiveis acaba.
    //
    // Teto dinamico (nao um numero fixo baixo): com cota por categoria, uma
    // categoria "devendo" cota (ex.: eletronicos zerado no dia) sempre ordena
    // primeiro mesmo quando esta com o pool de produtos esgotado (todo
    // candidato vira duplicate/sem novidade) — um teto fixo baixo (ex.: 8)
    // deixava esses agentes travados consumirem TODAS as tentativas da rodada
    // todo tick, nunca chegando nos agentes de outras categorias que
    // realmente tinham produto novo pra mandar (foi exatamente isso que
    // travou o grupo por horas: eletronicos+moda+casa esgotados na frente da
    // fila, beleza/supermercado/outros com produto novo nunca tentados).
    // Cada tentativa que falha e rapida (so consulta banco), so a que
    // realmente despacha faz trabalho pesado (IA/imagem) — e o loop para no
    // primeiro sucesso — entao dá pra tentar todos os elegiveis com folga de
    // sobra dentro do limite de tempo da funcao.
    const MAX_ATTEMPTS_PER_TICK = Math.min(eligible.length, 30);

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
      categoryQuota: {
        target: CONTENT_CATEGORY_QUOTA,
        dispatchedToday: Object.fromEntries(dispatchedTodayByCategory),
        totalDispatchedToday,
      },
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
