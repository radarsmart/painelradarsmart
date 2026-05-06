import { NextRequest, NextResponse } from 'next/server';
import remotionPackage from 'remotion/package.json';

import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const jobId = request.nextUrl.searchParams.get('jobId');

    if (jobId) {
      const job = await supabaseAdmin
        .from('ai_video_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      if (job.error) {
        return NextResponse.json({ error: job.error.message }, { status: 500 });
      }

      if (!job.data) {
        return NextResponse.json({ error: 'Job nao encontrado' }, { status: 404 });
      }

      return NextResponse.json({ job: job.data });
    }

    return NextResponse.json({
      provider: process.env.AI_VIDEO_PROVIDER || 'remotion',
      remotion: {
        installed: true,
        version: remotionPackage.version,
      },
      outputDir: process.env.REMOTION_OUTPUT_DIR || './temp/videos',
      dimensions: { width: 1080, height: 1920 },
      formats: ['mp4'],
      codecPolicy: 'mpeg4 via ffmpegOverride; nunca libx264',
      storageBucket: process.env.AI_VIDEO_STORAGE_BUCKET || 'ugc-videos',
    });
  } catch (error) {
    console.error('[/api/ai/video/status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get video status' },
      { status: 500 },
    );
  }
}
