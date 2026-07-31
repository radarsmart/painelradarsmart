function cleanEnv(value?: string): string {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function getConfig() {
  const baseUrl = cleanEnv(process.env.CONTROL_SERVER_URL).replace(/\/$/, "");
  const secret = cleanEnv(process.env.CONTROL_SERVER_SECRET);
  if (!baseUrl) {
    throw new Error("CONTROL_SERVER_URL nao configurada.");
  }
  return { baseUrl, secret };
}

async function callControlServer<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const { baseUrl, secret } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(secret ? { "x-control-secret": secret } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    } & T;

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `Control server retornou HTTP ${response.status}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export type ServiceStatus = {
  ok: boolean;
  whatsapp: "up" | "down";
  ml_session: "up" | "down";
};

export async function getServicesStatus(): Promise<ServiceStatus> {
  return callControlServer<ServiceStatus>("/status", { method: "GET" }, 10000);
}

export type ServiceName = "whatsapp" | "ml-session";

export async function restartService(service: ServiceName): Promise<{ message: string }> {
  return callControlServer<{ message: string }>(
    `/restart/${service}`,
    { method: "POST" },
    10000,
  );
}
