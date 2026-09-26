import { NextRequest } from "next/server";

// Autenticacao por token simples (mesmo padrao de CRON_SECRET em
// app/api/cron/*), nao a sessao Supabase do requireAdmin — a extensao de
// navegador nao tem como manter login de admin, precisa de um token fixo
// que o usuario cola uma vez no popup.
export function checkGarimparToken(req: NextRequest): { ok: true } | { ok: false; error: string; status: 401 | 500 } {
  const configuredToken = String(process.env.GARIMPAR_API_TOKEN ?? "").trim();
  if (!configuredToken) {
    return { ok: false, error: "GARIMPAR_API_TOKEN nao configurado no servidor.", status: 500 };
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const providedToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (providedToken !== configuredToken) {
    return { ok: false, error: "Token invalido.", status: 401 };
  }

  return { ok: true };
}
