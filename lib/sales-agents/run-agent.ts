import { salvarOferta, supabaseAdmin } from "@/lib/supabase";
import { generateWhatsAppCopy } from "@/lib/copy/whatsapp-generator";
import { generateAiProductImage } from "@/lib/ai/product-image";
import { generateMlAffiliateLink, fetchMlSellerReputation } from "@/lib/scraping/ml-session-client";
import { dispatchToSpecificTargets } from "@/lib/distribution/legacy-dispatch";
import { passesRadarSniperPreFilter, rankSniperCandidates } from "@/lib/radar-sniper";
import { renderCustomTemplate } from "./custom-template";
import { discoverForAgent } from "./discovery";
import { getSalesAgent, saveSalesAgentRunResult } from "./agent-store";
import type { AgentRunResult, DiscoveryCandidate, SalesAgent } from "./types";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getMissingColumnFromError(message: string): string | null {
  return (
    message.match(/Could not find the '([^']+)' column/i)?.[1] ||
    message.match(/column "([^"]+)" of relation/i)?.[1] ||
    null
  );
}

async function saveOfferCandidate(payload: Record<string, unknown>): Promise<{ id: string }> {
  const payloadToSave = { ...payload };
  let saveResult = await salvarOferta(payloadToSave);

  while (saveResult.error) {
    const missingColumn = getMissingColumnFromError(saveResult.error.message);
    if (!missingColumn || !(missingColumn in payloadToSave)) {
      break;
    }
    delete payloadToSave[missingColumn];
    saveResult = await salvarOferta(payloadToSave);
  }

  if (saveResult.error || !saveResult.data) {
    throw new Error(saveResult.error?.message ?? "Falha ao criar oferta do agente.");
  }

  return saveResult.data as { id: string };
}

