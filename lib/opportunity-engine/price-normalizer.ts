import {
  formatBRL,
  roundMoney,
  toNullableNumber,
} from "@/lib/opportunity-engine/text-utils";

export type PriceNormalizerInput = {
  price?: unknown;
  regular_price?: unknown;
  old_price?: unknown;
  original_price?: unknown;
  cash_price?: unknown;
  pix_price?: unknown;
  card_price?: unknown;
  installment_total_price?: unknown;
  installments?: unknown;
  installment_count?: unknown;
  installment_value?: unknown;
  installment_amount?: unknown;
  interest_free?: unknown;
  installment_interest_free?: unknown;
  shipping_cost?: unknown;
  coupon_discount?: unknown;
  automatic_discount?: unknown;
  cashback?: unknown;
  effective_price?: unknown;
  quantity?: unknown;
  package_quantity?: unknown;
  unit_quantity?: unknown;
  currency?: unknown;
  payment_information_original?: unknown;
};

export type NormalizedPaymentTerms = {
  regular_price: number | null;
  cash_price: number | null;
  pix_price: number | null;
  card_price: number | null;
  installment_total_price: number | null;
  installments: number | null;
  installment_value: number | null;
  interest_free: boolean | null;
  shipping_cost: number | null;
  coupon_discount: number | null;
  automatic_discount: number | null;
  cashback: number | null;
  effective_price: number | null;
  unit_price: number | null;
  unit_price_basis: "unit" | "kg" | "100g" | "liter" | "ml" | null;
  currency: string;
  payment_information_original: string | null;
};

export type OfferPresentation = {
  headline_price: string | null;
  secondary_price: string | null;
  discount_text: string | null;
  urgency_text: string | null;
  payment_summary: string | null;
};

function toPositiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toNullableNumber(value);
    if (parsed !== null && parsed >= 0) return parsed;
  }
  return null;
}

function toPositiveInteger(...values: unknown[]): number | null {
  const parsed = toPositiveNumber(...values);
  if (parsed === null || parsed <= 0) return null;
  return Math.round(parsed);
}

function toBooleanOrNull(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) continue;
    if (["true", "1", "sim", "sem juros", "interest_free"].includes(text)) return true;
    if (["false", "0", "nao", "não", "com juros"].includes(text)) return false;
  }
  return null;
}

function parsePaymentText(text: unknown): Partial<NormalizedPaymentTerms> {
  const raw = String(text ?? "").trim();
  if (!raw) return {};

  const normalized = raw.toLowerCase();
  const money = "(?:r\\$\\s*)?([0-9]{1,3}(?:\\.[0-9]{3})*,[0-9]{2}|[0-9]+[.,][0-9]{2})";
  const pixMatch = normalized.match(new RegExp(`${money}\\s*(?:no\\s*)?pix`));
  const installmentMatch = normalized.match(new RegExp(`(\\d{1,2})\\s*[x×]\\s*(?:de\\s*)?${money}`));

  return {
    pix_price: pixMatch?.[1] ? toNullableNumber(pixMatch[1]) : null,
    installments: installmentMatch?.[1] ? toPositiveInteger(installmentMatch[1]) : null,
    installment_value: installmentMatch?.[2] ? toNullableNumber(installmentMatch[2]) : null,
    interest_free: normalized.includes("sem juros")
      ? true
      : normalized.includes("com juros")
        ? false
        : null,
  };
}

function calculateEffectivePrice(input: {
  cashPrice: number | null;
  pixPrice: number | null;
  cardPrice: number | null;
  regularPrice: number | null;
  shippingCost: number | null;
  couponDiscount: number | null;
  automaticDiscount: number | null;
}): number | null {
  const base = input.pixPrice ?? input.cashPrice ?? input.cardPrice ?? input.regularPrice;
  if (base === null) return null;

  const effective =
    base +
    Math.max(0, input.shippingCost ?? 0) -
    Math.max(0, input.couponDiscount ?? 0) -
    Math.max(0, input.automaticDiscount ?? 0);

  return roundMoney(Math.max(0, effective));
}

function calculateUnitPrice(input: {
  effectivePrice: number | null;
  quantity: number | null;
}): number | null {
  if (input.effectivePrice === null || !input.quantity || input.quantity <= 1) return null;
  return roundMoney(input.effectivePrice / input.quantity);
}

