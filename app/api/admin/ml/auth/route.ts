import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const redirectUri =
    cleanEnv(process.env.MERCADOLIVRE_REDIRECT_URI) ||
    "https://radar-smart.vercel.app/api/admin/ml/callback";

  return { clientId, redirectUri };
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
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
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(authUrl.toString(), { status: 302 });
}
