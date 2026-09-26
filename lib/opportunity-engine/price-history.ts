import { roundMoney } from "@/lib/opportunity-engine/text-utils";

export type PriceHistorySnapshot = {
  offer_id?: string | null;
  canonical_product_id?: string | null;
  marketplace?: string | null;
  seller?: string | null;
  regular_price?: number | null;
  pix_price?: number | null;
  card_price?: number | null;
  effective_price?: number | null;
  shipping_cost?: number | null;
  captured_at: string | Date;
};

export type PriceWindowStats = {
  lowest: number | null;
  average: number | null;
  samples: number;
  distinct_days: number;
};

export type PriceHistoryStats = {
  lowest_7d: number | null;
  average_7d: number | null;
  samples_7d: number;
  lowest_30d: number | null;
  average_30d: number | null;
  samples_30d: number;
  lowest_90d: number | null;
  average_90d: number | null;
  samples_90d: number;
  distinct_days_90d: number;
};

export type RadarRealDiscountResult = {
  radar_real_discount_pct: number | null;
  reference_price: number | null;
  reference_window_days: 30 | 90 | null;
  confidence: "high" | "medium" | "low" | "insufficient";
  reason: string;
};

function snapshotPrice(snapshot: PriceHistorySnapshot): number | null {
  const price =
    snapshot.effective_price ??
    snapshot.pix_price ??
    snapshot.card_price ??
    snapshot.regular_price ??
    null;
  return price !== null && Number.isFinite(price) && price > 0 ? price : null;
}

function capturedMs(snapshot: PriceHistorySnapshot): number {
  const date = snapshot.captured_at instanceof Date ? snapshot.captured_at : new Date(snapshot.captured_at);
  return date.getTime();
}

function distinctDays(snapshots: PriceHistorySnapshot[]): number {
  return new Set(
    snapshots
      .map((snapshot) => {
        const ms = capturedMs(snapshot);
        return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
      })
      .filter(Boolean),
  ).size;
}

export function calculateWindowStats(
  snapshots: PriceHistorySnapshot[],
  days: number,
  now = new Date(),
): PriceWindowStats {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  const scoped = snapshots.filter((snapshot) => {
    const ms = capturedMs(snapshot);
    return Number.isFinite(ms) && ms >= since && ms <= now.getTime();
  });
  const prices = scoped
    .map(snapshotPrice)
    .filter((price): price is number => price !== null && price > 0);

  if (!prices.length) {
    return { lowest: null, average: null, samples: 0, distinct_days: 0 };
  }

  return {
    lowest: roundMoney(Math.min(...prices)),
    average: roundMoney(prices.reduce((sum, price) => sum + price, 0) / prices.length),
    samples: prices.length,
    distinct_days: distinctDays(scoped),
  };
}

export function calculatePriceHistoryStats(
  snapshots: PriceHistorySnapshot[],
  now = new Date(),
): PriceHistoryStats {
  const stats7 = calculateWindowStats(snapshots, 7, now);
  const stats30 = calculateWindowStats(snapshots, 30, now);
  const stats90 = calculateWindowStats(snapshots, 90, now);

  return {
    lowest_7d: stats7.lowest,
    average_7d: stats7.average,
    samples_7d: stats7.samples,
    lowest_30d: stats30.lowest,
    average_30d: stats30.average,
    samples_30d: stats30.samples,
    lowest_90d: stats90.lowest,
    average_90d: stats90.average,
    samples_90d: stats90.samples,
    distinct_days_90d: stats90.distinct_days,
  };
}

export function calculateRadarRealDiscount(params: {
  current_effective_price: number | null;
  history: PriceHistorySnapshot[];
  min_distinct_days?: number;
  now?: Date;
}): RadarRealDiscountResult {
  const current = params.current_effective_price;
  if (current === null || !Number.isFinite(current) || current <= 0) {
    return {
      radar_real_discount_pct: null,
      reference_price: null,
      reference_window_days: null,
      confidence: "insufficient",
      reason: "Preco atual ausente.",
    };
  }

  const minDays = params.min_distinct_days ?? 3;
  const now = params.now ?? new Date();
  const stats30 = calculateWindowStats(params.history, 30, now);
  const stats90 = calculateWindowStats(params.history, 90, now);
  const reference =
    stats30.distinct_days >= minDays && stats30.average !== null
      ? { price: stats30.average, days: 30 as const, confidence: "medium" as const }
      : stats90.distinct_days >= minDays && stats90.average !== null
        ? { price: stats90.average, days: 90 as const, confidence: "low" as const }
        : null;

  if (!reference) {
    return {
      radar_real_discount_pct: null,
      reference_price: null,
      reference_window_days: null,
      confidence: "insufficient",
      reason: "Historico insuficiente para afirmar desconto real.",
    };
  }

  const discount = ((reference.price - current) / reference.price) * 100;
  return {
    radar_real_discount_pct: roundMoney(Math.max(0, discount)),
    reference_price: reference.price,
    reference_window_days: reference.days,
    confidence: reference.days === 30 && stats30.distinct_days >= 7 ? "high" : reference.confidence,
    reason:
      discount > 0
        ? `Preco atual abaixo da media de ${reference.days} dias.`
        : `Preco atual nao esta abaixo da media de ${reference.days} dias.`,
  };
}
