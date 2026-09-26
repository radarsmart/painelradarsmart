import {
  getAutoPublishMinConfidence,
  getAutoPublishMinScore,
} from "@/lib/opportunity-engine/opportunity-score";
import { normalizePaymentTerms, type PriceNormalizerInput } from "@/lib/opportunity-engine/price-normalizer";
import { toNullableNumber } from "@/lib/opportunity-engine/text-utils";

export type PublishingGateStatus = "APPROVED" | "BLOCKED" | "REVIEW_REQUIRED";

export type PublishingGateInput = PriceNormalizerInput & {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  stock_status?: unknown;
  affiliate_url?: unknown;
  product_url?: unknown;
  expires_at?: unknown;
  match_score?: unknown;
  match_status?: unknown;
  condition?: unknown;
  opportunity_score?: unknown;
  opportunity_confidence?: unknown;
  opportunity_status?: unknown;
};

export type PublishingGateResult = {
  status: PublishingGateStatus;
  reasons: string[];
  warnings: string[];
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function isHttpUrl(value: unknown): boolean {
  const text = toText(value);
  if (!text) return false;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isExpired(value: unknown): boolean {
  const text = toText(value);
  if (!text) return false;
  const ms = Date.parse(text);
  return Number.isFinite(ms) && ms < Date.now();
}

export function evaluatePublishingGate(input: PublishingGateInput): PublishingGateResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const payment = normalizePaymentTerms(input);
  const status = toText(input.status).toLowerCase();
  const stock = toText(input.stock_status).toLowerCase();
  const condition = toText(input.condition).toUpperCase();
  const matchStatus = toText(input.match_status).toUpperCase();
  const matchScore = toNullableNumber(input.match_score);
  const opportunityScore = toNullableNumber(input.opportunity_score);
  const opportunityConfidence = toNullableNumber(input.opportunity_confidence);

  if (!toText(input.title)) reasons.push("Produto sem titulo.");
  if (status && !["active", "pending", "inactive"].includes(status)) {
    reasons.push(`Status de oferta desconhecido: ${status}.`);
  }
  if (["out_of_stock", "unavailable", "sold_out"].includes(stock)) {
    reasons.push("Estoque indisponivel.");
  }
  if (!isHttpUrl(input.affiliate_url)) {
    reasons.push("affiliate_url invalida ou ausente.");
  }
  if (input.expires_at && isExpired(input.expires_at)) {
    reasons.push("Oferta expirada.");
  }
  if (payment.effective_price === null || payment.effective_price <= 0) {
    reasons.push("Preco efetivo ausente.");
  }
  if (["USED", "REFURBISHED", "OPEN_BOX", "GENERIC", "COMPATIBLE"].includes(condition)) {
    reasons.push(`Condicao nao aprovada para publicacao automatica: ${condition}.`);
  }
  if (matchStatus === "REJECTED" || (matchScore !== null && matchScore < 65)) {
    reasons.push("Match confidence insuficiente.");
  }
  if (opportunityScore !== null && opportunityScore < getAutoPublishMinScore()) {
    warnings.push("Opportunity score abaixo do limite de autopublicacao.");
  }
  if (
    opportunityScore !== null &&
    opportunityScore >= getAutoPublishMinScore() &&
    opportunityConfidence !== null &&
    opportunityConfidence < getAutoPublishMinConfidence()
  ) {
    warnings.push("Confidence abaixo do limite de autopublicacao.");
  }
  if (!payment.pix_price && payment.installments) {
    warnings.push("Parcelamento existe, mas preco PIX nao foi informado.");
  }
  if (payment.pix_price && !payment.card_price && !payment.installments) {
    warnings.push("Preco PIX informado sem condicao de cartao/parcelamento.");
  }

  if (reasons.length > 0) return { status: "BLOCKED", reasons, warnings };
  if (warnings.length > 0) return { status: "REVIEW_REQUIRED", reasons, warnings };
  return { status: "APPROVED", reasons: ["Regras duras aprovadas."], warnings };
}
