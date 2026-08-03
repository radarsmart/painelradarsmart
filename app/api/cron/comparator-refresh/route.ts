import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toText(v: unknown): string {
  return String(v ?? "").trim();
}

function priceTrend(oldPrice: number, newPrice: number): "up" | "down" | "stable" {
  if (newPrice > oldPrice * 1.01) return "up";
  if (newPrice < oldPrice * 0.99) return "down";
  return "stable";
}

// "checked" distingue "confirmamos de verdade que o produto sumiu" de
// "nao conseguimos checar" (API fora do ar, bloqueada, sem chave configurada
// etc.) — so o primeiro caso deve derrubar a oferta. Antes os dois casos
// voltavam como "available: false" e a oferta era desativada mesmo quando o
// problema era so a chamada ter falhado (ex.: API oficial do ML passou a
// exigir OAuth de app registrado e comecou a bloquear TODAS as chamadas).
async function fetchCurrentPrice(offer: Record<string, unknown>): Promise<{
  price: number | null;
  available: boolean;
  checked: boolean;
}> {
  const marketplace = toText(offer.marketplace).toLowerCase();
  const productUrl = toText(offer.product_url || offer.affiliate_url);

  if (!productUrl) {
    return { price: null, available: false, checked: false };
  }

  try {
    if (marketplace === "amazon") {
      const rainforestKey = process.env.RAINFOREST_API_KEY;
      if (!rainforestKey) return { price: null, available: false, checked: false };

      const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})/i);
      if (!asinMatch) return { price: null, available: false, checked: false };

      const endpoint = new URL("https://api.rainforestapi.com/request");
      endpoint.searchParams.set("api_key", rainforestKey);
      endpoint.searchParams.set("type", "product");
      endpoint.searchParams.set("asin", asinMatch[1].toUpperCase());
      endpoint.searchParams.set("amazon_domain", "amazon.com.br");

      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) return { price: null, available: false, checked: false };

      const data = (await res.json()) as Record<string, unknown>;
      const product = (data.product as Record<string, unknown> | null) ?? null;
      const buybox = (product?.buybox_winner as Record<string, unknown> | null) ?? null;
      const priceData = (buybox?.price as Record<string, unknown> | null) ?? null;
      const price = toNumber(priceData?.value);

      return { price: price > 0 ? price : null, available: price > 0, checked: true };
    }

    if (marketplace === "mercadolivre") {
      const itemIdMatch = productUrl.match(/MLB-?(\d+)/i);
      if (!itemIdMatch) return { price: null, available: false, checked: false };

      const itemId = `MLB${itemIdMatch[1]}`;
      const res = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        cache: "no-store",
      });
      // API oficial do ML hoje exige OAuth de app registrado pra maioria das
      // chamadas e responde 401/403 — isso NAO significa que o produto saiu
      // do ar, so que nao conseguimos confirmar por essa via.
      if (!res.ok) return { price: null, available: false, checked: false };

      const data = (await res.json()) as Record<string, unknown>;
      const price = toNumber(data.price);
      const available = toText(data.status) === "active" && price > 0;

      return { price: price > 0 ? price : null, available, checked: true };
    }

    return { price: null, available: true, checked: false };
  } catch {
    return { price: null, available: false, checked: false };
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET ?? "";

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = req.nextUrl.searchParams.get("mode") ?? "top50";

  let query = supabaseAdmin
    .from("offers")
    .select("id, title, price, product_url, affiliate_url, marketplace, click_count, price_updated_at")
    .eq("status", "active")
    .eq("slot_type", "comparator");

  if (mode === "top50") {
    query = query.order("click_count", { ascending: false }).limit(50);
  } else {
    query = query.order("price_updated_at", { ascending: true }).limit(200);
  }

  const { data: offers, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = { updated: 0, removed: 0, unchanged: 0, errors: 0 };

  for (const offer of offers ?? []) {
    try {
      const { price: newPrice, available, checked } = await fetchCurrentPrice(
        offer as Record<string, unknown>,
      );

      if (checked && !available) {
        await supabaseAdmin
          .from("offers")
          .update({ status: "inactive", updated_at: new Date().toISOString() })
          .eq("id", offer.id);
        results.removed++;
        continue;
      }

      if (!checked) {
        results.unchanged++;
        continue;
      }

      if (!newPrice) {
        results.unchanged++;
        continue;
      }

      const currentPrice = toNumber(offer.price);
      const trend = priceTrend(currentPrice, newPrice);

      await supabaseAdmin
        .from("offers")
        .update({
          price_previous: currentPrice,
          price: newPrice,
          price_trend: trend,
          price_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", offer.id);

      await supabaseAdmin.from("offer_price_history").insert({
        offer_id: offer.id,
        price: newPrice,
        original_price: null,
        source: "comparator-refresh",
      });

      results.updated++;
    } catch {
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, mode, ...results });
}
