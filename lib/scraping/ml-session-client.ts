function cleanEnv(value?: string): string {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function getConfig() {
  const baseUrl = cleanEnv(process.env.ML_SESSION_API_URL).replace(/\/$/, "");
  const secret = cleanEnv(process.env.ML_SESSION_SECRET);
  if (!baseUrl) {
    throw new Error("ML_SESSION_API_URL nao configurada.");
  }
  return { baseUrl, secret };
}

async function callMlSession<T>(path: string, timeoutMs: number): Promise<T> {
  const { baseUrl, secret } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: secret ? { "x-ml-session-secret": secret } : {},
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    } & T;

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `ML session server retornou HTTP ${response.status}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export type MlSessionProduct = {
  title: string | null;
  price: number | null;
  old_price: number | null;
  image_url: string | null;
  url: string;
};

export type MlSessionSearchItem = {
  title: string;
  link: string;
  image_url: string | null;
  price: number | null;
  old_price: number | null;
};

export async function extractViaMlSession(url: string): Promise<MlSessionProduct> {
  const payload = await callMlSession<{ product: MlSessionProduct }>(
    `/extract?url=${encodeURIComponent(url)}`,
    25000,
  );
  return payload.product;
}

export async function searchViaMlSession(
  query: string,
  limit = 20,
): Promise<MlSessionSearchItem[]> {
  const payload = await callMlSession<{ items: MlSessionSearchItem[] }>(
    `/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    25000,
  );
  return payload.items ?? [];
}
