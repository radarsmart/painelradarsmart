const requiredPublicVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const requiredServerVars = ["SUPABASE_SERVICE_ROLE_KEY"];

export function checkEnvVars() {
  const missingPublic = requiredPublicVars.filter((key) => !process.env[key]);
  const missingServer =
    typeof window === "undefined"
      ? requiredServerVars.filter((key) => !process.env[key])
      : [];

  const missing = [...missingPublic, ...missingServer];

  if (missing.length > 0) {
    throw new Error(
      `❌ Variáveis de ambiente faltando: ${missing.join(", ")}`,
    );
  }
}