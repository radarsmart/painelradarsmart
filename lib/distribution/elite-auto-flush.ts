import { supabaseAdmin } from "@/lib/supabase";
import { dispatchLegacyOffer } from "@/lib/distribution/legacy-dispatch";

type EliteOfferCandidate = {
  id: string;
  title: string | null;
  score: number | null;
  curations_status: string | null;
  status: string | null;
};

type FlushOfferResult = {
  offerId: string;
  title: string;
  queued: number;
  skipped: number;
  score: number;
};

export type AutoFlushEliteResult = {
  success: boolean;
  message: string;
  processed: number;
  queued: number;
  skipped: number;
  failed: number;
  offers: FlushOfferResult[];
  errors: Array<{ offerId: string; title: string; error: string }>;
};

const ELITE_SCORE_THRESHOLD = 85;
const ELITE_BATCH_LIMIT = 10;

async function activateOfferForFlush(offerId: string) {
  const payload = {
    curations_status: "approved",
    status: "active",
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabaseAdmin
    .from("offers")
    .update(payload)
    .eq("id", offerId);

  if (error && error.message.includes("curations_status")) {
    const fallbackPayload = {
      status: "active",
      updated_at: payload.updated_at,
    };

    const fallback = await supabaseAdmin
      .from("offers")
      .update(fallbackPayload)
      .eq("id", offerId);

    error = fallback.error;
  }

  if (error) {
    throw new Error(`Falha ao aprovar oferta: ${error.message}`);
  }
}

export async function autoFlushEliteOffers(): Promise<AutoFlushEliteResult> {
  console.log("Iniciando Auto-Flush de Elite...");

  try {
    // `radar_smart_rank` no schema atual lista apenas ofertas ativas.
    // Para auto-flush de inbox, usamos o mesmo threshold de elite direto em `offers`.
    const { data: eliteOffers, error: eliteError } = await supabaseAdmin
      .from("offers")
      .select("id,title,score,curations_status,status")
      .eq("curations_status", "inbox")
      .gte("score", ELITE_SCORE_THRESHOLD)
      .order("score", { ascending: false })
      .limit(ELITE_BATCH_LIMIT);

    if (eliteError) {
      throw new Error(`Falha ao ler ofertas de elite: ${eliteError.message}`);
    }

    const candidates = (eliteOffers ?? []) as EliteOfferCandidate[];

    if (!candidates.length) {
      return {
        success: true,
        message: "Nenhuma oferta nova de elite para processar.",
        processed: 0,
        queued: 0,
        skipped: 0,
        failed: 0,
        offers: [],
        errors: [],
      };
    }

    console.log(`Processando ${candidates.length} ofertas de alta conversao...`);

    const settled = await Promise.allSettled(
      candidates.map(async (offer) => {
        await activateOfferForFlush(offer.id);

        const dispatch = await dispatchLegacyOffer({
          offerId: offer.id,
          channels: ["telegram", "whatsapp"],
          allowRequeueSameDay: false,
        });

        return {
          offerId: offer.id,
          title: String(offer.title ?? "Oferta sem titulo"),
          queued: dispatch.queued,
          skipped: dispatch.skipped,
          score: Number(offer.score ?? 0),
        };
      }),
    );

    const offers: FlushOfferResult[] = [];
    const errors: AutoFlushEliteResult["errors"] = [];

    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      const candidate = candidates[index];
      const title = String(candidate?.title ?? "Oferta sem titulo");

      if (result.status === "fulfilled") {
        offers.push(result.value);
        continue;
      }

      errors.push({
        offerId: String(candidate?.id ?? ""),
        title,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason ?? "Falha desconhecida"),
      });
    }

    const totalQueued = offers.reduce((acc, item) => acc + item.queued, 0);
    const totalSkipped = offers.reduce((acc, item) => acc + item.skipped, 0);
    const processed = offers.length;
    const failed = errors.length;

    return {
      success: failed === 0,
      message:
        processed > 0
          ? `${processed} ofertas de elite despachadas com sucesso!`
          : "Nenhuma oferta de elite foi despachada.",
      processed,
      queued: totalQueued,
      skipped: totalSkipped,
      failed,
      offers,
      errors,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Falha desconhecida no auto-flush.";
    console.error("Erro no Auto-Flush:", detail);

    return {
      success: false,
      message: detail,
      processed: 0,
      queued: 0,
      skipped: 0,
      failed: 1,
      offers: [],
      errors: [{ offerId: "", title: "Auto-Flush", error: detail }],
    };
  }
}
