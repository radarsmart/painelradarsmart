import { supabaseAdmin } from "@/lib/supabase";
import { resolveCategory } from "@/lib/offers/categories";
import { ensureOfferShortCode } from "@/lib/offers/short-link";
import { toAbsoluteSiteUrl } from "@/lib/site";
import { extractResponseText, type OpenAIResponsesApiResponse } from "./pipeline";
import type { TikTokGenerateRequest } from "./types";

const OPENAI_MODEL = "gpt-4o-mini";

// Descontos acima disso quase sempre sao erro de extracao (mesmo criterio
// usado em lib/sales-agents/run-agent.ts) — sem esse filtro, sao exatamente
// essas ofertas com desconto errado que sobem pro topo do seletor (ordenado
// por desconto desc), viram "a melhor oferta" e produzem video com numero
// de desconto/preco anterior absurdo.
const MAX_PLAUSIBLE_DISCOUNT_PCT = 80;

function requiredEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`Variavel ${name} ausente.`);
  return value;
}

function toBRL(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export type CandidateOffer = {
  id: string;
  title: string;
  price: number;
  discountPct: number;
  marketplace: string;
  imageUrl: string | null;
};

// Lista as ofertas reais mais "postaveis" agora — ativas, com desconto real,
// as mais recentes primeiro. E o que alimenta o seletor "gerar a partir de
// oferta real" no admin do tiktok-engine, pra nao depender de alguem digitar
// preco/desconto/beneficio do zero toda vez que quiser um video novo.
export async function listCandidateOffersForVideo(limit = 30): Promise<CandidateOffer[]> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id,title,price,discount_pct,marketplace,image_url,status,curations_status")
    .eq("status", "active")
    .eq("curations_status", "approved")
    .lte("discount_pct", MAX_PLAUSIBLE_DISCOUNT_PCT)
    .order("discount_pct", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao listar ofertas: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    price: Number(row.price) || 0,
    discountPct: Number(row.discount_pct) || 0,
    marketplace: String(row.marketplace ?? ""),
    imageUrl: row.image_url ? String(row.image_url) : null,
  }));
}

type OfferRow = {
  id: string;
  title: string | null;
  price: number | string | null;
  original_price: number | string | null;
  old_price: number | string | null;
  discount_pct: number | string | null;
  category: string | null;
  image_url: string | null;
  marketplace: string | null;
};

async function loadOffer(offerId: string): Promise<OfferRow> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id,title,price,original_price,old_price,discount_pct,category,image_url,marketplace")
    .eq("id", offerId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar oferta: ${error.message}`);
  if (!data) throw new Error("Oferta nao encontrada.");
  return data as OfferRow;
}

type DerivedCopy = {
  benefits: string[];
  pain: string;
};

// So a parte que uma oferta crua nao tem pronta (beneficios/dor do cliente em
// linguagem de video curto) — preco, desconto, categoria e imagem vem direto
// do catalogo, sem precisar de IA.
async function deriveCopyWithOpenAI(offer: OfferRow): Promise<DerivedCopy> {
  const openAiKey = requiredEnv("OPENAI_API_KEY");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      benefits: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 4 },
      pain: { type: "string" },
    },
    required: ["benefits", "pain"],
  };

  const system =
    "Voce e um redator de video curto (TikTok/Reels) pra e-commerce brasileiro. " +
    "Dado um produto real (titulo, preco, categoria), gere: (1) 3-4 beneficios " +
    "concretos e especificos do produto (nada generico tipo 'boa qualidade'), " +
    "e (2) a dor/frustracao principal que o cliente sente hoje sem esse produto " +
    "(1 frase curta, direta, em portugues coloquial do Brasil). Nunca invente " +
    "caracteristica tecnica que voce nao pode inferir do titulo/categoria.";

  const user = JSON.stringify({
    titulo: offer.title,
    preco: offer.price,
    categoria: offer.category,
    loja: offer.marketplace,
  });

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
      max_output_tokens: 300,
      text: {
        format: {
          type: "json_schema",
          name: "tiktok_offer_copy",
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI falhou (${res.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await res.json()) as OpenAIResponsesApiResponse;
  const text = extractResponseText(payload);
  if (!text) throw new Error("OpenAI retornou resposta vazia.");

  const parsed = JSON.parse(text) as DerivedCopy;
  return {
    benefits: Array.isArray(parsed.benefits) ? parsed.benefits.slice(0, 4) : [],
    pain: String(parsed.pain ?? "").trim(),
  };
}

export async function buildBriefingFromOffer(
  offerId: string,
): Promise<Omit<TikTokGenerateRequest, "model_ids" | "hook_count">> {
  const offer = await loadOffer(offerId);
  if (!offer.title || !(Number(offer.price) > 0)) {
    throw new Error("Oferta sem titulo/preco valido pra gerar video.");
  }

  const price = Number(offer.price) || 0;
  const rawOldPrice = Number(offer.original_price ?? offer.old_price ?? 0) || 0;
  const rawDiscountPct = Number(offer.discount_pct) || 0;

  // Mesma checagem de sanidade do run-agent.ts: desconto/preco anterior
  // implausivel (>80%) quase sempre e erro de extracao, nao promocao real —
  // melhor omitir o dado do que colocar um numero absurdo no video.
  const discountPct = rawDiscountPct > 0 && rawDiscountPct <= MAX_PLAUSIBLE_DISCOUNT_PCT ? rawDiscountPct : 0;
  const oldPrice = rawOldPrice > price && rawOldPrice <= price * 5 ? rawOldPrice : 0;

  const [{ benefits, pain }, shortCode] = await Promise.all([
    deriveCopyWithOpenAI(offer),
    ensureOfferShortCode(supabaseAdmin, offer.id),
  ]);

  return {
    product_name: offer.title ?? "",
    product_price: toBRL(price),
    product_discount: discountPct > 0 ? `${discountPct}% OFF` : undefined,
    product_category: resolveCategory(offer.category).label,
    product_benefits: benefits.map((item, index) => `${index + 1}. ${item}`).join("\n"),
    product_pain: pain,
    competitor_name: oldPrice > 0 ? "Preco anterior" : undefined,
    competitor_price: oldPrice > 0 ? toBRL(oldPrice) : undefined,
    shop_url: toAbsoluteSiteUrl(`/go/${shortCode}`),
    product_image_urls: offer.image_url ? [offer.image_url] : [],
  };
}
