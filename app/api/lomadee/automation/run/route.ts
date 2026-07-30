import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  getLomadeeAutomationConfig,
  normalizeLomadeeAutomationConfigInput,
  saveLomadeeAutomationRunResult,
  type LomadeeAutomationConfig,
  type LomadeeAutomationConfigInput,
  type LomadeeAutomationSlot,
} from "@/lib/lomadee/automation-config";
import { fetchLomadeeProducts, type NormalizedLomadeeProduct } from "@/lib/lomadee/client";
import { salvarOferta, supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LomadeeAutomationRunConfig = LomadeeAutomationConfig & {
  dryRun: boolean;
};

type AutomationProductResult = {
  name: string;
  price: number;
  link: string;
  action:
    | "staged"
    | "skipped"
    | "error"
    | "would_stage"
    | "would_skip";
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
  key: keyof LomadeeAutomationConfigInput,
) {
  if (Object.prototype.hasOwnProperty.call(body, key)) {
    return body[key];
  }

  const value = searchParams.get(key);
  return value === null ? undefined : value;
}

async function readConfig(req: NextRequest): Promise<LomadeeAutomationRunConfig> {
  const body =
    req.method === "POST"
      ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
      : {};
  const searchParams = req.nextUrl.searchParams;
  const storedConfig = await getLomadeeAutomationConfig();
  const overrides: LomadeeAutomationConfigInput = {};

  for (const key of [
    "search",
    "organizationIds",
    "sort",
    "limit",
    "slotType",
    "priceMin",
    "priceMax",
    "active",
  ] as Array<keyof LomadeeAutomationConfigInput>) {
    const value = pickOverride(body, searchParams, key);
    if (value !== undefined) {
      overrides[key] = value;
    }
  }

  const config = normalizeLomadeeAutomationConfigInput(overrides, storedConfig);
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
    throw new Error(saveResult.error?.message ?? "Falha ao criar candidato Lomadee na curadoria.");
  }

  return saveResult.data as { id?: string };
}

async function stageLomadeeProductForCuration(input: {
  slotType: LomadeeAutomationSlot;
  product: NormalizedLomadeeProduct;
}) {
  const externalOfferId = `lomadee:${input.product.organizationId}:${input.product.id}`;

  const offer = await saveOfferCandidate({
    title: input.product.title,
    product_url: input.product.link,
    affiliate_url: input.product.link,
    image_url: input.product.image || null,
    marketplace: "lomadee",
    platform: "lomadee",
    category: null,
    price: input.product.price,
    old_price: input.product.original_price || null,
    original_price: input.product.original_price || null,
    discount_pct: input.product.discount_pct,
    discount_percent: input.product.discount_pct,
    external_offer_id: externalOfferId,
    slot_type: input.slotType,
    is_flash: input.slotType === "flash",
    is_featured: input.slotType === "best",
    status: "inactive",
    curations_status: "review",
    published_at: null,
    expires_at: null,
    source: "lomadee_automation",
    currency: "BRL",
    raw_data: {
      source: "lomadee_automation",
      needs_manual_approval: true,
      organization_id: input.product.organizationId,
      seller: input.product.seller,
      lomadee_product_id: input.product.id,
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

  let config: LomadeeAutomationRunConfig | null = null;

  try {
    config = await readConfig(req);
    const productsResult = await fetchLomadeeProducts({
      search: config.search || undefined,
      organizationIds: config.organizationIds || undefined,
      page: 1,
      limit: config.limit,
      priceMin: config.priceMin || null,
      priceMax: config.priceMax,
      sort: config.sort,
      isAvailable: true,
    });
    const candidates = productsResult.products.slice(0, config.limit);
    const products: AutomationProductResult[] = [];
    let staged = 0;
    let skipped = 0;
    let errors = 0;
    let wouldStage = 0;
    let wouldSkip = 0;

    for (const product of candidates) {
      try {
        const existingOffer = await findExistingOfferByAffiliateUrl(product.link);
        if (existingOffer) {
          skipped += 1;
          if (config.dryRun) wouldSkip += 1;
          products.push({
            name: product.title,
            price: product.price,
            link: product.link,
            action: config.dryRun ? "would_skip" : "skipped",
            offer_id: existingOffer.id,
            reason: "duplicate",
          });
          continue;
        }

        if (config.dryRun) {
          wouldStage += 1;
          products.push({
            name: product.title,
            price: product.price,
            link: product.link,
            action: "would_stage",
          });
          continue;
        }

        const stagedOffer = await stageLomadeeProductForCuration({
          slotType: config.slotType,
          product,
        });
        staged += 1;
        products.push({
          name: product.title,
          price: product.price,
          link: product.link,
          action: "staged",
          offer_id: stagedOffer.offer_id,
        });
      } catch (error) {
        errors += 1;
        products.push({
          name: product.title,
          price: product.price,
          link: product.link,
          action: "error",
          error: error instanceof Error ? error.message : "Falha ao enviar produto Lomadee para a curadoria.",
        });
      }
    }

    const result = {
      success: errors === 0,
      search: config.search || null,
      organizationIds: config.organizationIds || null,
      sort: config.sort,
      slotType: config.slotType,
      priceMin: config.priceMin,
      priceMax: config.priceMax,
      active: config.active,
      dryRun: config.dryRun,
      requested: config.limit,
      available: productsResult.meta.total,
      considered: candidates.length,
      wouldStage,
      wouldSkip,
      staged,
      skipped,
      errors,
      products,
      executed_at: new Date().toISOString(),
    };

    let logError = "";
    try {
      await saveLomadeeAutomationRunResult(result);
    } catch (error) {
      logError = error instanceof Error ? error.message : "Falha ao salvar resultado.";
    }

    return NextResponse.json(logError ? { ...result, logError } : result);
  } catch (error) {
    const result = {
      success: false,
      active: config?.active ?? false,
      dryRun: config?.dryRun ?? false,
      wouldStage: 0,
      wouldSkip: 0,
      staged: 0,
      skipped: 0,
      errors: 1,
      products: [],
      executed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Falha na automacao Lomadee.",
    };

    if (config) {
      await saveLomadeeAutomationRunResult(result).catch(() => undefined);
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
