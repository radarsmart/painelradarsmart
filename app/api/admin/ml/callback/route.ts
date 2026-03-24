import { NextRequest, NextResponse } from "next/server";
import { saveMercadoLivreAuth } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const redirectUri =
    cleanEnv(process.env.MERCADOLIVRE_REDIRECT_URI) ||
    "https://radar-smart.vercel.app/api/admin/ml/callback";

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

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const { clientId, clientSecret, redirectUri } = getMlOAuthConfig();

  if (!code) {
    return NextResponse.redirect(
      `${origin}/admin/curadoria?ml_auth=error&reason=missing_code`,
      { status: 302 },
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
    return NextResponse.redirect(
      `${origin}/admin/curadoria?ml_auth=error&reason=missing_credentials`,
      { status: 302 },
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
      return NextResponse.redirect(
        `${origin}/admin/curadoria?ml_auth=error&reason=${reason}`,
        { status: 302 },
      );
    }

    await saveMercadoLivreAuth(payload);
    return NextResponse.redirect(`${origin}/admin/curadoria?ml_auth=success`, {
      status: 302,
    });
  } catch (error) {
    const reason = encodeURIComponent(
      error instanceof Error ? error.message : "unknown_callback_error",
    );
    return NextResponse.redirect(
      `${origin}/admin/curadoria?ml_auth=error&reason=${reason}`,
      { status: 302 },
    );
  }
}
