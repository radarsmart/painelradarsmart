import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { AIFactory, type TextInput } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = await request.json() as Partial<TextInput>;

    if (!body.productName?.trim() || !body.description?.trim()) {
      return NextResponse.json(
        { error: 'productName e description sao obrigatorios' },
        { status: 400 },
      );
    }

    const result = await AIFactory.generateText({
      productName: body.productName.trim(),
      description: body.description.trim(),
      price: body.price?.trim(),
      targetAudience: body.targetAudience?.trim(),
      platform: body.platform,
      durationSeconds: body.durationSeconds,
    });

    if (result.status === 'error') {
      return NextResponse.json(
        { error: result.error || 'Falha ao gerar roteiro' },
        { status: 500 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[/api/ai/text] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
