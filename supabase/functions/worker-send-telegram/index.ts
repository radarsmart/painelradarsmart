import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

// (Opcional) Gate interno
function isAuthorized(req: Request): boolean {
  const internalKey = Deno.env.get("INTERNAL_API_KEY");
  const provided = req.headers.get("x-internal-key");
  if (internalKey && provided === internalKey) return true;

  // Allow calls authenticated by Supabase JWT (e.g. cron invoking with service role key).
  // The Supabase gateway already validates the JWT before the request hits the function.
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

// Remove Markdown SEM quebrar texto:
// - [Texto](url) -> Texto
// - **negrito** / __negrito__ / *itálico* / _itálico_ -> texto
// - remove crases e headings
function markdownToPlain(input: string): string {
  let s = input;

  // links markdown -> só o texto
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1");

  // bold/italic comuns
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");

  // inline code e headings simples
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");

  return s;
}

// Remove URLs "soltas" (ex.: http... no fim da mensagem),
// mas NÃO quebra estruturas tipo [texto](url) porque isso já foi convertido antes.
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

function buildTelegramCaptionFromPayload(rawText: string, link: string | null): string {
  const original = normalize(rawText);
  if (!link) return original;

  const withoutPlainLink = original
    .split("\n")
    .filter((line) => !String(line || "").includes(link))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return withoutPlainLink || original;
}

function formatPanelCopyForTelegram(text: string): string {
  return normalize(text)
    .split("\n")
    .map((line) =>
      escapeHtml(line)
        .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
        .replace(/~([^~\n]+)~/g, "<s>$1</s>"),
    )
    .join("\n");
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

function normalizeTelegramMediaUrl(value: unknown): string | null {
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
    const normalized = normalizeTelegramMediaUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function pickVideo(payload: Record<string, unknown>): string | null {
  const p = payload as any;
  const o = p.offer ?? {};
  const list = [
    p.video_url,
    o.video_url,
    o.video,
  ].filter(Boolean);
  for (const candidate of list) {
    const normalized = normalizeTelegramMediaUrl(candidate);
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

function pickText(payload: Record<string, unknown>): string {
  const v = (payload as any).ad_text ?? (payload as any).text ?? (payload as any).caption ?? "";
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

function emphasizePriceTokensHtml(text: string): string {
  // Strikethrough line: "R$ 169,00 — 45% de desconto!" (old price + discount only).
  const struckMatch = text.match(
    /^(R\$\s*\d[\d.]*,\d{2})(\s*—\s*\d{1,3}\s*%\s*de desconto!?)$/i,
  );
  if (struckMatch) {
    return `<s>${struckMatch[1]}</s>${struckMatch[2]}`;
  }

  return text
    .replace(/R\$\s*\d[\d.]*,\d{2}/g, (m) => `<b>${m}</b>`)
    .replace(/\b\d{1,3}\s*%\s*OFF\b/gi, (m) => `<b>${m.toUpperCase()}</b>`)
    .replace(/(Cupom:\s*[A-Z0-9_-]{3,24})/gi, (m) => `<b>${m}</b>`);
}

function formatTelegramHtml(text: string): string {
  const lines = String(text || "").split("\n");
  const firstIdx = lines.findIndex((line) => String(line).trim().length > 0);
  if (firstIdx < 0) return "";

  return lines
    .map((line, idx) => {
      const escaped = escapeHtml(line);
      if (idx === firstIdx) return `<b>${escaped}</b>`;
      return emphasizePriceTokensHtml(escaped);
    })
    .join("\n")
    .trim();
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

async function sendTelegram(args: {
  token: string;
  chatId: string;
  text: string;
  image?: string | null;
  video?: string | null;
  buttonUrl?: string | null;
}) {
  const { token, chatId, text, image, video, buttonUrl } = args;

  const reply_markup = buttonUrl
    ? { inline_keyboard: [[{ text: "🟡 Radar Smart — Comprar agora", url: String(buttonUrl) }]] }
    : undefined;

  // 0) Tenta vÃ­deo (preferÃªncia do Telegram)
  if (video) {
    const rv = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        video,
        caption: text,
        parse_mode: "HTML",
        supports_streaming: true,
        reply_markup,
      }),
    });
    const jv = await rv.json().catch(() => null);
    if (rv.ok && jv?.ok) return jv;
    // fallback para foto/texto se vÃ­deo falhar
  }

  // 1) Tenta foto
  if (image) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: image,
        caption: text,
        parse_mode: "HTML",
        reply_markup,
      }),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.ok) return j;
    // fallback para texto se foto falhar
  }

  // 2) Fallback texto
  const r2 = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup,
    }),
  });

  const j2 = await r2.json().catch(() => null);
  if (!r2.ok || !j2?.ok) throw new Error(`Telegram error: ${JSON.stringify(j2)}`);
  return j2;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // Segurança opcional
  if (!isAuthorized(req)) return json(401, { error: "Unauthorized" });

  const body = await req.json().catch(() => ({}));
  const forceNow = Boolean((body as any)?.force_now || (body as any)?.forceNow);
  const jobId = Number((body as any)?.job_id ?? (body as any)?.jobId ?? 0);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

  if (!url || !key) return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  if (!token.trim()) return json(500, { error: "Missing TELEGRAM_BOT_TOKEN" });

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
      .eq("channel", "telegram")
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

  // AUTORECOVERY (somente telegram):
  // Se existir job em processing com locked_until null, vira “zumbi”.
  // - Se ainda não estourou tentativas: volta pra queued
  // - Se já estourou: marca failed
  await sb
    .from("post_queue")
    .update({ status: "failed", last_error: "zombie job: processing without lock", updated_at: new Date().toISOString() })
    .eq("channel", "telegram")
    .eq("status", "processing")
    .is("locked_until", null)
    .gte("attempt_count", MAX_ATTEMPTS);

  await sb
    .from("post_queue")
    .update({ status: "queued", locked_until: null, last_error: null, updated_at: new Date().toISOString() })
    .eq("channel", "telegram")
    .eq("status", "processing")
    .is("locked_until", null)
    .lt("attempt_count", MAX_ATTEMPTS);

  // Se algum job chegou ao limite e ficou em queued (ex.: retry manual sem resetar tentativa),
  // marque como failed para aparecer no painel de erros.
  await sb
    .from("post_queue")
    .update({
      status: "failed",
      last_error: "max_attempts_reached",
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("channel", "telegram")
    .eq("status", "queued")
    .gte("attempt_count", MAX_ATTEMPTS);

  // Claim 1 job (usa a versão com parâmetro)
  let job: QueueJob | null = null;
  if (jobId > 0) {
    const specific = await claimSpecificJob(sb, "telegram", jobId);
    if (specific.error) {
      return json(500, { error: "claim_specific_job_failed", details: specific.error });
    }
    if (!specific.job) {
      return json(200, { ok: true, skipped: true, message: specific.message || `Job ${jobId} nao disponivel` });
    }
    job = specific.job;
  } else {
    const { data: claimed, error: claimErr } = await sb.rpc("claim_next_post_queue_job", { p_channel: "telegram" });
    if (claimErr) return json(500, { error: "claim_next_post_queue_job failed", details: claimErr.message });
    if (!claimed?.length) return json(200, { ok: true, message: "Sem jobs" });
    job = claimed[0] as QueueJob;
  }

  if (!job) return json(200, { ok: true, message: "Sem jobs" });

  // Segurança extra: se vier algo que não seja telegram, devolve pra fila sem falhar
  if (job.channel !== "telegram") {
    await sb.from("post_queue").update({ status: "queued", locked_until: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    return json(200, { ok: true, skipped: true, reason: `Job é ${job.channel}, não telegram.` });
  }

  // Target (post_targets)
  const { data: target, error: tErr } = await sb
    .from("post_targets")
    .select("external_id, is_active")
    .eq("id", job.target_id)
    .eq("channel", "telegram")
    .single();

  if (tErr || !target?.is_active || !target?.external_id) {
    await sb.rpc("fail_post_queue_job", { p_id: job.id, p_error: "Target inválido/inativo ou external_id vazio" });
    return json(400, { error: "Target inválido/inativo" });
  }

  const payload = job.payload || {};
  const rawText = pickText(payload);

  // ✅ Aqui é onde corrigimos o “formato fora do padrão”
  // 1) converte Markdown -> texto puro
  // 2) se tiver botão, remove URLs soltas (evita duplicar link no texto)
  // 3) mantém quebras e emojis
  const link = pickLink(payload);
  let finalText = buildTelegramCaptionFromPayload(rawText, link);
  finalText = formatPanelCopyForTelegram(finalText);

  if (!finalText) {
    await sb.rpc("fail_post_queue_job", { p_id: job.id, p_error: "Texto vazio no payload" });
    return json(400, { error: "Texto vazio no payload" });
  }

  const image = pickImage(payload);
  const video = pickVideo(payload);

  // Envia
  let tg: any;
  try {
    tg = await sendTelegram({
      token,
      chatId: String(target.external_id),
      text: finalText,
      image,
      video,
      buttonUrl: link,
    });
  } catch (e: any) {
    await sb.rpc("fail_post_queue_job", { p_id: job.id, p_error: String(e?.message ?? e) });
    return json(500, { ok: false, error: "Telegram send failed", details: String(e?.message ?? e) });
  }

  // Marca sent + grava message_id e resposta
  const telegramMessageId = tg?.result?.message_id ?? null;

  await sb
    .from("post_queue")
    .update({
      status: "sent",
      locked_until: null,
      last_error: null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      payload: {
        ...(payload as any),
        stage: "sent",
        telegram_message_id: telegramMessageId,
        telegram_chat_id: String(target.external_id),
        telegram_response: tg ?? null,
      },
    })
    .eq("id", job.id);

  return json(200, { ok: true, job_id: job.id, telegram_message_id: telegramMessageId });
});
