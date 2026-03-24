import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { salvarOferta, supabaseAdmin } from "@/lib/supabase";

type IncomingWebhookPayload = {
  title?: unknown;
  price?: unknown;
  original_price?: unknown;
  old_price?: unknown;
  image_url?: unknown;
  affiliate_link?: unknown;
  affiliate_url?: unknown;
  product_url?: unknown;
  source_url?: unknown;
  marketplace?: unknown;
  store?: unknown;
  category?: unknown;
  raw_data?: unknown;
  request_id?: unknown;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferMarketplace(input: IncomingWebhookPayload): string {
  const fromPayload = toText(input.marketplace || input.store).toLowerCase();
  if (fromPayload.includes("mercado")) return "mercadolivre";
  if (fromPayload.includes("amazon")) return "amazon";

  const source = toText(input.product_url || input.source_url || input.affiliate_url || input.affiliate_link).toLowerCase();
  if (source.includes("mercadolivre") || source.includes("mercadolibre")) return "mercadolivre";
  if (source.includes("amazon.")) return "amazon";
  return "outro";
}

function inferCategory(title: string): string {
  const normalized = title.toLowerCase();
  if (/monitor|tv|notebook|smartphone|iphone|teclado|mouse|gamer|ssd/.test(normalized)) return "Tecnologia";
  if (/fritadeira|chaleira|cooktop|cafeteira|panela|geladeira|micro-ondas/.test(normalized)) return "Casa";
  if (/halter|bike|esteira|fitness|academia|corrida|esporte/.test(normalized)) return "Fitness";
  return "Geral";
}

function isWebhookAuthorized(req: NextRequest): boolean {
  const expected = toText(process.env.N8N_WEBHOOK_SECRET);
  if (!expected) return true;

  const provided =
    req.headers.get("x-radar-webhook-key") ??
    req.headers.get("x-webhook-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  return toText(provided) === expected;
}

export async function POST(req: NextRequest) {
  try {
    if (!isWebhookAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Webhook não autorizado." }, { status: 401 });
    }

    const body = (await req.json()) as IncomingWebhookPayload;
    const title = toText(body.title);
    const price = toNumber(body.price);
    const oldPrice = toNumber(body.original_price ?? body.old_price);
    const imageUrl = toText(body.image_url);
    const affiliateUrl = toText(body.affiliate_link || body.affiliate_url);
    const sourceUrl = toText(body.product_url || body.source_url || affiliateUrl);

    if (!title || !price || !imageUrl || !affiliateUrl || !sourceUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "Campos obrigatórios: title, price, image_url, affiliate_link e product_url/source_url.",
        },
        { status: 400 },
      );
    }

    const marketplace = inferMarketplace(body);
    const category = toText(body.category) || inferCategory(title);
    const categorySlug = category.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const requestId = toText(body.request_id) || randomUUID();
    const discountPct =
      oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;

    const rawData =
      body.raw_data && typeof body.raw_data === "object" && !Array.isArray(body.raw_data)
        ? (body.raw_data as Record<string, unknown>)
        : {};

    const { data, error } = await salvarOferta({
      title,
      price,
      old_price: oldPrice,
      original_price: oldPrice,
      image_url: imageUrl,
      category,
      category_name: category,
      category_slug: categorySlug,
      store: marketplace === "mercadolivre" ? "MERCADO LIVRE" : marketplace === "amazon" ? "AMAZON" : "LOJA",
      marketplace,
      platform: marketplace,
      product_url: sourceUrl,
      origin_url: sourceUrl,
      affiliate_url: affiliateUrl,
      external_offer_id: `${marketplace}:${sourceUrl}`,
      status: "active",
      curations_status: "approved",
      source: "n8n_webhook",
      currency: "BRL",
      discount_pct: discountPct,
      discount_percent: discountPct,
      raw_data: {
        ...rawData,
        n8n_request_id: requestId,
        webhook_received_at: new Date().toISOString(),
      },
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, offer: data, request_id: requestId });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao processar webhook do n8n.",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const sourceUrl = toText(req.nextUrl.searchParams.get("source_url"));
    if (!sourceUrl) {
      return NextResponse.json(
        { ok: false, error: "Parâmetro source_url é obrigatório." },
        { status: 400 },
      );
    }

    const selectFields =
      "id,title,price,old_price,image_url,product_url,affiliate_url,marketplace,status,created_at";

    const candidates: Array<{ field: "origin_url" | "product_url" | "affiliate_url"; value: string }> = [
      { field: "origin_url", value: sourceUrl },
      { field: "product_url", value: sourceUrl },
      { field: "affiliate_url", value: sourceUrl },
    ];

    let foundOffer: Record<string, unknown> | null = null;
    for (const candidate of candidates) {
      const { data, error } = await supabaseAdmin
        .from("offers")
        .select(selectFields)
        .eq(candidate.field, candidate.value)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      if (data) {
        foundOffer = data as Record<string, unknown>;
        break;
      }
    }

    return NextResponse.json({ ok: true, offer: foundOffer });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao consultar retorno do webhook.",
      },
      { status: 500 },
    );
  }
}
