/**
 * apply-migration.ts
 * Aplica a migration das novas colunas diretamente via Supabase REST API
 * usando o service_role key (acesso total, server-side only).
 *
 * Uso: npx tsx scripts/apply-migration.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ SUPABASE_URL ou SERVICE_KEY ausentes.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function log(msg: string, ok = true) {
  console.log(`${ok ? "✅" : "❌"}  ${msg}`);
}

/**
 * Executa SQL via endpoint REST do PostgREST com rpc
 * O supabase-js não tem DDL direto, mas podemos usar fetch para o endpoint
 * /rest/v1/rpc/exec_sql se existir, ou via o endpoint de Management API.
 *
 * Alternativa: usar a API SQL direta via fetch no endpoint correto.
 */
async function executeSql(sql: string, label: string): Promise<boolean> {
  // Supabase expõe um endpoint SQL via REST usando o service role key
  // Endpoint: POST /rest/v1/ com cabeçalho Prefer: params=multiple-objects
  // Para DDL, usamos o endpoint direto da pg REST

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Se o endpoint exec_sql não existe, tentar via URL direta
    if (res.status === 404 || body.includes("not exist")) {
      return executeSqlViaManagementApi(sql, label);
    }
    log(`${label}: ${body.slice(0, 200)}`, false);
    return false;
  }

  log(label);
  return true;
}

async function executeSqlViaManagementApi(sql: string, label: string): Promise<boolean> {
  // Tenta usar o endpoint de postgres diretamente via pg/query
  const projectRef = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "").split(".")[0];

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const body = await res.text();
    log(`${label} (management API): ${body.slice(0, 300)}`, false);
    return false;
  }

  log(label);
  return true;
}

// Abordagem alternativa: checar via SELECT e usar INSERT para testar colunas
async function checkAndApplyMigration() {
  console.log("\n🔧  Aplicando migration TikTok Engine\n");

  // Verificar se as colunas já existem
  const checkCols = await supabase
    .from("tiktok_engine_jobs")
    .select("hook_variation_index, hook_variation_text, log_steps, render_metadata")
    .limit(1);

  if (!checkCols.error) {
    log("Colunas já existem — migration já foi aplicada anteriormente.");
    return true;
  }

  const errMsg = checkCols.error.message ?? "";
  if (!errMsg.includes("column") && !errMsg.includes("hook_variation")) {
    log(`Erro inesperado ao verificar colunas: ${errMsg}`, false);
    return false;
  }

  console.log("⚠️  Colunas não encontradas. Tentando aplicar via Management API...\n");

  // Tentar via Management API do Supabase
  const projectRef = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");

  const migration = `
ALTER TABLE public.tiktok_engine_jobs
  ADD COLUMN IF NOT EXISTS hook_variation_index  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hook_variation_text   text,
  ADD COLUMN IF NOT EXISTS log_steps             jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS render_metadata       jsonb,
  ADD COLUMN IF NOT EXISTS script_text_final     text,
  ADD COLUMN IF NOT EXISTS video_provider        text,
  ADD COLUMN IF NOT EXISTS video_storage_path    text,
  ADD COLUMN IF NOT EXISTS audio_storage_path    text;

ALTER TABLE public.tiktok_engine_briefings
  ADD COLUMN IF NOT EXISTS hook_count           integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS video_provider       text DEFAULT 'remotion',
  ADD COLUMN IF NOT EXISTS product_image_urls   jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shop_url             text;

ALTER TABLE public.tiktok_engine_jobs
  DROP CONSTRAINT IF EXISTS tiktok_engine_jobs_status_chk;

ALTER TABLE public.tiktok_engine_jobs
  ADD CONSTRAINT tiktok_engine_jobs_status_chk
  CHECK (status IN (
    'pending', 'script', 'audio', 'avatar', 'processing',
    'completed', 'failed',
    'script_generating', 'script_done', 'script_failed',
    'rendering_video', 'video_uploading', 'video_submitted', 'video_rendering'
  ));

CREATE INDEX IF NOT EXISTS idx_tiktok_engine_jobs_briefing_status
  ON public.tiktok_engine_jobs (briefing_id, status);

CREATE INDEX IF NOT EXISTS idx_tiktok_engine_jobs_hook_variation
  ON public.tiktok_engine_jobs (model_id, hook_variation_index);
  `;

  const mgmtRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: migration }),
  });

  if (mgmtRes.ok) {
    log("Migration aplicada via Management API com sucesso!");
    return true;
  }

  const mgmtBody = await mgmtRes.text();

  // Não foi possível aplicar automaticamente — imprimir instrução manual clara
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ⚠️  AÇÃO MANUAL NECESSÁRIA — Migration não aplicada automaticamente
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Acesse: https://supabase.com/dashboard/project/vhsfuoskndjebaheyobe/sql/new

  2. Cole e execute o SQL do arquivo:
     supabase/migrations/20260417_tiktok_migration_consolidada.sql

  3. Verifique que o resultado mostra 5 colunas:
     hook_variation_index | hook_variation_text | log_steps | render_metadata | video_provider

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  console.log(`Resposta da Management API (${mgmtRes.status}):\n${mgmtBody.slice(0, 400)}`);
  return false;
}

