import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Comparacao de "mesmo produto em lojas diferentes" — nao temos EAN/GTIN
// confiavel em todas as fontes (ML/Shopee raramente expoem isso pra nos),
// entao o sinal e titulo normalizado + preco compativel. Nao filtra por
// categoria: o campo `category` cru vem de cada marketplace com qualidade
// bem inconsistente (ex.: "Utilidades Domesticas (low ticket)" aplicado a
// produtos completamente diferentes), entao exigir bucket igual bloqueava
// matches reais mais do que evitava falso positivo. E deliberadamente
// conservador: um falso positivo aqui (mostrar "tambem disponivel em X" pra
// um produto DIFERENTE) prejudica a confianca do cliente muito mais do que
// simplesmente nao mostrar comparacao nenhuma.
const TITLE_SIMILARITY_THRESHOLD = 0.72;
const MAX_PRICE_RATIO = 1.35;

// Palavras que aparecem em titulo de marketplace mas nao ajudam a identificar
// o produto (nem atrapalham removidas) — reduz ruido sem arriscar apagar
// algo que distingue produtos de verdade (marca, modelo, capacidade etc
// ficam intactos).
const NOISE_WORDS = new Set([
  "original",
  "novo",
  "nova",
  "com",
  "sem",
  "para",
  "de",
  "da",
  "do",
  "e",
  "unidade",
  "unissex",
  "kit",
]);

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeTitleTokens(title: string): Set<string> {
  const normalized = stripAccents(String(title ?? "").toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized.split(" ").filter((token) => token.length > 1 && !NOISE_WORDS.has(token));
  return new Set(tokens);
}

export function titleSimilarity(titleA: string, titleB: string): number {
  const tokensA = normalizeTitleTokens(titleA);
  const tokensB = normalizeTitleTokens(titleB);
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function isPriceCompatible(priceA: number, priceB: number): boolean {
  if (priceA <= 0 || priceB <= 0) return false;
  const ratio = priceA > priceB ? priceA / priceB : priceB / priceA;
  return ratio <= MAX_PRICE_RATIO;
}

type MatchCandidateOffer = {
  id: string;
  title: string;
  price: number;
  marketplace: string;
  category: string | null;
  product_group_id: string | null;
};

/**
 * Procura, entre ofertas ativas de OUTRAS lojas, uma que pareca ser o mesmo
 * produto fisico (titulo muito parecido + preco na mesma faixa). So retorna
 * quando a confianca e alta o suficiente pra publicar a comparacao no site
 * sem revisao manual.
 */
export async function findCrossMarketplaceMatch(
  client: SupabaseClient,
  candidate: { title: string; price: number; marketplace: string; category: string | null },
): Promise<MatchCandidateOffer | null> {
  if (!candidate.title || !(candidate.price > 0)) return null;

  const { data } = await client
    .from("offers")
    .select("id,title,price,marketplace,category,product_group_id")
    .eq("status", "active")
    .neq("marketplace", candidate.marketplace)
    .limit(300);

  const rows = (data ?? []) as MatchCandidateOffer[];

  let best: { offer: MatchCandidateOffer; score: number } | null = null;

  for (const row of rows) {
    if (!isPriceCompatible(candidate.price, Number(row.price) || 0)) continue;

    const score = titleSimilarity(candidate.title, row.title);
    if (score < TITLE_SIMILARITY_THRESHOLD) continue;
    if (!best || score > best.score) best = { offer: row, score };
  }

  return best?.offer ?? null;
}

/**
 * Depois de salvar uma oferta nova/atualizada, tenta achar e vincular a
 * correspondente em outra loja. Nunca lanca erro — matching e um extra, uma
 * falha aqui nao pode derrubar o fluxo principal de publicar a oferta.
 */
export async function assignProductGroup(
  client: SupabaseClient,
  offerId: string,
  candidate: { title: string; price: number; marketplace: string; category: string | null },
): Promise<string | null> {
  try {
    const match = await findCrossMarketplaceMatch(client, candidate);
    if (!match) return null;

    const groupId = match.product_group_id || randomUUID();

    await client.from("offers").update({ product_group_id: groupId }).eq("id", offerId);
    if (!match.product_group_id) {
      await client.from("offers").update({ product_group_id: groupId }).eq("id", match.id);
    }

    return groupId;
  } catch {
    return null;
  }
}
