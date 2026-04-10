import { NextRequest, NextResponse } from "next/server";
import { fetchShopeeTopProducts } from "@/lib/shopee/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(req: NextRequest) {
  const limitValue = Number(req.nextUrl.searchParams.get("limit") ?? 10);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(limitValue, 20)) : 10;
  const keyword = req.nextUrl.searchParams.get("q")?.trim() || "iphone";

  try {
    const result = await fetchShopeeTopProducts(limit, keyword);

    if (result.status !== 200) {
      return NextResponse.json(
        {
          ok: false,
          status: result.status,
          error: "Falha ao consultar Shopee Afiliados.",
          raw: result.raw,
        },
        { status: 502 },
      );
    }

    const products = result.products.map((item) => ({
      title: item.productName ?? "Produto Shopee",
      price: toNumber(item.price) || toNumber(item.priceMax),
      image: item.imageUrl ?? "",
      link: item.offerLink || item.productLink || "",
      commission_rate: toNumber(item.commissionRate),
      marketplace: "Shopee",
      item_id: item.itemId ?? null,
      shop_name: item.shopName ?? null,
    }));

    return NextResponse.json(
      {
        ok: true,
        source: "shopee_affiliate",
        keyword,
        count: products.length,
        products,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro desconhecido na Shopee.",
      },
      { status: 500 },
    );
  }
}
