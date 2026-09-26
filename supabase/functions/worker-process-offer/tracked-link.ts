import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHORT_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const SHORT_CODE_LENGTH = 6;

function randomShortCode(): string {
  let code = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += SHORT_CODE_ALPHABET[Math.floor(Math.random() * SHORT_CODE_ALPHABET.length)];
  }
  return code;
}

function resolveSiteBaseUrl(): string {
  const configured = (Deno.env.get("SITE_BASE_URL") ?? Deno.env.get("PUBLIC_SITE_URL") ?? "").trim();
  return (configured || "https://radarsmart.com.br").replace(/\/$/, "");
}

/**
 * Devolve (gerando e persistindo se ainda nao tiver) o link rastreado
 * radarsmart.com.br/go/{short_code} da oferta — mesma logica/formato usada
 * em lib/offers/short-link.ts no painel Next.js, pra clique vindo do grupo
 * contar como sinal de interesse (igual ao clique no site) em vez de expor
 * o link de afiliado cru.
 */
export async function buildTrackedLink(
  offer: { id: string; short_code?: string | null },
  supabase: SupabaseClient,
): Promise<string | null> {
  if (!offer?.id) return null;

  if (offer.short_code) {
    return `${resolveSiteBaseUrl()}/go/${offer.short_code}`;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomShortCode();
    const { error } = await supabase
      .from("offers")
      .update({ short_code: candidate })
      .eq("id", offer.id)
      .is("short_code", null);

    if (!error) {
      return `${resolveSiteBaseUrl()}/go/${candidate}`;
    }
    // Colisao de unique constraint — tenta outro codigo.
  }

  return null;
}
