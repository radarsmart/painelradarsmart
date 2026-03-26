export type MlProduct = {
  id: string;
  title: string;
  price: number;
  original_price: number;
  discount_pct: number;
  image_url: string;
  product_url: string;
  affiliate_url: string;
  sold: number;
  condition: string;
};

type MlApiResult = {
  id?: string | null;
  title?: string | null;
  price?: number | string | null;
  original_price?: number | string | null;
  permalink?: string | null;
  thumbnail?: string | null;
  sold_quantity?: number | string | null;
  condition?: string | null;
};

type MlApiResponse = {
  results?: MlApiResult[] | null;
};

export const normalizeMlProducts = (
  data: MlApiResponse | null | undefined,
  mattTool = "",
): MlProduct[] => {
  const items = data?.results ?? [];

  return items.slice(0, 10).map((item) => {
    const price = Number(item.price ?? 0);
    const original = Number(item.original_price ?? price);
    const discountPct =
      original > price ? Math.round(((original - price) / original) * 100) : 0;

    const permalink = String(item.permalink ?? "");
    const affiliate_url = mattTool
      ? `${permalink}${permalink.includes("?") ? "&" : "?"}matt_tool=${mattTool}`
      : permalink;

    return {
      id: String(item.id ?? ""),
      title: String(item.title ?? ""),
      price,
      original_price: original,
      discount_pct: discountPct,
      image_url: String(item.thumbnail ?? "").replace("-I.jpg", "-O.jpg"),
      product_url: permalink,
      affiliate_url,
      sold: Number(item.sold_quantity ?? 0),
      condition: String(item.condition ?? "new"),
    };
  });
};

export function normalizeMercadoLivreAffiliateUrl(
  rawUrl?: string | null,
  source = "radarsmart",
): string {
  const url = String(rawUrl ?? "").trim();
  if (!url) return "";

  try {
    const parsed = new URL(url);
    parsed.hash = "";

    if (!parsed.searchParams.has("source")) {
      parsed.searchParams.set("source", source);
    }

    if (!parsed.searchParams.has("matt_tool")) {
      parsed.searchParams.set("matt_tool", "radarsmart");
    }

    return parsed.toString();
  } catch {
    return url;
  }
}
