import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

type DispatchPayload = {
  source_url?: unknown;
  affiliate_link?: unknown;
  marketplace?: unknown;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { ok: false, error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const body = (await req.json()) as DispatchPayload;
    const sourceUrl = toText(body.source_url);
    const affiliateLink = toText(body.affiliate_link);
    const marketplace = toText(body.marketplace) || "unknown";

    if (!sourceUrl) {
      return NextResponse.json(
        { ok: false, error: "Campo source_url é obrigatório." },
        { status: 400 },
      );
    }

    const n8nWebhookUrl = toText(process.env.N8N_WEBHOOK_URL);
    if (!n8nWebhookUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "N8N_WEBHOOK_URL não configurada no ambiente.",
        },
        { status: 500 },
      );
    }

    const requestId = randomUUID();

    const response = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "x-radar-webhook-key": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({
        request_id: requestId,
        source_url: sourceUrl,
        affiliate_link: affiliateLink || sourceUrl,
        marketplace,
        origin: "radar_smart_admin",
        requested_at: new Date().toISOString(),
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `n8n retornou status ${response.status}.`,
          details: responseText.slice(0, 300),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      request_id: requestId,
      message: "URL enviada para a Engine n8n com sucesso.",
      n8n_response: responseText.slice(0, 300),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha ao enviar URL para a Engine n8n.",
      },
      { status: 500 },
    );
  }
}
