import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { AIFactory, type VideoInput } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidVideoInput(body: Partial<VideoInput>): body is VideoInput {
  return Boolean(
    body.imageUrl?.trim() &&
      body.productName?.trim() &&
      body.script?.hook?.trim() &&
      body.script?.body?.trim() &&
      body.script?.cta?.trim(),
  );
}

export async function POST(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = await request.json() as Partial<VideoInput>;

    if (!isValidVideoInput(body)) {
      return NextResponse.json(
        { error: 'imageUrl, productName e script completo sao obrigatorios' },
        { status: 400 },
      );
    }

    const result = await AIFactory.composeVideo(body);

    if (result.status === 'error') {
      return NextResponse.json(
        { error: result.error || 'Falha ao compor video' },
        { status: 500 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/ai/video/compose] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
