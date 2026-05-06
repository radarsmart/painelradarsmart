import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { supabaseAdmin } from '@/lib/supabase';
import type { PublishInput, PublishOutput } from './contracts/publish';

const DEFAULT_BUCKET = 'ugc-videos';

function sanitizePathPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'video';
}

async function ensureBucket(bucket: string): Promise<void> {
  const buckets = await supabaseAdmin.storage.listBuckets();
  if (buckets.error) {
    throw new Error(`Falha ao listar buckets do Supabase Storage: ${buckets.error.message}`);
  }

  const exists = buckets.data.some((item) => item.name === bucket);
  if (exists) return;

  const created = await supabaseAdmin.storage.createBucket(bucket, {
    public: true,
    allowedMimeTypes: ['video/mp4'],
  });

  if (created.error) {
    throw new Error(`Falha ao criar bucket ${bucket}: ${created.error.message}`);
  }
}

async function readInput(input: PublishInput): Promise<Buffer> {
  if (input.localFilePath) {
    return fs.readFile(input.localFilePath);
  }

  if (input.videoUrl) {
    const response = await fetch(input.videoUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Falha ao baixar video remoto: HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error('localFilePath ou videoUrl e obrigatorio para publicar.');
}

function buildStoragePath(input: PublishInput): string {
  const date = new Date().toISOString().slice(0, 10);
  const rawName = input.fileName || (input.localFilePath ? path.basename(input.localFilePath) : 'radar-smart-video.mp4');
  const baseName = sanitizePathPart(rawName.replace(/\.mp4$/i, ''));
  return `${date}/${baseName}-${randomUUID()}.mp4`;
}

export async function publishVideoToSupabase(input: PublishInput): Promise<PublishOutput> {
  const bucket = input.bucket || process.env.AI_VIDEO_STORAGE_BUCKET || DEFAULT_BUCKET;

  try {
    await ensureBucket(bucket);

    const fileBuffer = await readInput(input);
    const storagePath = buildStoragePath(input);
    const uploaded = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, {
        contentType: input.contentType || 'video/mp4',
        upsert: false,
        cacheControl: '31536000',
      });

    if (uploaded.error) {
      throw new Error(uploaded.error.message);
    }

    const publicUrl = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;

    return {
      status: 'success',
      provider: 'supabase',
      bucket,
      path: storagePath,
      publicUrl,
      metadata: {
        ...input.metadata,
        publishedAt: new Date().toISOString(),
        bytes: fileBuffer.byteLength,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao publicar video.';
    return {
      status: 'error',
      provider: 'supabase',
      bucket,
      error: message,
    };
  }
}
