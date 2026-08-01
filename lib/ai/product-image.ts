import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase";
import { isValidRemoteImageUrl } from "@/lib/story-image-allowlist";

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

export async function generateAiProductImage(params: {
  imageUrl: string;
  prompt?: string;
}): Promise<{ imageUrl: string }> {
  const openaiKey = toText(process.env.OPENAI_API_KEY);
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY nao configurada.");
  }

  const imageUrl = toText(params.imageUrl);
  if (!imageUrl) {
    throw new Error("image_url e obrigatorio.");
  }

  const { buffer, contentType } = await fetchImageBuffer(imageUrl);

  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", toText(params.prompt) || DEFAULT_PROMPT);
  form.append("size", "1024x1024");
  form.append("image[]", new Blob([new Uint8Array(buffer)], { type: contentType }), "product.jpg");

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

  return { imageUrl: publicUrlData.publicUrl };
}
