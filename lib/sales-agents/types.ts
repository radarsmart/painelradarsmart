export type SalesAgentSource = "awin" | "lomadee" | "shopee" | "amazon" | "mercadolivre";

export const SALES_AGENT_SOURCES: SalesAgentSource[] = [
  "awin",
  "lomadee",
  "shopee",
  "amazon",
  "mercadolivre",
];

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
  sendWindowStartHour: number;
  sendWindowEndHour: number;
  timezone: string;
  maxSendsPerDay: number;
  minIntervalMinutes: number;
  active: boolean;
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
  raw: unknown;
};

export type AgentRunResult = {
  success: boolean;
  message: string;
  candidatesFound: number;
  candidatesConsidered: number;
  queued: number;
  skipped: number;
  errors: number;
  offers: Array<{ offerId: string; title: string; queued: number; skipped: number }>;
  details: Array<{ title: string; action: string; reason?: string; error?: string }>;
  executedAt: string;
};
