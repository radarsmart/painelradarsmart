const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36";

export type TikTokShopProductInfo = {
  title: string;
  imageUrl: string;
  finalUrl: string;
};

function parseOgInfo(url: string): { title?: string; image?: string } | null {
  try {
    const parsed = new URL(url);
    const raw = parsed.searchParams.get("og_info");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * TikTok embeds og:title/og:image direto na query string (og_info) do link
 * final apos o redirect do vt.tiktok.com — a pagina real (tiktok.com/view/product/...)
 * fica atras de um "Security Check" que bloqueia fetch simples, entao nao da
 * pra raspar preco por ali. So seguimos os redirects ate achar esse parametro.
 */
export async function extractTikTokShopProductInfo(
  startUrl: string,
): Promise<TikTokShopProductInfo | null> {
  let current = startUrl;

  for (let hop = 0; hop < 6; hop += 1) {
    const directOgInfo = parseOgInfo(current);
    if (directOgInfo?.title || directOgInfo?.image) {
      return {
        title: String(directOgInfo.title ?? ""),
        imageUrl: String(directOgInfo.image ?? ""),
        finalUrl: current,
      };
    }

    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (response.status < 300 || response.status >= 400) {
      break;
    }

    const location = response.headers.get("location");
    if (!location) break;

    current = new URL(location, current).toString();
  }

  return null;
}
