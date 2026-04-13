import { NextRequest, NextResponse } from "next/server";
import { saveMercadoLivreAuth } from "@/lib/supabase";
import { resolveSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ML_OAUTH_STATE_COOKIE = "radar_ml_oauth_state";

function cleanEnv(value?: string): string {
  return (value ?? "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\r|\\n/g, "")
    .trim();
}

function getMlOAuthConfig() {
  const clientId =
    cleanEnv(process.env.MERCADOLIVRE_APP_ID) ||
    cleanEnv(process.env.ML_APP_ID) ||
    cleanEnv(process.env.MERCADOLIVRE_CLIENT_ID) ||
    "";

  const clientSecret =
    cleanEnv(process.env.MERCADOLIVRE_CLIENT_SECRET) ||
    cleanEnv(process.env.ML_CLIENT_SECRET) ||
    "";

  const configuredRedirectUri = cleanEnv(process.env.MERCADOLIVRE_REDIRECT_URI);
  const canonicalRedirectUri = `${resolveSiteUrl()}/api/admin/ml/callback`;
  const redirectUri =
    !configuredRedirectUri || configuredRedirectUri.includes("radar-smart.vercel.app")
      ? canonicalRedirectUri
      : configuredRedirectUri;

  return { clientId, clientSecret, redirectUri };
}

type MercadoLivreTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in: number;
  scope?: string;
  user_id?: number;
  refresh_token?: string;
  error?: string;
  message?: string;
};

function clearMlOauthStateCookie(
  response: NextResponse,
  req: NextRequest,
): NextResponse {
  response.cookies.set({
    name: ML_OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/admin/ml/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get(ML_OAUTH_STATE_COOKIE)?.value ?? "";
  const { clientId, clientSecret, redirectUri } = getMlOAuthConfig();

  if (!code) {
    return clearMlOauthStateCookie(
      NextResponse.redirect(
        `${origin}/admin/curadoria?ml_auth=error&reason=missing_code`,
        { status: 302 },
      ),
      req,
    );
  }

  if (!state || !cookieState || state !== cookieState) {
    return clearMlOauthStateCookie(
      NextResponse.redirect(
        `${origin}/admin/curadoria?ml_auth=error&reason=invalid_state`,
        { status: 302 },
      ),
      req,
    );
  }

  // Safe debug log: does not expose secret values.
  console.log("[ML OAuth][callback] config", {
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    clientIdLength: clientId.length,
    clientSecretLength: clientSecret.length,
    redirectUri,
  });

  if (!clientId || !clientSecret) {
    return clearMlOauthStateCookie(
      NextResponse.redirect(
        `${origin}/admin/curadoria?ml_auth=error&reason=missing_credentials`,
        { status: 302 },
      ),
      req,
    );
  }

  try {
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as MercadoLivreTokenResponse;
    if (!response.ok || !payload.access_token) {
      const reason = encodeURIComponent(
        payload.message || payload.error || `token_exchange_http_${response.status}`,
      );
      return clearMlOauthStateCookie(
        NextResponse.redirect(
          `${origin}/admin/curadoria?ml_auth=error&reason=${reason}`,
          { status: 302 },
        ),
        req,
      );
    }

    await saveMercadoLivreAuth(payload);
    return clearMlOauthStateCookie(
      NextResponse.redirect(`${origin}/admin/curadoria?ml_auth=success`, {
        status: 302,
      }),
      req,
    );
  } catch (error) {
    const reason = encodeURIComponent(
      error instanceof Error ? error.message : "unknown_callback_error",
    );
    return clearMlOauthStateCookie(
      NextResponse.redirect(
        `${origin}/admin/curadoria?ml_auth=error&reason=${reason}`,
        { status: 302 },
      ),
      req,
    );
  }
}
