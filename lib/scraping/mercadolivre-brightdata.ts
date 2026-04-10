import {
  extractMercadoLivreHtmlMetadataFromHtml,
  type MercadoLivreOfficialPreview,
} from "@/lib/scraping/mercadolivre-official";

type MercadoLivreBrightDataInput = {
  url: string;
  affiliateUrl?: string | null;
};

type BrightDataResponse = {
  body?: unknown;
  html?: unknown;
  content?: unknown;
  url?: unknown;
  final_url?: unknown;
  response_url?: unknown;
  status_code?: unknown;
  headers?: unknown;
};

const BRIGHTDATA_UNLOCKER_URL = "https://api.brightdata.com/request";
const BRIGHTDATA_TIMEOUT_MS = 6500;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function snippet(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function pickHtml(payload: BrightDataResponse, rawBody: string): string {
  const body = payload.body;
  if (typeof body === "string" && body.trim()) return body;

  const html = toText(payload.html);
  if (html) return html;

  const content = toText(payload.content);
  if (content) return content;

  return rawBody;
}

function pickFinalUrl(payload: BrightDataResponse, sourceUrl: string): string {
  return (
    toText(payload.response_url) ||
    toText(payload.final_url) ||
    toText(payload.url) ||
    sourceUrl
  );
}

export async function extractMercadoLivreWithBrightData(
  input: MercadoLivreBrightDataInput,
): Promise<MercadoLivreOfficialPreview> {
  const apiKey = toText(process.env.BRIGHTDATA_API_KEY);
  const zone = toText(process.env.BRIGHTDATA_ZONE);
  const sourceUrl = toText(input.url);

  if (!sourceUrl) {
    throw new Error("URL Mercado Livre obrigatoria.");
  }

  if (!apiKey || !zone) {
    throw new Error("BRIGHTDATA_API_KEY ou BRIGHTDATA_ZONE nao configurada.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRIGHTDATA_TIMEOUT_MS);

  try {
    const response = await fetch(BRIGHTDATA_UNLOCKER_URL, {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
      },
      body: JSON.stringify({
        zone,
        url: sourceUrl,
        format: "raw",
        method: "GET",
        country: "br",
      }),
    });

    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(
        `Bright Data retornou ${response.status}${rawBody ? `: ${snippet(rawBody)}` : ""}`,
      );
    }

    let payload: BrightDataResponse = {};
    try {
      payload = JSON.parse(rawBody) as BrightDataResponse;
    } catch {
      payload = {};
    }

    const html = pickHtml(payload, rawBody);
    const finalUrl = pickFinalUrl(payload, sourceUrl);

    return extractMercadoLivreHtmlMetadataFromHtml({
      html,
      sourceUrl,
      finalUrl,
      affiliateUrl: input.affiliateUrl,
      rawData: {
        brightdata_zone: zone,
        brightdata_response_status: toText(payload.status_code) || String(response.status),
        brightdata_headers: payload.headers ?? null,
        brightdata_final_url: finalUrl,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}
