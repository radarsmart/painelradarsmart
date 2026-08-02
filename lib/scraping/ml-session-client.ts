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

export type MlInstallments = {
  text: string;
  count: number | null;
  amount: number | null;
  interest_free: boolean;
} | null;

export type MlSessionProduct = {
  title: string | null;
  price: number | null;
  old_price: number | null;
  image_url: string | null;
  url: string;
  installments?: MlInstallments;
};

export type MlSessionSearchItem = {
  title: string;
  link: string;
  image_url: string | null;
  price: number | null;
  old_price: number | null;
  rating: number | null;
  sold_count: number | null;
  is_full: boolean;
  installments?: MlInstallments;
};

export type MlSellerReputation = {
  sellerName: string | null;
  level: string | null;
  isMercadoLider: boolean;
  totalSales: number | null;
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

/**
 * So existe na pagina do produto, entao deve ser chamada sob demanda (para o
 * candidato ja selecionado), nunca para todos os resultados de uma busca.
 */
export async function fetchMlSellerReputation(productUrl: string): Promise<MlSellerReputation> {
  const payload = await callMlSession<{ reputation: MlSellerReputation }>(
    `/seller-reputation?url=${encodeURIComponent(productUrl)}`,
    25000,
  );
  return payload.reputation;
}

function getAffiliateConfig() {
  const baseUrl = cleanEnv(process.env.ML_AFFILIATE_SESSION_API_URL).replace(/\/$/, "");
  const secret = cleanEnv(process.env.ML_AFFILIATE_SESSION_SECRET);
  if (!baseUrl) {
    throw new Error("ML_AFFILIATE_SESSION_API_URL nao configurada.");
  }
  return { baseUrl, secret };
}

/**
 * Gera um link de afiliado oficial do Mercado Livre (meli.la/...) via a sessao
 * de afiliados logada (conta separada da sessao de busca/extracao, ja que o ML
 * bloqueia contas de colaborador de entrar no Programa de Afiliados).
 */
export async function generateMlAffiliateLink(productUrl: string): Promise<string> {
  const { baseUrl, secret } = getAffiliateConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);

  try {
    const response = await fetch(
      `${baseUrl}/affiliate-link?url=${encodeURIComponent(productUrl)}`,
      {
        headers: secret ? { "x-ml-affiliate-session-secret": secret } : {},
        signal: controller.signal,
        cache: "no-store",
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      affiliate_url?: string;
    };

    if (!response.ok || payload.ok === false || !payload.affiliate_url) {
      throw new Error(payload.error || `ML affiliate session server retornou HTTP ${response.status}`);
    }

    return payload.affiliate_url;
  } finally {
    clearTimeout(timeout);
  }
}