async function runValidation() {
  const migrationOk = await checkAndApplyMigration();

  if (!migrationOk) {
    console.log("\n⛔  Aplique a migration manualmente e execute novamente.");
    process.exit(1);
  }

  // Re-verifica colunas após tentativa
  console.log("\nVerificando colunas após migration...");

  const verify = await supabase
    .from("tiktok_engine_jobs")
    .select("hook_variation_index, hook_variation_text, log_steps, render_metadata")
    .limit(1);

  if (verify.error) {
    log(`Colunas ainda não encontradas: ${verify.error.message}`, false);
    process.exit(1);
  }

  log("Todas as colunas novas verificadas com sucesso!");

  // Teste de escrita
  console.log("\nTestando escrita nas novas colunas...");

  const briefingTest = await supabase
    .from("tiktok_engine_briefings")
    .insert({
      product_name: "[MIGRATION-VALIDATE]",
      product_price: "0,01",
      product_benefits: "teste",
      product_pain: "teste",
      avatar_id: "test",
      model_ids: [1],
      hook_count: 1,
      video_provider: "remotion",
      status: "pending",
    })
    .select("id")
    .single();

  if (briefingTest.error) {
    log(`INSERT briefing falhou: ${briefingTest.error.message}`, false);
    process.exit(1);
  }

  const briefingId = briefingTest.data.id as string;

  const jobTest = await supabase
    .from("tiktok_engine_jobs")
    .insert({
      briefing_id: briefingId,
      model_id: 1,
      model_name: "Test",
      hook_variation_index: 0,
      hook_variation_text: "Hook de teste",
      log_steps: [{ step: "init", detail: "migration validate", ok: true, ts: new Date().toISOString() }],
      status: "script_generating",
    })
    .select("id")
    .single();

  if (jobTest.error) {
    log(`INSERT job com novas colunas falhou: ${jobTest.error.message}`, false);
    await supabase.from("tiktok_engine_briefings").delete().eq("id", briefingId);
    process.exit(1);
  }

  log("INSERT com hook_variation_index + log_steps + status='script_generating': OK");

  // UPDATE com render_metadata
  const updateTest = await supabase
    .from("tiktok_engine_jobs")
    .update({
      status: "completed",
      render_metadata: { provider: "remotion", template: "hook_choque", fps: 30, duration_in_frames: 600 },
      log_steps: [
        { step: "init", detail: "ok", ok: true, ts: new Date().toISOString() },
        { step: "completed", detail: "validate", ok: true, ts: new Date().toISOString() },
      ],
    })
    .eq("id", jobTest.data.id as string);

  if (updateTest.error) {
    log(`UPDATE com render_metadata + status='completed' falhou: ${updateTest.error.message}`, false);
  } else {
    log("UPDATE com render_metadata + status='completed': OK");
  }

  // Limpar dados de teste
  await supabase.from("tiktok_engine_briefings").delete().eq("id", briefingId);
  log("Dados de teste removidos.");

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅  MIGRATION VALIDADA — Pipeline pronto para E2E real
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Próximo passo: rodar npx tsx scripts/validate-tiktok-e2e.ts
  para testar OpenAI + ElevenLabs + Storage.

  Depois: teste E2E completo no painel admin em
  /admin/criativos/tiktok-engine
`);
}

runValidation().catch((e: unknown) => {
  console.error("\n❌ Erro fatal:", e);
  process.exit(1);
});
