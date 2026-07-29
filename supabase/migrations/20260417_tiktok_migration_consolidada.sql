-- ============================================================
-- TikTok Engine — Migration Consolidada
-- Supabase SQL Editor > New Query > Cole e execute
-- ============================================================

-- 1. Colunas novas na tabela tiktok_engine_jobs
ALTER TABLE public.tiktok_engine_jobs
  ADD COLUMN IF NOT EXISTS hook_variation_index  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hook_variation_text   text,
  ADD COLUMN IF NOT EXISTS log_steps             jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS render_metadata       jsonb,
  ADD COLUMN IF NOT EXISTS script_text_final     text,
  ADD COLUMN IF NOT EXISTS video_provider        text,
  ADD COLUMN IF NOT EXISTS video_storage_path    text;

-- 2. Colunas novas na tabela tiktok_engine_briefings
ALTER TABLE public.tiktok_engine_briefings
  ADD COLUMN IF NOT EXISTS hook_count           integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS video_provider       text DEFAULT 'remotion',
  ADD COLUMN IF NOT EXISTS product_image_urls   jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shop_url             text;

-- 3. Corrigir CHECK de status para aceitar TODOS os estados do pipeline
--    (o check antigo só aceitava: pending, script, audio, avatar, processing, completed, failed)
ALTER TABLE public.tiktok_engine_jobs
  DROP CONSTRAINT IF EXISTS tiktok_engine_jobs_status_chk;

ALTER TABLE public.tiktok_engine_jobs
  ADD CONSTRAINT tiktok_engine_jobs_status_chk
  CHECK (status IN (
    'pending',
    'script',
    'audio',
    'avatar',
    'processing',
    'completed',
    'failed',
    'script_generating',
    'script_done',
    'script_failed',
    'rendering_video',
    'video_uploading',
    'video_submitted',
    'video_rendering'
  ));

-- 4. Índices de performance para A/B e consultas de status
CREATE INDEX IF NOT EXISTS idx_tiktok_engine_jobs_briefing_status
  ON public.tiktok_engine_jobs (briefing_id, status);

CREATE INDEX IF NOT EXISTS idx_tiktok_engine_jobs_hook_variation
  ON public.tiktok_engine_jobs (model_id, hook_variation_index);

-- 5. Verificar que as colunas existem (resultado esperado: 5 linhas)
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tiktok_engine_jobs'
  AND column_name IN (
    'hook_variation_index',
    'hook_variation_text',
    'log_steps',
    'render_metadata',
    'video_provider'
  )
ORDER BY column_name;
