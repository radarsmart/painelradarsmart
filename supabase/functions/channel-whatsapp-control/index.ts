import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isAuthorized(req: Request): boolean {
  const internalKey = Deno.env.get("INTERNAL_API_KEY");
  const provided = req.headers.get("x-internal-key");
  if (internalKey && provided === internalKey) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return !!token && token.length > 20;
}

function trimEnv(name: string): string {
  return String(Deno.env.get(name) ?? "").trim().replace(/\/+$/, "");
}

async function readTextAndMaybeJson(res: Response) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null as any };
  }
}

class WhatsAppApiError extends Error {
  status: number;
  url: string;
  bodyText: string;
  bodyJson: any | null;

  constructor(args: { status: number; url: string; bodyText: string; bodyJson: any | null }) {
    const { status, url, bodyText, bodyJson } = args;
    super(
      `WhatsApp API HTTP ${status} (${url}): ${
        bodyJson ? JSON.stringify(bodyJson) : (bodyText || "empty body")
      }`,
    );
    this.name = "WhatsAppApiError";
    this.status = status;
    this.url = url;
    this.bodyText = bodyText;
    this.bodyJson = bodyJson;
  }
}

async function apiGet(url: string, headers: HeadersInit) {
  const res = await fetch(url, { method: "GET", headers });
  const { text, json } = await readTextAndMaybeJson(res);
  if (!res.ok) {
    throw new WhatsAppApiError({ status: res.status, url, bodyText: text, bodyJson: json });
  }
  return json ?? text;
}

async function apiPost(url: string, headers: HeadersInit, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const { text, json } = await readTextAndMaybeJson(res);
  if (!res.ok) {
    throw new WhatsAppApiError({ status: res.status, url, bodyText: text, bodyJson: json });
  }
  return json ?? text;
}

async function bestEffortApiPost(url: string, headers: HeadersInit, body?: unknown) {
  try {
    return await apiPost(url, headers, body);
  } catch {
    return null;
  }
}

async function generateToken(args: { apiUrl: string; session: string; secretKey: string }) {
  const url = `${args.apiUrl}/${args.session}/${args.secretKey}/generate-token`;
  const data = await apiPost(url, {});
  const token = String((data as Record<string, unknown>)?.token ?? "").trim();
  if (!token) {
    throw new Error("generate-token retornou token vazio.");
  }
  return token;
}

async function resolveToken(args: {
  apiUrl: string;
  session: string;
  token: string;
  secretKey: string;
}) {
  if (args.token) {
    return { token: args.token, generated: false };
  }
  if (!args.secretKey) {
    throw new Error("WHATSAPP_TOKEN ou WHATSAPP_SECRET_KEY ausente.");
  }
  const token = await generateToken(args);
  return { token, generated: true };
}

