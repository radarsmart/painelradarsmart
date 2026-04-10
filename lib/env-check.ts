const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

const serverEnv = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

export function checkEnvVars() {
  const missingPublic = Object.entries(publicEnv)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  const missingServer =
    typeof window === "undefined"
      ? Object.entries(serverEnv)
          .filter(([, value]) => !value)
          .map(([key]) => key)
      : [];

  const missing = [...missingPublic, ...missingServer];
  if (missing.length === 0) return;

  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(`Variáveis de ambiente faltando: ${missing.join(", ")}`);
    return;
  }

  throw new Error(`Variáveis de ambiente faltando: ${missing.join(", ")}`);
}
