import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Robos de previa de link (WhatsApp, Telegram, Facebook...) abrem a URL
// sozinhos antes da pessoa clicar, so pra montar o cartao com imagem/titulo.
// Se deixarmos isso seguir ate o link de afiliado de verdade, "gasta" um
// clique de rastreamento que a rede (Mercado Livre, AWIN etc.) as vezes trata
// como uso unico — a pessoa clica depois e o rastreamento nao conta mais.
const PREVIEW_BOT_USER_AGENT_PATTERN =
  /whatsapp|telegrambot|facebookexternalhit|facebot|slackbot|linkedinbot|twitterbot|discordbot|skypeuripreview|pinterest|redditbot|vkshare|w3c_validator|embedly/i;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isPreviewBot(request: NextRequest): boolean {
  const userAgent = request.headers.get("user-agent") ?? "";
  return PREVIEW_BOT_USER_AGENT_PATTERN.test(userAgent);
}

function buildPreviewHtml(params: { title: string; imageUrl: string | null; pageUrl: string }): string {
  const title = escapeHtml(params.title || "Radar Smart");
  const image = params.imageUrl ? escapeHtml(params.imageUrl) : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta property="og:title" content="${title}" />
<meta property="og:type" content="product" />
<meta property="og:url" content="${escapeHtml(params.pageUrl)}" />
${image ? `<meta property="og:image" content="${image}" />` : ""}
</head>
<body></body>
</html>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const param = toText(params.id);
  const source = toText(request.nextUrl.searchParams.get("source")) || "go_redirect";
  if (!param) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Link curto (short_code, ex.: "aB3xY7") ou o uuid completo da oferta —
  // aceita os dois pra manter compatibilidade com links ja enviados antes.
  const lookupColumn = UUID_PATTERN.test(param) ? "id" : "short_code";

  const { data: offer, error } = await supabaseAdmin
    .from("offers")
    .select("id,title,image_url,affiliate_url,click_count")
    .eq(lookupColumn, param)
    .maybeSingle();

  const affiliateUrl = toText(offer?.affiliate_url);
  if (error || !offer || !affiliateUrl) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPreviewBot(request)) {
    const html = buildPreviewHtml({
      title: toText(offer.title),
      imageUrl: offer.image_url ? toText(offer.image_url) : null,
      pageUrl: request.url,
    });
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const offerId = String(offer.id);
  const nextClickCount = Number(offer?.click_count ?? 0) + 1;

  void Promise.allSettled([
    supabaseAdmin.from("clicks").insert({
      offer_id: offerId,
      type: "product_click",
      source,
    }),
    supabaseAdmin
      .from("offers")
      .update({ click_count: nextClickCount })
      .eq("id", offerId),
  ]);

  return NextResponse.redirect(affiliateUrl);
}
