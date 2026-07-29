import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { AIFactory, type ImageInput, type TextInput, type VideoInput } from '@/lib/ai';
import { publishVideoToSupabase } from '@/lib/ai/publish';
import { createAiVideoJob, updateAiVideoJob } from '@/lib/ai/video-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type FullPipelineRequest = ImageInput & TextInput & {
  publish?: boolean;
  bucket?: string;
  jobId?: string;
  retryOfJobId?: string;
  attemptNumber?: number;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  let jobId: string | null = null;

  try {
    const body = await request.json() as Partial<FullPipelineRequest>;

    if (!body.productName?.trim() || !body.description?.trim()) {
      return NextResponse.json(
        { error: 'productName e description sao obrigatorios' },
        { status: 400 },
      );
    }

    jobId = await createAiVideoJob({
      id: body.jobId?.trim(),
      productName: body.productName.trim(),
      status: 'preview_generating',
      input: body as Record<string, unknown>,
      originalJobId: body.retryOfJobId?.trim(),
      attemptNumber: body.attemptNumber,
      createdByUserId: isUuid(adminGuard.userId) ? adminGuard.userId : null,
      createdByEmail: adminGuard.email,
    });
    console.log(`[/api/ai/video/full-pipeline] job=${jobId} preview_generating product="${body.productName.trim()}"`);

    const [imageResult, textResult] = await Promise.all([
      AIFactory.generateImage({
        productName: body.productName.trim(),
        description: body.description.trim(),
        price: body.price?.trim(),
        style: body.style?.trim(),
        sourceImageUrl: body.sourceImageUrl?.trim(),
      }),
      AIFactory.generateText({
        productName: body.productName.trim(),
        description: body.description.trim(),
        price: body.price?.trim(),
        targetAudience: body.targetAudience?.trim(),
        platform: body.platform,
        durationSeconds: body.durationSeconds,
      }),
    ]);

    if (imageResult.status === 'error') {
      await updateAiVideoJob(jobId, {
        status: 'failed',
        error: imageResult.error || 'Image generation failed',
        detail: 'image_generation_failed',
        output: { image: { ...imageResult }, text: { ...textResult } },
      });
      return NextResponse.json({ error: `Image generation failed: ${imageResult.error}` }, { status: 500 });
    }

    if (textResult.status === 'error') {
      await updateAiVideoJob(jobId, {
        status: 'failed',
        error: textResult.error || 'Text generation failed',
        detail: 'text_generation_failed',
        output: { image: { ...imageResult }, text: { ...textResult } },
      });
      return NextResponse.json({ error: `Text generation failed: ${textResult.error}` }, { status: 500 });
    }

    await updateAiVideoJob(jobId, {
      status: 'preview_ready',
      detail: 'image_and_text_ready',
      output: {
        image: { ...imageResult },
        text: { ...textResult },
      },
    });
    console.log(`[/api/ai/video/full-pipeline] job=${jobId} preview_ready`);

    const videoInput: VideoInput = {
      imageUrl: imageResult.outputUrl,
      productName: body.productName.trim(),
      jobId,
      script: {
        hook: textResult.hook,
        body: textResult.body,
        cta: textResult.cta,
        duration: textResult.duration,
      },
    };

    await updateAiVideoJob(jobId, {
      status: 'render_queued',
      detail: 'video_input_ready',
      output: {
        image: { ...imageResult },
        text: { ...textResult },
      },
    });
    console.log(`[/api/ai/video/full-pipeline] job=${jobId} render_queued`);

    const composeResult = await AIFactory.composeVideo(videoInput);
    await updateAiVideoJob(jobId, {
      status: 'rendering',
      detail: 'remotion_render_started',
      output: {
        image: { ...imageResult },
        text: { ...textResult },
        compose: { ...composeResult },
      },
    });
    console.log(`[/api/ai/video/full-pipeline] job=${jobId} rendering`);

    const renderResult = await AIFactory.renderVideo(videoInput);

    if (renderResult.status === 'error') {
      await updateAiVideoJob(jobId, {
        status: 'failed',
        error: renderResult.error || 'Video rendering failed',
        detail: 'video_render_failed',
        output: {
          image: { ...imageResult },
          text: { ...textResult },
          compose: { ...composeResult },
          render: { ...renderResult },
        },
      });
      return NextResponse.json({ error: `Video rendering failed: ${renderResult.error}` }, { status: 500 });
    }

    await updateAiVideoJob(jobId, {
      status: 'rendered',
      detail: 'mp4_rendered',
      output: {
        image: { ...imageResult },
        text: { ...textResult },
        compose: { ...composeResult },
        render: { ...renderResult },
      },
    });
    console.log(`[/api/ai/video/full-pipeline] job=${jobId} rendered path=${renderResult.localFilePath || renderResult.videoUrl || ''}`);

    const shouldPublish = body.publish !== false;
    if (shouldPublish) {
      await updateAiVideoJob(jobId, {
        status: 'uploading',
        detail: 'supabase_storage_upload_started',
        output: {
          image: { ...imageResult },
          text: { ...textResult },
          compose: { ...composeResult },
          render: { ...renderResult },
        },
      });
      console.log(`[/api/ai/video/full-pipeline] job=${jobId} uploading`);
    }

    // Remotion local → localFilePath | Remotion Lambda → videoUrl (S3 pública)
    const hasRenderOutput = renderResult.localFilePath || renderResult.videoUrl;
    const publishResult = shouldPublish && hasRenderOutput
      ? await publishVideoToSupabase({
          localFilePath: renderResult.localFilePath,
          videoUrl: renderResult.localFilePath ? undefined : renderResult.videoUrl,
          bucket: body.bucket,
          fileName: `${body.productName.trim()}.mp4`,
          metadata: {
            productName: body.productName.trim(),
            imageProvider: imageResult.provider,
            textProvider: textResult.provider,
            videoProvider: renderResult.provider,
          },
        })
      : null;

    if (publishResult?.status === 'error') {
      await updateAiVideoJob(jobId, {
        status: 'failed',
        error: publishResult.error || 'Publish failed',
        detail: 'publish_failed',
        output: {
          image: { ...imageResult },
          text: { ...textResult },
          compose: { ...composeResult },
          render: { ...renderResult },
          publish: { ...publishResult },
        },
      });
      return NextResponse.json(
        {
          error: `Publish failed: ${publishResult.error}`,
          pipeline: {
            image: imageResult,
            text: textResult,
            compose: composeResult,
            render: renderResult,
            publish: publishResult,
          },
        },
        { status: 500 },
      );
    }

    await updateAiVideoJob(jobId, {
      status: publishResult ? 'published' : 'rendered',
      detail: publishResult ? 'published_to_supabase_storage' : 'publish_skipped',
      output: {
        image: { ...imageResult },
        text: { ...textResult },
        compose: { ...composeResult },
        render: { ...renderResult },
        publish: publishResult ? { ...publishResult } : null,
      },
    });
    console.log(`[/api/ai/video/full-pipeline] job=${jobId} ${publishResult ? `published url=${publishResult.publicUrl || ''}` : 'completed_without_publish'}`);

    return NextResponse.json({
      status: 'success',
      jobId,
      pipeline: {
        image: imageResult,
        text: textResult,
        compose: composeResult,
        render: renderResult,
        publish: publishResult,
      },
      videoUrl: publishResult?.publicUrl || renderResult.videoUrl,
      metadata: {
        completedAt: new Date().toISOString(),
        productName: body.productName.trim(),
      },
    });
  } catch (error) {
    console.error('[/api/ai/video/full-pipeline] Error:', error);
    if (jobId) {
      await updateAiVideoJob(jobId, {
        status: 'failed',
        detail: 'unhandled_pipeline_error',
        error: error instanceof Error ? error.message : 'Internal server error',
      }).catch((updateError) => {
        console.error('[/api/ai/video/full-pipeline] Failed to persist job error:', updateError);
      });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
