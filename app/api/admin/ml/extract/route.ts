import { NextRequest, NextResponse } from "next/server";
import {
  extractMercadoLivreOffer,
  mapToAdminProdutoML,
} from "@/lib/scraping/mercadolivre-extractor";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobStatus = "pending" | "processing" | "done" | "failed";

async function isAuthenticatedRequest(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (token.length > 20) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data.user) return true;
  }

  return req.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"),
    );
}

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function computeDiscountPct(
  price: number | null,
  oldPrice: number | null,
): number | null {
  if (price === null || oldPrice === null || oldPrice <= price) return null;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

function shouldMarkNeedsReview(
  preview: Awaited<ReturnType<typeof extractMercadoLivreOffer>>,
): boolean {
  const title = String(preview.title ?? "").toLowerCase();
  const price = preview.price;
  const hasMinimumContent = Boolean(preview.title || preview.imageUrl);

  if (price === null) return hasMinimumContent;

  if (price < 5) return true;

  const highTicket = /(monitor|gamer|odyssey|tv|notebook|iphone|playstation|ps5|placa de video|geladeira)/i
    .test(title);
  if (highTicket && price < 100) return true;

  if (
    typeof preview.oldPrice === "number" &&
    preview.oldPrice > 0 &&
    preview.oldPrice >= price * 8
  ) {
    return true;
  }

  if (!preview.imageUrl) return true;

  return false;
}

async function createJob(sourceUrl: string, affiliateUrl: string | null) {
  const nowIso = new Date().toISOString();
  const staleThresholdMs = 15 * 60 * 1000;

  const { data: latest, error: latestError } = await supabaseAdmin
    .from("scrape_jobs")
    .select("id,status,attempts,updated_at,created_at")
    .eq("source", "mercadolivre")
    .eq("product_url", sourceUrl)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(`Falha ao consultar scrape_jobs: ${latestError.message}`);
  }

  if (latest?.status === "processing") {
    const updatedAtRaw = String(latest.updated_at ?? latest.created_at ?? "");
    const updatedAtTs = Date.parse(updatedAtRaw);
    const isStale = Number.isFinite(updatedAtTs)
      ? (Date.now() - updatedAtTs) > staleThresholdMs
      : true;

    if (!isStale) {
      throw new Error("Ja existe um job em processamento para esta URL.");
    }

    const staleAttempts = Math.max(1, Number(latest.attempts ?? 0));
    await supabaseAdmin
      .from("scrape_jobs")
      .update({
        status: "failed",
        attempts: staleAttempts,
        last_error: "Job travado em processing (timeout de seguranca).",
        updated_at: nowIso,
      })
      .eq("id", latest.id);
  }

  if (latest?.status === "failed") {
    const currentAttempts = Math.max(1, Number(latest.attempts ?? 0));
    if (currentAttempts >= 3) {
      throw new Error(
        "Limite maximo de 3 tentativas atingido para esta URL.",
      );
    }

    const nextAttempts = currentAttempts + 1;
    const { data, error } = await supabaseAdmin
      .from("scrape_jobs")
      .update({
        status: "processing",
        attempts: nextAttempts,
        last_error: null,
        updated_at: nowIso,
      })
      .eq("id", latest.id)
      .select("id,status,attempts")
      .single();

    if (error) {
      throw new Error(`Falha ao atualizar scrape_job (retry): ${error.message}`);
    }

    let normalized = data as { id: string; status: JobStatus; attempts: number };
    if (Number(normalized.attempts ?? 0) < 1) {
      const { data: patched } = await supabaseAdmin
        .from("scrape_jobs")
        .update({ attempts: nextAttempts, updated_at: nowIso })
        .eq("id", normalized.id)
        .select("id,status,attempts")
        .single();
      if (patched) {
        normalized = patched as { id: string; status: JobStatus; attempts: number };
      }
    }
    return normalized;
  }

  const { data, error } = await supabaseAdmin
    .from("scrape_jobs")
    .insert({
      source: "mercadolivre",
      product_url: sourceUrl,
      affiliate_url: affiliateUrl ?? sourceUrl,
      status: "processing",
      attempts: 1,
      payload: null,
      last_error: null,
      updated_at: nowIso,
    })
    .select("id,status,attempts")
    .single();

  if (error) {
    throw new Error(`Falha ao criar scrape_job: ${error.message}`);
  }

  let created = data as { id: string; status: JobStatus; attempts: number };
  if (Number(created.attempts ?? 0) < 1) {
    const { data: patched } = await supabaseAdmin
      .from("scrape_jobs")
      .update({ attempts: 1, updated_at: nowIso })
      .eq("id", created.id)
      .select("id,status,attempts")
      .single();
    if (patched) {
      created = patched as { id: string; status: JobStatus; attempts: number };
    }
  }
  return created;
}

