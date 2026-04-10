import { NextRequest, NextResponse } from "next/server";
import { CURATED_ML_PRODUCTS } from "@/lib/ml/curated-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limit = Math.max(
      1,
      Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 8), 8),
    );
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

    let products = CURATED_ML_PRODUCTS;
    if (q) {
      const filtered = CURATED_ML_PRODUCTS.filter((product) =>
        product.title.toLowerCase().includes(q),
      );
      products = filtered.length ? filtered : CURATED_ML_PRODUCTS;
    }

    return NextResponse.json(
      {
        success: true,
        source: "curated_static",
        count: products.slice(0, limit).length,
        products: products.slice(0, limit).map((product) => ({
          id: product.id,
          title: product.title,
          price: product.price,
          image: product.image,
          thumbnail: product.image,
          permalink: product.link,
          link: product.link,
          category_id: product.category_id,
          sold_quantity: product.sold_quantity,
          updated_at: new Date().toISOString(),
        })),
      },
      {
        headers: {
          "Cache-Control": "s-maxage=7200, stale-while-revalidate=7200",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha ao montar o Mercado Livre Hub.",
        products: [],
      },
      { status: 500 },
    );
  }
}
