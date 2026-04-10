import { supabaseAdmin } from "@/lib/supabase";

export type AwinAutomationSort = "best_deals" | "top_selling";
export type AwinAutomationSlot = "flash" | "best" | "comparator";

export type AwinAutomationConfig = {
  id: string;
  advertiserId: string;
  category: string;
  sort: AwinAutomationSort;
  limit: number;
  slotType: AwinAutomationSlot;
  priceMin: number;
  priceMax: number | null;
  active: boolean;
  updatedAt: string | null;
  lastRunAt: string | null;
  lastRunResult: unknown | null;
};

export type AwinAutomationConfigInput = Partial<{
  advertiserId: unknown;
  category: unknown;
  sort: unknown;
  limit: unknown;
  slotType: unknown;
  priceMin: unknown;
  priceMax: unknown;
  active: unknown;
}>;

type AwinAutomationConfigRow = {
  id: string;
  advertiser_id: string | null;
  category: string | null;
  sort: string | null;
  limit: number | null;
  slot_type: string | null;
  price_min: number | string | null;
  price_max: number | string | null;
  active: boolean | null;
  updated_at: string | null;
  last_run_at: string | null;
  last_run_result: unknown | null;
};

export const AWIN_AUTOMATION_CONFIG_ID = "00000000-0000-4000-8000-000000000001";

const DEFAULT_CONFIG: AwinAutomationConfig = {
  id: AWIN_AUTOMATION_CONFIG_ID,
  advertiserId: "18879",
  category: "",
  sort: "best_deals",
  limit: 5,
  slotType: "flash",
  priceMin: 80,
  priceMax: null,
  active: false,
  updatedAt: null,
  lastRunAt: null,
  lastRunResult: null,
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSort(value: unknown): AwinAutomationSort {
  return toText(value) === "top_selling" ? "top_selling" : "best_deals";
}

function normalizeSlotType(value: unknown): AwinAutomationSlot {
  const slotType = toText(value);
  if (slotType === "best" || slotType === "comparator") return slotType;
  return "flash";
}

function normalizeLimit(value: unknown) {
  const parsed = Math.trunc(toNumber(value, DEFAULT_CONFIG.limit));
  return Math.min(Math.max(parsed, 1), 20);
}

function normalizePriceMin(value: unknown) {
  const parsed = Number(toNumber(value, DEFAULT_CONFIG.priceMin).toFixed(2));
  return Math.min(Math.max(parsed, 80), 5000);
}

function normalizePriceMax(value: unknown, priceMin: number) {
  const text = toText(value);
  if (!text) return null;

  const parsed = Number(text.replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(priceMin, Number(parsed.toFixed(2))), 5000);
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const normalized = toText(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function mapRowToConfig(row?: Partial<AwinAutomationConfigRow> | null): AwinAutomationConfig {
  const priceMin = normalizePriceMin(row?.price_min ?? DEFAULT_CONFIG.priceMin);

  return {
    id: row?.id || DEFAULT_CONFIG.id,
    advertiserId: toText(row?.advertiser_id) || DEFAULT_CONFIG.advertiserId,
    category: toText(row?.category),
    sort: normalizeSort(row?.sort),
    limit: normalizeLimit(row?.limit),
    slotType: normalizeSlotType(row?.slot_type),
    priceMin,
    priceMax: normalizePriceMax(row?.price_max, priceMin),
    active: Boolean(row?.active ?? DEFAULT_CONFIG.active),
    updatedAt: row?.updated_at ?? null,
    lastRunAt: row?.last_run_at ?? null,
    lastRunResult: row?.last_run_result ?? null,
  };
}

export function normalizeAwinAutomationConfigInput(
  input: AwinAutomationConfigInput,
  fallback: AwinAutomationConfig = DEFAULT_CONFIG,
): AwinAutomationConfig {
  const priceMin = normalizePriceMin(input.priceMin ?? fallback.priceMin);

  return {
    id: AWIN_AUTOMATION_CONFIG_ID,
    advertiserId: toText(input.advertiserId) || fallback.advertiserId,
    category: toText(input.category),
    sort: normalizeSort(input.sort ?? fallback.sort),
    limit: normalizeLimit(input.limit ?? fallback.limit),
    slotType: normalizeSlotType(input.slotType ?? fallback.slotType),
    priceMin,
    priceMax: normalizePriceMax(input.priceMax ?? fallback.priceMax, priceMin),
    active: normalizeBoolean(input.active, fallback.active),
    updatedAt: fallback.updatedAt,
    lastRunAt: fallback.lastRunAt,
    lastRunResult: fallback.lastRunResult,
  };
}

function mapConfigToRow(config: AwinAutomationConfig) {
  return {
    id: AWIN_AUTOMATION_CONFIG_ID,
    advertiser_id: config.advertiserId,
    category: config.category || null,
    sort: config.sort,
    limit: config.limit,
    slot_type: config.slotType,
    price_min: config.priceMin,
    price_max: config.priceMax,
    active: config.active,
    updated_at: new Date().toISOString(),
  };
}

async function insertDefaultConfig() {
  const { data, error } = await supabaseAdmin
    .from("awin_automation_config")
    .upsert(mapConfigToRow(DEFAULT_CONFIG), { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao criar configuracao AWIN: ${error.message}`);
  }

  return mapRowToConfig(data as AwinAutomationConfigRow);
}

export async function getAwinAutomationConfig() {
  const { data, error } = await supabaseAdmin
    .from("awin_automation_config")
    .select("*")
    .eq("id", AWIN_AUTOMATION_CONFIG_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao ler configuracao AWIN: ${error.message}`);
  }

  return data ? mapRowToConfig(data as AwinAutomationConfigRow) : insertDefaultConfig();
}

export async function saveAwinAutomationConfig(input: AwinAutomationConfigInput) {
  const current = await getAwinAutomationConfig();
  const next = normalizeAwinAutomationConfigInput(input, current);

  const { data, error } = await supabaseAdmin
    .from("awin_automation_config")
    .upsert(mapConfigToRow(next), { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao salvar configuracao AWIN: ${error.message}`);
  }

  return mapRowToConfig(data as AwinAutomationConfigRow);
}

export async function saveAwinAutomationRunResult(result: unknown) {
  const { error } = await supabaseAdmin
    .from("awin_automation_config")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_result: result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", AWIN_AUTOMATION_CONFIG_ID);

  if (error) {
    throw new Error(`Falha ao salvar resultado da automacao AWIN: ${error.message}`);
  }
}
