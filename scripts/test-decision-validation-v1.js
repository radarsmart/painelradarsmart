const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(root, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function loadTs(mod, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

const {
  calculateActualValueScore,
  calculateInitialExpectedValue,
  calculateSampleConfidence,
  classifyPrediction,
  confidenceBucket,
  recommendedAction,
  scoreBucket,
  summarizeDecisionOutcomes,
} = require("../lib/opportunity-engine/decision-validation-service.ts");

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

async function run() {
  await test("1 - buckets separam score e confidence para calibracao", async () => {
    assert.equal(scoreBucket(39), "0-39");
    assert.equal(scoreBucket(72), "72-79");
    assert.equal(scoreBucket(91), "90-100");
    assert.equal(confidenceBucket(34), "0-34");
    assert.equal(confidenceBucket(60), "60-79");
    assert.equal(confidenceBucket(99), "80-100");
  });

  await test("2 - acao recomendada respeita gate e classificacao", async () => {
    assert.equal(recommendedAction({ classification: "PUBLISH_NOW", publishingGateStatus: "APPROVED" }), "publish_now");
    assert.equal(recommendedAction({ classification: "PUBLISH", publishingGateStatus: "APPROVED" }), "publish");
    assert.equal(recommendedAction({ classification: "WATCH", publishingGateStatus: "REVIEW_REQUIRED" }), "review_required");
    assert.equal(recommendedAction({ classification: "PUBLISH_NOW", publishingGateStatus: "BLOCKED" }), "reject");
  });

  await test("3 - expected value inicial usa predicao sem inventar receita", async () => {
    const expected = calculateInitialExpectedValue({
      opportunity_score: 90,
      opportunity_confidence: 80,
      market_price_advantage: 92,
      purchase_intent_score: 88,
      internal_performance_score: null,
    });

    assert.ok(expected.expected_value >= 85);
    assert.equal(expected.components.opportunity_score, 90);
    assert.equal(expected.components.opportunity_confidence, 80);
    assert.equal(expected.components.signal_average, 90);
  });

  await test("4 - actual value e confidence penalizam amostra pequena", async () => {
    const tiny = {
      impressions: 12,
      views: null,
      clicks: 2,
      affiliate_clicks: null,
      orders: null,
      units_sold: null,
      revenue: null,
      commission: null,
      ctr: 2 / 12,
      conversion_rate: null,
      earnings_per_click: null,
      revenue_per_click: null,
    };
    const robust = {
      impressions: 2314,
      views: null,
      clicks: 183,
      affiliate_clicks: 183,
      orders: 14,
      units_sold: 14,
      revenue: 4200,
      commission: 420,
      ctr: 183 / 2314,
      conversion_rate: 14 / 183,
      earnings_per_click: 420 / 183,
      revenue_per_click: 4200 / 183,
    };

    assert.ok(calculateSampleConfidence(tiny) <= 30);
    assert.ok(calculateSampleConfidence(robust) >= 80);
    assert.ok(calculateActualValueScore(robust) > calculateActualValueScore(tiny));
  });

  await test("5 - prediction vs actual separa falsos positivos e verdadeiros positivos", async () => {
    assert.deepEqual(
      classifyPrediction({
        recommended_action: "publish",
        prediction_score: 88,
        prediction_confidence: 82,
        actual_value_score: 71,
        sample_confidence: 80,
      }),
      { prediction_result: "true_positive", hit: true, outcome_status: "available" },
    );
    assert.deepEqual(
      classifyPrediction({
        recommended_action: "publish",
        prediction_score: 88,
        prediction_confidence: 82,
        actual_value_score: 34,
        sample_confidence: 80,
      }),
      { prediction_result: "false_positive", hit: false, outcome_status: "available" },
    );
    assert.deepEqual(
      classifyPrediction({
        recommended_action: "watch",
        prediction_score: 62,
        prediction_confidence: 40,
        actual_value_score: 75,
        sample_confidence: 80,
      }),
      { prediction_result: "false_negative", hit: false, outcome_status: "available" },
    );
  });

  await test("6 - resumo calcula acerto por score, confidence, canal e thresholds", async () => {
    const base = {
      decision_snapshot_id: "snapshot",
      evaluation_id: "evaluation",
      offer_id: "offer",
      canonical_product_id: "product",
      evaluation_window: "24h",
      window_started_at: "2026-08-13T00:00:00.000Z",
      window_ended_at: "2026-08-14T00:00:00.000Z",
      category: "appliance",
      marketplace: "mercadolivre",
      expected_value: 85,
      prediction_confidence: 80,
      confidence_bucket: "80-100",
      outcome_status: "available",
      sample_confidence: 80,
      impressions: 1000,
      views: null,
      clicks: 80,
      affiliate_clicks: 70,
      orders: 5,
      units_sold: 5,
      revenue: 1200,
      commission: 120,
      ctr: 0.08,
      conversion_rate: 0.071,
      earnings_per_click: 1.71,
      revenue_per_click: 17.14,
    };
    const rows = [
      {
        ...base,
        decision_snapshot_id: "s1",
        offer_id: "o1",
        channel: "all",
        prediction_score: 88,
        prediction_bucket: "80-89",
        actual_value_score: 72,
        prediction_result: "true_positive",
        hit: true,
      },
      {
        ...base,
        decision_snapshot_id: "s2",
        offer_id: "o2",
        channel: "all",
        prediction_score: 88,
        prediction_bucket: "80-89",
        actual_value_score: 35,
        prediction_result: "false_positive",
        hit: false,
      },
      {
        ...base,
        decision_snapshot_id: "s3",
        offer_id: "o3",
        channel: "whatsapp",
        prediction_score: 88,
        prediction_bucket: "80-89",
        actual_value_score: 90,
        prediction_result: "true_positive",
        hit: true,
      },
    ];

    const summary = summarizeDecisionOutcomes(rows, {
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-08-14T00:00:00.000Z",
    });

    assert.equal(summary.score_bucket_accuracy[0].key, "80-89");
    assert.equal(summary.score_bucket_accuracy[0].hit_rate, 50);
    assert.equal(summary.confidence_bucket_accuracy[0].key, "80-100");
    assert.equal(summary.channel_performance[0].key, "whatsapp");
    assert.equal(summary.category_performance[0].key, "appliance");
    assert.ok(summary.threshold_recommendations.some((row) => row.threshold === 72));
    assert.equal(summary.expected_vs_actual.average_actual_value, 53.5);
  });

  const failed = results.filter((result) => result.status === "FAIL");
  for (const result of results) {
    console.log(`${result.status} ${result.name}${result.error ? ` - ${result.error}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} tests passed`);
  if (failed.length) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
