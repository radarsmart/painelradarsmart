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
