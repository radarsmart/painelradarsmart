import { getValidToken } from "@/lib/supabase";

/**
 * Obtém um token válido do Mercado Livre, renovando automaticamente se necessário.
 * @returns Promise<string> - Token de acesso válido
 * @throws Error se não houver token ou falha na renovação
 */
export async function getValidMLToken(): Promise<string> {
  return getValidToken();
}