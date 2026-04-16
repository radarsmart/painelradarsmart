import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { NextRequest } from "next/server";

type JsonValue = Record<string, unknown>;

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

process.env.ADMIN_ALLOW_ANY_AUTHENTICATED = "true";

function makeJsonRequest(url: string, method: "GET" | "POST" | "PATCH", body?: unknown, headers?: HeadersInit) {
  return new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return { raw: text } as JsonValue;
  }
}

async function getTestReference() {
  const { supabaseAdmin } = await import("@/lib/supabase");
  const query = await supabaseAdmin
    .from("tiktok_engine_jobs")
    .select("id,briefing_id,status,video_url,created_at")
    .eq("status", "completed")
    .not("video_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (query.error) throw new Error(`Falha ao buscar job completed: ${query.error.message}`);
  if (query.data) return { briefingId: String(query.data.briefing_id), jobId: String(query.data.id) };

  const fallbackBriefing = await supabaseAdmin
    .from("tiktok_engine_briefings")
    .select("id,created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fallbackBriefing.error) {
    throw new Error(`Falha ao buscar briefing fallback: ${fallbackBriefing.error.message}`);
  }
  if (fallbackBriefing.data) {
    return { briefingId: String(fallbackBriefing.data.id), jobId: "" };
  }

  const seeded = await supabaseAdmin
    .from("tiktok_engine_briefings")
    .insert({
      product_name: "E2E Feature Flag Test Product",
      product_price: "99.90",
      product_discount: "10% OFF",
      product_category: "test",
      product_benefits: "Teste E2E de distribuicao com feature flags",
      product_pain: "Validar bloqueio e habilitacao por canal",
      voice_id: "test-voice",
      avatar_id: "test-avatar",
      status: "pending",
    })
    .select("id")
    .single();

  if (seeded.error || !seeded.data?.id) {
    throw new Error(
      `Falha ao criar briefing de teste: ${seeded.error?.message ?? "sem id"}`,
    );
  }

  return { briefingId: String(seeded.data.id), jobId: "" };
}

async function run() {
  const { GET: getFlagsRoute, PATCH: patchFlagsRoute } = await import(
    "@/app/api/admin/distribution/flags/route"
  );
  const { POST: distributeRoute } = await import(
    "@/app/api/tiktok-engine/distribute/route"
  );
  const { POST: eliteFlushRoute } = await import(
    "@/app/api/admin/distribution/elite-flush/route"
  );
  const { GET: cronDistributeRoute } = await import(
    "@/app/api/cron/distribute-scheduled/route"
  );
  const { supabaseAdmin } = await import("@/lib/supabase");

  const results: TestResult[] = [];
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) throw new Error("CRON_SECRET nao configurado no ambiente.");

  const reference = await getTestReference();
  const briefingId = reference.briefingId;
  const jobId = reference.jobId;

  // TESTE 1: tudo desligado
  await patchFlagsRoute(
    makeJsonRequest("http://local.test/api/admin/distribution/flags", "PATCH", {
      distribution_enabled: false,
      auto_distribute_on_complete: false,
      channels: {
        whatsapp: { enabled: false, groups: [] },
        telegram: { enabled: false, chats: [] },
        instagram: { enabled: false, post_as_reel: true },
      },
    }),
  );

  const flags1Res = await getFlagsRoute(makeJsonRequest("http://local.test/api/admin/distribution/flags", "GET"));
  const flags1 = await parseJsonResponse(flags1Res);
  const t1a = flags1Res.status === 200 && (flags1.flags as JsonValue)?.distribution_enabled === false;
  results.push({
    name: "Teste 1.1 flags off",
    passed: t1a,
    detail: `HTTP ${flags1Res.status} distribution_enabled=${String((flags1.flags as JsonValue)?.distribution_enabled)}`,
  });

  const distOffRes = await distributeRoute(
    makeJsonRequest("http://local.test/api/tiktok-engine/distribute", "POST", {
      briefing_id: briefingId,
      job_id: jobId || undefined,
      channels: ["whatsapp", "telegram", "instagram"],
    }),
  );
  const distOff = await parseJsonResponse(distOffRes);
  const t1b = distOffRes.status === 403;
  results.push({
    name: "Teste 1.2 bloqueio distribuição desligada",
    passed: t1b,
    detail: `HTTP ${distOffRes.status} payload=${JSON.stringify(distOff)}`,
  });

  // TESTE 2: telegram-only
  await patchFlagsRoute(
    makeJsonRequest("http://local.test/api/admin/distribution/flags", "PATCH", {
      distribution_enabled: true,
      channels: {
        telegram: { enabled: true, chats: ["-100TESTE123"] },
        whatsapp: { enabled: false, groups: [] },
        instagram: { enabled: false },
      },
    }),
  );

  const distTgRes = await distributeRoute(
    makeJsonRequest("http://local.test/api/tiktok-engine/distribute", "POST", {
      briefing_id: briefingId,
      job_id: jobId || undefined,
      channels: ["whatsapp", "telegram", "instagram"],
    }),
  );
  const distTg = await parseJsonResponse(distTgRes);
  const tgScheduled = Array.isArray(distTg.scheduled) ? distTg.scheduled : [];
  const t2 = distTgRes.status === 200 && tgScheduled.length === 1 && (tgScheduled[0] as JsonValue).channel === "telegram";
  results.push({
    name: "Teste 2 telegram-only",
    passed: t2,
    detail: `HTTP ${distTgRes.status} scheduled=${JSON.stringify(tgScheduled)} skipped=${JSON.stringify(distTg.skipped_channels)}`,
  });

  // TESTE 3: whatsapp + telegram
  await patchFlagsRoute(
    makeJsonRequest("http://local.test/api/admin/distribution/flags", "PATCH", {
      channels: {
        whatsapp: { enabled: true, groups: ["5511999999999"] },
      },
    }),
  );

  const distBothRes = await distributeRoute(
    makeJsonRequest("http://local.test/api/tiktok-engine/distribute", "POST", {
      briefing_id: briefingId,
      job_id: jobId || undefined,
      channels: ["whatsapp", "telegram", "instagram"],
    }),
  );
  const distBoth = await parseJsonResponse(distBothRes);
  const bothScheduled = Array.isArray(distBoth.scheduled) ? distBoth.scheduled : [];
  const channelsBoth = bothScheduled.map((entry) => String((entry as JsonValue).channel));
  const t3 = distBothRes.status === 200 && channelsBoth.includes("telegram") && channelsBoth.includes("whatsapp") && channelsBoth.length === 2;
  results.push({
    name: "Teste 3 multi-canal",
    passed: t3,
    detail: `HTTP ${distBothRes.status} channels=${channelsBoth.join(",")}`,
  });

  // TESTE 4: desligar novamente
  await patchFlagsRoute(
    makeJsonRequest("http://local.test/api/admin/distribution/flags", "PATCH", {
      distribution_enabled: false,
    }),
  );

  const distOffAgainRes = await distributeRoute(
    makeJsonRequest("http://local.test/api/tiktok-engine/distribute", "POST", {
      briefing_id: briefingId,
      job_id: jobId || undefined,
      channels: ["telegram"],
    }),
  );
  const distOffAgain = await parseJsonResponse(distOffAgainRes);
  const t4 = distOffAgainRes.status === 403;
  results.push({
    name: "Teste 4 desligar novamente",
    passed: t4,
    detail: `HTTP ${distOffAgainRes.status} payload=${JSON.stringify(distOffAgain)}`,
  });

  // TESTE 5: fluxo legado bloqueado
  const legacyOffRes = await eliteFlushRoute(
    makeJsonRequest("http://local.test/api/admin/distribution/elite-flush", "POST", {}),
  );
  const legacyOff = await parseJsonResponse(legacyOffRes);
  const t5 = legacyOffRes.status === 403;
  results.push({
    name: "Teste 5 legacy/post_queue bloqueado",
    passed: t5,
    detail: `HTTP ${legacyOffRes.status} payload=${JSON.stringify(legacyOff)}`,
  });

  // TESTE 6A: cron com flags off
  const cronOffRes = await cronDistributeRoute(
    makeJsonRequest("http://local.test/api/cron/distribute-scheduled", "GET", undefined, {
      authorization: `Bearer ${cronSecret}`,
    }),
  );
  const cronOff = await parseJsonResponse(cronOffRes);
  const t6a = cronOffRes.status === 200 && String(cronOff.message ?? "").toLowerCase().includes("desativada");
  results.push({
    name: "Teste 6A cron bloqueado",
    passed: t6a,
    detail: `HTTP ${cronOffRes.status} payload=${JSON.stringify(cronOff)}`,
  });

  // TESTE 6B: cron com telegram ativo
  await patchFlagsRoute(
    makeJsonRequest("http://local.test/api/admin/distribution/flags", "PATCH", {
      distribution_enabled: true,
      channels: {
        telegram: { enabled: true, chats: ["-100TESTE123"] },
        whatsapp: { enabled: false },
        instagram: { enabled: false },
      },
      scheduling: {
        max_posts_per_day: 5,
      },
    }),
  );

  const scheduleRes = await distributeRoute(
    makeJsonRequest("http://local.test/api/tiktok-engine/distribute", "POST", {
      briefing_id: briefingId,
      job_id: jobId || undefined,
      channels: ["telegram"],
    }),
  );
  const schedulePayload = await parseJsonResponse(scheduleRes);
  const scheduleRows = Array.isArray(schedulePayload.scheduled)
    ? (schedulePayload.scheduled as Array<JsonValue>)
    : [];

  if (scheduleRows.length > 0) {
    const scheduledPostId = String(scheduleRows[0].scheduledPostId ?? "");
    if (scheduledPostId) {
      await supabaseAdmin
        .from("tiktok_engine_scheduled_posts")
        .update({
          status: "scheduled",
          scheduled_for: new Date(Date.now() - 60_000).toISOString(),
        })
        .eq("id", scheduledPostId);
    }
  }

  const cronOnRes = await cronDistributeRoute(
    makeJsonRequest("http://local.test/api/cron/distribute-scheduled", "GET", undefined, {
      authorization: `Bearer ${cronSecret}`,
    }),
  );
  const cronOn = await parseJsonResponse(cronOnRes);
  const processed = Number(cronOn.processed ?? 0);
  const t6b = cronOnRes.status === 200 && processed >= 1;
  results.push({
    name: "Teste 6B cron processa com flags on",
    passed: t6b,
    detail: `HTTP ${cronOnRes.status} processed=${processed} payload=${JSON.stringify(cronOn)}`,
  });

  // cleanup final seguro: desligar tudo
  await patchFlagsRoute(
    makeJsonRequest("http://local.test/api/admin/distribution/flags", "PATCH", {
      distribution_enabled: false,
      auto_distribute_on_complete: false,
      channels: {
        whatsapp: { enabled: false, groups: [] },
        telegram: { enabled: false, chats: [] },
        instagram: { enabled: false, post_as_reel: true },
      },
    }),
  );

  const latestDist = await supabaseAdmin
    .from("tiktok_engine_distributions")
    .select("id,channel,status,created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("\n=== RESULTADOS E2E (Feature Flags Distribuição) ===");
  for (const item of results) {
    console.log(`${item.passed ? "✅" : "❌"} ${item.name} -> ${item.detail}`);
  }
  const passed = results.filter((r) => r.passed).length;
  console.log(`\nResumo: ${passed}/${results.length} passaram.`);
  if (latestDist.data) {
    console.log("\nÚltimas distribuições (amostra):");
    for (const row of latestDist.data) {
      console.log(`- id=${row.id} channel=${row.channel} status=${row.status} created_at=${row.created_at}`);
    }
  }
}

run().catch((error) => {
  console.error("Falha ao executar E2E:", error);
  process.exit(1);
});
