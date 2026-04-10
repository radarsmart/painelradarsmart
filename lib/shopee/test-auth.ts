import {
  buildShopeeAffiliateAuthHeader,
  buildShopeeAffiliatePayload,
  fetchShopeeTopProducts,
  type ShopeeProductNode,
} from "@/lib/shopee/client";

export type ShopeeAuthTestResult = {
  status: number;
  authorization: string;
  timestamp: number;
  products: ShopeeProductNode[];
  raw: unknown;
};

export function buildTestShopeeAffiliateAuthHeader(timestamp = Math.floor(Date.now() / 1000)) {
  const payload = buildShopeeAffiliatePayload(5, "iphone");
  return buildShopeeAffiliateAuthHeader(payload, timestamp);
}

export async function testShopeeAffiliateAuth(): Promise<ShopeeAuthTestResult> {
  const payload = buildShopeeAffiliatePayload(5, "iphone");
  const { authorization, timestamp } = buildShopeeAffiliateAuthHeader(payload);
  const { status, products, raw } = await fetchShopeeTopProducts(5, "iphone");

  return {
    status,
    authorization,
    timestamp,
    products,
    raw,
  };
}
