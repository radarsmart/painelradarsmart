import { supabaseAdmin } from "@/lib/supabase";

export type LomadeeAutomationSort = "discount" | "price_asc" | "price_desc";
export type LomadeeAutomationSlot = "flash" | "best" | "comparator";

export type LomadeeAutomationConfig = {
  id: string;
  search: string;
  organizationIds: string;
  sort: LomadeeAutomationSort;
  limit: number;
  slotType: LomadeeAutomationSlot;
  priceMin: number;
  priceMax: number | null;
  active: boolean;
  updatedAt: string | null;
  lastRunAt: string | null;
  lastRunResult: unknown | null;
};

export type LomadeeAutomationConfigInput = Partial<{
  search: unknown;
  organizationIds: unknown;
  sort: unknown;
  limit: unknown;
  slotType: unknown;
  priceMin: unknown;
  priceMax: unknown;
  active: unknown;
}>;

type LomadeeAutomationConfigRow = {
  id: string;
  search: string | null;
  organization_ids: string | null;
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

export const LOMADEE_AUTOMATION_CONFIG_ID = "00000000-0000-4000-8000-000000000002";

const DEFAULT_CONFIG: LomadeeAutomationConfig = {
  id: LOMADEE_AUTOMATION_CONFIG_ID,
  search: "",
  organizationIds: "",
  sort: "discount",
  limit: 10,
  slotType: "flash",
  priceMin: 0,
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

function normalizeSort(value: unknown): LomadeeAutomationSort {
  const sort = toText(value);
  if (sort === "price_asc" || sort === "price_desc") return sort;
  return "discount";
}

function normalizeSlotType(value: unknown): LomadeeAutomationSlot {
  const slotType = toText(value);
  if (slotType === "best" || slotType === "comparator") return slotType;
  return "flash";
}

function normalizeLimit(value: unknown) {
  const parsed = Math.trunc(toNumber(value, DEFAULT_CONFIG.limit));
  return Math.min(Math.max(parsed, 1), 100);
}

function normalizePriceMin(value: unknown) {
  const parsed = Number(toNumber(value, DEFAULT_CONFIG.priceMin).toFixed(2));
  return Math.min(Math.max(parsed, 0), 50000);
}

function normalizePriceMax(value: unknown, priceMin: number) {
  const text = toText(value);
  if (!text) return null;

  const parsed = Number(text.replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(priceMin, Number(parsed.toFixed(2))), 50000);
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const normalized = toText(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function mapRowToConfig(row?: Partial<LomadeeAutomationConfigRow> | null): LomadeeAutomationConfig {
  const priceMin = normalizePriceMin(row?.price_min ?? DEFAULT_CONFIG.priceMin);

  return {
    id: row?.id || DEFAULT_CONFIG.id,
    search: toText(row?.search),
    organizationIds: toText(row?.organization_ids),
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

export function normalizeLomadeeAutomationConfigInput(
  input: LomadeeAutomationConfigInput,
  fallback: LomadeeAutomationConfig = DEFAULT_CONFIG,
): LomadeeAutomationConfig {
  const priceMin = normalizePriceMin(input.priceMin ?? fallback.priceMin);

  return {
    id: LOMADEE_AUTOMATION_CONFIG_ID,
    search: toText(input.search ?? fallback.search),
    organizationIds: toText(input.organizationIds ?? fallback.organizationIds),
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

function mapConfigToRow(config: LomadeeAutomationConfig) {
  return {
    id: LOMADEE_AUTOMATION_CONFIG_ID,
    search: config.search || null,
    organization_ids: config.organizationIds || null,
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
    .from("lomadee_automation_config")
    .upsert(mapConfigToRow(DEFAULT_CONFIG), { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao criar configuracao Lomadee: ${error.message}`);
  }

  return mapRowToConfig(data as LomadeeAutomationConfigRow);
}

export async function getLomadeeAutomationConfig() {
  const { data, error } = await supabaseAdmin
    .from("lomadee_automation_config")
    .select("*")
    .eq("id", LOMADEE_AUTOMATION_CONFIG_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao ler configuracao Lomadee: ${error.message}`);
  }

  return data ? mapRowToConfig(data as LomadeeAutomationConfigRow) : insertDefaultConfig();
}

export async function saveLomadeeAutomationConfig(input: LomadeeAutomationConfigInput) {
  const current = await getLomadeeAutomationConfig();
  const next = normalizeLomadeeAutomationConfigInput(input, current);

  const { data, error } = await supabaseAdmin
    .from("lomadee_automation_config")
    .upsert(mapConfigToRow(next), { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao salvar configuracao Lomadee: ${error.message}`);
  }

  return mapRowToConfig(data as LomadeeAutomationConfigRow);
}

export async function saveLomadeeAutomationRunResult(result: unknown) {
  const { error } = await supabaseAdmin
    .from("lomadee_automation_config")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_result: result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", LOMADEE_AUTOMATION_CONFIG_ID);

  if (error) {
    throw new Error(`Falha ao salvar resultado da automacao Lomadee: ${error.message}`);
  }
}
