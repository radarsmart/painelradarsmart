// Radar Creative AI - Commercial Persuasion / Desire Engine V1 - Purchase Motivation Questions
//
// PURO - responde WHY_BUY_THIS_PRODUCT / WHY_BUY_AT_THIS_PRICE / WHY_BUY_NOW
// / WHY_KEEP_WATCHING SEMPRE com evidencia+confidence explicitos. Regra
// central (item 6 do pedido): sem evidencia real de urgencia (estoque
// baixo, prazo real de oferta), WHY_BUY_NOW NUNCA inventa "ultimas
// unidades"/"oferta termina hoje" - fica com confidence=LOW e uma
// resposta honesta de que nao ha urgencia legitima disponivel.

import type { PersuasionEvidence, ProductDesireProfile, PurchaseMotivationAnswers } from "@/lib/commercial-video/persuasion/types";

const URGENCY_PRESSURE_KEYWORDS = [
  "ultimas unidades",
  "últimas unidades",
  "oferta termina",
  "so hoje",
  "só hoje",
  "corra",
  "acaba hoje",
  "estoque limitado",
  "por tempo limitado",
];

/**
 * Deteccao ANTI-GAMING (item 28-D do pedido, fixture FAKE_URGENCY) -
 * independente do fluxo normal desta camada (que NUNCA produz
 * confidence != LOW para whyBuyNow sem evidencia real, ver
 * answerPurchaseMotivationQuestions acima). Serve pra provar que, SE
 * algum caller externo (ou uma fixture sintetica adversarial) tentar
 * forcar uma resposta de urgencia com confidence alta sem fonte real, o
 * gate detecta e reprova - nunca confia so na boa-fe do gerador de copy.
 */
export function detectFakeUrgency(motivationAnswers: PurchaseMotivationAnswers): { detected: boolean; reason: string } {
  const statement = motivationAnswers.whyBuyNow.statement.toLowerCase();
  const matchedKeyword = URGENCY_PRESSURE_KEYWORDS.find((kw) => statement.includes(kw));
  const detected = Boolean(matchedKeyword) && motivationAnswers.whyBuyNow.confidence !== "LOW";
  return {
    detected,
    reason: detected
      ? `whyBuyNow contem linguagem de urgencia de pressao ("${matchedKeyword}") com confidence="${motivationAnswers.whyBuyNow.confidence}" (deveria ser LOW sem evidencia real de estoque/prazo) - urgencia fabricada.`
      : "Nenhuma urgencia fabricada detectada.",
  };
}

export function answerPurchaseMotivationQuestions(evidence: PersuasionEvidence, desireProfile: ProductDesireProfile): PurchaseMotivationAnswers {
  const whyBuyThisProduct = {
    statement: `${evidence.productName}: ${desireProfile.primaryDesire.text}`,
    evidence: `Fonte: ${desireProfile.primaryDesire.source} - ${desireProfile.primaryDesire.text}`,
    confidence: desireProfile.primaryDesire.confidence,
  };

  const whyBuyAtThisPrice =
    evidence.price !== null
      ? {
          statement: `R$ ${evidence.price.toFixed(2).replace(".", ",")} e um valor de entrada baixo para experimentar a categoria "${desireProfile.productCategory}" sem grande risco financeiro.`,
          evidence: `Preco real persistido em offers.price (R$ ${evidence.price.toFixed(2).replace(".", ",")}). ${evidence.discountPercent && evidence.discountPercent > 0 ? `Desconto real de ${evidence.discountPercent}%.` : "Sem desconto real a comunicar (discount_pct=0)."}`,
          confidence: "HIGH" as const,
        }
      : {
          statement: "Nao ha preco persistido - argumento de preco nao pode ser construido.",
          evidence: "offers.price = null.",
          confidence: "LOW" as const,
        };

  const hasRealUrgencySignal = false; // nenhum campo real de estoque/prazo de oferta existe hoje no schema - nunca inventar
  const whyBuyNow = hasRealUrgencySignal
    ? { statement: "Urgencia real disponivel.", evidence: "(nao aplicavel nesta versao - nenhum sinal real de estoque/prazo existe no schema atual)", confidence: "LOW" as const }
    : {
        statement: "Nao ha evidencia real de urgencia (estoque, prazo de oferta) disponivel nesta oferta - nenhuma frase de urgencia deve ser criada (nunca 'ultimas unidades'/'oferta termina hoje' sem fonte real).",
        evidence: "Schema atual de offers nao expõe estoque nem prazo de expiracao verificavel para uso comercial direto nesta versao.",
        confidence: "LOW" as const,
      };

  const whyKeepWatching = {
    statement: `Curiosidade sobre ${desireProfile.likelyConsumerGoal} + preco baixo (R$ ${evidence.price?.toFixed(2).replace(".", ",") ?? "?"}) como gatilho de permanencia.`,
    evidence: `Combinacao de desireProfile.primaryDesire (${desireProfile.primaryDesire.source}) + preco real.`,
    confidence: desireProfile.primaryDesire.confidence,
  };

  return { whyBuyThisProduct, whyBuyAtThisPrice, whyBuyNow, whyKeepWatching };
}
