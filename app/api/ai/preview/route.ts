import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { AIFactory, type ImageInput, type TextInput, type TextScene } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface PreviewRequest {
  productName: string;
  description: string;
  price?: string;
  targetAudience?: string;
  platform?: 'tiktok' | 'reels' | 'shorts' | 'generic';
  style?: string;
  sourceImageUrl?: string;
  durationSeconds?: number;
}

export interface PreviewResponse {
  image: {
    status: 'success' | 'error';
    provider: string;
    outputUrl: string;
    prompt: string;
    dimensions: {
      width: number;
      height: number;
    };
    error?: string;
  };
  text: {
    status: 'success' | 'error';
    provider: string;
    hook: string;
    body: string;
    cta: string;
    duration: number;
    variations: string[];
    scenes: TextScene[];
    error?: string;
  };
  preview: {
    format: 'vertical_9_16';
    dimensions: {
      width: 1080;
      height: 1920;
    };
    scenes: TextScene[];
    renderReady: boolean;
  };
}

export async function POST(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = await request.json() as Partial<PreviewRequest>;

    if (!body.productName?.trim() || !body.description?.trim()) {
      return NextResponse.json(
        { error: 'productName e description sao obrigatorios' },
        { status: 400 },
      );
    }

    const imageInput: ImageInput = {
      productName: body.productName.trim(),
      description: body.description.trim(),
      price: body.price?.trim(),
      style: body.style?.trim(),
      sourceImageUrl: body.sourceImageUrl?.trim(),
    };

    const textInput: TextInput = {
      productName: body.productName.trim(),
      description: body.description.trim(),
      price: body.price?.trim(),
      targetAudience: body.targetAudience?.trim(),
      platform: body.platform,
      durationSeconds: body.durationSeconds,
    };

    const [imageResult, textResult] = await Promise.all([
      AIFactory.generateImage(imageInput),
      AIFactory.generateText(textInput),
    ]);

    const response: PreviewResponse = {
      image: {
        status: imageResult.status,
        provider: imageResult.provider,
        outputUrl: imageResult.outputUrl,
        prompt: imageResult.prompt,
        dimensions: imageResult.dimensions,
        error: imageResult.error,
      },
      text: {
        status: textResult.status,
        provider: textResult.provider,
        hook: textResult.hook,
        body: textResult.body,
        cta: textResult.cta,
        duration: textResult.duration,
        variations: textResult.variations,
        scenes: textResult.scenes,
        error: textResult.error,
      },
      preview: {
        format: 'vertical_9_16',
        dimensions: {
          width: 1080,
          height: 1920,
        },
        scenes: textResult.scenes,
        renderReady: imageResult.status === 'success' && textResult.status === 'success',
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[/api/ai/preview] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
