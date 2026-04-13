import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { resolveSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ML_OAUTH_STATE_COOKIE = "radar_ml_oauth_state";
const ML_OAUTH_STATE_TTL_SECONDS = 10 * 60;

function cleanEnv(value?: string): string {
  return (value ?? "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\r|\\n/g, "")
    .trim();
}

function getMlAuthConfig() {
  const clientId =
    cleanEnv(process.env.MERCADOLIVRE_APP_ID) ||
    cleanEnv(process.env.ML_APP_ID) ||
    cleanEnv(process.env.MERCADOLIVRE_CLIENT_ID) ||
    "";

  const configuredRedirectUri = cleanEnv(process.env.MERCADOLIVRE_REDIRECT_URI);
  const canonicalRedirectUri = `${resolveSiteUrl()}/api/admin/ml/callback`;
  const redirectUri =
    !configuredRedirectUri || configuredRedirectUri.includes("radar-smart.vercel.app")
      ? canonicalRedirectUri
      : configuredRedirectUri;

  return { clientId, redirectUri };
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.redirect(`${origin}/admin/login`, { status: 302 });
  }

  const { clientId, redirectUri } = getMlAuthConfig();

  // Safe debug log: does not expose secrets.
  console.log("[ML OAuth][auth] config", {
    hasClientId: Boolean(clientId),
    clientIdLength: clientId.length,
    redirectUri,
  });

  if (!clientId) {
    return NextResponse.redirect(
      `${origin}/admin/curadoria?ml_auth=error&reason=missing_client_id`,
      { status: 302 },
    );
  }

  const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
  const state = randomUUID();
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString(), { status: 302 });
  response.cookies.set({
    name: ML_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/admin/ml/callback",
    maxAge: ML_OAUTH_STATE_TTL_SECONDS,
  });

  return response;
}
