import type { SupabaseClient } from "@supabase/supabase-js";

const SHORT_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const SHORT_CODE_LENGTH = 6;

function randomShortCode(): string {
  let code = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += SHORT_CODE_ALPHABET[Math.floor(Math.random() * SHORT_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Devolve o short_code da oferta, gerando e salvando um novo se ainda nao
 * tiver — assim o link mandado pro grupo fica curto (radarsmart.com.br/go/{6
 * caracteres}) em vez do uuid completo da oferta.
 */
export async function ensureOfferShortCode(
  client: SupabaseClient,
  offerId: string,
): Promise<string> {
  const { data: existing } = await client
    .from("offers")
    .select("short_code")
    .eq("id", offerId)
    .maybeSingle();

  const currentCode = (existing as { short_code?: string | null } | null)?.short_code;
  if (currentCode) return currentCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomShortCode();
    const { error } = await client
      .from("offers")
      .update({ short_code: candidate })
      .eq("id", offerId)
      .is("short_code", null);

    if (!error) return candidate;
    // Colisao de unique constraint — tenta outro codigo.
  }

  // Fallback extremamente improvavel: usa os primeiros caracteres do proprio
  // id em vez de travar o fluxo de despacho por causa do link curto.
  return offerId.slice(0, 8);
}
