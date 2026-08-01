import { supabaseAdmin } from "@/lib/supabase";
import {
  SALES_AGENT_SOURCES,
  type SalesAgent,
  type SalesAgentSource,
  type SalesAgentTextMode,
} from "./types";

type SalesAgentRow = {
  id: string;
  name: string | null;
  source: string | null;
  advertiser_id: string | null;
  search_query: string | null;
  category: string | null;
  price_min: number | string | null;
  price_max: number | string | null;
  min_discount_pct: number | null;
  aav_filter_enabled: boolean | null;
  ai_image_enabled: boolean | null;
  ai_instructions: string | null;
  text_mode: string | null;
  custom_text_template: string | null;
  ai_image_prompt: string | null;
  send_window_start_hour: number | null;
  send_window_end_hour: number | null;
  timezone: string | null;
  max_sends_per_day: number | null;
  min_interval_minutes: number | null;
  active: boolean | null;
  last_run_at: string | null;
  last_run_result: unknown | null;
  created_at: string;
  updated_at: string;
};

export type SalesAgentInput = Partial<{
  name: unknown;
  source: unknown;
  advertiserId: unknown;
  searchQuery: unknown;
  category: unknown;
  priceMin: unknown;
  priceMax: unknown;
  minDiscountPct: unknown;
  aavFilterEnabled: unknown;
  aiImageEnabled: unknown;
  aiInstructions: unknown;
  textMode: unknown;
  customTextTemplate: unknown;
  aiImagePrompt: unknown;
  sendWindowStartHour: unknown;
  sendWindowEndHour: unknown;
  timezone: unknown;
  maxSendsPerDay: unknown;
  minIntervalMinutes: unknown;
  active: unknown;
  targetIds: unknown;
}>;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toOptionalText(value: unknown): string | null {
  const text = toText(value);
  return text ? text : null;
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  const normalized = toText(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function toHour(value: unknown, fallback: number): number {
  const parsed = Math.trunc(toNumber(value, fallback));
  return Math.min(Math.max(parsed, 0), 23);
}

function toSource(value: unknown): SalesAgentSource {
  const text = toText(value) as SalesAgentSource;
  return SALES_AGENT_SOURCES.includes(text) ? text : "awin";
}

function toTextMode(value: unknown): SalesAgentTextMode {
  return toText(value) === "custom" ? "custom" : "ai";
}

function mapRowToAgent(row: SalesAgentRow, targetIds: string[]): SalesAgent {
  return {
    id: row.id,
    name: toText(row.name) || "Agente sem nome",
    source: toSource(row.source),
    advertiserId: toOptionalText(row.advertiser_id),
    searchQuery: toOptionalText(row.search_query),
    category: toOptionalText(row.category),
    priceMin: toOptionalNumber(row.price_min),
    priceMax: toOptionalNumber(row.price_max),
    minDiscountPct: Math.min(Math.max(Math.trunc(toNumber(row.min_discount_pct, 0)), 0), 99),
    aavFilterEnabled: Boolean(row.aav_filter_enabled ?? true),
    aiImageEnabled: Boolean(row.ai_image_enabled ?? false),
    aiInstructions: toOptionalText(row.ai_instructions),
    textMode: toTextMode(row.text_mode),
    customTextTemplate: toOptionalText(row.custom_text_template),
    aiImagePrompt: toOptionalText(row.ai_image_prompt),
    sendWindowStartHour: toHour(row.send_window_start_hour, 8),
    sendWindowEndHour: toHour(row.send_window_end_hour, 22),
    timezone: toText(row.timezone) || "America/Sao_Paulo",
    maxSendsPerDay: Math.min(Math.max(Math.trunc(toNumber(row.max_sends_per_day, 10)), 1), 200),
    minIntervalMinutes: Math.min(
      Math.max(Math.trunc(toNumber(row.min_interval_minutes, 20)), 1),
      1440,
    ),
    active: Boolean(row.active),
    lastRunAt: row.last_run_at,
    lastRunResult: row.last_run_result,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targetIds,
  };
}

function mapInputToRow(input: SalesAgentInput, fallback?: SalesAgent) {
  const priceMin = toOptionalNumber(input.priceMin ?? fallback?.priceMin ?? null);
  const priceMax = toOptionalNumber(input.priceMax ?? fallback?.priceMax ?? null);

  return {
    name: toText(input.name ?? fallback?.name) || "Agente sem nome",
    source: toSource(input.source ?? fallback?.source),
    advertiser_id: toOptionalText(input.advertiserId ?? fallback?.advertiserId),
    search_query: toOptionalText(input.searchQuery ?? fallback?.searchQuery),
    category: toOptionalText(input.category ?? fallback?.category),
    price_min: priceMin,
    price_max: priceMax !== null && priceMin !== null ? Math.max(priceMax, priceMin) : priceMax,
    min_discount_pct: Math.min(
      Math.max(Math.trunc(toNumber(input.minDiscountPct ?? fallback?.minDiscountPct, 0)), 0),
      99,
    ),
    aav_filter_enabled: toBoolean(input.aavFilterEnabled, fallback?.aavFilterEnabled ?? true),
    ai_image_enabled: toBoolean(input.aiImageEnabled, fallback?.aiImageEnabled ?? false),
    ai_instructions: toOptionalText(input.aiInstructions ?? fallback?.aiInstructions),
    text_mode: toTextMode(input.textMode ?? fallback?.textMode),
    custom_text_template: toOptionalText(input.customTextTemplate ?? fallback?.customTextTemplate),
    ai_image_prompt: toOptionalText(input.aiImagePrompt ?? fallback?.aiImagePrompt),
    send_window_start_hour: toHour(
      input.sendWindowStartHour ?? fallback?.sendWindowStartHour,
      8,
    ),
    send_window_end_hour: toHour(input.sendWindowEndHour ?? fallback?.sendWindowEndHour, 22),
    timezone: toText(input.timezone ?? fallback?.timezone) || "America/Sao_Paulo",
    max_sends_per_day: Math.min(
      Math.max(Math.trunc(toNumber(input.maxSendsPerDay ?? fallback?.maxSendsPerDay, 10)), 1),
      200,
    ),
    min_interval_minutes: Math.min(
      Math.max(
        Math.trunc(toNumber(input.minIntervalMinutes ?? fallback?.minIntervalMinutes, 20)),
        1,
      ),
      1440,
    ),
    active: toBoolean(input.active, fallback?.active ?? false),
    updated_at: new Date().toISOString(),
  };
}

function extractTargetIds(input: SalesAgentInput): string[] | null {
  if (!("targetIds" in input)) return null;
  const value = input.targetIds;
  if (!Array.isArray(value)) return [];
  return value.map((item) => toText(item)).filter(Boolean);
}

async function fetchTargetIdsByAgent(agentIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!agentIds.length) return map;

  const { data, error } = await supabaseAdmin
    .from("sales_agent_targets")
    .select("agent_id,target_id")
    .in("agent_id", agentIds);

  if (error) {
    throw new Error(`Falha ao ler destinos dos agentes: ${error.message}`);
  }

  for (const row of (data ?? []) as Array<{ agent_id: string; target_id: string }>) {
    const list = map.get(row.agent_id) ?? [];
    list.push(row.target_id);
    map.set(row.agent_id, list);
  }

  return map;
}

async function replaceAgentTargets(agentId: string, targetIds: string[]): Promise<void> {
  const { error: deleteError } = await supabaseAdmin
    .from("sales_agent_targets")
    .delete()
    .eq("agent_id", agentId);

  if (deleteError) {
    throw new Error(`Falha ao limpar destinos do agente: ${deleteError.message}`);
  }

  if (!targetIds.length) return;

  const rows = targetIds.map((targetId) => ({ agent_id: agentId, target_id: targetId }));
  const { error: insertError } = await supabaseAdmin.from("sales_agent_targets").insert(rows);

  if (insertError) {
    throw new Error(`Falha ao salvar destinos do agente: ${insertError.message}`);
  }
}

export async function listSalesAgents(): Promise<SalesAgent[]> {
  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar agentes: ${error.message}`);
  }

  const rows = (data ?? []) as SalesAgentRow[];
  const targetsByAgent = await fetchTargetIdsByAgent(rows.map((row) => row.id));

  return rows.map((row) => mapRowToAgent(row, targetsByAgent.get(row.id) ?? []));
}

export async function listActiveSalesAgents(): Promise<SalesAgent[]> {
  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .select("*")
    .eq("active", true);

  if (error) {
    throw new Error(`Falha ao listar agentes ativos: ${error.message}`);
  }

  const rows = (data ?? []) as SalesAgentRow[];
  const targetsByAgent = await fetchTargetIdsByAgent(rows.map((row) => row.id));

  return rows.map((row) => mapRowToAgent(row, targetsByAgent.get(row.id) ?? []));
}

export async function getSalesAgent(id: string): Promise<SalesAgent | null> {
  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao ler agente: ${error.message}`);
  }
  if (!data) return null;

  const targetsByAgent = await fetchTargetIdsByAgent([id]);
  return mapRowToAgent(data as SalesAgentRow, targetsByAgent.get(id) ?? []);
}

