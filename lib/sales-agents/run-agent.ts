import { salvarOferta, supabaseAdmin } from "@/lib/supabase";
import { generateWhatsAppCopy } from "@/lib/copy/whatsapp-generator";
import { generateAiProductImage } from "@/lib/ai/product-image";
import { dispatchToSpecificTargets } from "@/lib/distribution/legacy-dispatch";
import { passesRadarSniperPreFilter, rankSniperCandidates } from "@/lib/radar-sniper";
import { renderCustomTemplate } from "./custom-template";
import { discoverForAgent } from "./discovery";
import { getSalesAgent, saveSalesAgentRunResult } from "./agent-store";
import { SOURCES_REQUIRING_MANUAL_AFFILIATE } from "./types";
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

async function findExistingOffer(
  candidate: DiscoveryCandidate,
  useProductUrl: boolean,
): Promise<{ id: string } | null> {
  const column = useProductUrl ? "product_url" : "affiliate_url";
  const value = useProductUrl ? candidate.productUrl : candidate.affiliateUrl;
  if (!value) return null;

  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id")
    .eq(column, value)
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
  let staged = 0;
  let skipped = 0;
  let errors = 0;
  const needsManualAffiliate = SOURCES_REQUIRING_MANUAL_AFFILIATE.includes(agent.source);

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
    const selected = selectCandidates(agent, discovered).slice(0, remainingQuota);

    for (const candidate of selected) {
      try {
        const existing = await findExistingOffer(candidate, needsManualAffiliate);
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
      candidatesConsidered: selected.length,
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
