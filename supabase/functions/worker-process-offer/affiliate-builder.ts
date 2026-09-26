// ============================================================
// RADAR SMART - Affiliate Link Builder
// Gera links de afiliado com base no marketplace e config do painel
// Lê credenciais de affiliate_programs (tabela do painel admin)
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AffiliateConfig {
  marketplace: string;
  enabled: boolean;
  tracking_tag: string | null;
  api_key: string | null;
  api_secret: string | null;
  access_token: string | null;
  shop_url: string | null;
  affiliate_type: string | null;
  shopee_app_id: string | null;
  shopee_secret: string | null;
  ml_tag: string | null;
  ml_token: string | null;
  awin_id: string | null;
  awin_oauth_token: string | null;
}

/**
 * Busca config do marketplace em affiliate_programs e gera link tagueado.
 * Retorna null se não houver config habilitada ou se o marketplace não for suportado.
 */
export async function buildAffiliateUrl(
  offer: { marketplace: string; product_url: string | null; affiliate_url: string | null },
  supabase: SupabaseClient,
): Promise<string | null> {
  // Se já tem affiliate_url (ex: Shopee), usa direto
  if (offer.affiliate_url) return offer.affiliate_url;

  const productUrl = offer.product_url;
  if (!productUrl) return null;

  const marketplace = String(offer.marketplace ?? "").toLowerCase();
  if (!marketplace || marketplace === "outros") return null;
  const aliases = marketplace === "mercadolivre" ? ["mercadolivre", "mercado_livre"] : [marketplace];

  const { data: configs } = await supabase
    .from("affiliate_programs")
    .select("*")
    .in("marketplace", aliases)
    .eq("enabled", true)
    .limit(1);
  const config = Array.isArray(configs) ? configs[0] : null;

  if (!config) return null;

  switch (marketplace) {
    case "amazon":
      return buildAmazonLink(productUrl, config.tracking_tag);
    case "magalu":
      return buildMagaluLink(productUrl, config.shop_url);
    case "mercadolivre":
      return buildMercadoLivreLink(productUrl, config.ml_tag);
    case "awin":
    case "belezanaweb":
    case "ca":
    case "dafiti":
    case "eudora":
      return buildAwinLink(productUrl, config.awin_id);
    case "natura":
      return buildNaturaLink(productUrl, config.natura_consultant_tag);
    case "oboticario":
      return buildOBoticarioLink(productUrl, config.oboticario_store_name);
    default:
      return null;
  }
}

// ---- Builders por marketplace ----

function buildAmazonLink(url: string, trackingTag: string | null): string | null {
  if (!trackingTag) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("amazon.")) return null;
    parsed.searchParams.delete("tag");
    parsed.searchParams.delete("ascsubtag");
    parsed.searchParams.set("tag", trackingTag);
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildMagaluLink(url: string, shopUrl: string | null): string | null {
  if (!shopUrl) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("magazineluiza.com.br") && !parsed.hostname.includes("magalu.com")) return null;

    // Extrai o path do produto (ex: /produto/abc123/)
    const path = parsed.pathname;

    // shopUrl é tipo "https://www.magazinevoce.com.br/magazineRADAR"
    // Remove trailing slash
    const base = shopUrl.replace(/\/+$/, "");
    return `${base}${path}`;
  } catch {
    return null;
  }
}

function buildMercadoLivreLink(url: string, mlTag: string | null): string | null {
  if (!mlTag) return null;
  try {
    const parsed = new URL(url);
    if (
      !parsed.hostname.includes("mercadolivre.com.br") &&
      !parsed.hostname.includes("mercadolibre.com")
    ) return null;
    parsed.searchParams.delete("tag");
    parsed.searchParams.set("tag", mlTag);
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildAwinLink(url: string, awinId: string | null): string | null {
  if (!awinId) return null;
  try {
    const encoded = encodeURIComponent(url);
    return `https://www.awin1.com/cread.php?awinaffid=${awinId}&ued=${encoded}`;
  } catch {
    return null;
  }
}

function buildNaturaLink(url: string, consultantTag: string | null): string | null {
  if (!consultantTag) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("natura.com.br")) return null;
    parsed.searchParams.set("consultoria", consultantTag);
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildOBoticarioLink(url: string, storeName: string | null): string | null {
  if (!storeName) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("boticario.com.br")) return null;
    parsed.searchParams.set("store", storeName);
    return parsed.toString();
  } catch {
    return null;
  }
}