export async function createSalesAgent(input: SalesAgentInput): Promise<SalesAgent> {
  const row = mapInputToRow(input);
  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao criar agente: ${error.message}`);
  }

  const agentRow = data as SalesAgentRow;
  const targetIds = extractTargetIds(input) ?? [];
  await replaceAgentTargets(agentRow.id, targetIds);

  return mapRowToAgent(agentRow, targetIds);
}

export async function updateSalesAgent(id: string, input: SalesAgentInput): Promise<SalesAgent> {
  const current = await getSalesAgent(id);
  if (!current) {
    throw new Error("Agente nao encontrado.");
  }

  const row = mapInputToRow(input, current);
  const { data, error } = await supabaseAdmin
    .from("sales_agents")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar agente: ${error.message}`);
  }

  const targetIds = extractTargetIds(input);
  if (targetIds !== null) {
    await replaceAgentTargets(id, targetIds);
  }

  const agentRow = data as SalesAgentRow;
  return mapRowToAgent(agentRow, targetIds ?? current.targetIds);
}

export async function deleteSalesAgent(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("sales_agents").delete().eq("id", id);
  if (error) {
    throw new Error(`Falha ao excluir agente: ${error.message}`);
  }
}

export async function saveSalesAgentRunResult(id: string, result: unknown): Promise<void> {
  const { error } = await supabaseAdmin
    .from("sales_agents")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_result: result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Falha ao salvar resultado do agente: ${error.message}`);
  }
}
