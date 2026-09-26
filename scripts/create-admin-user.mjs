import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const VALID_ROLES = new Set(["admin", "central_oferta", "operador_ofertas"]);

function cleanEnv(value) {
  return String(value ?? "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\r|\\n/g, "")
    .trim();
}

function usage() {
  console.error(
    "Uso: node scripts/create-admin-user.mjs <email> <senha> [admin|central_oferta|operador_ofertas]",
  );
}

async function findUserByEmail(client, email) {
  let page = 1;
  const perPage = 100;

  while (page <= 50) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const user = data.users.find(
      (item) => item.email?.toLowerCase() === email.toLowerCase(),
    );
    if (user) return user;
    if (data.users.length < perPage) return null;

    page += 1;
  }

  return null;
}

async function upsertAdminRole(client, user, email, role) {
  const byUserId = await client
    .from("admins")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (byUserId.error) throw byUserId.error;

  if (byUserId.data?.id) {
    const { error } = await client
      .from("admins")
      .update({ email, role })
      .eq("id", byUserId.data.id);
    if (error) throw error;
    return;
  }

  const byEmail = await client
    .from("admins")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (byEmail.error) throw byEmail.error;

  if (byEmail.data?.id) {
    const { error } = await client
      .from("admins")
      .update({ user_id: user.id, email, role })
      .eq("id", byEmail.data.id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from("admins").insert({
    user_id: user.id,
    email,
    role,
  });
  if (error) throw error;
}

async function main() {
  const [, , rawEmail, password, rawRole = "operador_ofertas"] = process.argv;
  const email = String(rawEmail ?? "").trim().toLowerCase();
  const role = String(rawRole ?? "").trim().toLowerCase();

  if (!email || !password || !VALID_ROLES.has(role)) {
    usage();
    process.exit(1);
  }

  const supabaseUrl =
    cleanEnv(process.env.SUPABASE_URL) ||
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRole = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRole) {
    console.error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.");
    process.exit(1);
  }

  const client = createClient(supabaseUrl, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  let user = await findUserByEmail(client, email);

  if (!user) {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? "Falha ao criar usuario no Supabase Auth.");
    }
    user = data.user;
  } else {
    const { error } = await client.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
  }

  await upsertAdminRole(client, user, email, role);

  console.log("Usuario admin configurado com sucesso.");
  console.log(`Login: ${email}`);
  console.log(`Role: ${role}`);
  console.log(`Senha temporaria: ${password}`);
  console.log("URL: https://radarsmart.com.br/admin/login");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
