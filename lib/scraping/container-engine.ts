import {
  extractAmazonOffer,
  type AmazonOfferPreview,
} from "@/lib/scraping/amazon-extractor";
import {
  extractMercadoLivreOffer,
  type MercadoLivreOfferPreview,
} from "@/lib/scraping/mercadolivre-extractor";

type Marketplace = "mercadolivre" | "amazon";

export type ContainerEngineOutput =
  | {
      engine: "container-egg-v1";
      marketplace: "mercadolivre";
      elapsedMs: number;
      data: MercadoLivreOfferPreview;
    }
  | {
      engine: "container-egg-v1";
      marketplace: "amazon";
      elapsedMs: number;
      data: AmazonOfferPreview;
    };

export function detectMarketplaceFromUrl(url: string): Marketplace | null {
  const normalized = url.toLowerCase();
  if (normalized.includes("mercadolivre.") || normalized.includes("mercadolibre.")) {
    return "mercadolivre";
  }
  if (normalized.includes("meli.la")) {
    return "mercadolivre";
  }
  if (normalized.includes("amazon.")) {
    return "amazon";
  }
  if (normalized.includes("amzn.to")) {
    return "amazon";
  }
  return null;
}

async function resolveShortUrl(url: string): Promise<string> {
  const normalized = url.toLowerCase();
  const isShortener = normalized.includes("meli.la") || normalized.includes("amzn.to");
  if (!isShortener) return url;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    const resolved = String(response.url ?? "").trim();
    return resolved || url;
  } catch {
    return url;
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractWithContainerEngine(input: {
  url: string;
  affiliateUrl?: string | null;
}): Promise<ContainerEngineOutput> {
  const sourceUrl = String(input.url ?? "").trim();
  if (!sourceUrl) throw new Error("Campo url obrigatorio.");

  const resolvedUrl = await resolveShortUrl(sourceUrl);
  const marketplace = detectMarketplaceFromUrl(resolvedUrl);
  if (!marketplace) {
    throw new Error("URL invalida. Use Mercado Livre ou Amazon.");
  }

  const startedAt = Date.now();

  if (marketplace === "mercadolivre") {
    const data = await extractMercadoLivreOffer({
      url: resolvedUrl,
      affiliateUrl: input.affiliateUrl ?? resolvedUrl,
    });
    return {
      engine: "container-egg-v1",
      marketplace,
      elapsedMs: Date.now() - startedAt,
      data,
    };
  }

  const data = await extractAmazonOffer({
    url: resolvedUrl,
    affiliateUrl: input.affiliateUrl ?? resolvedUrl,
  });
  return {
    engine: "container-egg-v1",
    marketplace,
    elapsedMs: Date.now() - startedAt,
    data,
  };
}
