const DEFAULT_PUBLIC_OFFER_WINDOW_MS = 48 * 60 * 60 * 1000;
const DEFAULT_VISIBLE_SLOTS = ["flash", "best", "comparator"] as const;

type SiteSlot = (typeof DEFAULT_VISIBLE_SLOTS)[number];

type SiteVisibilityRow = {
  status?: unknown;
  curations_status?: unknown;
  affiliate_url?: unknown;
  slot_type?: unknown;
  published_at?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
  expires_at?: unknown;
  manual_copy?: unknown;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseManualCopy(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

export function slotToDestinationBlock(slot: string): string {
  if (slot === "flash") return "flash";
  if (slot === "comparator") return "comparator";
  return "day";
}

export function hasManualSiteOverride(row: Pick<SiteVisibilityRow, "manual_copy" | "slot_type">) {
  const manualCopy = parseManualCopy(row.manual_copy);
  const slotType = toText(row.slot_type).toLowerCase();
  const manualSlot = toText(manualCopy.slot_type).toLowerCase();
  const destinationBlock = toText(manualCopy.destination_block).toLowerCase();
  const explicitBooleanFlags = [
    manualCopy.site_override,
    manualCopy.approved_by_admin,
    manualCopy.publish_to_site,
  ];

  if (
    explicitBooleanFlags.some(
      (value) => value === true || toText(value).toLowerCase() === "true",
    )
  ) {
    return true;
  }

  if (manualSlot && DEFAULT_VISIBLE_SLOTS.includes(manualSlot as SiteSlot)) {
    return true;
  }

  if (destinationBlock && ["flash", "day", "comparator"].includes(destinationBlock)) {
    return true;
  }

  if (slotType && destinationBlock === slotToDestinationBlock(slotType)) {
    return true;
  }

  return false;
}

export function isOfferVisibleOnSite(
  row: SiteVisibilityRow,
  options?: {
    publicWindowMs?: number;
    validSlots?: readonly string[];
  },
) {
  const validSlots = options?.validSlots ?? DEFAULT_VISIBLE_SLOTS;
  const publicWindowMs = options?.publicWindowMs ?? DEFAULT_PUBLIC_OFFER_WINDOW_MS;

  if (toText(row.status).toLowerCase() !== "active") return false;
  if (!toText(row.affiliate_url)) return false;

  const slotType = toText(row.slot_type).toLowerCase();
  if (!validSlots.includes(slotType)) return false;

  const hasApprovedCuration =
    toText(row.curations_status).toLowerCase() === "approved" ||
    hasManualSiteOverride(row);
  if (!hasApprovedCuration) return false;

  const publishedReference = toText(
    row.published_at ?? row.updated_at ?? row.created_at,
  );
  if (!publishedReference) return false;

  const publishedAt = Date.parse(publishedReference);
  if (Number.isNaN(publishedAt)) return false;
  if (Date.now() - publishedAt > publicWindowMs) return false;

  const expiresAt = toText(row.expires_at);
  if (!expiresAt) return true;

  const parsedExpiresAt = Date.parse(expiresAt);
  return !Number.isNaN(parsedExpiresAt) && parsedExpiresAt > Date.now();
}

export function buildSiteManualCopyOverride(
  currentManualCopy: unknown,
  slotType: SiteSlot,
  now: string,
) {
  const existing = parseManualCopy(currentManualCopy);

  return {
    ...existing,
    destination_block: slotToDestinationBlock(slotType),
    slot_type: slotType,
    curated_at: now,
    site_override: true,
    approved_by_admin: true,
  };
}

export const PUBLIC_OFFER_WINDOW_MS = DEFAULT_PUBLIC_OFFER_WINDOW_MS;
export const VISIBLE_SITE_SLOTS = DEFAULT_VISIBLE_SLOTS;
