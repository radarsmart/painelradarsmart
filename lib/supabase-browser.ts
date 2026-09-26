import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client Supabase seguro pro navegador (chave anonima). Fica num arquivo
// proprio, sem nenhum outro import de lib interna, de proposito: lib/supabase.ts
// tambem exporta codigo so-de-servidor (supabaseAdmin, salvarOferta) que
// arrasta o Opportunity Engine inteiro (matching, providers de mercado com
// dependencias Node-only como undici/node:crypto) — se um Client Component
// importasse `supabase` de la, o webpack tentaria empacotar essa cadeia
// inteira pro bundle do navegador e quebraria o build. Este arquivo existe
// especificamente pra Client Components importarem `supabase` sem puxar nada
// disso junto.

function cleanEnv(value?: string): string {
  return (value ?? "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\r|\\n/g, "")
    .trim();
}

const supabaseUrl =
  cleanEnv(process.env.SUPABASE_URL) ||
  cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  "";
const supabaseAnon =
  cleanEnv(process.env.SUPABASE_ANON_KEY) ||
  cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  "";

type GlobalWithSupabasePublic = typeof globalThis & {
  __radar_supabase_public__?: SupabaseClient;
};

const globalWithSupabase = globalThis as GlobalWithSupabasePublic;

function warnMissingEnv(name: string) {
  if (typeof window === "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      `[supabase] Variavel ${name} ausente. Defina no ambiente (Vercel/.env).`,
    );
  }
}

// Mesmo motivo do noStoreFetch original em lib/supabase.ts: evita que o App
// Router cacheie (Data Cache) respostas do supabase-js entre requests.
function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: "no-store" });
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
    global: {
      fetch: noStoreFetch,
    },
  });
}

function getPublicSingleton() {
  if (!globalWithSupabase.__radar_supabase_public__) {
    globalWithSupabase.__radar_supabase_public__ = createPublicClient();
  }
  return globalWithSupabase.__radar_supabase_public__;
}

export const supabase = getPublicSingleton();
