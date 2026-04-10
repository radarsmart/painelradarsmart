import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  getAwinAutomationConfig,
  normalizeAwinAutomationConfigInput,
  saveAwinAutomationRunResult,
  type AwinAutomationConfig,
  type AwinAutomationConfigInput,
  type AwinAutomationSlot,
} from "@/lib/awin/automation-config";
import { fetchAwinAdvertiserFeedProducts } from "@/lib/awin/client";
import { salvarOferta, supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AwinAutomationRunConfig = AwinAutomationConfig & {
  dryRun: boolean;
};

type AwinAutomationProduct = {
  id: string;
  productName: string;
  searchPrice: number;
  merchantImageUrl: string;
  awDeepLink: string;
  categoryName: string;
  merchantName: string;
  originalSearchPrice: number;
  originalCurrency: string;
};

type AutomationProductResult = {
  name: string;
  price: number;
  awDeepLink: string;
  action:
    | "staged"
    | "skipped"
    | "error"
    | "would_stage"
    | "would_skip"
    | "published"
    | "would_publish";
  offer_id?: string;
  error?: string;
  reason?: string;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeBoolean(value: unknown): boolean {
  const normalized = toText(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function hasCronAccess(req: NextRequest): boolean {
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) return false;

  const authHeader = String(req.headers.get("authorization") ?? "").trim();
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const querySecret = String(req.nextUrl.searchParams.get("secret") ?? "").trim();

  return bearer === cronSecret || querySecret === cronSecret;
}

async function authorizeAutomation(req: NextRequest) {
  if (hasCronAccess(req)) {
    return { ok: true as const };
  }

  return requireAdmin(req);
}

function pickOverride(
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
  key: keyof AwinAutomationConfigInput,
) {
  if (Object.prototype.hasOwnProperty.call(body, key)) {
    return body[key];
  }

  const value = searchParams.get(key);
  return value === null ? undefined : value;
}

async function readConfig(req: NextRequest): Promise<AwinAutomationRunConfig> {
  const body =
    req.method === "POST"
      ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
      : {};
  const searchParams = req.nextUrl.searchParams;
  const storedConfig = await getAwinAutomationConfig();
  const overrides: AwinAutomationConfigInput = {};

  for (const key of [
    "advertiserId",
    "category",
    "sort",
    "limit",
    "slotType",
    "priceMin",
    "priceMax",
    "active",
  ] as Array<keyof AwinAutomationConfigInput>) {
    const value = pickOverride(body, searchParams, key);
    if (value !== undefined) {
      overrides[key] = value;
    }
  }

  const config = normalizeAwinAutomationConfigInput(overrides, storedConfig);
  const dryRunOverride = Object.prototype.hasOwnProperty.call(body, "dryRun")
    ? body.dryRun
    : searchParams.get("dryRun");
  const hasDryRunOverride =
    Object.prototype.hasOwnProperty.call(body, "dryRun") ||
    searchParams.has("dryRun");

  return {
    ...config,
    dryRun: config.active
      ? hasDryRunOverride
        ? normalizeBoolean(dryRunOverride)
        : false
      : true,
  };
}

function getMissingColumnFromError(message: string) {
  return (
    message.match(/Could not find the '([^']+)' column/i)?.[1] ||
    message.match(/column "([^"]+)" of relation/i)?.[1] ||
    null
  );
}

async function saveOfferCandidate(payload: Record<string, unknown>) {
  const payloadToSave = { ...payload };
  let saveResult = await salvarOferta(payloadToSave);

  while (saveResult.error) {
    const missingColumn = getMissingColumnFromError(saveResult.error.message);
    if (!missingColumn || !(missingColumn in payloadToSave)) {
      break;
    }

    delete payloadToSave[missingColumn];
    saveResult = await salvarOferta(payloadToSave);
  }

  if (saveResult.error || !saveResult.data) {
    throw new Error(saveResult.error?.message ?? "Falha ao criar candidato AWIN na curadoria.");
  }

  return saveResult.data as { id?: string };
}

async function stageAwinProductForCuration(input: {
  advertiserId: string;
  slotType: AwinAutomationSlot;
  product: AwinAutomationProduct;
}) {
  const externalOfferId = `awin:${input.advertiserId}:${input.product.id || input.product.awDeepLink}`;
  const categorySlug = input.product.categoryName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const offer = await saveOfferCandidate({
    title: input.product.productName,
    product_url: input.product.awDeepLink,
    affiliate_url: input.product.awDeepLink,
    image_url: input.product.merchantImageUrl || null,
    marketplace: "awin",
    platform: "awin",
    category: input.product.categoryName || null,
    category_name: input.product.categoryName || null,
    category_slug: categorySlug || null,
    price: input.product.searchPrice,
    old_price: null,
    original_price: null,
    discount_pct: 0,
    discount_percent: 0,
    external_offer_id: externalOfferId,
    slot_type: input.slotType,
    is_flash: input.slotType === "flash",
    is_featured: input.slotType === "best",
    status: "inactive",
    curations_status: "review",
    published_at: null,
    expires_at: null,
    source: "awin_automation",
    currency: "BRL",
    raw_data: {
      source: "awin_automation",
      needs_manual_approval: true,
      advertiser_id: input.advertiserId,
      category_name: input.product.categoryName,
      merchant_name: input.product.merchantName,
      aw_product_id: input.product.id,
      original_price: input.product.originalSearchPrice,
      original_currency: input.product.originalCurrency,
      suggested_slot_type: input.slotType,
    },
  });

  return { offer_id: String(offer.id ?? "") };
}

async function findExistingOfferByAffiliateUrl(affiliateUrl: string) {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id,title")
    .eq("affiliate_url", affiliateUrl)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao verificar duplicidade: ${error.message}`);
  }

  return data as { id: string; title?: string | null } | null;
}

async function runAutomation(req: NextRequest) {
  const auth = await authorizeAutomation(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let config: AwinAutomationRunConfig | null = null;

  try {
    config = await readConfig(req);
    const productsResult = await fetchAwinAdvertiserFeedProducts({
      advertiserId: config.advertiserId,
      category: config.category,
      sort: config.sort,
      page: 1,
      priceMin: config.priceMin,
      priceMax: config.priceMax,
    });
    const candidates = productsResult.products.slice(0, config.limit);
    const products: AutomationProductResult[] = [];
    let published = 0;
    let skipped = 0;
    let errors = 0;
    let wouldPublish = 0;
    let wouldSkip = 0;
    let staged = 0;
    let wouldStage = 0;

    for (const product of candidates) {
      try {
        const existingOffer = await findExistingOfferByAffiliateUrl(product.awDeepLink);
        if (existingOffer) {
          skipped += 1;
          if (config.dryRun) wouldSkip += 1;
          products.push({
            name: product.productName,
            price: product.searchPrice,
            awDeepLink: product.awDeepLink,
            action: config.dryRun ? "would_skip" : "skipped",
            offer_id: existingOffer.id,
            reason: "duplicate",
          });
          continue;
        }

        if (config.dryRun) {
          wouldPublish += 1;
          wouldStage += 1;
          products.push({
            name: product.productName,
            price: product.searchPrice,
            awDeepLink: product.awDeepLink,
            action: "would_stage",
          });
          continue;
        }

        const stagedOffer = await stageAwinProductForCuration({
          advertiserId: config.advertiserId,
          slotType: config.slotType,
          product,
        });
        published += 1;
        staged += 1;
        products.push({
          name: product.productName,
          price: product.searchPrice,
          awDeepLink: product.awDeepLink,
          action: "staged",
          offer_id: stagedOffer.offer_id,
        });
      } catch (error) {
        errors += 1;
        products.push({
          name: product.productName,
          price: product.searchPrice,
          awDeepLink: product.awDeepLink,
          action: "error",
          error: error instanceof Error ? error.message : "Falha ao enviar produto AWIN para a curadoria.",
        });
      }
    }

    const result = {
      success: errors === 0,
      advertiserId: config.advertiserId,
      category: config.category || null,
      sort: config.sort,
      slotType: config.slotType,
      priceMin: config.priceMin,
      priceMax: config.priceMax,
      active: config.active,
      dryRun: config.dryRun,
      requested: config.limit,
      available: productsResult.total,
      considered: candidates.length,
      wouldPublish,
      wouldSkip,
      wouldStage,
      published,
      staged,
      skipped,
      errors,
      products,
      executed_at: new Date().toISOString(),
    };

    let logError = "";
    try {
      await saveAwinAutomationRunResult(result);
    } catch (error) {
      logError = error instanceof Error ? error.message : "Falha ao salvar resultado.";
    }

    return NextResponse.json(logError ? { ...result, logError } : result);
  } catch (error) {
    const result = {
      success: false,
      active: config?.active ?? false,
      dryRun: config?.dryRun ?? false,
      wouldPublish: 0,
      wouldSkip: 0,
      wouldStage: 0,
      published: 0,
      staged: 0,
      skipped: 0,
      errors: 1,
      products: [],
      executed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Falha na automacao AWIN.",
    };

    if (config) {
      await saveAwinAutomationRunResult(result).catch(() => undefined);
    }

    return NextResponse.json(
      result,
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return runAutomation(req);
}

export async function POST(req: NextRequest) {
  return runAutomation(req);
}
