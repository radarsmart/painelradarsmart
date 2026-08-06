import { createHash } from "node:crypto";

export type ShopeeProductNode = {
  productName?: string | null;
  commissionRate?: string | number | null;
  price?: string | number | null;
  priceMax?: string | number | null;
  itemId?: string | number | null;
  shopName?: string | null;
  imageUrl?: string | null;
  productLink?: string | null;
  offerLink?: string | null;
};

function requiredEnv(name: "SHOPEE_APP_ID" | "SHOPEE_SECRET_KEY"): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`${name} nao configurada.`);
  }
  return value;
}

export function buildShopeeAffiliatePayload(limit = 10, keyword?: string, page = 1) {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const safePage = Math.max(1, Math.min(page, 50));
  const keywordArg = keyword?.trim() ? `keyword: ${JSON.stringify(keyword.trim())}, ` : "";
  const query = `{ productOfferV2(${keywordArg}sortType: 2, page: ${safePage}, limit: ${safeLimit}) { nodes { productName commissionRate price priceMax itemId shopName imageUrl productLink offerLink } } }`;

  return JSON.stringify({ query });
}

export function buildShopeeAffiliateAuthHeader(payload: string, timestamp = Math.floor(Date.now() / 1000)) {
  const appId = requiredEnv("SHOPEE_APP_ID");
  const secretKey = requiredEnv("SHOPEE_SECRET_KEY");
  const baseString = `${appId}${timestamp}${payload}${secretKey}`;
  const signature = createHash("sha256").update(baseString).digest("hex");
  const authorization = `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;

  return {
    appId,
    timestamp,
    signature,
    authorization,
  };
}

export async function fetchShopeeTopProducts(limit = 10, keyword?: string, page = 1) {
  const payload = buildShopeeAffiliatePayload(limit, keyword, page);
  const { authorization, timestamp } = buildShopeeAffiliateAuthHeader(payload);

  const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: payload,
    cache: "no-store",
  });

  const raw = await response.json().catch(async () => ({
    text: await response.text().catch(() => ""),
  }));

  const products =
    ((raw as { data?: { productOfferV2?: { nodes?: ShopeeProductNode[] } } })?.data
      ?.productOfferV2?.nodes ?? []) as ShopeeProductNode[];

  return {
    status: response.status,
    timestamp,
    products,
    raw,
  };
}

// Extrai shopId/itemId de uma URL de produto Shopee, nos dois formatos que
// a Shopee usa: "...-i.<shopId>.<itemId>" (link normal compartilhado) e
// "/product/<shopId>/<itemId>" (formato que a propria API devolve em
// productLink). Com esses dois numeros, productOfferV2 busca o produto
// exato direto na API oficial — sem depender de raspar a pagina, que a
// Shopee bloqueia com frequencia (deteccao de bot).
export function parseShopeeProductId(url: string): { shopId: string; itemId: string } | null {
  const value = String(url ?? "");

  const dashFormat = value.match(/-i\.(\d+)\.(\d+)/);
  if (dashFormat) return { shopId: dashFormat[1], itemId: dashFormat[2] };

  const pathFormat = value.match(/\/product\/(\d+)\/(\d+)/);
  if (pathFormat) return { shopId: pathFormat[1], itemId: pathFormat[2] };

  return null;
}

/**
 * Busca um produto especifico pela API oficial de afiliados, via shopId +
 * itemId (em vez de busca por palavra-chave) — devolve titulo, preco,
 * imagem e link de afiliado numa unica chamada, sem scraping.
 */
export async function fetchShopeeProductByIds(
  shopId: string,
  itemId: string,
): Promise<ShopeeProductNode | null> {
  const query = `{ productOfferV2(shopId: ${Number(shopId)}, itemId: ${Number(itemId)}) { nodes { productName commissionRate price priceMax itemId shopId shopName imageUrl productLink offerLink } } }`;
  const payload = JSON.stringify({ query });
  const { authorization } = buildShopeeAffiliateAuthHeader(payload);

  const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: payload,
    cache: "no-store",
  });

  const raw = await response.json().catch(async () => ({
    text: await response.text().catch(() => ""),
  }));

  const nodes =
    ((raw as { data?: { productOfferV2?: { nodes?: ShopeeProductNode[] } } })?.data
      ?.productOfferV2?.nodes ?? []) as ShopeeProductNode[];

  return nodes[0] ?? null;
}

export async function generateShopeeAffiliateShortLink(originUrl: string): Promise<string> {
  const sanitizedOriginUrl = String(originUrl ?? "").trim();
  if (!sanitizedOriginUrl) return "";

  const payload = JSON.stringify({
    query: `mutation { generateShortLink(input: { originUrl: ${JSON.stringify(sanitizedOriginUrl)} }) { shortLink } }`,
  });

  const { authorization } = buildShopeeAffiliateAuthHeader(payload);

  const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: payload,
    cache: "no-store",
  });

  const raw = await response.json().catch(async () => ({
    text: await response.text().catch(() => ""),
  }));

  const shortLink = String(
    ((raw as { data?: { generateShortLink?: { shortLink?: string | null } } }).data
      ?.generateShortLink?.shortLink ?? ""),
  ).trim();

  return shortLink || sanitizedOriginUrl;
}
