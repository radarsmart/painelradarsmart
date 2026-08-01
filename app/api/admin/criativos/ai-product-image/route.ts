import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidRemoteImageUrl } from "@/lib/story-image-allowlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_PROMPT =
  "Transforme esta imagem de produto em uma foto realista de produto, como se tivesse sido fotografada profissionalmente por um fotografo de catalogo. Use iluminacao natural e suave, fundo limpo e neutro (branco ou cinza claro), qualidade fotorrealista de alta resolucao. O produto deve permanecer fiel ao original (mesmas cores, rotulo, formato e texto), centralizado e em destaque, ocupando a maior parte do quadro.";

const STORAGE_BUCKET = "ugc-assets";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

async function fetchImageBuffer(src: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (!isValidRemoteImageUrl(src)) {
    throw new Error("Imagem do produto invalida ou de host nao permitido.");
  }

  const upstream = await fetch(src, {
    redirect: "follow",
    headers: {
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  });

  if (!upstream.ok) {
    throw new Error(`Falha ao baixar imagem do produto (${upstream.status}).`);
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const arrayBuffer = await upstream.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: contentType.startsWith("image/") ? contentType : "image/jpeg",
  };
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const openaiKey = toText(process.env.OPENAI_API_KEY);
  if (!openaiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY nao configurada." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    image_url?: unknown;
    prompt?: unknown;
  };

  const imageUrl = toText(body.image_url);
  const customPrompt = toText(body.prompt);

  if (!imageUrl) {
    return NextResponse.json({ error: "image_url e obrigatorio." }, { status: 400 });
  }

  try {
    const { buffer, contentType } = await fetchImageBuffer(imageUrl);

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", customPrompt || DEFAULT_PROMPT);
    form.append("size", "1024x1024");
    form.append(
      "image[]",
      new Blob([new Uint8Array(buffer)], { type: contentType }),
      "product.jpg",
    );

    const openaiResponse = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text().catch(() => "");
      throw new Error(
        `OpenAI images/edits falhou (${openaiResponse.status}): ${errText.slice(0, 500)}`,
      );
    }

    const openaiJson = (await openaiResponse.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const b64 = openaiJson?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("OpenAI nao retornou imagem gerada.");
    }

    const outputBuffer = Buffer.from(b64, "base64");
    const storagePath = `produto-ai/${randomUUID()}.png`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, outputBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) {
      throw new Error(`Falha no upload da imagem gerada: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return NextResponse.json({ success: true, image_url: publicUrlData.publicUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Falha ao gerar imagem com IA.",
      },
      { status: 500 },
    );
  }
}
