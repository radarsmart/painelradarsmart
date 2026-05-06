import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { publishVideoToSupabase } from '@/lib/ai/publish';
import { updateAiVideoJob } from '@/lib/ai/video-jobs';
import type { PublishInput } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = await request.json() as PublishInput;
    const jobId = body.jobId && isUuid(body.jobId) ? body.jobId : null;

    if (jobId) {
      await updateAiVideoJob(jobId, { status: 'uploading' });
    }

    const result = await publishVideoToSupabase(body);

    if (result.status === 'error') {
      if (jobId) {
        await updateAiVideoJob(jobId, { status: 'failed', error: result.error || 'Publish failed' });
      }
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    if (jobId) {
      await updateAiVideoJob(jobId, { status: 'published', output: { ...result } });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erro interno ao publicar video.',
      },
      { status: 500 },
    );
  }
}