function authHeaders(token: string): HeadersInit {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function checkConnection(apiUrl: string, session: string, token: string) {
  return await apiGet(`${apiUrl}/${session}/check-connection-session`, authHeaders(token));
}

async function statusSession(apiUrl: string, session: string, token: string) {
  return await apiGet(`${apiUrl}/${session}/status-session`, authHeaders(token));
}

async function listGroups(apiUrl: string, session: string, token: string) {
  const headers = authHeaders(token);
  const candidates = [
    `${apiUrl}/${session}/all-groups`,
    `${apiUrl}/${session}/all-chats`,
    `${apiUrl}/${session}/get-all-groups`,
    `${apiUrl}/${session}/list-chats`,
  ];
  const errors: string[] = [];

  for (const url of candidates) {
    try {
      const payload = await apiGet(url, headers);
      const groups = normalizeGroupPayload(payload);
      if (groups.length > 0) {
        return {
          ok: true,
          channel: "whatsapp",
          checked_at: new Date().toISOString(),
          source_url: url,
          groups,
        };
      }
      errors.push(`${url}: sem grupos retornados`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    ok: true,
    channel: "whatsapp",
    checked_at: new Date().toISOString(),
    groups: [],
    warnings: errors,
  };
}

async function startSession(apiUrl: string, session: string, token: string) {
  return await apiPost(`${apiUrl}/${session}/start-session`, authHeaders(token));
}

async function resetSession(apiUrl: string, session: string, token: string) {
  const headers = authHeaders(token);
  await bestEffortApiPost(`${apiUrl}/${session}/close-session`, headers);
  await bestEffortApiPost(`${apiUrl}/${session}/logout-session`, headers);
}

async function fetchQrCodeDataUrl(apiUrl: string, session: string, token: string): Promise<string | null> {
  const status = await statusSession(apiUrl, session, token);
  const qrInline = String((status as Record<string, unknown>)?.qrcode ?? "").trim();
  if (qrInline) {
    return qrInline.startsWith("data:image")
      ? qrInline
      : `data:image/png;base64,${qrInline.replace(/^data:image\/png;base64,/, "")}`;
  }

  const url = `${apiUrl}/${session}/qrcode-session`;
  const res = await fetch(url, { method: "GET", headers: authHeaders(token) });
  if (!res.ok) {
    const { text, json } = await readTextAndMaybeJson(res);
    throw new WhatsAppApiError({ status: res.status, url, bodyText: text, bodyJson: json });
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const { json } = await readTextAndMaybeJson(res);
    const qr = String(
      (json as Record<string, unknown> | null)?.qrcode ??
        (json as Record<string, unknown> | null)?.qr_code ??
        "",
    ).trim();
    if (!qr) return null;
    return qr.startsWith("data:image")
      ? qr
      : `data:image/png;base64,${qr.replace(/^data:image\/png;base64,/, "")}`;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

async function readStatus(args: {
  apiUrl: string;
  session: string;
  token: string;
  includeQr?: boolean;
}) {
  const [connection, sessionStatus] = await Promise.all([
    checkConnection(args.apiUrl, args.session, args.token),
    statusSession(args.apiUrl, args.session, args.token),
  ]);

  const connected = Boolean((connection as Record<string, unknown>)?.status === true);
  const rawStatus = String((sessionStatus as Record<string, unknown>)?.status ?? "").trim();
  const qrInline = String((sessionStatus as Record<string, unknown>)?.qrcode ?? "").trim();

  let status = "disconnected";
  if (connected) {
    status = "connected";
  } else if (qrInline || /^QRCODE$/i.test(rawStatus)) {
    status = "qr_pending";
  } else if (rawStatus) {
    status = /^CONNECTED$/i.test(rawStatus) ? "disconnected" : rawStatus.toLowerCase();
  }

  let qrCode: string | null = null;
  if (args.includeQr && status !== "connected") {
    qrCode = await fetchQrCodeDataUrl(args.apiUrl, args.session, args.token).catch(() => null);
  }

  return {
    ok: true,
    channel: "whatsapp",
    status,
    session: args.session,
    checked_at: new Date().toISOString(),
    connection,
    session_status: sessionStatus,
    qr_code: qrCode,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function extractArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of ["response", "groups", "chats", "data", "result"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function textField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === "string" || typeof raw === "number") {
      const value = String(raw ?? "").trim();
      if (value) return value;
    }
    const nested = asRecord(raw);
    const serialized = String(nested._serialized ?? "").trim();
    if (serialized) return serialized;
    const user = String(nested.user ?? "").trim();
    const server = String(nested.server ?? "").trim();
    if (user && server) return `${user}@${server}`;
  }
  return "";
}

function numberField(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const raw = record[key];
    if (Array.isArray(raw)) return raw.length;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return Math.round(value);
  }
  return 0;
}

function booleanField(record: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    if (typeof record[key] === "boolean") return Boolean(record[key]);
    if (typeof record[key] === "string") return /^(true|1|yes|sim)$/i.test(String(record[key]));
  }
  return false;
}

function normalizeGroupPayload(payload: unknown) {
  const rows = extractArray(payload);
  return rows
    .map((row) => {
      const record = asRecord(row);
      const groupMetadata = asRecord(record.groupMetadata);
      const id = textField(record, ["id", "_serialized", "wid", "groupId", "chatId"]);
      const name =
        textField(record, ["name", "formattedTitle", "title", "subject", "pushname"]) ||
        textField(groupMetadata, ["subject", "name"]);
      const isGroup =
        id.endsWith("@g.us") ||
        booleanField(record, ["isGroup", "is_group", "group"]) ||
        String(record.kind ?? "").toLowerCase().includes("group");
      if (!id || !isGroup) return null;
      return {
        id,
        name: name || id,
        member_count:
          numberField(record, ["member_count", "participantsCount", "participants", "membersCount"]) ||
          numberField(groupMetadata, ["size", "participants"]),
        is_admin: booleanField(record, ["is_admin", "isAdmin", "admin", "iAmAdmin"]),
        invite_url: textField(record, ["invite_url", "inviteUrl", "link", "url"]) || null,
        raw: record,
      };
    })
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (!isAuthorized(req)) return json(401, { error: "Nao autorizado" });

  const apiUrl = trimEnv("WHATSAPP_API_URL");
  const session = trimEnv("WHATSAPP_SESSION");
  const staticToken = String(Deno.env.get("WHATSAPP_TOKEN") ?? "").trim();
  const secretKey = String(Deno.env.get("WHATSAPP_SECRET_KEY") ?? "").trim();

  if (!apiUrl || !session) {
    return json(500, { error: "Missing WHATSAPP_API_URL or WHATSAPP_SESSION" });
  }
  if (!staticToken && !secretKey) {
    return json(500, { error: "Missing WHATSAPP_TOKEN or WHATSAPP_SECRET_KEY" });
  }

  try {
    const body =
      req.method === "POST"
        ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
        : {};
    const action = String(body.action ?? "status").trim().toLowerCase();
    const tokenData = await resolveToken({ apiUrl, session, token: staticToken, secretKey });

    if (action === "status") {
      const statusPayload = await readStatus({
        apiUrl,
        session,
        token: tokenData.token,
        includeQr: false,
      });
      return json(200, { ...statusPayload, token_generated: tokenData.generated });
    }

    if (action === "groups") {
      const payload = await listGroups(apiUrl, session, tokenData.token);
      return json(200, { ...payload, token_generated: tokenData.generated });
    }

    if (action === "reconnect" || action === "connect") {
      await startSession(apiUrl, session, tokenData.token);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const statusPayload = await readStatus({
        apiUrl,
        session,
        token: tokenData.token,
        includeQr: false,
      });
      return json(200, {
        ...statusPayload,
        action,
        message: "Sessao reiniciada.",
        token_generated: tokenData.generated,
      });
    }

    if (action === "qrcode" || action === "new-qr") {
      if (action === "new-qr") {
        await resetSession(apiUrl, session, tokenData.token);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await startSession(apiUrl, session, tokenData.token);
      for (let i = 0; i < 5; i += 1) {
        const payload = await readStatus({
          apiUrl,
          session,
          token: tokenData.token,
          includeQr: true,
        });
        if (payload.qr_code || payload.status === "connected") {
          return json(200, {
            ...payload,
            action,
            message:
              payload.status === "connected"
                ? "Sessao ja conectada."
                : "QR Code gerado.",
            token_generated: tokenData.generated,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const payload = await readStatus({
        apiUrl,
        session,
        token: tokenData.token,
        includeQr: true,
      });
      return json(200, {
        ...payload,
        action,
        message: payload.qr_code
          ? "QR Code gerado."
          : "Nao foi possivel obter QR Code agora.",
        token_generated: tokenData.generated,
      });
    }

    return json(400, { error: "Acao invalida." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return json(500, { error: message });
  }
});
