import { randomUUID } from 'node:crypto';

import { supabaseAdmin } from '@/lib/supabase';

export type AiVideoJobStatus =
  | 'draft'
  | 'preview_generating'
  | 'preview_ready'
  | 'render_queued'
  | 'rendering'
  | 'rendered'
  | 'uploading'
  | 'published'
  | 'failed'
  | 'cancelled';

type JobPayload = {
  id?: string;
  productName: string;
  status: AiVideoJobStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string | null;
  originalJobId?: string | null;
  attemptNumber?: number | null;
  createdByUserId?: string | null;
  createdByEmail?: string | null;
};

type AiVideoJobEvent = {
  status: AiVideoJobStatus;
  at: string;
  detail?: string;
  error?: string | null;
};

function shouldIgnoreMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: unknown; message?: unknown };
  const code = String(maybe.code || '').toUpperCase();
  const message = String(maybe.message || '').toLowerCase();
  return code === '42P01' || message.includes('ai_video_jobs');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function createAiVideoJob(payload: JobPayload): Promise<string> {
  const id = payload.id && isUuid(payload.id) ? payload.id : randomUUID();
  const initialEvent: AiVideoJobEvent = {
    status: payload.status,
    at: new Date().toISOString(),
    detail: 'job_created',
    error: payload.error ?? null,
  };

  const inserted = await supabaseAdmin
    .from('ai_video_jobs')
    .insert({
      id,
      product_name: payload.productName,
      status: payload.status,
      input: payload.input || {},
      output: payload.output || {},
      status_events: [initialEvent],
      error: payload.error ?? null,
      original_job_id: payload.originalJobId && isUuid(payload.originalJobId)
        ? payload.originalJobId
        : null,
      attempt_number:
        typeof payload.attemptNumber === 'number' && Number.isFinite(payload.attemptNumber)
          ? Math.max(1, Math.floor(payload.attemptNumber))
          : 1,
      created_by_user_id: payload.createdByUserId ?? null,
      created_by_email: payload.createdByEmail ?? null,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (inserted.error && !shouldIgnoreMissingTable(inserted.error)) {
    throw new Error(inserted.error.message);
  }

  console.log(`[ai_video_jobs] created job=${id} status=${payload.status}`);
  return id;
}

export async function updateAiVideoJob(
  id: string,
  patch: {
    status: AiVideoJobStatus;
    output?: Record<string, unknown>;
    error?: string | null;
    detail?: string;
  },
): Promise<void> {
  const existing = await supabaseAdmin
    .from('ai_video_jobs')
    .select('status_events')
    .eq('id', id)
    .maybeSingle();

  if (existing.error && !shouldIgnoreMissingTable(existing.error)) {
    throw new Error(existing.error.message);
  }

  const currentEvents = Array.isArray(existing.data?.status_events)
    ? existing.data.status_events as AiVideoJobEvent[]
    : [];
  const nextEvent: AiVideoJobEvent = {
    status: patch.status,
    at: new Date().toISOString(),
    detail: patch.detail,
    error: patch.error ?? null,
  };

  const updated = await supabaseAdmin
    .from('ai_video_jobs')
    .update({
      status: patch.status,
      output: patch.output,
      status_events: [...currentEvents, nextEvent],
      error: patch.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updated.error && !shouldIgnoreMissingTable(updated.error)) {
    throw new Error(updated.error.message);
  }

  console.log(`[ai_video_jobs] updated job=${id} status=${patch.status}${patch.detail ? ` detail=${patch.detail}` : ''}`);
}
