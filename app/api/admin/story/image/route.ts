import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function isValidRemoteImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const src = req.nextUrl.searchParams.get("src")?.trim() ?? "";
  if (!src || !isValidRemoteImageUrl(src)) {
    return NextResponse.json({ error: "Imagem invalida." }, { status: 400 });
  }

  const upstream = await fetch(src, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "user-agent": "RadarSmartStoryBot/1.0",
    },
    cache: "force-cache",
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: "Falha ao carregar imagem." }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType.startsWith("image/") ? contentType : "image/jpeg",
      "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
