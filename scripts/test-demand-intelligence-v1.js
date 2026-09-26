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

const { normalizeProduct } = require("../lib/opportunity-engine/product-normalizer.ts");
const { buildDemandQueries } = require("../lib/opportunity-engine/demand-query-builder.ts");
const { runDemandIntelligence } = require("../lib/opportunity-engine/demand-intelligence-service.ts");

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

function createMockClient(previousTrend = 60) {
  const inserts = [];
  return {
    inserts,
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        gte() {
          return this;
        },
        lt() {
          return this;
        },
        not() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle: async () => ({ data: table === "demand_snapshots" ? { trend_score: previousTrend } : null, error: null }),
        insert(payload) {
          inserts.push(payload);
          return {
            select() {
              return {
                single: async () => ({ data: { id: `snap-${inserts.length}`, ...payload }, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

async function run() {
  await test("1 - query builder gera consultas especificas e comerciais", async () => {
    const product = normalizeProduct({
      title: "Air Fryer Mondial Family AFN-50-BI 5L 127V",
      brand: "Mondial",
      model: "AFN-50-BI",
    });
    const queries = buildDemandQueries(product).map((item) => item.query);
    assert.ok(queries.includes("Mondial AFN-50-BI"));
    assert.ok(queries.includes("Mondial AFN-50-BI preco"));
    assert.ok(queries.includes("Mondial AFN-50-BI promocao"));
    assert.ok(queries.includes("Mondial AFN-50-BI comprar"));
    assert.ok(queries.includes("Mondial AFN-50-BI cupom"));
    assert.ok(queries.includes("Mondial AFN-50-BI vale a pena"));
    assert.ok(!queries.includes("air fryer"));
  });

  await test("2 - sem provider nao inventa trend nem purchase intent", async () => {
    const client = createMockClient();
    const product = normalizeProduct({ title: "Air Fryer Mondial AFN-50-BI 5L", brand: "Mondial", model: "AFN-50-BI" });
    const result = await runDemandIntelligence(client, {
      offerId: "offer-1",
      canonicalProductId: "canonical-1",
      product,
      providers: [],
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.trend_score, null);
    assert.equal(result.purchase_intent_score, null);
    assert.equal(result.demand_confidence_score, 0);
  });

  await test("3 - agrega trend e purchase intent separadamente", async () => {
    const client = createMockClient(70);
    const product = normalizeProduct({ title: "Air Fryer Mondial AFN-50-BI 5L", brand: "Mondial", model: "AFN-50-BI" });
    const provider = {
      name: "mock-demand",
      type: "search_interest",
      async search(input) {
        return {
          provider: "mock-demand",
          status: "success",
          metrics: [
            {
              provider_type: "search_interest",
              query: input.queries[0].query,
              query_intent: "base",
              interest_score: 95,
              search_demand_score: null,
              marketplace_popularity_score: null,
              social_score: null,
              trend_score: 95,
              trend_velocity: null,
              purchase_intent_score: 42,
              confidence: 90,
              status: "available",
              captured_at: "2026-08-13T22:00:00.000Z",
              raw_payload: {},
            },
          ],
        };
      },
    };

    const result = await runDemandIntelligence(client, {
      offerId: "offer-1",
      canonicalProductId: "canonical-1",
      product,
      providers: [provider],
      forceRefresh: true,
    });
    assert.equal(result.trend_score, 95);
    assert.equal(result.purchase_intent_score, 42);
    assert.equal(result.trend_velocity, 35.71);
    assert.ok(result.demand_confidence_score >= 70, JSON.stringify(result));
  });

  await test("4 - teste unitario nao chama rede externa", async () => {
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
