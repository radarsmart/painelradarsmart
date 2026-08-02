export type SalesAgentSource = "awin" | "lomadee" | "shopee" | "amazon" | "mercadolivre";

export const SALES_AGENT_SOURCES: SalesAgentSource[] = [
  "awin",
  "lomadee",
  "shopee",
  "amazon",
  "mercadolivre",
];

export type SalesAgentTextMode = "ai" | "custom";

// Mesmas 3 opcoes que a Central de Oferta ja usa pra decidir onde no site a
// oferta aparece (ver lib/offers/site-visibility.ts).
export type SiteSlotType = "flash" | "best" | "comparator";

export type SalesAgent = {
  id: string;
  name: string;
  source: SalesAgentSource;
  advertiserId: string | null;
  searchQuery: string | null;
  category: string | null;
  priceMin: number | null;
  priceMax: number | null;
  minDiscountPct: number;
  aavFilterEnabled: boolean;
  aiImageEnabled: boolean;
  aiInstructions: string | null;
  textMode: SalesAgentTextMode;
  customTextTemplate: string | null;
  aiImagePrompt: string | null;
  sendWindowStartHour: number;
  sendWindowStartMinute: number;
  sendWindowEndHour: number;
  sendWindowEndMinute: number;
  timezone: string;
  maxSendsPerDay: number;
  minIntervalMinutes: number;
  active: boolean;
  publishToSite: boolean;
  siteSlotType: SiteSlotType;
  lastRunAt: string | null;
  lastRunResult: unknown | null;
  createdAt: string;
  updatedAt: string;
  targetIds: string[];
};

export type DiscoveryCandidate = {
  externalId: string;
  title: string;
  price: number;
  oldPrice: number | null;
  discountPct: number | null;
  imageUrl: string | null;
  affiliateUrl: string;
  productUrl: string;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  badges: string[];
  /**
   * Comissao real do afiliado em % (ex.: Shopee), quando a loja nao expoe
   * desconto/avaliacao real na API — usado como sinal substituto no filtro
   * AAV (ver passesRadarSniperPreFilter).
   */
  commissionRatePct: number | null;
  raw: unknown;
  /**
   * true quando affiliateUrl e um link de afiliado real/rastreado (API ou
   * automacao oficial da loja). false quando nao foi possivel confirmar
   * rastreamento (ex: falha na geracao automatica) — nesse caso a oferta
   * entra em revisao manual em vez de ser publicada direto.
   */
  affiliateLinkVerified: boolean;
};

export type AgentRunResult = {
  success: boolean;
  message: string;
  candidatesFound: number;
  candidatesConsidered: number;
  queued: number;
  staged: number;
  skipped: number;
  errors: number;
  offers: Array<{ offerId: string; title: string; queued: number; skipped: number }>;
  details: Array<{ title: string; action: string; reason?: string; error?: string }>;
  executedAt: string;
};
