import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  cleanEnv(process.env.SUPABASE_URL) ||
  cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  "";
const supabaseAnon =
  cleanEnv(process.env.SUPABASE_ANON_KEY) ||
  cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  "";
const supabaseService = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY) || "";

type GlobalWithSupabase = typeof globalThis & {
  __radar_supabase_public__?: SupabaseClient;
  __radar_supabase_admin__?: SupabaseClient;
};

const globalWithSupabase = globalThis as GlobalWithSupabase;

function warnMissingEnv(name: string) {
  if (typeof window === "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      `[supabase] Variavel ${name} ausente. Defina no ambiente (Vercel/.env).`,
    );
  }
}

function createPublicClient() {
  if (!supabaseUrl) {
    warnMissingEnv("SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!supabaseAnon) {
    warnMissingEnv("SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createClient(supabaseUrl || "", supabaseAnon || "", {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

function getPublicSingleton() {
  if (!globalWithSupabase.__radar_supabase_public__) {
    globalWithSupabase.__radar_supabase_public__ = createPublicClient();
  }
  return globalWithSupabase.__radar_supabase_public__;
}

function createAdminClient() {
  if (!supabaseUrl) {
    warnMissingEnv("SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!supabaseService) {
    warnMissingEnv("SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl || "", supabaseService || "", {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function getAdminSingleton() {
  if (typeof window !== "undefined") {
    // Evita criar um segundo GoTrueClient no browser.
    return getPublicSingleton();
  }

  if (!globalWithSupabase.__radar_supabase_admin__) {
    globalWithSupabase.__radar_supabase_admin__ = createAdminClient();
  }
  return globalWithSupabase.__radar_supabase_admin__;
}

export const supabase = getPublicSingleton();
export const supabaseAdmin = getAdminSingleton();

type MercadoLivreTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in: number;
  scope?: string;
  user_id?: number;
  refresh_token?: string;
};

type MercadoLivreAuthRow = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  token_type?: string | null;
  scope?: string | null;
  user_id?: string | null;
  updated_at?: string | null;
};

function cleanEnv(value?: string): string {
  return (value ?? "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\r|\\n/g, "")
    .trim();
}

const ML_CLIENT_ID =
  cleanEnv(process.env.MERCADOLIVRE_APP_ID) ??
  cleanEnv(process.env.ML_APP_ID) ??
  cleanEnv(process.env.MERCADOLIVRE_CLIENT_ID) ??
  "";
const ML_CLIENT_SECRET =
  cleanEnv(process.env.MERCADOLIVRE_CLIENT_SECRET) ??
  cleanEnv(process.env.ML_CLIENT_SECRET) ??
  "";

function computeExpiryIso(expiresInSeconds: number): string {
  const safe = Number.isFinite(expiresInSeconds) ? expiresInSeconds : 0;
  return new Date(Date.now() + Math.max(0, safe - 60) * 1000).toISOString();
}

export async function saveMercadoLivreAuth(
  tokenPayload: MercadoLivreTokenResponse,
) {
  const expiresAt = computeExpiryIso(Number(tokenPayload.expires_in ?? 0));

  const row = {
    id: "default",
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token ?? null,
    token_type: tokenPayload.token_type ?? "bearer",
    scope: tokenPayload.scope ?? null,
    user_id:
      tokenPayload.user_id !== undefined && tokenPayload.user_id !== null
        ? String(tokenPayload.user_id)
        : null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("mercadolivre_auth")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    if (
      String(error.message).toLowerCase().includes("could not find the table") ||
      String(error.message).toLowerCase().includes("mercadolivre_auth")
    ) {
      throw new Error(
        "Tabela public.mercadolivre_auth inexistente. Crie a tabela antes de concluir o OAuth do Mercado Livre.",
      );
    }
    throw new Error(`Falha ao salvar mercadolivre_auth: ${error.message}`);
  }

  return data;
}

async function readMercadoLivreAuth(): Promise<MercadoLivreAuthRow | null> {
  const byDefault = await supabaseAdmin
    .from("mercadolivre_auth")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (byDefault.data) return byDefault.data as MercadoLivreAuthRow;

  const latest = await supabaseAdmin
    .from("mercadolivre_auth")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error && latest.error.code !== "PGRST116") {
    throw new Error(`Falha ao consultar mercadolivre_auth: ${latest.error.message}`);
  }

  return (latest.data as MercadoLivreAuthRow | null) ?? null;
}

async function refreshMercadoLivreToken(refreshToken: string): Promise<string> {
  if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
    throw new Error("Credenciais ML ausentes (MERCADOLIVRE_APP_ID/CLIENT_SECRET).");
  }

  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ML_CLIENT_ID,
    client_secret: ML_CLIENT_SECRET,
    refresh_token: refreshToken,
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

  const payload = (await response.json().catch(() => ({}))) as Partial<MercadoLivreTokenResponse> & {
    message?: string;
    error?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.message ||
        payload.error ||
        `Falha ao atualizar token ML (HTTP ${response.status}).`,
    );
  }

  await saveMercadoLivreAuth(payload as MercadoLivreTokenResponse);
  return String(payload.access_token);
}

export async function getValidToken(): Promise<string> {
  const row = await readMercadoLivreAuth();
  if (!row?.access_token) {
    throw new Error("Token Mercado Livre nao encontrado em mercadolivre_auth.");
  }

  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : NaN;
  const notExpired = Number.isFinite(expiresAt) ? expiresAt > Date.now() : false;
  if (notExpired) {
    return row.access_token;
  }

  if (!row.refresh_token) {
    throw new Error("refresh_token ausente para renovar token do Mercado Livre.");
  }

  return refreshMercadoLivreToken(row.refresh_token);
}

export const getDestaques = async (limit = 5) =>
  (await supabaseAdmin.from("radar_smart_boost").select("*").limit(limit)).data ??
  [];

export const getOfertas = async (limit = 20, categoria?: string) => {
  let query = supabaseAdmin.from("radar_smart_rank").select("*").limit(limit);
  if (categoria) query = query.eq("category_slug", categoria);
  return (await query).data ?? [];
};

export const getCategorias = async () =>
  (
    await supabaseAdmin
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("sort_order")
  ).data ?? [];

export const getHistoricoPreco = async (offerId: string) =>
  (
    await supabaseAdmin
      .from("price_history")
      .select("*")
      .eq("offer_id", offerId)
      .order("recorded_at", { ascending: true })
      .limit(90)
  ).data ?? [];

export const getBlogPosts = async (limit = 10) =>
  (
    await supabaseAdmin
      .from("blog_posts")
      .select("*")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(limit)
  ).data ?? [];

export const registrarClique = async (offerId: string, source: string) =>
  supabase
    .from("clicks")
    .insert({ offer_id: offerId, type: "product_click", source });

export const registrarGrupo = async (canal: string, origem: string) =>
  supabase.from("grupo_membros").insert({ canal, origem });

export const salvarOferta = async (oferta: Record<string, unknown>) => {
  const now = new Date().toISOString();
  const id = typeof oferta.id === "string" ? oferta.id : null;

  const basePayload: Record<string, unknown> = {
    ...oferta,
    updated_at: now,
  };

  if (id) {
    return supabaseAdmin
      .from("offers")
      .update(basePayload)
      .eq("id", id)
      .select()
      .single();
  }

  return supabaseAdmin
    .from("offers")
    .insert({
      status: "active",
      created_at: now,
      ...basePayload,
    })
    .select()
    .single();
};

export const toggleOferta = async (id: string, ativo: boolean) =>
  supabaseAdmin
    .from("offers")
    .update({ status: ativo ? "active" : "inactive" })
    .eq("id", id);

export const deletarOferta = async (id: string) =>
  supabaseAdmin.from("offers").delete().eq("id", id);

export const getDashboardStats = async () => {
  const [cliques, receita, fila, membros] = await Promise.all([
    supabaseAdmin.from("clicks").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("v_revenue_by_marketplace").select("*"),
    supabaseAdmin
      .from("post_queue")
      .select("status")
      .in("status", ["queued", "failed"]),
    supabaseAdmin
      .from("grupo_membros")
      .select("*", { count: "exact", head: true }),
  ]);

  return {
    totalCliques: cliques.count ?? 0,
    receita: receita.data ?? [],
    filaQueued: fila.data?.filter((x: { status: string }) => x.status === "queued")
      .length ?? 0,
    filaFailed: fila.data?.filter((x: { status: string }) => x.status === "failed")
      .length ?? 0,
    totalMembros: membros.count ?? 0,
  };
};
