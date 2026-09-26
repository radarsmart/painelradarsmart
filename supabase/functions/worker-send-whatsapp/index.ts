import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type QueueJob = {
  id: number;
  offer_id: string;
  channel: string;
  target_id: string;
  attempt_count?: number;
  payload: Record<string, unknown>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ATTEMPTS = 5;
const SEND_WINDOW_START_HOUR = 8;
const SEND_WINDOW_END_HOUR = 23;
const SEND_TIMEZONE = "America/Sao_Paulo";

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getTimeZoneParts(date: Date, timeZone = SEND_TIMEZONE): TimeZoneParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone = SEND_TIMEZONE): number {
  const local = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

function dateFromTimeZoneParts(parts: TimeZoneParts, timeZone = SEND_TIMEZONE): Date {
  const baseUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second ?? 0),
  );

  let adjusted = baseUtc;
  for (let i = 0; i < 3; i++) {
    const offset = getTimeZoneOffsetMinutes(new Date(adjusted), timeZone);
    const next = baseUtc - offset * 60 * 1000;
    if (Math.abs(next - adjusted) < 1000) {
      adjusted = next;
      break;
    }
    adjusted = next;
  }

  return new Date(adjusted);
}

function nextWindowStart(date: Date, timeZone = SEND_TIMEZONE): Date {
  const local = getTimeZoneParts(date, timeZone);
  const midday = dateFromTimeZoneParts(
    {
      year: local.year,
      month: local.month,
      day: local.day,
      hour: 12,
      minute: 0,
      second: 0,
    },
    timeZone,
  );

  const tomorrowMidday = new Date(midday.getTime() + 24 * 60 * 60 * 1000);
  const tomorrow = getTimeZoneParts(tomorrowMidday, timeZone);
  return dateFromTimeZoneParts(
    {
      year: tomorrow.year,
      month: tomorrow.month,
      day: tomorrow.day,
      hour: SEND_WINDOW_START_HOUR,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

function isWithinSendWindow(now: Date, timeZone = SEND_TIMEZONE): boolean {
  const local = getTimeZoneParts(now, timeZone);
  return local.hour >= SEND_WINDOW_START_HOUR && local.hour < SEND_WINDOW_END_HOUR;
}

function getNextAllowedSendTime(now: Date, timeZone = SEND_TIMEZONE): Date {
  const local = getTimeZoneParts(now, timeZone);
  if (local.hour < SEND_WINDOW_START_HOUR) {
    return dateFromTimeZoneParts(
      {
        year: local.year,
        month: local.month,
        day: local.day,
        hour: SEND_WINDOW_START_HOUR,
        minute: 0,
        second: 0,
      },
      timeZone,
    );
  }
  if (local.hour >= SEND_WINDOW_END_HOUR) {
    return nextWindowStart(now, timeZone);
  }
  return now;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Optional gate (same behavior as other internal workers).
function isAuthorized(req: Request): boolean {
  const internalKey = Deno.env.get("INTERNAL_API_KEY");
  const provided = req.headers.get("x-internal-key");
  if (internalKey && provided === internalKey) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\\s+/i, "").trim();
  return !!token && token.length > 20;
}

function normalize(text: unknown): string {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureParagraphSpacing(text: string): string {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([^\n])\n(?=[^\n])/g, "$1\n\n")
    .trim();
}

function markdownToPlain(input: string): string {
  let s = input;
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  return s;
}

function stripPlainUrls(text: string): string {
  return text
    .replace(/(^|\s)(https?:\/\/\S+)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textContainsLink(text: string, link: string | null): boolean {
  if (!link) return false;
  return String(text || "").includes(link);
}

function buildFinalTextFromPayload(rawText: string, link: string | null): string {
  let finalText = normalize(rawText);
  if (link && !textContainsLink(finalText, link)) {
    finalText = `${finalText}\n\n🟡 Comprar agora:\n${link}`;
  }
  return finalText;
}

function uppercaseFirstLine(text: string): string {
  const lines = String(text || "").split("\n");
  const firstIdx = lines.findIndex((line) => String(line).trim().length > 0);
  if (firstIdx < 0) return String(text || "").trim();

  const first = String(lines[firstIdx] || "").replace(/\s+/g, " ").trim();
  if (!first) return String(text || "").trim();

  lines[firstIdx] = first.toLocaleUpperCase("pt-BR");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeWhatsAppMediaUrl(value: unknown): string | null {
  let url = String(value ?? "").trim();
  if (!url) return null;
  if (url.startsWith("//")) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) return null;

  try {
    const parsed = new URL(url);
    if (/\.avif$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname
        .replace(/\.jpg_[^/]*\.avif$/i, ".jpg")
        .replace(/\.jpeg_[^/]*\.avif$/i, ".jpeg")
        .replace(/\.png_[^/]*\.avif$/i, ".png")
        .replace(/_\.avif$/i, "")
        .replace(/\.avif$/i, ".jpg");
      url = parsed.toString();
    }
  } catch {
    return null;
  }

  return url;
}

function pickImage(payload: Record<string, unknown>): string | null {
  const p = payload as any;
  const o = p.offer ?? {};
  const imageUrls = Array.isArray(p.image_urls) ? (p.image_urls as unknown[]) : [];
  const list = [
    p.image_url, p.best_image_url,
    o.image_url, o.best_image_url,
    ...imageUrls,
  ].filter(Boolean);
  for (const candidate of list) {
    const normalized = normalizeWhatsAppMediaUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function pickLink(payload: Record<string, unknown>): string | null {
  const p = payload as any;
  const o = p.offer ?? {};
  const btns = Array.isArray(p.buttons) ? p.buttons : [];
  const v =
    p.affiliate_url ?? p.product_url ?? p.url ?? p.link ??
    o.link ?? o.affiliate_url ?? o.product_url ??
    (btns.length > 0 ? btns[0].url : null) ??
    null;
  return v ? String(v) : null;
}

function normalizeWhatsAppDestination(raw: unknown): {
  to: string | null;
  isGroup: boolean;
  error: string | null;
} {
  const input = String(raw ?? "").trim();
  if (!input) return { to: null, isGroup: false, error: "external_id vazio no target" };

  const compact = input.replace(/\s+/g, "");
  if (/@g\.us$/i.test(compact)) {
    return { to: compact, isGroup: true, error: null };
  }
  if (/@c\.us$/i.test(compact)) {
    return { to: compact, isGroup: false, error: null };
  }

  const digits = compact.replace(/[^\d]/g, "");
  if (digits.length >= 10 && digits.length <= 16) {
    return { to: digits, isGroup: false, error: null };
  }

  return {
    to: null,
    isGroup: false,
    error: `external_id invalido para WhatsApp: ${input}`,
  };
}

function pickText(payload: Record<string, unknown>): string {
  const v = payload.ad_text ?? payload.text ?? payload.caption ?? "";
  return normalize(v);
}

function toPositiveMoney(value: unknown): number | null {
  let s = String(value ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!s) return null;
  if (s.includes(".") && s.includes(",")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const raw = Number(s);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return roundMoney(raw);
}

function formatBRL(value: number): string {
  return roundMoney(value).toFixed(2).replace(".", ",");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function extractCouponCodeFromPayload(payload: Record<string, unknown>): string | null {
  const p = payload as any;
  const o = p.offer ?? {};
  const raw = o.raw ?? p.raw ?? {};
  const candidates = [
    p.coupon_code,
    p.coupon,
    p.cupom,
    o.coupon_code,
    o.coupon,
    o.cupom,
    raw?.coupon_code,
    raw?.coupon,
    raw?.cupom,
    raw?.promotion?.coupon_code,
    raw?.promotion?.coupon,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value) continue;
    const compact = value.replace(/[^A-Za-z0-9_-]/g, "");
    if (compact.length >= 3 && compact.length <= 24) {
      return compact.toUpperCase();
    }
  }
  return null;
}

function normalizeOfferEconomicsFromPayload(payload: Record<string, unknown>): {
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  savings: number | null;
} {
  const p = payload as any;
  const o = p.offer ?? {};
  const price = toPositiveMoney(o.price ?? p.price);
  const originalRaw = toPositiveMoney(o.original_price ?? p.original_price);
  const hasValidOriginal =
    price !== null &&
    originalRaw !== null &&
    originalRaw > price;

  const originalPrice = hasValidOriginal ? originalRaw : null;
  const discountPct =
    originalPrice !== null && price !== null
      ? Math.max(1, Math.round(((originalPrice - price) / originalPrice) * 100))
      : null;
  const savings =
    originalPrice !== null && price !== null
      ? roundMoney(originalPrice - price)
      : null;

  return { price, originalPrice, discountPct, savings };
}

function toPercentInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded <= 0 || rounded > 100) return null;
  return rounded;
}

function extractMarketplacePaymentInfoFromPayload(
  payload: Record<string, unknown>,
): { price: number | null; discountPct: number | null } {
  const p = payload as any;
  const o = p.offer ?? {};
  const raw = o.raw ?? p.raw ?? {};
  const pricing = raw?.pricing ?? {};
  const econ = normalizeOfferEconomicsFromPayload(payload);

  const priceCandidate = toPositiveMoney(
    p.marketplace_payment_price ??
      p.mercado_pago_price ??
      p.pix_price ??
      o.marketplace_payment_price ??
      o.mercado_pago_price ??
      o.pix_price ??
      pricing?.marketplace_payment_price ??
      pricing?.mercado_pago_price ??
      pricing?.pix_price,
  );
  const price =
    priceCandidate !== null &&
    econ.price !== null &&
    priceCandidate <= econ.price + 0.01
      ? priceCandidate
      : null;

  const discountPct = toPercentInt(
    p.marketplace_payment_discount_pct ??
      o.marketplace_payment_discount_pct ??
      pricing?.marketplace_payment_discount_pct,
  );

  return { price, discountPct };
}

function buildEconomicLineFromPayload(payload: Record<string, unknown>): string | null {
  const p = payload as any;
  const o = p.offer ?? {};
  const marketplace = String(o?.marketplace ?? p?.marketplace ?? "").toLowerCase();
  const isMercadoLivre =
    marketplace.includes("mercadolivre") || marketplace.includes("mercado_livre");
  const econ = normalizeOfferEconomicsFromPayload(payload);
  if (econ.price === null) return null;
  const mpInfo = extractMarketplacePaymentInfoFromPayload(payload);
  const couponCode = extractCouponCodeFromPayload(payload);
  const lines: string[] = [];

  lines.push(`💰 Apenas R$ ${formatBRL(econ.price)}`);
  if (econ.originalPrice !== null && econ.discountPct !== null) {
    lines.push(`R$ ${formatBRL(econ.originalPrice)} — ${econ.discountPct}% de desconto!`);
  }

  if (isMercadoLivre && mpInfo.price !== null && mpInfo.price < econ.price) {
    const discountFromOriginal =
      econ.originalPrice !== null && econ.originalPrice > mpInfo.price
        ? Math.round(((econ.originalPrice - mpInfo.price) / econ.originalPrice) * 100)
        : null;
    const mpDiscountPct = mpInfo.discountPct ?? discountFromOriginal;

    lines.push(
      mpDiscountPct !== null
        ? `⚡ No Pix/Mercado Pago sai ainda mais barato: R$ ${formatBRL(mpInfo.price)} (${mpDiscountPct}% OFF)`
        : `⚡ No Pix/Mercado Pago: R$ ${formatBRL(mpInfo.price)}`,
    );
  }

  if (couponCode) lines.push(`🎟️ Cupom: ${couponCode}`);
  return lines.join("\n");
}

function isEconomicClaimLine(line: string): boolean {
  const value = String(line || "");
  if (!value.trim()) return false;
  return (
    /r\$\s*\d/i.test(value) ||
    /\b\d{1,3}\s*%\s*off\b/i.test(value) ||
    /\b(desconto|economia|cupom)\b/i.test(value) ||
    /\bde\s+r\$/i.test(value)
  );
}

function applyEconomicLine(text: string, payload: Record<string, unknown>): string {
  const economicLine = buildEconomicLineFromPayload(payload);
  if (!economicLine) return normalize(text);

  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const cleaned = lines.filter((line) => !isEconomicClaimLine(line));
  if (!cleaned.length) return economicLine;

  let seenNonEmpty = 0;
  let insertAt = cleaned.length;
  for (let i = 0; i < cleaned.length; i++) {
    if (String(cleaned[i] || "").trim().length > 0) {
      seenNonEmpty += 1;
      if (seenNonEmpty >= 2) {
        insertAt = i + 1;
        break;
      }
    }
  }

  cleaned.splice(insertAt, 0, economicLine);
  return normalize(cleaned.join("\n"));
}

function emphasizePriceTokensWhatsapp(text: string): string {
  const lines = String(text || "").split("\n");
  return lines
    .map((line) => {
      // Strikethrough line: "R$ 169,00 — 45% de desconto!" (old price + discount only).
      const struckMatch = line.match(
        /^(R\$\s*\d[\d.]*,\d{2})(\s*—\s*\d{1,3}\s*%\s*de desconto!?)$/i,
      );
      if (struckMatch) {
        return `~${struckMatch[1]}~${struckMatch[2]}`;
      }

      return line
        .replace(/R\$\s*\d[\d.]*,\d{2}/g, (m) => `*${m}*`)
        .replace(/\b\d{1,3}\s*%\s*OFF\b/gi, (m) => `*${m.toUpperCase()}*`)
        .replace(/(Cupom:\s*[A-Z0-9_-]{3,24})/gi, (m) => `*${m}*`);
    })
    .join("\n");
}

function boldFirstLineWhatsapp(text: string): string {
  const lines = String(text || "").split("\n");
  const firstIdx = lines.findIndex((line) => String(line).trim().length > 0);
  if (firstIdx < 0) return "";
  lines[firstIdx] = `*${lines[firstIdx]}*`;
  return lines.join("\n").trim();
}

async function claimSpecificJob(
  sb: any,
  channel: string,
  jobId: number,
): Promise<{ job: QueueJob | null; error?: string; message?: string }> {
  const { data: rawJob, error: readErr } = await sb
    .from("post_queue")
    .select("id, offer_id, channel, target_id, payload, status, attempt_count")
    .eq("id", jobId)
    .maybeSingle();

  if (readErr) return { job: null, error: readErr.message };
  if (!rawJob) return { job: null, message: `Job ${jobId} nao encontrado` };

  const current = rawJob as any;
  const currentChannel = String(current?.channel || "");
  const currentStatus = String(current?.status || "");
  const currentAttempt = Number(current?.attempt_count || 0);

  if (currentChannel !== channel) {
    return { job: null, message: `Job ${jobId} pertence ao canal ${currentChannel || "desconhecido"}` };
  }
  if (currentStatus !== "queued") {
    return { job: null, message: `Job ${jobId} esta com status ${currentStatus || "desconhecido"}` };
  }
  if (currentAttempt >= MAX_ATTEMPTS) {
    await sb.rpc("fail_post_queue_job", { p_id: jobId, p_error: "max_attempts_reached" }).catch(() => null);
    return { job: null, message: `Job ${jobId} atingiu limite de tentativas` };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const lockUntilIso = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

  const { data: claimedRows, error: claimErr } = await sb
    .from("post_queue")
    .update({
      status: "processing",
      locked_until: lockUntilIso,
      attempt_count: currentAttempt + 1,
      scheduled_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", jobId)
    .eq("channel", channel)
    .eq("status", "queued")
    .eq("attempt_count", currentAttempt)
    .select("id, offer_id, channel, target_id, payload, attempt_count");

  if (claimErr) return { job: null, error: claimErr.message };
  if (!claimedRows?.length) return { job: null, message: `Job ${jobId} nao disponivel para claim` };

  return { job: claimedRows[0] as QueueJob };
}

function clampInt(n: unknown, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

function backoffSeconds(attempt: number): number {
  const a = clampInt(attempt, 1, 10);
  const secs = 30 * Math.pow(2, a - 1);
  return clampInt(secs, 30, 60 * 30);
}

async function readTextAndMaybeJson(res: Response): Promise<{ text: string; json: any | null }> {
  const text = await res.text().catch(() => "");
  let json: any | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { text, json };
}

class WhatsAppApiError extends Error {
  status: number;
  url: string;
  bodyText: string;
  bodyJson: any | null;

  constructor(args: { status: number; url: string; bodyText: string; bodyJson: any | null }) {
    const { status, url, bodyText, bodyJson } = args;
    const snippet = (bodyText || "").slice(0, 500).trim();
    super(
      `WhatsApp API HTTP ${status} (${url}): ${
        bodyJson ? JSON.stringify(bodyJson) : (snippet || "empty body")
      }`,
    );
    this.name = "WhatsAppApiError";
    this.status = status;
    this.url = url;
    this.bodyText = bodyText;
    this.bodyJson = bodyJson;
  }
}

async function generateWhatsAppToken(args: { apiUrl: string; session: string; secretKey: string }): Promise<string> {
  const { apiUrl, session, secretKey } = args;
  const url = `${apiUrl}/${session}/${secretKey}/generate-token`;

  const res = await fetch(url, { method: "POST" });
  const { text, json } = await readTextAndMaybeJson(res);
  if (!res.ok) {
    throw new WhatsAppApiError({ status: res.status, url, bodyText: text, bodyJson: json });
  }

  const token = json?.token ? String(json.token) : "";
  if (!token) {
    throw new Error(`WhatsApp generate-token returned empty token (${url})`);
  }
  return token;
}

// Envia imagem com legenda via WPPConnect
async function sendWhatsAppImage(args: {
  apiUrl: string;
  session: string;
  token: string;
  to: string;
  image: string;
  caption: string;
}) {
  const { apiUrl, session, token, to, image, caption } = args;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = `${apiUrl}/${session}/send-image`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phone: to,
      path: image,
      caption,
      isGroup: to.includes("@g.us"),
    }),
  });

  const { text, json } = await readTextAndMaybeJson(res);
  if (!res.ok) {
    throw new WhatsAppApiError({ status: res.status, url, bodyText: text, bodyJson: json });
  }
  return json ?? text;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function inferImageExtension(contentType: string): string {
  const normalized = contentType.toLowerCase().split(";")[0].trim();
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  return "jpg";
}

async function fetchImageAsBase64(image: string): Promise<{ base64: string; filename: string }> {
  const res = await fetch(image);
  if (!res.ok) {
    const { text, json } = await readTextAndMaybeJson(res);
    throw new WhatsAppApiError({
      status: res.status,
      url: image,
      bodyText: text,
      bodyJson: json,
    });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!/^image\//i.test(contentType)) {
    throw new Error(`Image fetch returned non-image content-type: ${contentType}`);
  }

  const buffer = await res.arrayBuffer();
  const mime = contentType.toLowerCase().split(";")[0].trim() || "image/jpeg";
  return {
    base64: `data:${mime};base64,${arrayBufferToBase64(buffer)}`,
    filename: `radar-smart.${inferImageExtension(mime)}`,
  };
}

async function sendWhatsAppImageBase64(args: {
  apiUrl: string;
  session: string;
  token: string;
  to: string;
  image: string;
  caption: string;
}) {
  const { apiUrl, session, token, to, image, caption } = args;
  const file = await fetchImageAsBase64(image);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = `${apiUrl}/${session}/send-file-base64`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phone: to,
      base64: file.base64,
      filename: file.filename,
      caption,
      isGroup: to.includes("@g.us"),
    }),
  });

  const { text, json } = await readTextAndMaybeJson(res);
  if (!res.ok) {
    throw new WhatsAppApiError({ status: res.status, url, bodyText: text, bodyJson: json });
  }
  return json ?? text;
}

async function sendWhatsAppImageWithFallback(args: {
  apiUrl: string;
  session: string;
  token: string;
  to: string;
  image: string;
  caption: string;
}) {
  try {
    return await sendWhatsAppImage(args);
  } catch (firstError) {
    if (firstError instanceof WhatsAppApiError && firstError.status === 401) {
      throw firstError;
    }
    try {
      return await sendWhatsAppImageBase64(args);
    } catch (secondError) {
      if (secondError instanceof WhatsAppApiError && secondError.status === 401) {
        throw secondError;
      }
      const first = firstError instanceof Error ? firstError.message : String(firstError);
      const second = secondError instanceof Error ? secondError.message : String(secondError);
      throw new Error(`WhatsApp image send failed. url=${first}; base64=${second}`);
    }
  }
}

// Envia texto simples via WPPConnect
async function sendWhatsAppText(args: {
  apiUrl: string;
  session: string;
  token: string;
  to: string;
  text: string;
}) {
  const { apiUrl, session, token, to, text } = args;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = `${apiUrl}/${session}/send-message`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: to, message: text, isGroup: to.includes("@g.us") }),
  });

  const { text: bodyText, json } = await readTextAndMaybeJson(res);
  if (!res.ok) {
    throw new WhatsAppApiError({ status: res.status, url, bodyText, bodyJson: json });
  }
  return json ?? bodyText;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!isAuthorized(req)) return json(401, { error: "Unauthorized" });

  const body = await req.json().catch(() => ({}));
  const forceNow = Boolean((body as any)?.force_now || (body as any)?.forceNow);
  const jobId = Number((body as any)?.job_id ?? (body as any)?.jobId ?? 0);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  const whatsappApiUrl = (Deno.env.get("WHATSAPP_API_URL") || "").replace(/\/+$/, "");
  const whatsappSession = Deno.env.get("WHATSAPP_SESSION") || "";
  const whatsappToken = Deno.env.get("WHATSAPP_TOKEN") || "";
  const whatsappSecretKey = Deno.env.get("WHATSAPP_SECRET_KEY") || "";

  if (!url || !key) return json(500, { error: "Missing SUPABASE_URL or SERVICE_ROLE_KEY" });
  if (!whatsappApiUrl || !whatsappSession) {
    return json(500, { error: "Missing WHATSAPP_API_URL or WHATSAPP_SESSION (Secrets)" });
  }
  if (!whatsappToken && !whatsappSecretKey) {
    return json(500, { error: "Missing WHATSAPP_TOKEN or WHATSAPP_SECRET_KEY (Secrets)" });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date();
  const nowIso = now.toISOString();
  const nextAllowed = getNextAllowedSendTime(now);
  const nextAllowedIso = nextAllowed.toISOString();

  // Admin "Enviar Agora": traz jobs futuros para agora antes de processar.
  if (forceNow && !(jobId > 0)) {
    await sb
      .from("post_queue")
      .update({ scheduled_at: nextAllowedIso, updated_at: nowIso })
      .eq("channel", "whatsapp")
      .eq("status", "queued")
      .not("scheduled_at", "is", null)
      .gt("scheduled_at", nowIso)
      .lt("attempt_count", MAX_ATTEMPTS);
  }

  // Janela operacional: 08:00-22:00 (America/Sao_Paulo), todos os dias.
  if (!isWithinSendWindow(now)) {
    return json(200, {
      ok: true,
      skipped: true,
      reason: "outside_send_window",
      window: "08:00-22:00 America/Sao_Paulo",
      next_run_at: nextAllowedIso,
    });
  }

  // AUTORECOVERY: processing sem lock vira loop eterno
  await sb
    .from("post_queue")
    .update({ status: "queued", locked_until: null })
    .eq("channel", "whatsapp")
    .eq("status", "processing")
    .is("locked_until", null);

  // Evita jobs presos em queued com attempt_count alto (nÃ£o serÃ£o claimados).
  await sb
    .from("post_queue")
    .update({
      status: "failed",
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("channel", "whatsapp")
    .eq("status", "queued")
    .gte("attempt_count", MAX_ATTEMPTS);

  let job: QueueJob | null = null;
  if (jobId > 0) {
    const specific = await claimSpecificJob(sb, "whatsapp", jobId);
    if (specific.error) {
      return json(500, { error: "claim_specific_job_failed", details: specific.error });
    }
    if (!specific.job) {
      return json(200, { ok: true, skipped: true, message: specific.message || `Job ${jobId} nao disponivel` });
    }
    job = specific.job;
  } else {
    const { data: claimed, error: claimErr } = await sb.rpc("claim_next_post_queue_job", { p_channel: "whatsapp" });
    if (claimErr) return json(500, { error: "claim_next_post_queue_job failed", details: claimErr.message });
    if (!claimed?.length) return json(200, { ok: true, message: "Sem jobs" });
    job = claimed[0] as QueueJob;
  }

  if (!job) return json(200, { ok: true, message: "Sem jobs" });
  if (job.channel !== "whatsapp") {
    await sb
      .from("post_queue")
      .update({ status: "queued", locked_until: null, updated_at: new Date().toISOString() })
      .eq("id", job.id);
    return json(200, { ok: true, skipped: true, reason: `Job e ${job.channel}, nao whatsapp` });
  }

  // Target
  const { data: target, error: tErr } = await sb
    .from("post_targets")
    .select("external_id, is_active")
    .eq("id", job.target_id)
    .single();

  if (tErr || !target?.is_active) {
    await sb.rpc("fail_post_queue_job", { p_id: job.id, p_error: "Target invalido/inativo" });
    return json(400, { error: "Target invalido/inativo" });
  }

  const payload = job.payload || {};
  const rawText = pickText(payload);
  const link = pickLink(payload);
  const image = pickImage(payload);

  // Formatar texto igual ao Telegram:
  // 1) Markdown â†’ texto puro
  // 2) Remove URLs soltas (link vai no final)
  // 3) Primeira linha em *negrito* (WhatsApp bold)
  let finalText = buildFinalTextFromPayload(rawText, link);

  // Adiciona link no final
  if (false && link) {
    finalText = `${finalText}\n\n🟡 Comprar agora:\n${link}`;
  }

  if (!finalText) {
    await sb.rpc("fail_post_queue_job", { p_id: job.id, p_error: "Texto vazio no payload" });
    return json(400, { error: "Texto vazio no payload" });
  }

  const destination = normalizeWhatsAppDestination(target.external_id);
  if (!destination.to) {
    await sb.rpc("fail_post_queue_job", {
      p_id: job.id,
      p_error: destination.error || "external_id invalido no target",
    });
    return json(400, { error: destination.error || "external_id invalido no target" });
  }
  const to = destination.to;

  let wa: unknown;
  // Token strategy:
  // - Use WHATSAPP_TOKEN if present.
  // - If missing (or if WPP returns 401), and WHATSAPP_SECRET_KEY is set, auto-refresh via /generate-token.
  let tokenToUse = whatsappToken;
  if (!tokenToUse && whatsappSecretKey) {
    tokenToUse = await generateWhatsAppToken({
      apiUrl: whatsappApiUrl,
      session: whatsappSession,
      secretKey: whatsappSecretKey,
    });
  }
  try {
    // 1) Tenta enviar imagem com legenda (igual Telegram)
    if (image) {
      try {
        wa = await sendWhatsAppImageWithFallback({
          apiUrl: whatsappApiUrl,
          session: whatsappSession,
          token: tokenToUse,
          to,
          image,
          caption: finalText,
        });
      } catch (imageError) {
        throw imageError;
        // fallback: se imagem falhar, envia sÃ³ texto
        wa = await sendWhatsAppText({
          apiUrl: whatsappApiUrl,
          session: whatsappSession,
          token: tokenToUse,
          to,
          text: finalText,
        });
      }
    } else {
      // 2) Sem imagem: envia texto
      wa = await sendWhatsAppText({
        apiUrl: whatsappApiUrl,
        session: whatsappSession,
        token: tokenToUse,
        to,
        text: finalText,
      });
    }
  } catch (err) {
    // Auto-refresh token on 401 (common after WPP restart / token rotation).
    if (err instanceof WhatsAppApiError && err.status === 401 && whatsappSecretKey) {
      try {
        tokenToUse = await generateWhatsAppToken({
          apiUrl: whatsappApiUrl,
          session: whatsappSession,
          secretKey: whatsappSecretKey,
        });

        if (image) {
          try {
            wa = await sendWhatsAppImageWithFallback({
              apiUrl: whatsappApiUrl,
              session: whatsappSession,
              token: tokenToUse,
              to,
              image,
              caption: finalText,
            });
          } catch (imageError) {
            throw imageError;
            wa = await sendWhatsAppText({
              apiUrl: whatsappApiUrl,
              session: whatsappSession,
              token: tokenToUse,
              to,
              text: finalText,
            });
          }
        } else {
          wa = await sendWhatsAppText({
            apiUrl: whatsappApiUrl,
            session: whatsappSession,
            token: tokenToUse,
            to,
            text: finalText,
          });
        }

        // retry succeeded
        err = null;
      } catch (err2) {
        err = err2;
      }
    }

    if (!err) {
      // retry succeeded; fall through to mark job as sent
    } else {
    const msg = (err as Error).message ?? String(err);
    console.error("sendWhatsApp error:", msg);

    // Transient upstream outage: requeue with backoff instead of failing permanently.
    const attempt = clampInt((job as any).attempt_count, 1, 50);
    const isTransientHttp =
      err instanceof WhatsAppApiError &&
      (err.status === 408 || err.status === 429 || (err.status >= 500 && err.status <= 599));
    const isTransient =
      isTransientHttp ||
      /\bHTTP\s+(500|502|503|504)\b/i.test(msg) ||
      /\btimeout\b/i.test(msg) ||
      /\bfetch\b/i.test(msg) ||
      /\bnetwork\b/i.test(msg);

    if (isTransient && attempt < (MAX_ATTEMPTS + 1)) {
      const delaySecs = backoffSeconds(attempt);
      const retryAt = new Date(Date.now() + delaySecs * 1000).toISOString();

      await sb
        .from("post_queue")
        .update({
          status: "queued",
          locked_until: null,
          last_error: msg,
          scheduled_at: retryAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return json(502, { error: "WhatsApp send failed (will retry)", details: msg, retry_at: retryAt });
    }

    await sb.rpc("fail_post_queue_job", { p_id: job.id, p_error: msg });
    return json(502, { error: "WhatsApp send failed", details: msg });
    }
  }

  await sb
    .from("post_queue")
    .update({
      status: "sent",
      locked_until: null,
      last_error: null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      payload: {
        ...payload,
        stage: "sent",
        whatsapp_response: wa ?? null,
      },
    })
    .eq("id", job.id);

  return json(200, { ok: true, job_id: job.id });
});
