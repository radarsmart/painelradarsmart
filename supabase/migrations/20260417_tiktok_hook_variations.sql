-- Migration: TikTok Engine — Hook Variations + Log Steps
-- Aplicar no Supabase Dashboard > SQL Editor

-- 1. Colunas de variação de hook nos jobs
ALTER TABLE tiktok_engine_jobs
  ADD COLUMN IF NOT EXISTS hook_variation_index integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hook_variation_text   text,
  ADD COLUMN IF NOT EXISTS log_steps             jsonb DEFAULT '[]'::jsonb;

-- 2. Colunas adicionais de rastreamento de render
ALTER TABLE tiktok_engine_jobs
  ADD COLUMN IF NOT EXISTS render_metadata jsonb,
  ADD COLUMN IF NOT EXISTS started_at      timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at    timestamptz;

-- 3. Índice para consultar jobs por briefing + status com eficiência
CREATE INDEX IF NOT EXISTS idx_tiktok_engine_jobs_briefing_status
  ON tiktok_engine_jobs (briefing_id, status);

-- 4. Índice para filtrar por hook_variation_index (análise de A/B)
CREATE INDEX IF NOT EXISTS idx_tiktok_engine_jobs_hook_variation
  ON tiktok_engine_jobs (model_id, hook_variation_index);

-- 5. Comentários descritivos
COMMENT ON COLUMN tiktok_engine_jobs.hook_variation_index IS
  'Índice (0-4) da variação de hook sorteada de lib/tiktok-engine/hooks.ts';

COMMENT ON COLUMN tiktok_engine_jobs.hook_variation_text IS
  'Texto original do hook antes da resolução de placeholders';

COMMENT ON COLUMN tiktok_engine_jobs.log_steps IS
  'Array de { step, detail, ok, ts } — log por etapa persistido pelo pipeline';

COMMENT ON COLUMN tiktok_engine_jobs.render_metadata IS
  'Metadados do render: provider, composition_id, template, duration_in_frames, fps';
