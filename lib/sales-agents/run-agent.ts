import { salvarOferta, supabaseAdmin } from "@/lib/supabase";
import { generateWhatsAppCopy } from "@/lib/copy/whatsapp-generator";
import { generateAiProductImage } from "@/lib/ai/product-image";
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

async function findExistingOfferByAffiliateUrl(affiliateUrl: string): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id")
    .eq("affiliate_url", affiliateUrl)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao verificar duplicidade da oferta: ${error.message}`);
  }

  return data as { id: string } | null;
}

async function countSentToday(agentId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("post_queue")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("dedupe_bucket", todayUtcDate())
    .in("status", ["queued", "processing", "sent"]);

  if (error) {
    throw new Error(`Falha ao contar envios do dia do agente: ${error.message}`);
  }

  return count ?? 0;
}

function passesBasicFilters(agent: SalesAgent, candidate: DiscoveryCandidate): boolean {
  if (!candidate.title || !(candidate.price > 0) || !candidate.affiliateUrl) return false;
  if (typeof agent.priceMin === "number" && candidate.price < agent.priceMin) return false;
  if (typeof agent.priceMax === "number" && candidate.price > agent.priceMax) return false;
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
    const selected = selectCandidates(agent, discovered).slice(0, remainingQuota);

    for (const candidate of selected) {
      try {
        const existing = await findExistingOfferByAffiliateUrl(candidate.affiliateUrl);
        if (existing) {
          skipped += 1;
          details.push({ title: candidate.title, action: "skipped", reason: "duplicate" });
          continue;
        }

        const savedOffer = await saveOfferCandidate({
          title: candidate.title,
          price: candidate.price,
          original_price: candidate.oldPrice,
          old_price: candidate.oldPrice,
          discount_pct: candidate.discountPct ?? 0,
          image_url: candidate.imageUrl,
          product_url: candidate.productUrl,
          affiliate_url: candidate.affiliateUrl,
          marketplace: agent.source,
          category: candidate.category,
          status: "active",
          curations_status: "approved",
          slot_type: "flash",
          source: `sales_agent:${agent.id}`,
          currency: "BRL",
          raw_data: {
            source: "sales_agent",
            agent_id: agent.id,
            agent_name: agent.name,
            discovery: candidate.raw,
          },
        });

        const offerId = toText(savedOffer.id);
        if (!offerId) {
          throw new Error("Oferta criada sem id valido.");
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

    const result: AgentRunResult = {
      success: errors === 0,
      message: offers.length
        ? `${offers.length} oferta(s) despachada(s).`
        : "Nenhuma oferta nova encontrada nesta rodada.",
      candidatesFound,
      candidatesConsidered: selected.length,
      queued,
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
