import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "@/lib/supabase";

// Cria um login restrito ao papel "central_oferta" (so acessa a Central de
// Oferta, sem publicar no site nem disparar pros grupos — ver
// lib/admin-auth.ts e app/api/admin/extrator/dispatch/route.ts).
// Uso: npx tsx scripts/create-central-oferta-user.ts <email> <senha>

async function main() {
  const [, , email, password] = process.argv;

  if (!email || !password) {
    console.error("Uso: npx tsx scripts/create-central-oferta-user.ts <email> <senha>");
    process.exit(1);
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    console.error("Falha ao criar usuario no Supabase Auth:", createError?.message);
    process.exit(1);
  }

  const { error: insertError } = await supabaseAdmin.from("admins").insert({
    user_id: created.user.id,
    email,
    role: "central_oferta",
  });

  if (insertError) {
    console.error("Usuario criado no Auth, mas falhou ao inserir em admins:", insertError.message);
    process.exit(1);
  }

  console.log("Colaborador criado com sucesso.");
  console.log(`Login: ${email}`);
  console.log(`Senha temporaria: ${password}`);
  console.log("URL: https://radarsmart.com.br/admin/login");
}

main();
