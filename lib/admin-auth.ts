import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type AdminGuardResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; status: 401 | 403; error: string };

function extractBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

function decodeBase64Url(value: string): string | null {
  try {
    let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

function extractTokenFromCookieValue(rawCookieValue: string): string | null {
  const cookieValue = decodeURIComponent(rawCookieValue ?? "").trim();
  if (!cookieValue) return null;

  const jwtLike = cookieValue.match(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  )?.[0];
  if (jwtLike) return jwtLike;

  const maybeJson = cookieValue.startsWith("base64-")
    ? decodeBase64Url(cookieValue.slice("base64-".length))
    : cookieValue;

  if (!maybeJson) return null;

  try {
    const parsed = JSON.parse(maybeJson) as unknown;

    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      return parsed[0];
    }

    if (parsed && typeof parsed === "object") {
      const accessToken = (parsed as Record<string, unknown>).access_token;
      if (typeof accessToken === "string" && accessToken.length > 20) {
        return accessToken;
      }
    }
  } catch {
    const token = maybeJson.match(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
    )?.[0];
    if (token) return token;
  }

  return null;
}

function extractTokenFromSupabaseCookies(req: NextRequest): string | null {
  const supabaseCookie = req.cookies
    .getAll()
    .find(
      (cookie) =>
        cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"),
    );

  if (!supabaseCookie?.value) return null;
  return extractTokenFromCookieValue(supabaseCookie.value);
}

function extractTokenFromCookieEntries(
  entries: Array<{ name: string; value: string }>,
): string | null {
  const supabaseCookie = entries.find(
    (cookie) =>
      cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"),
  );

  if (!supabaseCookie?.value) return null;
  return extractTokenFromCookieValue(supabaseCookie.value);
}

async function validateAdminToken(token: string): Promise<AdminGuardResult> {
  if (!token) {
    return { ok: false, status: 401, error: "Nao autorizado" };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, error: "Nao autorizado" };
  }

  const userId = data.user.id;
  const email = data.user.email ?? null;

  const byUserId = await supabaseAdmin
    .from("admins")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (byUserId.data?.id) {
    return { ok: true, userId, email };
  }

  if (email) {
    const byEmail = await supabaseAdmin
      .from("admins")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (byEmail.data?.id) {
      return { ok: true, userId, email };
    }
  }

  const fallbackEmails = (
    process.env.ADMIN_FALLBACK_EMAILS ??
    process.env.ADMIN_EMAILS ??
    "contato@radarsmart.com.br"
  )
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (email && fallbackEmails.includes(email.toLowerCase())) {
    return { ok: true, userId, email };
  }

  return { ok: false, status: 403, error: "Nao autorizado" };
}

export async function requireAdmin(req: NextRequest): Promise<AdminGuardResult> {
  const token = extractBearerToken(req) || extractTokenFromSupabaseCookies(req);
  return validateAdminToken(token ?? "");
}

export async function requireAdminFromCookies(
  entries: Array<{ name: string; value: string }>,
): Promise<AdminGuardResult> {
  const token = extractTokenFromCookieEntries(entries);
  return validateAdminToken(token ?? "");
}
