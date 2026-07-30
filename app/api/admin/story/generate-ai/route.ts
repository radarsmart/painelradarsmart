import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidRemoteImageUrl } from "@/lib/story-image-allowlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function formatBRL(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

async function fetchProductImageBuffer(
  src: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (!isValidRemoteImageUrl(src)) {
    throw new Error("Imagem do produto invalida ou de host nao permitido.");
  }

  const upstream = await fetch(src, {
    redirect: "follow",
    headers: {
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      referer: "https://www.amazon.com.br/",
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

function buildPrompt(input: {
  title: string;
  price: number;
  oldPrice: number | null;
  discountPct: number | null;
}): string {
  const priceText = `R$ ${formatBRL(input.price)}`;
  const oldPriceText = input.oldPrice ? `R$ ${formatBRL(input.oldPrice)}` : null;
  const discountText = input.discountPct ? `${input.discountPct}%` : null;

  return [
    "A primeira imagem enviada e um TEMPLATE fixo de anuncio para Stories do Instagram/WhatsApp: uma modelo de blazer verde apontando para um circulo em branco no centro, fundo verde/azul com icones 3D de compras (carrinho, sacola, desconto, presente), e um botao grande escrito 'LINK NA BIO!' no rodape.",
    "A segunda imagem enviada e a FOTO REAL do produto que deve ser divulgado.",
    "Gere uma nova imagem final no MESMO estilo visual: mesma modelo, mesma pose, mesmas cores, mesmos icones e o mesmo botao 'LINK NA BIO!' do template (mantenha tudo igual e sem alteracoes), substituindo apenas o circulo central em branco pela foto do produto (imagem 2), recortada e centralizada de forma realista dentro do circulo.",
    `Escreva tambem sobre a arte, respeitando o estilo visual verde/branco do template com fontes bold e legiveis: o titulo curto do produto "${input.title}", o preco atual em destaque ${priceText}`,
    oldPriceText ? `, o preco antigo riscado ${oldPriceText}` : "",
    discountText ? `, e um selo de desconto chamativo com ${discountText} OFF` : "",
    ". Nao altere o rosto, roupa ou pose da modelo do template. Nao remova o botao 'LINK NA BIO!'. Mantenha o formato vertical.",
  ]
    .filter(Boolean)
    .join("");
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
    title?: unknown;
    price?: unknown;
    old_price?: unknown;
    discount_pct?: unknown;
    image_url?: unknown;
  };

  const title = toText(body.title) || "Oferta especial";
  const price = Number(body.price);
  const oldPriceRaw = Number(body.old_price);
  const oldPrice = Number.isFinite(oldPriceRaw) && oldPriceRaw > price ? oldPriceRaw : null;
  const discountPctRaw = Number(body.discount_pct);
  const discountPct =
    Number.isFinite(discountPctRaw) && discountPctRaw > 0
      ? Math.round(discountPctRaw)
      : oldPrice && price
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : null;
  const imageUrl = toText(body.image_url);

  if (!Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "Preco invalido." }, { status: 400 });
  }
  if (!imageUrl) {
    return NextResponse.json({ error: "URL da imagem do produto e obrigatoria." }, { status: 400 });
  }

  try {
    const templatePath = path.join(process.cwd(), "public", "criativos", "story-template.jpeg");
    const templateBuffer = fs.readFileSync(templatePath);
    const { buffer: productBuffer, contentType: productContentType } =
      await fetchProductImageBuffer(imageUrl);

    const prompt = buildPrompt({ title, price, oldPrice, discountPct });

    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", "1024x1536");
    form.append(
      "image[]",
      new Blob([new Uint8Array(templateBuffer)], { type: "image/jpeg" }),
      "template.jpeg",
    );
    form.append(
      "image[]",
      new Blob([new Uint8Array(productBuffer)], { type: productContentType }),
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
    const storagePath = `stories/${randomUUID()}.png`;
    const bucket = "ugc-assets";

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, outputBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) {
      throw new Error(`Falha no upload da imagem gerada: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);

    return NextResponse.json({ success: true, image_url: publicUrlData.publicUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao gerar story com IA.",
      },
      { status: 500 },
    );
  }
}
