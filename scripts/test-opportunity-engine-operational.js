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

let fetchCalls = 0;
global.fetch = async () => {
  fetchCalls += 1;
  throw new Error("External calls are forbidden in this test.");
};

const { calculateRadarOpportunityScore } = require("../lib/opportunity-engine/opportunity-score.ts");
const { evaluatePublishingGate } = require("../lib/opportunity-engine/publishing-gate-service.ts");
const { getOpportunityEngineFlags, shouldEnforceOpportunityGate } = require("../lib/opportunity-engine/feature-flags.ts");
const { enqueueOpportunityEvaluation } = require("../lib/opportunity-engine/evaluation-queue.ts");

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

function withEnv(updates, fn) {
  const previous = {};
  for (const key of Object.keys(updates)) {
    previous[key] = process.env[key];
    if (updates[key] === undefined) delete process.env[key];
    else process.env[key] = updates[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(updates)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function createMockClient() {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push({ method: "from", table });
      return {
        upsert(payload, options) {
          calls.push({ method: "upsert", payload, options });
          return {
            select(columns) {
              calls.push({ method: "select", columns });
              return {
                async single() {
                  calls.push({ method: "single" });
                  return { data: { id: "job-1" }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function run() {
  await test("1 - score_components persistem score, peso e contribution", async () => {
    const result = calculateRadarOpportunityScore({
      trend_score: 80,
      purchase_intent_score: 90,
      payment_attractiveness: 70,
    });
    assert.equal(result.score_components.trend_score.score, 80);
    assert.equal(result.score_components.trend_score.weight, 0.2);
    assert.equal(result.score_components.trend_score.contribution, 16);
    assert.equal(result.score_components.market_price_advantage.status, "unavailable");
  });

  await test("2 - ausencia de trend/purchase fica null/unavailable, nao zero", async () => {
    const result = calculateRadarOpportunityScore({
      payment_attractiveness: 90,
      market_price_advantage: 80,
    });
    assert.equal(result.score_components.trend_score.score, null);
    assert.equal(result.score_components.trend_score.status, "unavailable");
    assert.equal(result.score_components.purchase_intent_score.score, null);
    assert.ok(result.warnings.some((warning) => warning.includes("trend_score unavailable")));
  });

  await test("3 - confidence e data completeness ficam abaixo de 100 com poucos sinais", async () => {
    const result = calculateRadarOpportunityScore({
      payment_attractiveness: 90,
      market_price_advantage: 80,
    });
    assert.ok(result.data_completeness_score > 0);
    assert.ok(result.data_completeness_score < 100);
    assert.equal(result.confidence, result.data_completeness_score);
  });

  await test("4 - PublishingGate exige confidence minimo quando score tenta autopublicar", async () => {
    const gate = withEnv({ AUTO_PUBLISH_MIN_SCORE: "72", AUTO_PUBLISH_MIN_CONFIDENCE: "70" }, () =>
      evaluatePublishingGate({
        title: "Oferta real",
        price: 100,
        affiliate_url: "https://radarsmart.com.br/go/abc",
        opportunity_score: 95,
        opportunity_confidence: 40,
      }),
    );
    assert.equal(gate.status, "REVIEW_REQUIRED");
    assert.ok(gate.warnings.some((warning) => warning.includes("Confidence abaixo")));
  });

  await test("5 - feature flag mode off/shadow/enforce", async () => {
    withEnv({ OPPORTUNITY_ENGINE_MODE: "off", OPPORTUNITY_ENGINE_ENABLED: undefined, PUBLISHING_GATE_ENABLED: undefined }, () => {
      const flags = getOpportunityEngineFlags();
      assert.equal(flags.OPPORTUNITY_ENGINE_MODE, "off");
      assert.equal(flags.OPPORTUNITY_EVALUATION_ENABLED, false);
      assert.equal(shouldEnforceOpportunityGate(), false);
    });
    withEnv({ OPPORTUNITY_ENGINE_MODE: "shadow" }, () => {
      const flags = getOpportunityEngineFlags();
      assert.equal(flags.OPPORTUNITY_ENGINE_MODE, "shadow");
      assert.equal(flags.OPPORTUNITY_EVALUATION_ENABLED, true);
      assert.equal(shouldEnforceOpportunityGate(), false);
    });
    withEnv({ OPPORTUNITY_ENGINE_MODE: "enforce" }, () => {
      const flags = getOpportunityEngineFlags();
      assert.equal(flags.OPPORTUNITY_ENGINE_MODE, "enforce");
      assert.equal(flags.PUBLISHING_GATE_ENABLED, true);
      assert.equal(shouldEnforceOpportunityGate(), true);
    });
  });

  await test("6 - enqueue usa upsert idempotente por offer_id,dedupe_key", async () => {
    const client = createMockClient();
    const jobId = await enqueueOpportunityEvaluation(client, {
      offerId: "offer-1",
      reason: "test",
    });
    assert.equal(jobId, "job-1");
    const upsert = client.calls.find((call) => call.method === "upsert");
    assert.equal(upsert.options.onConflict, "offer_id,dedupe_key");
    assert.equal(upsert.payload.status, "queued");
  });

  await test("7 - operational layer nao chama rede externa", async () => {
    assert.equal(fetchCalls, 0);
  });

  const failed = results.filter((result) => result.status === "FAIL");
  for (const result of results) {
    console.log(`${result.status === "PASS" ? "OK  " : "FAIL"} - ${result.name}${result.error ? ` :: ${result.error}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram. fetchCalls=${fetchCalls}`);
  if (failed.length > 0) process.exitCode = 1;
}

run();
