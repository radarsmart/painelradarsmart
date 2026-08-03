import { salvarOferta, supabaseAdmin } from "@/lib/supabase";
import { generateWhatsAppCopy } from "@/lib/copy/whatsapp-generator";
import { generateAiProductImage } from "@/lib/ai/product-image";
import { generateMlAffiliateLink, fetchMlSellerReputation } from "@/lib/scraping/ml-session-client";
import { dispatchToSpecificTargets, todayLocalDate } from "@/lib/distribution/legacy-dispatch";
import { buildSiteManualCopyOverride } from "@/lib/offers/site-visibility";
import { ensureOfferShortCode } from "@/lib/offers/short-link";
import { trackAndComputeDiscount } from "./price-tracking";
import { passesRadarSniperPreFilter, rankSniperCandidates } from "@/lib/radar-sniper";
import { renderCustomTemplate } from "./custom-template";
import { discoverForAgent } from "./discovery";
import { getSalesAgent, saveSalesAgentRunResult } from "./agent-store";
import type { AgentRunResult, DiscoveryCandidate, SalesAgent } from "./types";

function toText(value: unknown): string {
  return String(value ?? "").trim();
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

// Nao repete o mesmo produto antes disso, mesmo que tenha tido cliques — evita
// spam. Depois disso, so repete se teve interesse real (ver isEligibleForRepost).
const MIN_REPOST_HOURS = 24;

type ExistingOfferInfo = {
  id: string;
  createdAt: string;
  clickCount: number;
  everDispatched: boolean;
};

async function findExistingOffer(candidate: DiscoveryCandidate): Promise<ExistingOfferInfo | null> {
  if (!candidate.productUrl) return null;

  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id, created_at, click_count")
    .eq("product_url", candidate.productUrl)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao verificar duplicidade da oferta: ${error.message}`);
  }
  if (!data) return null;

  const { data: queueRow, error: queueError } = await supabaseAdmin
    .from("post_queue")
    .select("id")
    .eq("offer_id", data.id)
    .limit(1)
    .maybeSingle();
  if (queueError) {
    throw new Error(`Falha ao verificar historico de envio da oferta: ${queueError.message}`);
  }

  return {
    id: String(data.id),
    createdAt: String(data.created_at),
    clickCount: Number(data.click_count ?? 0),
    everDispatched: Boolean(queueRow),
  };
}

// O cliente pode ter visto e nao comprado na hora, mas se depois voltar a ver
// pode comprar — entao repetir oferta e permitido, mas so quando ha sinal real
// de interesse (cliques no grupo/site), nao so por ter passado tempo. Excecao:
// uma oferta que nunca foi de fato enviada (ex.: criada so pra acumular
// historico de preco via price-tracking) nao e "repost" nenhum — e a primeira
// vez publicando de verdade, entao libera na hora.
function isEligibleForRepost(existing: ExistingOfferInfo): boolean {
  if (!existing.everDispatched) return true;
  const hoursSinceLastPost = (Date.now() - new Date(existing.createdAt).getTime()) / 3600000;
  return hoursSinceLastPost >= MIN_REPOST_HOURS && existing.clickCount > 0;
}

function resolveSiteBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured || "https://radarsmart.com.br").replace(/\/$/, "");
}

// Link rastreado (em vez do link de afiliado cru) para que cliques vindos dos
// grupos de WhatsApp/Telegram tambem contem como sinal de interesse, do mesmo
// jeito que os cliques do site — necessario pro criterio de repost acima.
// Usa o short_code (6 caracteres) em vez do uuid completo da oferta pra nao
// ficar um link gigante dentro da mensagem do grupo.
async function buildTrackedLink(offerId: string): Promise<string> {
  const shortCode = await ensureOfferShortCode(supabaseAdmin, offerId);
  return `${resolveSiteBaseUrl()}/go/${shortCode}`;
}

async function countSentToday(agentId: string): Promise<number> {
  // Conta ofertas distintas, nao linhas da fila — cada oferta gera 1 linha por
  // destino (grupo/canal), entao contar linhas infla a cota quando o agente
  // tem varios destinos configurados.
  const { data, error } = await supabaseAdmin
    .from("post_queue")
    .select("offer_id")
    .eq("agent_id", agentId)
    .eq("dedupe_bucket", todayLocalDate())
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

// Fontes que nao trazem desconto/avaliacao/comissao real por produto (ex.: a
// maioria dos anunciantes da AWIN) usam rastreamento de preco proprio —
// grava o preco de hoje e so libera o candidato quando ja da pra confirmar
// uma queda real vs a media historica (ver lib/sales-agents/price-tracking.ts).
async function enrichWithPriceTracking(
  agent: SalesAgent,
  candidates: DiscoveryCandidate[],
): Promise<DiscoveryCandidate[]> {
  const enriched: DiscoveryCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.discountPct !== null) {
      enriched.push(candidate);
      continue;
    }
    if (!candidate.title || !(candidate.price > 0) || !candidate.affiliateUrl) continue;
    if (typeof agent.priceMin === "number" && candidate.price < agent.priceMin) continue;
    if (typeof agent.priceMax === "number" && candidate.price > agent.priceMax) continue;

    try {
      const tracked = await trackAndComputeDiscount(agent, candidate);
      if (tracked.ready && tracked.discountPct !== null) {
        enriched.push({
          ...candidate,
          discountPct: tracked.discountPct,
          oldPrice: tracked.avgPrice !== null ? Math.round(tracked.avgPrice * 100) / 100 : null,
        });
      }
    } catch {
      // Falha no rastreamento nao deve travar o agente inteiro — so deixa de
      // considerar esse candidato nesta rodada.
    }
  }

  return enriched;
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
    const withPriceTracking = await enrichWithPriceTracking(agent, discovered);
    const ranked = selectCandidates(agent, withPriceTracking);

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
        let repostOfferId: string | null = null;
        if (existing) {
          if (!isEligibleForRepost(existing)) {
            skipped += 1;
            details.push({ title: candidate.title, action: "skipped", reason: "duplicate" });
            continue;
          }
          repostOfferId = existing.id;
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

        // So publica no site quando a oferta ja esta pronta pra ir ao ar (link
        // de afiliado confirmado) e o agente tem "publicar no site" ativado —
        // mesmas 3 opcoes (flash/best/comparator) que a Central de Oferta usa.
        const publishToSiteNow = agent.publishToSite && !needsManualAffiliate;

        const offerFields = {
          title: candidate.title,
          price: candidate.price,
          original_price: candidate.oldPrice,
          old_price: candidate.oldPrice,
          discount_pct: candidate.discountPct ?? 0,
          image_url: candidate.imageUrl,
          installment_count: candidate.installmentCount,
          installment_amount: candidate.installmentAmount,
          installment_interest_free: candidate.installmentInterestFree,
          coupon_code: candidate.couponCode,
          coupon_description: candidate.couponDescription,
          affiliate_url: needsManualAffiliate ? null : candidate.affiliateUrl,
          status: needsManualAffiliate ? "inactive" : "active",
          curations_status: needsManualAffiliate ? "review" : "approved",
          slot_type: publishToSiteNow ? agent.siteSlotType : null,
          published_at: publishToSiteNow ? new Date().toISOString() : null,
          // Um trigger antigo do banco (auto_curate_offer) reavalia curations_status
          // sozinho com base numa coluna "score" que os agentes nunca preenchem, e
          // acaba marcando como "rejected" mesmo apos AAV + reputacao ja terem
          // aprovado a oferta. O manual_copy com site_override e o mesmo mecanismo
          // que a Central de Oferta usa pra aprovacao manual — isOfferVisibleOnSite()
          // aceita esse override independente do que o trigger fizer com curations_status.
          manual_copy: publishToSiteNow
            ? buildSiteManualCopyOverride(null, agent.siteSlotType, new Date().toISOString())
            : null,
          raw_data: {
            source: "sales_agent",
            agent_id: agent.id,
            agent_name: agent.name,
            discovery: candidate.raw,
            ...(needsManualAffiliate
              ? { needs_manual_approval: true, needs_manual_affiliate_url: true }
              : {}),
          },
        };

        let offerId: string;
        if (repostOfferId) {
          // Reaproveita a mesma oferta (mesmo id) em vez de criar duplicata —
          // zera o contador de cliques e a data de criacao pra medir interesse
          // fresco deste novo ciclo, e reabrir a janela de 24h pro proximo repost.
          const { data: updated, error: updateError } = await supabaseAdmin
            .from("offers")
            .update({ ...offerFields, click_count: 0, created_at: new Date().toISOString() })
            .eq("id", repostOfferId)
            .select("id")
            .single();
          if (updateError || !updated) {
            throw new Error(updateError?.message ?? "Falha ao atualizar oferta para reenvio.");
          }
          offerId = toText(updated.id);
        } else {
          const savedOffer = await saveOfferCandidate({
            ...offerFields,
            external_offer_id: candidate.externalId,
            product_url: candidate.productUrl,
            marketplace: agent.source,
            category: candidate.category,
            source: `sales_agent:${agent.id}`,
            currency: "BRL",
          });
          offerId = toText(savedOffer.id);
        }

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

        // Link rastreado (nao o link de afiliado cru) embutido no texto — assim
        // cliques vindos do grupo tambem contam como sinal de interesse pro
        // criterio de repost (ver isEligibleForRepost).
        const trackedLink = await buildTrackedLink(offerId);

        let telegramText: string;
        let whatsappText: string;

        if (agent.textMode === "custom" && agent.customTextTemplate) {
          const rendered = renderCustomTemplate(agent.customTextTemplate, {
            productName: candidate.title,
            price: candidate.price,
            originalPrice: candidate.oldPrice,
            discountPct: candidate.discountPct,
            store: agent.source,
            link: trackedLink,
          });
          telegramText = rendered;
          whatsappText = rendered;
        } else {
          const copy = await generateWhatsAppCopy({
            title: candidate.title,
            price: candidate.price,
            original_price: candidate.oldPrice ?? undefined,
            discount_pct: candidate.discountPct ?? undefined,
            affiliate_url: trackedLink,
            image_url: imageUrlForCopy,
            category: candidate.category ?? undefined,
            marketplace: agent.source,
            extra_instructions: agent.aiInstructions ?? undefined,
            installment_count: candidate.installmentCount ?? undefined,
            installment_amount: candidate.installmentAmount ?? undefined,
            installment_interest_free: candidate.installmentInterestFree ?? undefined,
            coupon_code: candidate.couponCode ?? undefined,
            coupon_description: candidate.couponDescription ?? undefined,
          });
          telegramText = copy.long;
          whatsappText = copy.medium;
        }

        const dispatch = await dispatchToSpecificTargets({
          offerId,
          targetIds: agent.targetIds,
          agentId: agent.id,
          // Usa o link rastreado tambem no botao inline (Telegram) — e o que o
          // cliente realmente clica, entao precisa ser o /go/ pra contar como
          // sinal de interesse, nao o link de afiliado cru.
          affiliateUrl: trackedLink,
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
