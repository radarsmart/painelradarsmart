import { NextRequest, NextResponse } from "next/server";

import { sanitizeMarketplaceUrl } from "@/lib/amazon";
import { buildAwinDeepLink, forceAliExpressBrazilLink, getAwinPublisherId } from "@/lib/awin/client";
import { resolveAwinMerchantId } from "@/lib/awin/store-directory";
import { checkGarimparToken } from "@/lib/garimpar/auth";
import { normalizePaymentTerms, resolveOfferPricing } from "@/lib/offers/pricing";
import { classifyOfferCategory, computeProfitPotential } from "@/lib/radar-sniper";
import { garimparCorsPreflight, withGarimparCors } from "@/lib/garimpar/cors";
import { fetchShopeeProductByIds, parseShopeeProductId } from "@/lib/shopee/client";
import { salvarOferta, supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "awin" cobre qualquer loja da rede AWIN alem do AliExpress (Dafiti,
// Centauro, Natura, C&A, KaBuM...) — o merchant ID certo e resolvido pelo
// hostname da URL capturada (ver lib/awin/store-directory.ts). AliExpress
// continua com seu proprio valor porque ja tinha etiqueta/rotulo dedicado
// antes da generalizacao, mas usa a mesma logica de link por baixo.
type GarimparMarketplace = "shopee" | "amazon" | "mercadolivre" | "aliexpress" | "awin";

// Mercado Livre e o unico marketplace que realmente exige link de afiliado
// resolvido no momento da captura (a extensao gera no navegador, usando a
// sessao logada do usuario) — nao ha como monetizar sem ele, e nao existe
// hoje nenhum jeito barato/confiavel do backend resolver sozinho. Shopee,
// Amazon, AliExpress e lojas AWIN resolvem sempre no backend: Shopee via API
// oficial (sincrono, ver resolveShopeeOffer), Amazon via reescrita pura de
// URL com a tag (sanitizeMarketplaceUrl), AliExpress/AWIN via deep link da
// AWIN (buildAwinDeepLink) — todos deterministicos, sem chamada externa
// nenhuma — entao a extensao so precisa mandar a URL bruta pra elas.
const MARKETPLACES_REQUIRING_AFFILIATE_LINK = new Set<GarimparMarketplace>(["mercadolivre"]);

type ShopeeResolved = {
  affiliateUrl: string | null;
  rating: number | null;
  sales: number | null;
  title: string | null;
  price: number | null;
  imageUrl: string | null;
};

const EMPTY_SHOPEE_RESOLVED: ShopeeResolved = {
  affiliateUrl: null,
  rating: null,
  sales: null,
  title: null,
  price: null,
  imageUrl: null,
};

// A extensao so precisa mandar a URL do produto Shopee — a API oficial ja
// devolve titulo, preco, imagem, link de afiliado, rating e vendas numa unica
// chamada, entao nao ha necessidade de raspar nada do DOM da Shopee (classes
// CSS obfuscadas que mudam com frequencia) so pra descobrir esses dados.
async function resolveShopeeOffer(productUrl: string): Promise<ShopeeResolved> {
  const ids = parseShopeeProductId(productUrl);
  if (!ids) return EMPTY_SHOPEE_RESOLVED;

  try {
    const node = await fetchShopeeProductByIds(ids.shopId, ids.itemId);
    if (!node) return EMPTY_SHOPEE_RESOLVED;

    const rating = Number(node.ratingStar);
    const sales = Number(node.sales);
    const price = Number(node.price);

    return {
      affiliateUrl: toText(node.offerLink) || null,
      rating: Number.isFinite(rating) && rating > 0 ? rating : null,
      sales: Number.isFinite(sales) && sales >= 0 ? sales : null,
      title: toText(node.productName) || null,
      price: Number.isFinite(price) && price > 0 ? price : null,
      imageUrl: toText(node.imageUrl) || null,
    };
  } catch {
    return EMPTY_SHOPEE_RESOLVED;
  }
}

type GarimparItem = {
  title?: unknown;
  price?: unknown;
  old_price?: unknown;
  image_url?: unknown;
  product_url?: unknown;
  affiliate_url?: unknown;
  marketplace?: unknown;
  pix_price?: unknown;
  cash_price?: unknown;
  card_price?: unknown;
  installment_count?: unknown;
  installment_amount?: unknown;
  installment_interest_free?: unknown;
  coupon_code?: unknown;
  coupon_description?: unknown;
};

type ItemResult = {
  index: number;
  ok: boolean;
  offer_id?: string;
  error?: string;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeMarketplace(value: unknown): GarimparMarketplace | null {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "shopee" ||
    normalized === "amazon" ||
    normalized === "mercadolivre" ||
    normalized === "aliexpress" ||
    normalized === "awin"
  ) {
    return normalized;
  }
  return null;
}

async function importItem(item: GarimparItem, index: number): Promise<ItemResult> {
  const productUrl = toText(item.product_url);
  const marketplace = normalizeMarketplace(item.marketplace);

  if (!marketplace) {
    return {
      index,
      ok: false,
      error: "marketplace invalido ou fora de escopo (use shopee, amazon, mercadolivre, aliexpress ou awin; magalu ainda nao suportado).",
    };
  }

  if (!productUrl) {
    return { index, ok: false, error: "product_url obrigatorio." };
  }

  const manualAffiliateUrl = toText(item.affiliate_url);

  // Shopee resolve tudo (link, titulo, preco, imagem) pela API oficial a
  // partir so da URL — a extensao nao precisa mandar mais nada pra Shopee.
  const shopeeResolved =
    marketplace === "shopee" && !manualAffiliateUrl ? await resolveShopeeOffer(productUrl) : null;

  const title = toText(item.title) || shopeeResolved?.title || "";
  if (!title) {
    return { index, ok: false, error: "title e obrigatorio (ou a Shopee precisa conseguir resolver o produto pela URL)." };
  }

  const pricing = resolveOfferPricing({
    price: item.price || shopeeResolved?.price || undefined,
    old_price: item.old_price,
  });
  if (pricing.price <= 0) {
    return { index, ok: false, error: "price invalido." };
  }

  // Regra inegociavel: sem link de afiliado resolvido, ML/Amazon nao entram
  // como oferta pendente — entram como erro de importacao, pra nao deixar a
  // curadoria decidir sobre algo que nunca vai poder ser publicado de
  // qualquer forma (sem link nao tem como monetizar o clique).
  const requiresLink = MARKETPLACES_REQUIRING_AFFILIATE_LINK.has(marketplace);
  if (requiresLink && !manualAffiliateUrl) {
    return {
      index,
      ok: false,
      error: `affiliate_url obrigatorio para ${marketplace} — extracao sem link resolvido e erro de importacao, nao oferta pendente.`,
    };
  }

  const affiliateUrl =
    manualAffiliateUrl ||
    shopeeResolved?.affiliateUrl ||
    (marketplace === "amazon"
      ? sanitizeMarketplaceUrl(productUrl, marketplace, { fallbackUrl: productUrl })
      : marketplace === "aliexpress" || marketplace === "awin"
        ? buildAwinDeepLink({
            advertiserId: resolveAwinMerchantId(productUrl),
            publisherId: getAwinPublisherId(),
            // Reescreve hostname pra pt.aliexpress.com quando for AliExpress;
            // passa direto (sem efeito) pra qualquer outra loja da rede AWIN.
            destinationUrl: forceAliExpressBrazilLink(productUrl),
          })
        : productUrl);

  const imageUrl = toText(item.image_url) || shopeeResolved?.imageUrl || "";

  const discountPct = pricing.discountPct;
  const payment = normalizePaymentTerms({
    price: pricing.price,
    regular_price: pricing.price,
    pix_price: item.pix_price,
    cash_price: item.cash_price,
    card_price: item.card_price,
    installment_count: item.installment_count,
    installment_amount: item.installment_amount,
    installment_interest_free: item.installment_interest_free,
  });
  const hasCardInfo =
    toNumberOrNull(item.card_price) !== null ||
    Boolean(payment.installments && payment.installment_value);
  const score = computeProfitPotential({
    title,
    marketplace,
    price: pricing.price,
    oldPrice: pricing.oldPrice ?? 0,
    discountPct,
    raw: null,
  });
  const category = classifyOfferCategory(title);
  const externalOfferId = `${marketplace}:${productUrl}`;

  const existing = await supabaseAdmin
    .from("offers")
    .select("id")
    .eq("external_offer_id", externalOfferId)
    .maybeSingle();

  if (existing.error) {
    return { index, ok: false, error: existing.error.message };
  }

  const payload: Record<string, unknown> = {
    id: existing.data?.id,
    title,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    image_url: imageUrl || null,
    marketplace,
    platform: marketplace,
    category,
    category_name: category,
    price: pricing.price,
    regular_price: pricing.price,
    old_price: pricing.oldPrice || null,
    original_price: pricing.oldPrice || null,
    discount_pct: discountPct,
    external_offer_id: externalOfferId,
    rating: shopeeResolved?.rating ?? null,
    sales: shopeeResolved?.sales ?? null,
    pix_price: payment.pix_price,
    cash_price: payment.cash_price,
    card_price: hasCardInfo ? payment.card_price : null,
    installment_count: payment.installments,
    installment_amount: payment.installment_value,
    installment_interest_free: payment.interest_free,
    coupon_code: toText(item.coupon_code) || null,
    coupon_description: toText(item.coupon_description) || null,
    status: "inactive",
    curations_status: "review",
    source: "extensao",
    currency: "BRL",
    score,
  };

  const result = await salvarOferta(payload);
  if (result.error || !result.data) {
    return { index, ok: false, error: result.error?.message ?? "Falha ao salvar oferta." };
  }

  return { index, ok: true, offer_id: String(result.data.id) };
}

export async function OPTIONS() {
  return garimparCorsPreflight();
}

export async function POST(req: NextRequest) {
  const auth = checkGarimparToken(req);
  if (!auth.ok) {
    return withGarimparCors(NextResponse.json({ error: auth.error }, { status: auth.status }));
  }

  let body: { items?: unknown };
  try {
    body = (await req.json()) as { items?: unknown };
  } catch {
    return withGarimparCors(NextResponse.json({ error: "JSON invalido." }, { status: 400 }));
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return withGarimparCors(
      NextResponse.json({ error: "items deve ser uma lista com pelo menos 1 produto." }, { status: 400 }),
    );
  }
  if (body.items.length > 200) {
    return withGarimparCors(NextResponse.json({ error: "Maximo de 200 itens por lote." }, { status: 400 }));
  }

  const results: ItemResult[] = [];
  for (let index = 0; index < body.items.length; index += 1) {
    const item = body.items[index] as GarimparItem;
    results.push(await importItem(item, index));
  }

  const imported = results.filter((item) => item.ok).length;

  return withGarimparCors(
    NextResponse.json({
      ok: true,
      imported,
      rejected: results.length - imported,
      results,
    }),
  );
}
