import { NextResponse } from "next/server";

// A extensao de navegador chama essas rotas a partir de uma pagina
// chrome-extension://<id> (o popup), que o navegador trata como origem
// cross-site — sem isso o fetch nunca chega no servidor. Seguro liberar geral
// porque a autenticacao real e o token (checkGarimparToken), nao a origem.
export const GARIMPAR_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function withGarimparCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(GARIMPAR_CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function garimparCorsPreflight(): NextResponse {
  return withGarimparCors(new NextResponse(null, { status: 204 }));
}
