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

export const normalizeMlProducts = (
  data: any,
  mattTool = "",
): MlProduct[] => {
  const items = data?.results ?? [];

  return items.slice(0, 10).map((item: any) => {
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