async function findExistingOffer(candidate: DiscoveryCandidate): Promise<{ id: string } | null> {
  if (!candidate.productUrl) return null;

  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id")
    .eq("product_url", candidate.productUrl)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao verificar duplicidade da oferta: ${error.message}`);
  }

  return data as { id: string } | null;
}

async function countSentToday(agentId: string): Promise<number> {
  // Conta ofertas distintas, nao linhas da fila — cada oferta gera 1 linha por
  // destino (grupo/canal), entao contar linhas infla a cota quando o agente
  // tem varios destinos configurados.
  const { data, error } = await supabaseAdmin
    .from("post_queue")
    .select("offer_id")
    .eq("agent_id", agentId)
    .eq("dedupe_bucket", todayUtcDate())
    .in("status", ["queued", "processing", "sent"]);

  if (error) {
    throw new Error(`Falha ao contar envios do dia do agente: ${error.message}`);
  }

  const distinctOfferIds = new Set((data ?? []).map((row) => row.offer_id));
  return distinctOfferIds.size;
}

// Descontos acima disso quase sempre sao erro de extracao (ex.: valor de
// parcela confundido com preco) e nao um desconto real — melhor descartar o
// candidato do que arriscar publicar uma oferta enganosa.
const MAX_PLAUSIBLE_DISCOUNT_PCT = 80;

// Vendedor com historico de vendas real (nao gamificavel tao facilmente quanto
// nota/reviews) — abaixo disso, trata como vendedor novo/pouco estabelecido.
const MIN_SELLER_SALES = 500;

function passesBasicFilters(agent: SalesAgent, candidate: DiscoveryCandidate): boolean {
  if (!candidate.title || !(candidate.price > 0) || !candidate.affiliateUrl) return false;
  if (typeof agent.priceMin === "number" && candidate.price < agent.priceMin) return false;
  if (typeof agent.priceMax === "number" && candidate.price > agent.priceMax) return false;
  if (candidate.discountPct !== null && candidate.discountPct > MAX_PLAUSIBLE_DISCOUNT_PCT) return false;
  if (
    agent.minDiscountPct > 0 &&
    candidate.discountPct !== null &&
    candidate.discountPct < agent.minDiscountPct
  ) {
    return false;
  }
  return true;
}

function selectCandidates(agent: SalesAgent, candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const filtered = candidates.filter((candidate) => passesBasicFilters(agent, candidate));

  if (!agent.aavFilterEnabled) {
    return filtered;
  }

  const withSignal = filtered.filter((candidate) => passesRadarSniperPreFilter(candidate));
  return rankSniperCandidates(withSignal);
}

export async function runSalesAgent(agentId: string): Promise<AgentRunResult> {
  const agent = await getSalesAgent(agentId);
  if (!agent) {
    throw new Error("Agente nao encontrado.");
  }
  if (!agent.targetIds.length) {
    throw new Error("Agente sem grupos/destinos configurados.");
  }

  const executedAt = new Date().toISOString();
  const details: AgentRunResult["details"] = [];
  const offers: AgentRunResult["offers"] = [];
  let queued = 0;
  let staged = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const remainingQuota = agent.maxSendsPerDay - (await countSentToday(agent.id));
    if (remainingQuota <= 0) {
      const result: AgentRunResult = {
        success: true,
        message: "Quota diaria do agente ja foi atingida.",
        candidatesFound: 0,
        candidatesConsidered: 0,
        queued: 0,
        staged: 0,
        skipped: 0,
        errors: 0,
        offers: [],
        details: [],
        executedAt,
      };
      await saveSalesAgentRunResult(agent.id, result);
      return result;
    }

    const discovered = await discoverForAgent(agent);
    const candidatesFound = discovered.length;
    const ranked = selectCandidates(agent, discovered);

    // So processa 1 oferta por execucao: o cron roda a cada poucos minutos, entao
    // isso e o que garante o espacamento entre mensagens (min_interval_minutes)
    // em vez de despachar a cota inteira do dia de uma vez na mesma rodada. Se um
    // candidato for rejeitado (duplicado, vendedor sem reputacao etc.), tenta o
    // proximo da lista ranqueada em vez de desistir a rodada inteira.
    const perRunLimit = Math.min(1, remainingQuota);
    let dispatchedThisRun = 0;
    let consideredCount = 0;

    for (const candidate of ranked) {
      if (dispatchedThisRun >= perRunLimit) break;
      consideredCount += 1;

      try {
        const existing = await findExistingOffer(candidate);
        if (existing) {
          skipped += 1;
          details.push({ title: candidate.title, action: "skipped", reason: "duplicate" });
          continue;
        }

        if (agent.source === "mercadolivre") {
          try {
            const reputation = await fetchMlSellerReputation(candidate.productUrl);
            const looksNewOrUnrated = /\bnovo\b/i.test(reputation.level || "");
            const hasLowSalesHistory =
              reputation.totalSales !== null && reputation.totalSales < MIN_SELLER_SALES;

            // So bloqueia com sinal negativo explicito (vendedor novo/sem
            // historico, ou historico de vendas baixo confirmado). Quando a
            // extracao nao acha nada (ex.: vendedor oficial "Mercado Livre",
            // layout de pagina diferente), deixa passar em vez de arriscar
            // rejeitar tudo por falso negativo — so registra como desconhecido.
            if (looksNewOrUnrated || hasLowSalesHistory) {
              skipped += 1;
              details.push({
                title: candidate.title,
                action: "skipped",
                reason: `reputacao_vendedor_insuficiente${reputation.sellerName ? ` (${reputation.sellerName})` : ""}`,
              });
              continue;
            }
            if (reputation.totalSales === null) {
              details.push({
                title: candidate.title,
                action: "seller_reputation_unknown",
                reason: reputation.sellerName ?? "vendedor nao identificado",
              });
            }
          } catch (reputationError) {
            // Falha tecnica na checagem nao deve travar o agente inteiro — so
            // registra e segue sem a garantia extra de reputacao.
            details.push({
              title: candidate.title,
              action: "seller_reputation_check_failed",
              error:
                reputationError instanceof Error
                  ? reputationError.message
                  : "Falha desconhecida na checagem de reputacao do vendedor.",
            });
          }
        }

        if (agent.source === "mercadolivre" && !candidate.affiliateLinkVerified) {
          try {
            candidate.affiliateUrl = await generateMlAffiliateLink(candidate.productUrl);
            candidate.affiliateLinkVerified = true;
          } catch (affiliateError) {
            details.push({
              title: candidate.title,
              action: "ml_affiliate_link_failed",
              error:
                affiliateError instanceof Error
                  ? affiliateError.message
                  : "Falha desconhecida ao gerar link de afiliado ML.",
            });
          }
        }

        const needsManualAffiliate = !candidate.affiliateLinkVerified;

        const savedOffer = await saveOfferCandidate({
          external_offer_id: candidate.externalId,
          title: candidate.title,
          price: candidate.price,
          original_price: candidate.oldPrice,
          old_price: candidate.oldPrice,
          discount_pct: candidate.discountPct ?? 0,
          image_url: candidate.imageUrl,
          product_url: candidate.productUrl,
          affiliate_url: needsManualAffiliate ? null : candidate.affiliateUrl,
          marketplace: agent.source,
          category: candidate.category,
          status: needsManualAffiliate ? "inactive" : "active",
          curations_status: needsManualAffiliate ? "review" : "approved",
          slot_type: "flash",
          source: `sales_agent:${agent.id}`,
          currency: "BRL",
          raw_data: {
            source: "sales_agent",
            agent_id: agent.id,
            agent_name: agent.name,
            discovery: candidate.raw,
            ...(needsManualAffiliate
              ? { needs_manual_approval: true, needs_manual_affiliate_url: true }
              : {}),
          },
        });

        const offerId = toText(savedOffer.id);
        if (!offerId) {
          throw new Error("Oferta criada sem id valido.");
        }

        if (needsManualAffiliate) {
          staged += 1;
          dispatchedThisRun += 1;
          offers.push({ offerId, title: candidate.title, queued: 0, skipped: 0 });
          details.push({
            title: candidate.title,
            action: "staged_for_review",
            reason: "link_de_afiliado_pendente",
          });
          continue;
        }

        let imageUrlForCopy = candidate.imageUrl || undefined;
        if (agent.aiImageEnabled && candidate.imageUrl) {
          try {
            const generatedImage = await generateAiProductImage({
              imageUrl: candidate.imageUrl,
              prompt: agent.aiImagePrompt ?? undefined,
            });
            imageUrlForCopy = generatedImage.imageUrl;
            await supabaseAdmin
              .from("offers")
              .update({ image_url: generatedImage.imageUrl })
              .eq("id", offerId);
          } catch (imageError) {
            details.push({
              title: candidate.title,
              action: "ai_image_failed",
              error: imageError instanceof Error ? imageError.message : "Falha desconhecida na imagem.",
            });
          }
        }

        let telegramText: string;
        let whatsappText: string;

        if (agent.textMode === "custom" && agent.customTextTemplate) {
          const rendered = renderCustomTemplate(agent.customTextTemplate, {
            productName: candidate.title,
            price: candidate.price,
            originalPrice: candidate.oldPrice,
            discountPct: candidate.discountPct,
            store: agent.source,
            link: candidate.affiliateUrl,
          });
          telegramText = rendered;
          whatsappText = rendered;
        } else {
          const copy = await generateWhatsAppCopy({
            title: candidate.title,
            price: candidate.price,
            original_price: candidate.oldPrice ?? undefined,
            discount_pct: candidate.discountPct ?? undefined,
            affiliate_url: candidate.affiliateUrl,
            image_url: imageUrlForCopy,
            category: candidate.category ?? undefined,
            marketplace: agent.source,
            extra_instructions: agent.aiInstructions ?? undefined,
          });
          telegramText = copy.long;
          whatsappText = copy.medium;
        }

        const dispatch = await dispatchToSpecificTargets({
          offerId,
          targetIds: agent.targetIds,
          agentId: agent.id,
          affiliateUrl: candidate.affiliateUrl,
          copyByChannel: { telegram: telegramText, whatsapp: whatsappText },
        });

        queued += dispatch.queued;
        skipped += dispatch.skipped;
        dispatchedThisRun += 1;
        offers.push({
          offerId,
          title: candidate.title,
          queued: dispatch.queued,
          skipped: dispatch.skipped,
        });
        details.push({ title: candidate.title, action: "dispatched" });
      } catch (candidateError) {
        errors += 1;
        details.push({
          title: candidate.title,
          action: "error",
          error: candidateError instanceof Error ? candidateError.message : "Falha desconhecida.",
        });
      }
    }

    const messageParts: string[] = [];
    if (offers.length - staged > 0) messageParts.push(`${offers.length - staged} oferta(s) despachada(s)`);
    if (staged > 0) messageParts.push(`${staged} aguardando link de afiliado manual (revisao)`);

    const result: AgentRunResult = {
      success: errors === 0,
      message: messageParts.length ? messageParts.join(", ") + "." : "Nenhuma oferta nova encontrada nesta rodada.",
      candidatesFound,
      candidatesConsidered: consideredCount,
      queued,
      staged,
      skipped,
      errors,
      offers,
      details,
      executedAt,
    };

    await saveSalesAgentRunResult(agent.id, result);
    return result;
  } catch (error) {
    const result: AgentRunResult = {
      success: false,
      message: error instanceof Error ? error.message : "Falha desconhecida ao rodar o agente.",
      candidatesFound: 0,
      candidatesConsidered: 0,
      queued,
      staged,
      skipped,
      errors: errors + 1,
      offers,
      details,
      executedAt,
    };
    await saveSalesAgentRunResult(agent.id, result).catch(() => undefined);
    return result;
  }
}
