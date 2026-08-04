import { salvarOferta, supabaseAdmin } from "@/lib/supabase";
import { generateWhatsAppCopy } from "@/lib/copy/whatsapp-generator";
import { generateAiProductImage } from "@/lib/ai/product-image";
import { generateMlAffiliateLink, fetchMlSellerReputation } from "@/lib/scraping/ml-session-client";
import { dispatchToSpecificTargets, todayLocalDate } from "@/lib/distribution/legacy-dispatch";
import { buildSiteManualCopyOverride } from "@/lib/offers/site-visibility";
import { assignProductGroup, normalizeTitleTokens, titleSimilarity } from "@/lib/offers/product-matching";
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

// Quantas horas deixar os agentes de ML pausados apos um bloqueio de
// rate-limit do gerador de link — tempo fixo (nao sondagem ativa), porque
// testar a pagina bloqueada de novo cedo demais so estende o bloqueio do
// lado do Mercado Livre.
const ML_RATE_LIMIT_COOLDOWN_HOURS = 2;
const ML_RATE_LIMIT_PAUSE_REASON = "ml_affiliate_rate_limited";

function isMlAffiliateRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /RATE_LIMITED/i.test(message);
}

// Pausa TODOS os agentes de ML ativos assim que um deles esbarra no
// rate-limit do gerador de link — eles compartilham a mesma sessao/pagina do
// ML, entao deixar os outros continuarem tentando so bateria no mesmo
// bloqueio de novo. resumeAutoPausedAgents() no cron reativa sozinho depois
// do cooldown (ver app/api/cron/sales-agents/run/route.ts).
async function pauseMlAgentsForRateLimit(): Promise<void> {
  const until = new Date(Date.now() + ML_RATE_LIMIT_COOLDOWN_HOURS * 3600000).toISOString();
  await supabaseAdmin
    .from("sales_agents")
    .update({ active: false, auto_paused_reason: ML_RATE_LIMIT_PAUSE_REASON, auto_paused_until: until })
    .eq("source", "mercadolivre")
    .eq("active", true);
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

async function loadExistingOfferInfo(offerId: string, createdAt: string, clickCount: number): Promise<ExistingOfferInfo> {
  const { data: queueRow, error: queueError } = await supabaseAdmin
    .from("post_queue")
    .select("id")
    .eq("offer_id", offerId)
    .limit(1)
    .maybeSingle();
  if (queueError) {
    throw new Error(`Falha ao verificar historico de envio da oferta: ${queueError.message}`);
  }

  return {
    id: offerId,
    createdAt,
    clickCount,
    everDispatched: Boolean(queueRow),
  };
}

// So considera ofertas recentes pro fallback por titulo — nao faz sentido
// (e fica caro) comparar contra o catalogo inteiro, so contra o que pode
// realmente ter sido postado de novo por engano.
const TITLE_FALLBACK_LOOKBACK_HOURS = 96;
const TITLE_FALLBACK_SIMILARITY_THRESHOLD = 0.82;
const TITLE_FALLBACK_MAX_PRICE_RATIO = 1.2;

// O Mercado Livre (e outras lojas) devolvem, pro MESMO anuncio, URLs
// diferentes dependendo de onde o produto foi encontrado: link de busca com
// querystring de rastreio, link "catalogo" (/p/MLB...) vs link "item"
// (MLB-...) etc. O dedupe por URL exata (abaixo) pega a maioria dos casos,
// mas quando a URL muda de formato ele nao reconhece e o agente republica o
// mesmo produto como se fosse novidade. Esse fallback por titulo+preco (na
// mesma loja, dentro da janela recente) e a rede de seguranca pro que a URL
// exata deixa passar.
async function findExistingOfferByTitle(
  candidate: DiscoveryCandidate,
  marketplace: string,
): Promise<ExistingOfferInfo | null> {
  if (!candidate.title || !(candidate.price > 0)) return null;

  const since = new Date(Date.now() - TITLE_FALLBACK_LOOKBACK_HOURS * 3600000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id, title, price, created_at, click_count")
    .eq("marketplace", marketplace)
    .gte("created_at", since)
    .limit(200);

  if (error) {
    throw new Error(`Falha ao verificar duplicidade da oferta (fallback por titulo): ${error.message}`);
  }

  let best: { id: string; createdAt: string; clickCount: number; score: number } | null = null;
  for (const row of data ?? []) {
    const rowPrice = Number(row.price) || 0;
    if (rowPrice <= 0) continue;
    const ratio = candidate.price > rowPrice ? candidate.price / rowPrice : rowPrice / candidate.price;
    if (ratio > TITLE_FALLBACK_MAX_PRICE_RATIO) continue;

    const score = titleSimilarity(candidate.title, String(row.title ?? ""));
    if (score < TITLE_FALLBACK_SIMILARITY_THRESHOLD) continue;
    if (!best || score > best.score) {
      best = {
        id: String(row.id),
        createdAt: String(row.created_at),
        clickCount: Number(row.click_count ?? 0),
        score,
      };
    }
  }

  if (!best) return null;
  return loadExistingOfferInfo(best.id, best.createdAt, best.clickCount);
}

async function findExistingOffer(candidate: DiscoveryCandidate, marketplace: string): Promise<ExistingOfferInfo | null> {
  if (candidate.productUrl) {
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
    if (data) {
      return loadExistingOfferInfo(String(data.id), String(data.created_at), Number(data.click_count ?? 0));
    }
  }

  return findExistingOfferByTitle(candidate, marketplace);
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

// Tokens "significativos" (>=5 letras) pra flagrar "mesma linha de produto" —
// ex.: "Perfume Rabanne 1 Million Eau De Toilette 200ml" e "1 Million Elixir
// Rabanne Masc EDP 200ml" sao variantes DIFERENTES (nao e duplicata, o
// titleSimilarity fica baixo por causa de abreviacao/formatacao), mas ainda
// assim repetir a mesma marca+linha de perfume no mesmo dia no grupo passa a
// sensacao de repeticao pro cliente. So compara tokens longos pra evitar falso
// positivo com palavras genericas do nicho (perfume, feminino, ml, edp...).
const SAME_LINE_TOKEN_MIN_LENGTH = 5;
const SAME_LINE_MIN_SHARED_TOKENS = 2;

function significantTokens(title: string): Set<string> {
  return new Set(Array.from(normalizeTitleTokens(title)).filter((token) => token.length >= SAME_LINE_TOKEN_MIN_LENGTH));
}

// So evita repetir a mesma linha/marca de produto NO MESMO DIA e pelo MESMO
// agente — variedade dentro do nicho, nao duplicidade tecnica (essa e trata
// em findExistingOffer). Um agente diferente pode postar a mesma marca sem
// problema (grupos/canais podem ser distintos).
async function hasSameLineSentToday(agentId: string, candidateTitle: string): Promise<boolean> {
  const candidateTokens = significantTokens(candidateTitle);
  if (candidateTokens.size === 0) return false;

  const { data, error } = await supabaseAdmin
    .from("post_queue")
    .select("offers(title)")
    .eq("agent_id", agentId)
    .eq("dedupe_bucket", todayLocalDate());

  if (error) {
    throw new Error(`Falha ao verificar variedade do dia do agente: ${error.message}`);
  }

  for (const row of data ?? []) {
    const title = String((row as { offers?: { title?: string } }).offers?.title ?? "");
    if (!title) continue;
    const shared = Array.from(significantTokens(title)).filter((token) => candidateTokens.has(token));
    if (shared.length >= SAME_LINE_MIN_SHARED_TOKENS) return true;
  }

  return false;
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
// grava o preco de hoje pra ir formando historico (ver
// lib/sales-agents/price-tracking.ts), mas NAO trava o candidato enquanto o
// historico ainda esta imaturo (< MIN_HISTORY_DAYS): decisao do negocio foi
// priorizar o grupo ter fluxo de oferta desde ja, mesmo sem desconto
// confirmado, em vez de ficar mudo por dias esperando 3 dias de historico.
// O rastreamento continua rodando em paralelo a cada candidato visto — assim
// que amadurecer (queda real >= MIN_TRACKED_DISCOUNT_PCT), a oferta passa a
// sair com desconto confirmado (ver uso de tracked.ready abaixo). Sem
// discountPct/oldPrice o texto da oferta so mostra o preco, sem alegar
// desconto que ainda nao foi confirmado (ver buildPriceBlock no gerador de
// copy — so mostra "De: / Desconto:" quando ha originalPrice real).
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
      } else {
        enriched.push(candidate);
      }
    } catch {
      // Falha no rastreamento nao deve travar o agente inteiro — deixa
      // seguir sem desconto confirmado em vez de descartar o candidato.
      enriched.push(candidate);
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
        const existing = await findExistingOffer(candidate, agent.source);
        let repostOfferId: string | null = null;
        if (existing) {
          if (!isEligibleForRepost(existing)) {
            skipped += 1;
            details.push({ title: candidate.title, action: "skipped", reason: "duplicate" });
            continue;
          }
          repostOfferId = existing.id;
        }

        if (!repostOfferId && (await hasSameLineSentToday(agent.id, candidate.title))) {
          skipped += 1;
          details.push({ title: candidate.title, action: "skipped", reason: "mesma_linha_ja_postada_hoje" });
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
            // candidate.productUrl e a forma CANONICA/encurtada (so pra dedupe -
            // ver canonicalizeMlProductUrl em discovery/mercadolivre.ts). O
            // gerador de link de afiliado do ML rejeita esse formato curto
            // ("Este URL nao e permitido pelo Programa") — precisa da URL
            // original completa, que fica em affiliateUrl ate esse ponto
            // (ainda nao foi sobrescrita pela linha abaixo).
            const rawProductUrl = candidate.affiliateUrl || candidate.productUrl;
            candidate.affiliateUrl = await generateMlAffiliateLink(rawProductUrl);
            candidate.affiliateLinkVerified = true;
          } catch (affiliateError) {
            if (isMlAffiliateRateLimitError(affiliateError)) {
              await pauseMlAgentsForRateLimit();
              details.push({
                title: candidate.title,
                action: "ml_affiliate_rate_limited",
                error: `Mercado Livre bloqueou por excesso de requisicoes — agentes de ML pausados por ${ML_RATE_LIMIT_COOLDOWN_HOURS}h.`,
              });
              break;
            }

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
          // {} (nao null) — a coluna e NOT NULL no banco; parseManualCopy() ja
          // trata objeto vazio exatamente como "sem override", entao e
          // equivalente pra quem le, mas evita o insert falhar com
          // "null value in column manual_copy violates not-null constraint"
          // sempre que a oferta nao vai direto pro site (ex.: link de
          // afiliado do ML falhou e ficou pendente de aprovacao manual).
          manual_copy: publishToSiteNow
            ? buildSiteManualCopyOverride(null, agent.siteSlotType, new Date().toISOString())
            : {},
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

        // Tenta achar o mesmo produto em outra loja pra alimentar a
        // comparacao real entre marketplaces na pagina da oferta — best
        // effort (nunca lanca erro), mas espera terminar pra nao ser
        // cortado pelo fim da funcao serverless.
        await assignProductGroup(supabaseAdmin, offerId, {
          title: candidate.title,
          price: candidate.price,
          marketplace: agent.source,
          category: candidate.category,
        });

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
