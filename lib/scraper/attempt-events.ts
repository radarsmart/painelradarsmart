import { supabaseAdmin } from "@/lib/supabase";

export type ScrapeEventStatus = "ok" | "fail";
export type ScrapeFinalOutcome = "success" | "failed" | "partial";

export type ScrapeAttemptEventInput = {
  requestId: string;
  source: string;
  sourceContext: string;
  marketplace: string;
  productUrl: string;
  layer: string;
  method: string;
  attempt: number;
  status: ScrapeEventStatus;
  durationMs: number;
  errorCategory?: string | null;
  httpStatus?: number | null;
  errorMessage?: string | null;
  finalOutcome?: ScrapeFinalOutcome | null;
  entityId?: string | null;
  offerId?: string | null;
};

const LOG_TIMEOUT_MS = 350;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalizeHttpStatus(rawStatus: unknown): number | null {
  const parsed = Number(rawStatus);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 100 || parsed > 599) return null;
  return parsed;
}

export function extractHttpStatusFromError(error: unknown): number | null {
  const maybeStatus = (error as { status?: unknown } | null)?.status;
  const direct = normalizeHttpStatus(maybeStatus);
  if (direct) return direct;

  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) return null;

  const patterns = [/HTTP\s+(\d{3})/i, /\b(\d{3})\b/];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const status = normalizeHttpStatus(match?.[1]);
    if (status) return status;
  }
  return null;
}

export function classifyExtractionError(error: unknown): string {
  const status = extractHttpStatusFromError(error);
  if (status === 403) return "http_403";
  if (status === 404) return "http_404";
  if (status === 429) return "http_429";
  if (status && status >= 500) return "http_5xx";

  const message = toText(error instanceof Error ? error.message : error).toLowerCase();
  if (!message) return "unknown";
  if (message.includes("timeout")) return "timeout";
  if (message.includes("dados insuficientes") || message.includes("nao extraiu")) return "empty_payload";
  if (message.includes("titulo nao encontrado")) return "selector_miss";
  if (
    message.includes("captcha") ||
    message.includes("blocked") ||
    message.includes("acesso negado") ||
    message.includes("anti")
  ) {
    return "anti_bot";
  }
  if (message.includes("proxy")) return "proxy_failure";
  if (message.includes("json") || message.includes("parse")) return "parse_error";
  if (message.includes("schema")) return "upstream_schema_change";
  if (message.includes("nao configurado")) return "missing_credentials";
  if (message.includes("url invalida") || message.includes("url vazia")) return "invalid_url";

  return "unknown";
}

export async function recordScrapeAttemptEvent(
  input: ScrapeAttemptEventInput,
): Promise<void> {
  const row = {
    request_id: input.requestId,
    source: toText(input.source) || "unknown",
    source_context: toText(input.sourceContext) || "unknown",
    marketplace: toText(input.marketplace) || "generic",
    product_url: toText(input.productUrl),
    layer: toText(input.layer) || "unknown",
    method: toText(input.method) || "unknown",
    attempt: Math.max(1, toInt(input.attempt)),
    status: input.status,
    duration_ms: toInt(input.durationMs),
    error_category: toText(input.errorCategory) || null,
    http_status: normalizeHttpStatus(input.httpStatus) ?? null,
    error_message: toText(input.errorMessage).slice(0, 500) || null,
    final_outcome: input.finalOutcome ?? null,
    entity_id: toText(input.entityId) || null,
    offer_id: toText(input.offerId) || null,
  };

  await Promise.race([
    supabaseAdmin.from("scrape_attempt_events").insert(row),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`log_timeout_${LOG_TIMEOUT_MS}ms`)), LOG_TIMEOUT_MS),
    ),
  ]);
}

export async function recordScrapeAttemptEventBestEffort(
  input: ScrapeAttemptEventInput,
): Promise<void> {
  try {
    await recordScrapeAttemptEvent(input);
  } catch {
    // Best effort: observability failure nunca deve quebrar o scraping.
  }
}
