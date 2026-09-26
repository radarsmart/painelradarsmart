import type {
  CommercialQualityIssue,
  CommercialQualityStatus,
  OfferConsistencyResult,
  OfferQualitySnapshot,
  VisualCommercialClaim,
} from "@/lib/commercial-video/quality/types";

function normalizeMoneyValue(value: string): number | null {
  const cleaned = value
    .replace(/\s/g, "")
    .replace(/[^\d,.]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePercentValue(value: string): number | null {
  const match = value.match(/-?\d+([,.]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasRealDiscount(offer: OfferQualitySnapshot): boolean {
  if (offer.discountPercent !== null && offer.discountPercent > 0) return true;
  return offer.originalPrice !== null && offer.price !== null && offer.originalPrice > offer.price;
}

function pushIssue(issues: CommercialQualityIssue[], issue: CommercialQualityIssue): void {
  issues.push(issue);
}

export function assessOfferConsistency(offer: OfferQualitySnapshot, visualClaims: VisualCommercialClaim[]): OfferConsistencyResult {
  const issues: CommercialQualityIssue[] = [];
  const realDiscount = hasRealDiscount(offer);

  for (const claim of visualClaims) {
    if (claim.source === "GENERATED_CONTENT") {
      if (claim.kind === "PRICE") {
        pushIssue(issues, {
          category: "GENERATED_PRICE",
          severity: "CRITICAL",
          sceneId: claim.sceneId,
          message: `Preco gerado dentro do asset: "${claim.value}". Preco comercial deve vir do compositor/dado persistido.`,
        });
      }
      if (claim.kind === "DISCOUNT") {
        pushIssue(issues, {
          category: claim.value.trim().toUpperCase() === "0% OFF" ? "GENERATED_CONTENT_CONTAMINATION" : "GENERATED_DISCOUNT",
          severity: "CRITICAL",
          sceneId: claim.sceneId,
          message: `Desconto gerado dentro do asset: "${claim.value}". Asset nao deve ser reutilizado automaticamente.`,
        });
      }
      continue;
    }

    if (claim.kind === "PRICE") {
      const claimPrice = normalizeMoneyValue(claim.value);
      if (offer.price !== null && claimPrice !== null && Math.abs(claimPrice - offer.price) > 0.01) {
        pushIssue(issues, {
          category: "PRICE_MISMATCH",
          severity: "CRITICAL",
          sceneId: claim.sceneId,
          message: `Preco visual/narrado "${claim.value}" diverge do preco persistido (${offer.price}).`,
        });
      }
    }

    if (claim.kind === "DISCOUNT") {
      const normalized = claim.value.trim().toUpperCase();
      if (normalized === "0% OFF" && !realDiscount) {
        pushIssue(issues, {
          category: "INVALID_DISCOUNT_OVERLAY",
          severity: "CRITICAL",
          sceneId: claim.sceneId,
          message: "Overlay 0% OFF nao e informacao comercial valida quando nao ha desconto real.",
        });
      }

      const claimDiscount = normalizePercentValue(claim.value);
      if (claimDiscount !== null && offer.discountPercent !== null && Math.abs(claimDiscount - offer.discountPercent) > 0.1) {
        pushIssue(issues, {
          category: "DISCOUNT_MISMATCH",
          severity: "CRITICAL",
          sceneId: claim.sceneId,
          message: `Desconto visual/narrado "${claim.value}" diverge do desconto persistido (${offer.discountPercent}%).`,
        });
      }
    }
  }

  const blocking = issues.some((issue) => issue.severity === "BLOCKING" || issue.severity === "CRITICAL");
  const status: CommercialQualityStatus = blocking ? "FAIL" : issues.length > 0 ? "PASS_WITH_OBSERVATIONS" : "PASS";
  return { status, issues };
}
