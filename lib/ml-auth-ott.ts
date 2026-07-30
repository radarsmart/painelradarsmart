import { createHmac, timingSafeEqual } from "node:crypto";

const OTT_TTL_MS = 2 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurada.");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createMlAuthStartToken(userId: string): string {
  const payload = JSON.stringify({ uid: userId, exp: Date.now() + OTT_TTL_MS });
  const encodedPayload = Buffer.from(payload, "utf-8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyMlAuthStartToken(
  token: string,
): { ok: true; userId: string } | { ok: false } {
  const [encodedPayload, signature] = String(token ?? "").split(".");
  if (!encodedPayload || !signature) return { ok: false };

  const expected = Buffer.from(sign(encodedPayload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf-8"),
    ) as { uid?: string; exp?: number };

    if (!payload.uid || !payload.exp || payload.exp < Date.now()) {
      return { ok: false };
    }

    return { ok: true, userId: payload.uid };
  } catch {
    return { ok: false };
  }
}
