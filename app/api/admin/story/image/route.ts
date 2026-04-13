import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const ALLOWED_IMAGE_HOSTS = new Set([
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
  "images-na.ssl-images-amazon.com.br",
  "http2.mlstatic.com",
  "http.mlstatic.com",
]);

function isValidRemoteImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && ALLOWED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const src = req.nextUrl.searchParams.get("src")?.trim() ?? "";
  if (!src || !isValidRemoteImageUrl(src)) {
    return NextResponse.json({ error: "Imagem invalida." }, { status: 400 });
  }

  const upstream = await fetch(src, {
    redirect: "follow",
    headers: {
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      referer: "https://www.amazon.com.br/",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    },
    cache: "force-cache",
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Falha ao carregar imagem remota (${upstream.status}).` },
      { status: 502 },
    );
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
