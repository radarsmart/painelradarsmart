import { normalizePaymentTerms, type PriceNormalizerInput } from "@/lib/opportunity-engine/price-normalizer";
import { clamp } from "@/lib/opportunity-engine/text-utils";

export type PaymentAttractivenessResult = {
  payment_attractiveness_score: number;
  reasons: string[];
  warnings: string[];
};

export function calculatePaymentAttractiveness(input: PriceNormalizerInput): PaymentAttractivenessResult {
  const payment = normalizePaymentTerms(input);
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 40;

  if (payment.pix_price && payment.card_price && payment.card_price > payment.pix_price) {
    const pixDiscount = ((payment.card_price - payment.pix_price) / payment.card_price) * 100;
    if (pixDiscount >= 10) {
      score += 18;
      reasons.push("Desconto PIX forte.");
    } else if (pixDiscount >= 3) {
      score += 10;
      reasons.push("Desconto PIX relevante.");
    }
    warnings.push(`Preco PIX ${Math.round(pixDiscount)}% menor que o cartao.`);
  }

  if (payment.installments && payment.installment_value) {
    if (payment.installments >= 10) {
      score += 20;
      reasons.push("Parcelamento longo disponivel.");
    } else if (payment.installments >= 6) {
      score += 12;
      reasons.push("Parcelamento medio disponivel.");
    } else {
      score += 6;
      reasons.push("Parcelamento curto disponivel.");
    }

    if (payment.interest_free === true) {
      score += 20;
      reasons.push("Parcelamento sem juros confirmado.");
    } else if (payment.interest_free === false) {
      score -= 8;
      warnings.push("Parcelamento informado sem evidencia de ser sem juros.");
    }
  }

  if (!payment.pix_price && !payment.installments) {
    warnings.push("Condicao de pagamento incompleta.");
  }

  return {
    payment_attractiveness_score: Math.round(clamp(score, 0, 100)),
    reasons,
    warnings,
  };
}
