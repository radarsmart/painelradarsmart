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
const { deriveLearningSegments } = require("../lib/opportunity-engine/learning-segments.ts");
const {
  aggregatePerformanceMetrics,
  calculateInternalPerformanceScore,
  internalPerformanceScoreForOpportunity,
} = require("../lib/opportunity-engine/learning-engine-service.ts");

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
  await test("1 - segmentos cobrem cold start por categoria/preco/canal", async () => {
    const product = normalizeProduct({ title: "Air Fryer Mondial AFN-50-BI 5L 127V", brand: "Mondial", model: "AFN-50-BI" });
    const segments = deriveLearningSegments({
      normalizedProduct: product,
      channel: "whatsapp",
      publishedAt: "2026-08-13T19:30:00.000Z",
      offer: {
        marketplace: "mercadolivre",
        effective_price: 359.9,
        discount_pct: 25,
        pix_price: 359.9,
        installment_count: 10,
        installment_interest_free: true,
      },
    });

    assert.equal(segments[0].level, "exact");
    assert.equal(segments[0].category, "appliance");
    assert.equal(segments[0].channel, "whatsapp");
    assert.equal(segments[0].price_range, "300-450");
    assert.equal(segments[0].payment_profile, "pix-plus-installments");
    assert.ok(segments.some((segment) => segment.level === "category_price_channel"));
    assert.ok(segments.some((segment) => segment.level === "category"));
  });

  await test("2 - agregacao preserva metricas reais e nao inventa conversao", async () => {
    const aggregate = aggregatePerformanceMetrics({
      events: [
        { event_type: "impression", channel: "site", created_at: "2026-08-13T18:00:00.000Z" },
        { event_type: "impression", channel: "site", created_at: "2026-08-13T18:01:00.000Z" },
        { event_type: "order", channel: "site", quantity: 2, revenue: 300, commission: 30, created_at: "2026-08-13T18:05:00.000Z" },
      ],
      clicks: [
        { source: "vitrine_card", created_at: "2026-08-13T18:03:00.000Z" },
      ],
    });

    assert.equal(aggregate.impressions, 2);
    assert.equal(aggregate.affiliate_clicks, 1);
    assert.equal(aggregate.orders, 1);
    assert.equal(aggregate.units_sold, 2);
    assert.equal(aggregate.revenue, 300);
    assert.equal(aggregate.commission, 30);
    assert.equal(aggregate.ctr, 50);
    assert.equal(aggregate.conversion_rate, 100);
  });

  await test("3 - amostra robusta gera score e confidence altos", async () => {
    const result = calculateInternalPerformanceScore({
      impressions: 2314,
      views: null,
      clicks: 183,
      affiliate_clicks: 183,
      orders: 14,
      units_sold: 16,
      revenue: 2200,
      commission: 280,
      ctr: 7.91,
      conversion_rate: 7.65,
      earnings_per_click: 1.53,
      revenue_per_click: 12.02,
    }, new Date().toISOString());

    assert.ok(result.internal_performance_score >= 85, JSON.stringify(result));
    assert.ok(result.internal_performance_confidence >= 80, JSON.stringify(result));
    assert.equal(internalPerformanceScoreForOpportunity(result), result.internal_performance_score);
  });

  await test("4 - amostra pequena pode ter score alto mas nao pesa no Opportunity", async () => {
    const result = calculateInternalPerformanceScore({
      impressions: 12,
      views: null,
      clicks: 2,
      affiliate_clicks: 2,
      orders: null,
      units_sold: null,
      revenue: null,
      commission: null,
      ctr: 16.67,
      conversion_rate: null,
      earnings_per_click: null,
      revenue_per_click: null,
    }, new Date().toISOString());

    assert.ok(result.internal_performance_score !== null);
    assert.ok(result.internal_performance_confidence < 35, JSON.stringify(result));
    assert.equal(internalPerformanceScoreForOpportunity(result), null);
  });

  await test("5 - teste unitario nao chama rede externa", async () => {
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