async function finishJob(
  jobId: string,
  status: JobStatus,
  payload: Record<string, unknown> | null,
  errorMessage: string | null,
) {
  const { error } = await supabaseAdmin
    .from("scrape_jobs")
    .update({
      status,
      payload,
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("[ml/extract] erro ao atualizar scrape_jobs", {
      job_id: jobId,
      error: error.message,
    });
  }
}

async function upsertOfferAndHistory(
  preview: Awaited<ReturnType<typeof extractMercadoLivreOffer>>,
) {
  const now = new Date().toISOString();
  const externalOfferId = `mercadolivre:${preview.itemId ?? preview.productUrl}`;
  const discountPct = computeDiscountPct(preview.price, preview.oldPrice);
  const needsReview = shouldMarkNeedsReview(preview);
  const offerStatus = needsReview ? "needs_review" : "active";

  const offerPayload = {
    marketplace: "mercadolivre",
    platform: "mercadolivre",
    external_offer_id: externalOfferId,
    item_id: preview.itemId,
    title: preview.title ?? "Sem titulo",
    product_url: preview.productUrl,
    affiliate_url: preview.affiliateUrl,
    image_url: preview.imageUrl,
    brand: preview.brand,
    price: preview.price,
    old_price: preview.oldPrice,
    original_price: preview.oldPrice,
    price_old: preview.oldPrice,
    discount_percent: discountPct,
    discount_pct: discountPct,
    rating: preview.rating,
    review_count: preview.reviewCount,
    reviews_count: preview.reviewCount,
    seller_name: preview.sellerName,
    availability: preview.availability,
    currency: preview.currency,
    scraped_at: now,
    raw_data: preview.raw,
    raw: preview.raw,
    status: offerStatus,
    curations_status: needsReview ? "needs_review" : "approved",
    last_seen_at: now,
    last_checked_at: now,
    updated_at: now,
    source: "url_ingest",
  };

  let offerId: string | null = null;

  if (preview.itemId) {
    const { data: existingByItem } = await supabaseAdmin
      .from("offers")
      .select("id")
      .eq("platform", "mercadolivre")
      .eq("item_id", preview.itemId)
      .limit(1)
      .maybeSingle();
    offerId = existingByItem?.id ?? null;
  }

  if (!offerId) {
    const { data: existingByUrl } = await supabaseAdmin
      .from("offers")
      .select("id")
      .eq("product_url", preview.productUrl)
      .limit(1)
      .maybeSingle();
    offerId = existingByUrl?.id ?? null;
  }

  if (offerId) {
    const { error } = await supabaseAdmin
      .from("offers")
      .update(offerPayload)
      .eq("id", offerId);
    if (error) {
      throw new Error(`Falha ao atualizar offers: ${error.message}`);
    }
  } else {
    const { data, error } = await supabaseAdmin
      .from("offers")
      .insert(offerPayload)
      .select("id")
      .single();
    if (error) {
      throw new Error(`Falha ao inserir offers: ${error.message}`);
    }
    offerId = data?.id ?? null;
  }

  if (offerId && preview.price !== null) {
    await supabaseAdmin.from("offer_price_history").insert({
      offer_id: offerId,
      price: preview.price,
      original_price: preview.oldPrice,
      currency: preview.currency,
      captured_at: now,
    });

    await supabaseAdmin.from("price_history").insert({
      offer_id: offerId,
      price: preview.price,
      recorded_at: now,
    });
  }

  return { offerId, offerStatus, needsReview };
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticatedRequest(req))) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  let jobId: string | null = null;

  try {
    const body = (await req.json()) as {
      url?: string;
      affiliate_url?: string | null;
      persist?: boolean;
    };

    const sourceUrl = String(body?.url ?? "").trim();
    const affiliateUrl = String(body?.affiliate_url ?? sourceUrl).trim();
    const persist = body?.persist !== false;

    if (!sourceUrl) {
      return NextResponse.json(
        { error: "Campo url obrigatorio" },
        { status: 400 },
      );
    }

    const job = await createJob(sourceUrl, affiliateUrl || null);
    jobId = job.id;

    const preview = await extractMercadoLivreOffer({
      url: sourceUrl,
      affiliateUrl: affiliateUrl || sourceUrl,
    });

    let offerId: string | null = null;
    let offerStatus: string | null = null;
    let needsReview = false;
    if (persist) {
      const persisted = await upsertOfferAndHistory(preview);
      offerId = persisted.offerId;
      offerStatus = persisted.offerStatus;
      needsReview = persisted.needsReview;
    }

    await finishJob(job.id, "done", {
      offer_id: offerId,
      extraction_method: preview.extractionMethod,
      title: preview.title,
      price: preview.price,
      old_price: preview.oldPrice,
      item_id: preview.itemId,
      product_url: preview.productUrl,
      image_url: preview.imageUrl,
    }, null);

    return NextResponse.json({
      success: true,
      job_id: job.id,
      offer_id: offerId,
      offer_status: offerStatus,
      needs_review: needsReview,
      preview: mapToAdminProdutoML(preview),
      extracted: preview,
    });
  } catch (error) {
    const message = extractErrorMessage(error);

    if (jobId) {
      await finishJob(jobId, "failed", null, message.slice(0, 1200));
    }

    return NextResponse.json(
      { error: message, job_id: jobId },
      { status: 500 },
    );
  }
}
