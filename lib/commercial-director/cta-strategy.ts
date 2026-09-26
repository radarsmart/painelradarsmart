// Radar Creative AI - Commercial Director / CTA Strategy
//
// Reaproveita o texto de CTA oficial ja validado pelo dono (BRAND_CTA_LINE)
// em vez de inventar um novo - so estrutura em torno dele para permitir
// A/B testing futuro.

import { BRAND_CTA_LINE } from "@/lib/ugc/brand-kit";
import type { CtaStrategy, PresenterStrategy } from "@/lib/commercial-director/types";

const HIGH_URGENCY_DISCOUNT = 40;
const MEDIUM_URGENCY_DISCOUNT = 20;

export function buildCtaStrategy(
  presenterStrategy: PresenterStrategy,
  discountPct: number | null,
): CtaStrategy {
  const ctaUrgency =
    (discountPct ?? 0) >= HIGH_URGENCY_DISCOUNT
      ? "HIGH"
      : (discountPct ?? 0) >= MEDIUM_URGENCY_DISCOUNT
        ? "MEDIUM"
        : "LOW";

  return {
    ctaText: BRAND_CTA_LINE,
    ctaVisual: "logo Radar Smart + preco final em destaque",
    ctaPresenter: presenterStrategy === "PRODUCT_ONLY" ? "PRODUCT_ONLY" : "GAROTA_RADAR_CTA_ONLY",
    ctaUrgency,
  };
}
