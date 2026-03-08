export type AmazonProduct = {
  asin: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string;
  rating: number;
  reviews: number;
  product_url: string;
  affiliate_url: string;
};

export const parseCurrencyToNumber = (raw?: string | null) => {
  if (!raw) return 0;
  const normalized = raw
    .replace(/\s/g, "")
    .replace(/[Rr]\$/, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const value = Number(normalized.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : 0;
};

export const normalizeAmazonProducts = (
  data: any,
  tag = "radarsmart-20",
): AmazonProduct[] => {
  const items = data?.data?.products ?? [];
  return items.slice(0, 10).map((p: any) => {
    const asin = String(p.asin ?? "");
    return {
      asin,
      title: String(p.product_title ?? ""),
      price: parseCurrencyToNumber(p.product_price),
      original_price: parseCurrencyToNumber(p.product_original_price),
      image_url: String(p.product_photo ?? ""),
      rating: Number(p.product_star_rating ?? 0),
      reviews: Number(p.product_num_ratings ?? 0),
      product_url: `https://www.amazon.com.br/dp/${asin}`,
      affiliate_url: `https://www.amazon.com.br/dp/${asin}?tag=${tag}`,
    };
  });
};