export function normalizePaymentTerms(input: PriceNormalizerInput): NormalizedPaymentTerms {
  const parsedText = parsePaymentText(input.payment_information_original);
  const regularPrice = toPositiveNumber(input.regular_price, input.price);
  const rawPixPrice = toPositiveNumber(input.pix_price, parsedText.pix_price);
  const pixPrice =
    rawPixPrice !== null &&
    regularPrice !== null &&
    rawPixPrice > regularPrice + 0.01
      ? regularPrice
      : rawPixPrice;
  const rawCashPrice = toPositiveNumber(input.cash_price, pixPrice);
  const cashPrice =
    rawCashPrice !== null &&
    regularPrice !== null &&
    rawCashPrice > regularPrice + 0.01
      ? pixPrice ?? regularPrice
      : rawCashPrice;
  const installments = toPositiveInteger(input.installments, input.installment_count, parsedText.installments);
  const installmentValue = toPositiveNumber(
    input.installment_value,
    input.installment_amount,
    parsedText.installment_value,
  );
  const installmentTotal =
    toPositiveNumber(input.installment_total_price) ??
    (installments && installmentValue ? roundMoney(installments * installmentValue) : null);
  const cardPrice = toPositiveNumber(input.card_price, installmentTotal, regularPrice);
  const interestFree = toBooleanOrNull(
    input.interest_free,
    input.installment_interest_free,
    parsedText.interest_free,
  );
  const shippingCost = toPositiveNumber(input.shipping_cost);
  const couponDiscount = toPositiveNumber(input.coupon_discount);
  const automaticDiscount = toPositiveNumber(input.automatic_discount);
  const cashback = toPositiveNumber(input.cashback);
  const effectivePrice = calculateEffectivePrice({
    cashPrice,
    pixPrice,
    cardPrice,
    regularPrice,
    shippingCost,
    couponDiscount,
    automaticDiscount,
  });
  const quantity = toPositiveNumber(input.unit_quantity, input.package_quantity, input.quantity);

  return {
    regular_price: regularPrice,
    cash_price: cashPrice,
    pix_price: pixPrice,
    card_price: cardPrice,
    installment_total_price: installmentTotal,
    installments,
    installment_value: installmentValue,
    interest_free: interestFree,
    shipping_cost: shippingCost,
    coupon_discount: couponDiscount,
    automatic_discount: automaticDiscount,
    cashback,
    effective_price: effectivePrice,
    unit_price: calculateUnitPrice({ effectivePrice, quantity }),
    unit_price_basis: quantity && quantity > 1 ? "unit" : null,
    currency: String(input.currency ?? "BRL").trim().toUpperCase() || "BRL",
    payment_information_original: String(input.payment_information_original ?? "").trim() || null,
  };
}

export function getBestCashPrice(payment: NormalizedPaymentTerms): number | null {
  return payment.pix_price ?? payment.cash_price ?? payment.regular_price;
}

export function getCardPrice(payment: NormalizedPaymentTerms): number | null {
  return payment.card_price ?? payment.regular_price;
}

export function getInstallmentText(payment: NormalizedPaymentTerms): string | null {
  if (payment.installments && payment.installment_value) {
    const formatted = formatBRL(payment.installment_value);
    if (!formatted) return null;
    const suffix = payment.interest_free === true ? " sem juros" : "";
    return `ou ${payment.installments}x de ${formatted} no cartão de crédito${suffix}`;
  }

  const cashReference = payment.pix_price ?? payment.cash_price ?? payment.regular_price;
  if (
    payment.card_price &&
    cashReference !== null &&
    Math.abs(payment.card_price - cashReference) >= 0.01
  ) {
    const formatted = formatBRL(payment.card_price);
    return formatted ? `ou 1x de ${formatted} no cartão de crédito` : null;
  }

  return null;
}

export function getPaymentSummary(payment: NormalizedPaymentTerms): string | null {
  const headline = payment.pix_price
    ? `${formatBRL(payment.pix_price)} no PIX`
    : payment.cash_price
      ? `${formatBRL(payment.cash_price)} a vista`
      : payment.regular_price
        ? `${formatBRL(payment.regular_price)} no PIX`
        : null;
  const installment = getInstallmentText(payment);

  return [headline, installment].filter(Boolean).join("\n") || null;
}

export function buildOfferPresentation(input: PriceNormalizerInput & {
  radar_real_discount_pct?: unknown;
  urgency_text?: unknown;
}): OfferPresentation {
  const payment = normalizePaymentTerms(input);
  const headline = payment.pix_price
    ? `${formatBRL(payment.pix_price)} no PIX`
    : payment.cash_price
      ? `${formatBRL(payment.cash_price)} a vista`
      : payment.regular_price
        ? `${formatBRL(payment.regular_price)} no PIX`
        : null;
  const secondary = getInstallmentText(payment);
  const realDiscount = toNullableNumber(input.radar_real_discount_pct);

  return {
    headline_price: headline,
    secondary_price: secondary,
    discount_text:
      realDiscount !== null && realDiscount > 0
        ? `${Math.round(realDiscount)}% abaixo da referencia Radar`
        : null,
    urgency_text: String(input.urgency_text ?? "").trim() || null,
    payment_summary: getPaymentSummary(payment),
  };
}
