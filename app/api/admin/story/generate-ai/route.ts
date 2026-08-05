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

const CTA_OPTIONS = ["LINK NA BIO!", "COMENTE \"QUERO\" NOS COMENTARIOS!"];

type PriceInfo = {
  title: string;
  price: number;
  oldPrice: number | null;
  discountPct: number | null;
};

type StoryTemplate = {
  id: string;
  file: string;
  ctaFixed: string | null;
  includeLogo: boolean;
  hidden?: boolean;
  buildPrompt: (input: PriceInfo, cta: string) => string;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function formatBRL(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function priceLines(input: PriceInfo): string {
  const priceText = `R$ ${formatBRL(input.price)}`;
  const oldPriceText = input.oldPrice ? `R$ ${formatBRL(input.oldPrice)}` : null;
  const discountText = input.discountPct ? `${input.discountPct}%` : null;

  return [
    `o titulo curto do produto "${input.title}"`,
    `o preco atual em destaque ${priceText}`,
    oldPriceText ? `o preco antigo riscado ${oldPriceText}` : "",
    discountText ? `um selo de desconto chamativo com ${discountText} OFF` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

const LOGO_INSTRUCTION =
  "Inclua o logo da marca (imagem do logo enviada) em um local estrategico e discreto da arte, como um selo/marca d'agua no canto superior esquerdo ou superior direito, em tamanho pequeno (nao mais que 12% da largura da imagem), sem cobrir o rosto da modelo ou o produto. Ao lado ou abaixo do logo, escreva o nome \"Radar Smart\" em fonte bold branca ou dourada, pequena e legivel, no mesmo estilo visual do restante da arte.";

const TEMPLATES: StoryTemplate[] = [
  {
    id: "circle",
    file: "story-template.jpeg",
    ctaFixed: "LINK NA BIO!",
    includeLogo: true,
    buildPrompt: (input) =>
      [
        "A primeira imagem enviada e um TEMPLATE fixo de anuncio para Stories do Instagram/WhatsApp: uma modelo de blazer verde apontando para um circulo em branco no centro, fundo verde/azul com icones 3D de compras (carrinho, sacola, desconto, presente), e um botao grande escrito 'LINK NA BIO!' no rodape.",
        "A segunda imagem enviada e a FOTO REAL do produto que deve ser divulgado.",
        "A terceira imagem enviada e o LOGO oficial da marca Radar Smart (circulo verde-escuro com borda dourada e icone de carrinho/radar dourado).",
        "Gere uma nova imagem final no MESMO estilo visual: mesma modelo, mesma pose, mesmas cores, mesmos icones e o mesmo botao 'LINK NA BIO!' do template (mantenha tudo igual e sem alteracoes), substituindo apenas o circulo central em branco pela foto do produto (imagem 2), recortada e centralizada de forma realista dentro do circulo.",
        LOGO_INSTRUCTION,
        `Escreva tambem sobre a arte, respeitando o estilo visual verde/branco do template com fontes bold e legiveis: ${priceLines(input)}.`,
        "Nao altere o rosto, roupa ou pose da modelo do template. Nao remova o botao 'LINK NA BIO!'. Mantenha o formato vertical.",
      ].join(" "),
  },
  {
    id: "unboxing",
    file: "story-template-unboxing.jpeg",
    ctaFixed: null,
    includeLogo: true,
    buildPrompt: (input, cta) =>
      [
        "A primeira imagem enviada e um TEMPLATE fixo com a mesma modelo/pessoa da marca Radar Smart: ela esta sentada no sofa, sorrindo, desembalando uma caixa de papelao e segurando um produto (fone de ouvido) com as duas maos, fundo de sala de estar com plantas e luz natural.",
        "A segunda imagem enviada e a FOTO REAL do produto que deve ser divulgado (produto diferente do fone de ouvido do template).",
        "A terceira imagem enviada e o LOGO oficial da marca Radar Smart.",
        "Gere uma nova imagem final na MESMA pose, mesmo rosto, mesma roupa e mesmo fundo do template, substituindo APENAS o objeto que ela segura nas maos pelo produto da segunda imagem (redimensionado e posicionado de forma realista como se ela estivesse desembalando ele agora, saindo da caixa de papelao).",
        LOGO_INSTRUCTION,
        `Adicione tambem sobre a arte, em fontes bold e legiveis no estilo verde/branco da marca: ${priceLines(input)}.`,
        `No rodape, adicione um botao grande e chamativo (fundo verde solido, texto branco bold) escrito "${cta}".`,
        "Nao altere o rosto, pose ou fundo da modelo do template. Mantenha o formato vertical.",
      ].join(" "),
  },
  {
    id: "cards",
    file: "story-template-cards.jpeg",
    ctaFixed: null,
    includeLogo: true,
    buildPrompt: (input, cta) =>
      [
        "A primeira imagem enviada e um TEMPLATE fixo com a mesma modelo/pessoa da marca Radar Smart: ela esta sentada no sofa olhando e sorrindo para o celular, com um cabecalho 'Grupo de Ofertas' e alguns cartoes flutuantes de produtos de exemplo.",
        "A segunda imagem enviada e a FOTO REAL do produto que deve ser divulgado.",
        "A terceira imagem enviada e o LOGO oficial da marca Radar Smart.",
        "Gere uma nova imagem final na MESMA pose, mesmo rosto e mesmo fundo do template, mantendo o cabecalho 'Grupo de Ofertas'. REMOVA os cartoes de exemplo do template e coloque no lugar deles APENAS UM cartao branco grande, arredondado, com sombra leve, contendo: a foto real do produto (imagem 2), um selo verde de check com texto 'Oferta verificada', o titulo curto do produto, o preco, e o botao de CTA (ver instrucao abaixo) dentro do proprio cartao, na parte de baixo dele.",
        "Use apenas UM cartao no total, com UM UNICO botao de CTA (dentro do cartao). Nao duplique o produto, o preco ou o botao em mais de um lugar da arte.",
        LOGO_INSTRUCTION,
        `Escreva no cartao, em fontes bold e legiveis: ${priceLines(input)}.`,
        `Dentro do cartao, na parte de baixo, adicione UM UNICO botao grande e chamativo (fundo verde solido, texto branco bold) escrito "${cta}". Nao crie nenhum outro botao fora do cartao.`,
        "Nao altere o rosto, pose ou fundo da modelo do template. Mantenha o formato vertical.",
      ].join(" "),
  },
  {
    id: "pointing",
    file: "story-template-pointing.jpeg",
    ctaFixed: null,
    includeLogo: false,
    buildPrompt: (input, cta) =>
      [
        "A primeira imagem enviada e um TEMPLATE fixo com a mesma modelo/pessoa da marca Radar Smart: ela sorrindo, apontando com as duas maos para baixo, fundo branco/azul/verde com icones 3D de compras flutuando, logo e texto 'RADAR SMART / COMPRA INTELIGENTE' ja presentes no centro da arte, e uma seta verde grande apontando para baixo no rodape (area vazia abaixo da seta).",
        "A segunda imagem enviada e a FOTO REAL do produto que deve ser divulgado.",
        "Gere uma nova imagem final na MESMA pose, mesmo rosto, mesmas cores e MESMO logo/wordmark 'RADAR SMART' do template (mantenha o logo e a seta exatamente como estao, sem duplicar ou adicionar outro logo), adicionando na area vazia abaixo da seta APENAS UM cartao branco arredondado com sombra leve, contendo a foto real do produto (uma unica vez, sem duplicar) recortada e centralizada dentro do cartao.",
        `Escreva no cartao, em fontes bold e legiveis, UMA UNICA VEZ (sem repetir em outro lugar da arte): ${priceLines(input)}.`,
        `Abaixo do cartao do produto, adicione um botao grande e chamativo (fundo verde solido, texto branco bold) escrito "${cta}".`,
        "Nao altere o rosto, pose ou fundo da modelo do template, nem o logo/wordmark existente. Nao duplique o produto nem o preco em mais de um lugar da arte. Mantenha o formato vertical.",
      ].join(" "),
  },
  {
    id: "tiktokshop",
    file: "story-template-tiktokshop.jpeg",
    ctaFixed: "Comprar agora",
    includeLogo: false,
    hidden: true,
    buildPrompt: (input, cta) =>
      [
        "A primeira imagem enviada e um TEMPLATE fixo de anuncio para TikTok Shop: fundo preto com efeito neon ciano/vermelho, o logo da marca Radar Smart no canto superior esquerdo, um icone grande de play dentro de um anel neon ciano/vermelho, o texto 'TIKTOK SHOP' em destaque abaixo do icone, e um cartao branco arredondado VAZIO na parte inferior da arte.",
        "A segunda imagem enviada e a FOTO REAL do produto que deve ser divulgado.",
        "Gere uma nova imagem final MANTENDO EXATAMENTE IGUAIS o fundo, o logo Radar Smart, o icone de play e o texto 'TIKTOK SHOP' do template (nao altere, mova, redimensione ou remova nenhum desses elementos existentes).",
        "Dentro do cartao branco vazio do template, insira a foto real do produto (imagem 2), recortada e centralizada de forma realista, ocupando a parte de cima do cartao.",
        `Logo abaixo da foto do produto, ainda dentro do MESMO cartao branco, escreva em fontes bold e legiveis, em cor escura: ${priceLines(input)}.`,
        `Na parte de baixo do cartao, adicione UM UNICO botao grande e chamativo (fundo preto solido ou gradiente ciano/vermelho, texto branco bold) escrito "${cta}". Nao crie nenhum outro botao fora do cartao.`,
        "Use apenas o UNICO cartao branco do template. Nao duplique o produto, o preco ou o botao em mais de um lugar da arte. Mantenha o formato vertical e todos os elementos fixos do template inalterados.",
      ].join(" "),
  },
];

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
    template_id?: unknown;
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
    const requestedTemplateId = toText(body.template_id);
    const requestedTemplate = requestedTemplateId
      ? TEMPLATES.find((item) => item.id === requestedTemplateId)
      : undefined;
    const selectableTemplates = TEMPLATES.filter((item) => !item.hidden);
    const template =
      requestedTemplate ??
      selectableTemplates[Math.floor(Math.random() * selectableTemplates.length)];
    const cta = template.ctaFixed ?? CTA_OPTIONS[Math.floor(Math.random() * CTA_OPTIONS.length)];

    const templatePath = path.join(process.cwd(), "public", "criativos", template.file);
    const templateBuffer = fs.readFileSync(templatePath);
    const { buffer: productBuffer, contentType: productContentType } =
      await fetchProductImageBuffer(imageUrl);

    const prompt = template.buildPrompt({ title, price, oldPrice, discountPct }, cta);

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

    if (template.includeLogo) {
      const logoPath = path.join(process.cwd(), "public", "radar-smart-logo.png");
      const logoBuffer = fs.readFileSync(logoPath);
      form.append(
        "image[]",
        new Blob([new Uint8Array(logoBuffer)], { type: "image/png" }),
        "logo.png",
      );
    }

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

    return NextResponse.json({
      success: true,
      image_url: publicUrlData.publicUrl,
      template_id: template.id,
    });
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
