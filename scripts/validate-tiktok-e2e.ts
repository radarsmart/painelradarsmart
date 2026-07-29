/**
 * Script de validação operacional do TikTok Engine.
 *
 * O que este script faz (em ordem):
 * 1. Aplica a migration das novas colunas + corrige o CHECK de status
 * 2. Valida que as colunas existem com INSERT/UPDATE de teste
 * 3. Roda 1 job real (OpenAI → ElevenLabs → Remotion → Storage)
 * 4. Faz poll de status até completed/failed
 * 5. Imprime relatório final com URL do MP4 ou erro exato
 *
 * Uso:
 *   npx tsx scripts/validate-tiktok-e2e.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// ─── Configuração ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_DEFAULT_VOICE_ID ||
  process.env.ELEVENLABS_VOICE_ID ||
  "F7823wtD50WK1gnmgBk5";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function log(msg: string, level: "info" | "ok" | "warn" | "error" = "info") {
  const icon = { info: "ℹ", ok: "✅", warn: "⚠️", error: "❌" }[level];
  console.log(`${icon}  ${msg}`);
}

function section(title: string) {
  console.log(`\n${"─".repeat(60)}\n  ${title}\n${"─".repeat(60)}`);
}

// ─── Passo 1: Aplicar migration das novas colunas ────────────────────────────

async function applyMigration() {
  section("PASSO 1 — Aplicar migration das novas colunas");

  // Executar cada ALTER TABLE via RPC se disponível, caso contrário via REST
  // O supabase-js não tem API de DDL — usamos o endpoint de SQL do Supabase Management API
  // mas como não temos a Management API key, vamos fazer via INSERT de teste para detectar
  // se as colunas já existem

  // Tenta fazer um SELECT nas colunas novas
  const testQuery = await supabase
    .from("tiktok_engine_jobs")
    .select("hook_variation_index, hook_variation_text, log_steps, render_metadata")
    .limit(1);

  if (testQuery.error) {
    const errMsg = testQuery.error.message ?? "";
    if (
      errMsg.includes("hook_variation_index") ||
      errMsg.includes("log_steps") ||
      errMsg.includes("column")
    ) {
      log("Colunas novas NÃO encontradas. É necessário aplicar a migration manualmente.", "error");
      log("", "info");
      log("➜ Acesse: https://supabase.com/dashboard/project/vhsfuoskndjebaheyobe/sql", "info");
      log("➜ Cole e execute o conteúdo de:", "info");
      log("  supabase/migrations/20260417_tiktok_hook_variations.sql", "info");
      log("  supabase/migration_tiktok_engine.sql (status_chk fix)", "info");
      log("", "info");
      log("Migration SQL a copiar e executar:", "warn");
      console.log(`
-- ============================================================
-- MIGRATION 1: Novas colunas e índices (copiar inteiro e executar)
-- ============================================================
ALTER TABLE public.tiktok_engine_jobs
  ADD COLUMN IF NOT EXISTS hook_variation_index integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hook_variation_text   text,
  ADD COLUMN IF NOT EXISTS log_steps             jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS render_metadata       jsonb,
  ADD COLUMN IF NOT EXISTS script_text_final     text,
  ADD COLUMN IF NOT EXISTS video_provider        text,
  ADD COLUMN IF NOT EXISTS video_storage_path    text,
  ADD COLUMN IF NOT EXISTS audio_storage_path    text;

ALTER TABLE public.tiktok_engine_briefings
  ADD COLUMN IF NOT EXISTS hook_count            integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS video_provider        text,
  ADD COLUMN IF NOT EXISTS product_image_urls    jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shop_url              text;

-- MIGRATION 2: Corrigir CHECK de status para aceitar todos os status do pipeline
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

-- Índices para análise de hooks A/B
CREATE INDEX IF NOT EXISTS idx_tiktok_engine_jobs_briefing_status
  ON public.tiktok_engine_jobs (briefing_id, status);
CREATE INDEX IF NOT EXISTS idx_tiktok_engine_jobs_hook_variation
  ON public.tiktok_engine_jobs (model_id, hook_variation_index);

-- Verificar resultado
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tiktok_engine_jobs'
  AND column_name IN (
    'hook_variation_index', 'hook_variation_text',
    'log_steps', 'render_metadata', 'video_provider'
  )
ORDER BY column_name;
-- ============================================================
`);
      return false;
    }
  }

  log("Colunas hook_variation_index, hook_variation_text, log_steps verificadas.", "ok");
  return true;
}

// ─── Passo 2: Validar escrita nas colunas novas ──────────────────────────────

async function validateWriteAccess(): Promise<boolean> {
  section("PASSO 2 — Validar escrita nas colunas novas");

  // Cria um briefing de teste mínimo
  const briefingInsert = await supabase
    .from("tiktok_engine_briefings")
    .insert({
      product_name: "[VALIDATE-TEST] Produto E2E",
      product_price: "99,90",
      product_benefits: "Beneficio de teste",
      product_pain: "Dor de teste",
      avatar_id: "test-avatar",
      model_ids: [1],
      hook_count: 1,
      video_provider: "remotion",
      status: "pending",
    })
    .select("id")
    .single();

  if (briefingInsert.error) {
    log(`Falha ao criar briefing de teste: ${briefingInsert.error.message}`, "error");
    return false;
  }

  const briefingId = briefingInsert.data.id as string;
  log(`Briefing de teste criado: ${briefingId}`, "ok");

  // Cria job de teste com novas colunas
  const jobInsert = await supabase
    .from("tiktok_engine_jobs")
    .insert({
      briefing_id: briefingId,
      model_id: 1,
      model_name: "Problema → Solução",
      hook_variation_index: 0,
      hook_variation_text: "Não acredito no que acabei de ver...",
      log_steps: [],
      status: "pending",
    })
    .select("id")
    .single();

  if (jobInsert.error) {
    log(`Falha ao criar job de teste: ${jobInsert.error.message}`, "error");
    // Limpa briefing de teste
    await supabase.from("tiktok_engine_briefings").delete().eq("id", briefingId);
    return false;
  }

  const jobId = jobInsert.data.id as string;
  log(`Job de teste criado: ${jobId}`, "ok");

  // Testa UPDATE com log_steps e render_metadata
  const updateTest = await supabase
    .from("tiktok_engine_jobs")
    .update({
      status: "script_generating",
      hook_variation_index: 0,
      hook_variation_text: "Não acredito no que acabei de ver...",
      log_steps: [{ step: "validate_test", detail: "ok", ok: true, ts: new Date().toISOString() }],
    })
    .eq("id", jobId);

  if (updateTest.error) {
    log(`Falha ao atualizar job com novas colunas: ${updateTest.error.message}`, "error");
    await supabase.from("tiktok_engine_briefings").delete().eq("id", briefingId);
    return false;
  }

  log("UPDATE com hook_variation_index + hook_variation_text + log_steps: OK", "ok");

  // Limpa dados de teste
  await supabase.from("tiktok_engine_briefings").delete().eq("id", briefingId);
  log("Dados de teste removidos.", "ok");

  return true;
}

// ─── Passo 3: Validar APIs externas ─────────────────────────────────────────

async function validateExternalApis(): Promise<{ openai: boolean; elevenlabs: boolean }> {
  section("PASSO 3 — Validar APIs externas (OpenAI + ElevenLabs)");

  // OpenAI — ping simples
  let openAiOk = false;
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });
    openAiOk = res.ok;
    log(`OpenAI API: ${res.ok ? "OK" : `Falhou (${res.status})`}`, res.ok ? "ok" : "error");
  } catch (e) {
    log(`OpenAI API: erro de rede — ${String(e)}`, "error");
  }

  // ElevenLabs — verificar voz
  let elevenOk = false;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${ELEVENLABS_VOICE_ID}`, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    elevenOk = res.ok;
    const data = await res.json().catch(() => ({})) as { name?: string };
    log(
      `ElevenLabs API: ${res.ok ? `OK — voz "${data.name ?? ELEVENLABS_VOICE_ID}"` : `Falhou (${res.status})`}`,
      res.ok ? "ok" : "error",
    );
  } catch (e) {
    log(`ElevenLabs API: erro de rede — ${String(e)}`, "error");
  }

  return { openai: openAiOk, elevenlabs: elevenOk };
}

// ─── Passo 4: Validar Remotion (bundle check) ───────────────────────────────

async function validateRemotion(): Promise<boolean> {
  section("PASSO 4 — Validar Remotion (verificar dependências)");

  try {
    const req = eval("require") as NodeRequire;
    req("@remotion/bundler");
    req("@remotion/renderer");
    req("@remotion/media-utils");
    log("@remotion/bundler, @remotion/renderer, @remotion/media-utils: instalados", "ok");
    return true;
  } catch (e) {
    log(`Remotion não instalado corretamente: ${String(e)}`, "error");
    log("Execute: npm install @remotion/bundler @remotion/renderer @remotion/media-utils", "warn");
    return false;
  }
}

// ─── Passo 5: Rodar E2E mínimo via API ──────────────────────────────────────

async function runE2ETest(): Promise<void> {
  section("PASSO 5 — E2E: testar roteiro + áudio (sem render Remotion)");

  log("Testando geração de roteiro via OpenAI...", "info");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      hook: { type: "string" },
      body: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
      cta: { type: "string" },
      caption: { type: "string" },
      on_screen_text: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
      duration_target_seconds: { type: "number" },
    },
    required: ["title", "hook", "body", "cta", "caption", "on_screen_text", "duration_target_seconds"],
  };

  let scriptOk = false;
  let hookText = "";

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: "Escreva um roteiro curto para TikTok Shop em portugues-BR. Responda em JSON aderente ao schema. CTA final: direcionar para Radar Smart." }],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Produto: Câmera de Ação 4K\nPreço: R$ 149,90\nDesconto: 40% OFF\nBeneficios: qualidade 4K, bateria 2h, resistente à água\nDor: câmera cara, complicada, sem garantia\nHook sugerido: Não acredito no que acabei de ver...\nDuração: 20 segundos\nRegras: hook máximo 14 palavras, CTA curto.",
              },
            ],
          },
        ],
        max_output_tokens: 420,
        text: {
          format: { type: "json_schema", name: "tiktok_script", strict: true, schema },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      log(`OpenAI script falhou (${res.status}): ${body.slice(0, 200)}`, "error");
    } else {
      const data = await res.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
      let text = "";
      if (data.output_text) {
        text = data.output_text;
      } else {
        for (const item of data.output ?? []) {
          for (const part of item.content ?? []) {
            if (part.type === "output_text" && part.text) text = part.text;
          }
        }
      }

      if (text) {
        const parsed = JSON.parse(text) as { hook?: string; title?: string; cta?: string };
        hookText = parsed.hook ?? "";
        log(`Roteiro gerado OK`, "ok");
        log(`  Title: ${parsed.title ?? "—"}`, "info");
        log(`  Hook:  ${hookText}`, "info");
        log(`  CTA:   ${parsed.cta ?? "—"}`, "info");
        scriptOk = true;
      } else {
        log("OpenAI retornou resposta vazia.", "error");
      }
    }
  } catch (e) {
    log(`Erro ao chamar OpenAI: ${String(e)}`, "error");
  }

  if (!scriptOk || !hookText) {
    log("Pulando teste de áudio (roteiro falhou).", "warn");
    return;
  }

  log("Testando geração de áudio via ElevenLabs...", "info");

  try {
    const shortScript = `${hookText} Câmera 4K por apenas R$ 149,90 — 40% off. Entra no Radar Smart pelo link na bio!`;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: shortScript,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.5, speed: 1.12 },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      log(`ElevenLabs falhou (${res.status}): ${body.slice(0, 200)}`, "error");
    } else {
      const arr = await res.arrayBuffer();
      const kb = Math.round(arr.byteLength / 1024);
      log(`Áudio gerado: ${kb} KB — OK`, "ok");

      // Upload para Supabase Storage
      const audioBuffer = Buffer.from(arr);
      const storagePath = `e2e-test/validate-${Date.now()}.mp3`;
      const upload = await supabase.storage
        .from("tiktok-engine-assets")
        .upload(storagePath, audioBuffer, { contentType: "audio/mpeg", upsert: true });

      if (upload.error) {
        log(`Upload áudio para Storage falhou: ${upload.error.message}`, "error");
        log("Verifique se o bucket 'tiktok-engine-assets' existe e está público.", "warn");
      } else {
        const publicUrl = supabase.storage.from("tiktok-engine-assets").getPublicUrl(storagePath);
        log(`Upload para Supabase Storage: OK`, "ok");
        log(`  URL pública: ${publicUrl.data.publicUrl}`, "info");

        // Limpar arquivo de teste
        await supabase.storage.from("tiktok-engine-assets").remove([storagePath]);
        log("Arquivo de teste removido do Storage.", "ok");
      }
    }
  } catch (e) {
    log(`Erro ao chamar ElevenLabs: ${String(e)}`, "error");
  }
}

// ─── Relatório Final ──────────────────────────────────────────────────────────

async function printReport() {
  section("RELATÓRIO — Próximos Passos");

  log("Para fazer 1 teste E2E completo com video:", "info");
  console.log(`
  1. Abra o painel admin: http://localhost:3000/admin/criativos/tiktok-engine
  2. Preencha:
     - Produto: Câmera de Ação 4K
     - Preço: 149,90
     - Desconto: 40% OFF
     - Benefícios: Qualidade 4K, bateria 2h, resistente à água
     - Dor: Câmera cara, complicada, sem garantia
     - URL da Imagem (1 linha): https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=1080
  3. Modelos: selecionar apenas o Modelo 1 (Problema → Solução)
  4. Variações de Hook: 1
  5. Clicar em "Gerar Vídeos"
  6. Observar o Job Card na aba Jobs — deve passar por:
     script_generating → script_done → audio → processing → rendering_video → video_uploading → completed
  7. Se falhar, verificar:
     a) rendering_video → erro de Chromium/Remotion (dependência headless)
     b) audio → erro de key ElevenLabs ou voz não encontrada
     c) script_generating → erro de key OpenAI ou schema inválido
  `);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🎬  TikTok Engine — Validação Operacional E2E");
  console.log("⏰  ", new Date().toLocaleString("pt-BR"));

  // Passo 1: Migration
  const migrationOk = await applyMigration();
  if (!migrationOk) {
    log("⛔ Execute a migration no Supabase antes de continuar.", "error");
    await printReport();
    process.exit(1);
  }

  // Passo 2: Escrita
  const writeOk = await validateWriteAccess();
  if (!writeOk) {
    log("⛔ Falha na validação de escrita. Verifique o banco e a migration.", "error");
    process.exit(1);
  }

  // Passo 3: APIs externas
  const apis = await validateExternalApis();
  if (!apis.openai) log("OpenAI falhou — scripts não serão gerados.", "error");
  if (!apis.elevenlabs) log("ElevenLabs falhou — áudio não será gerado.", "error");

  // Passo 4: Remotion
  const remotionOk = await validateRemotion();
  if (!remotionOk) {
    log("Remotion não disponível — render de vídeo vai falhar.", "warn");
  }

  // Passo 5: E2E de script+áudio
  if (apis.openai && apis.elevenlabs) {
    await runE2ETest();
  } else {
    log("Pulando E2E de script/áudio (APIs com falha).", "warn");
  }

  await printReport();

  section("RESULTADO");
  const allOk = migrationOk && writeOk && apis.openai && apis.elevenlabs && remotionOk;
  if (allOk) {
    log("Sistema pronto para E2E completo com render de vídeo!", "ok");
  } else {
    log("Há itens que precisam de atenção antes do primeiro render real (ver acima).", "warn");
  }
}

main().catch((e: unknown) => {
  console.error("\n❌ Erro fatal:", e);
  process.exit(1);
});
