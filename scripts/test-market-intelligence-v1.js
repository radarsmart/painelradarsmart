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
const { matchProducts } = require("../lib/opportunity-engine/product-matching-service.ts");
const { normalizePaymentTerms } = require("../lib/opportunity-engine/price-normalizer.ts");
const { buildPrimaryProductSearchQuery } = require("../lib/opportunity-engine/product-search-query-builder.ts");
const { compareMarketOffers } = require("../lib/opportunity-engine/market-comparison-service.ts");

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
  await test("1 - query builder usa marca, modelo e atributos criticos", async () => {
    const product = normalizeProduct({
      title: "Air Fryer Mondial Family AFN-50-BI 5L 1900W 127V",
      brand: "Mondial",
      model: "AFN-50-BI",
    });
    const query = buildPrimaryProductSearchQuery(product);
    assert.ok(query, "query ausente");
    assert.equal(query.strategy, "brand_model_attributes");
    assert.match(query.query, /Mondial/i);
    assert.match(query.query, /AFN-50-BI/i);
    assert.match(query.query, /5L/i);
    assert.match(query.query, /127V/i);
    assert.doesNotMatch(query.query, /^air fryer$/i);
  });

  await test("2 - query builder prioriza GTIN quando existe", async () => {
    const product = normalizeProduct({
      title: "Perfume Natura Kaiak Masculino 100ml",
      ean: "7891234567890",
    });
    const query = buildPrimaryProductSearchQuery(product);
    assert.ok(query, "query ausente");
    assert.equal(query.strategy, "gtin");
    assert.equal(query.query, "7891234567890");
  });

  await test("3 - falsos comparativos de SKU continuam rejeitados", async () => {
    const cases = [
      [
        { title: "Apple iPhone 16 128GB Preto" },
        { title: "Apple iPhone 16 256GB Preto" },
        "storage_gb",
      ],
      [
        { title: "Perfume Natura Kaiak Masculino 50ml" },
        { title: "Perfume Natura Kaiak Masculino 100ml" },
        "volume_ml",
      ],
      [
        { title: "Air Fryer Mondial AFN-50-BI 5L 127V" },
        { title: "Air Fryer Mondial AFN-50-BI 5L 220V" },
        "voltage",
      ],
      [
        { title: "Filtro original Electrolux unidade" },
        { title: "Kit 3 filtros original Electrolux" },
        "quantity",
      ],
      [
        { title: "Carregador Apple original novo" },
        { title: "Carregador compativel Apple" },
        "condition",
      ],
    ];

    for (const [left, right, conflict] of cases) {
      const result = matchProducts(left, right);
      assert.equal(result.match_status, "REJECTED", JSON.stringify(result));
      assert.ok(result.conflicts.some((item) => item.includes(conflict)), JSON.stringify(result));
    }
  });

  await test("4 - PriceNormalizer preserva PIX, cartao, parcelas, juros e frete", async () => {
    const payment = normalizePaymentTerms({
      regular_price: 399.9,
      pix_price: 359.9,
      card_price: 399.9,
      installment_count: 10,
      installment_amount: 39.99,
      installment_interest_free: true,
      shipping_cost: 12.5,
    });

    assert.equal(payment.regular_price, 399.9);
    assert.equal(payment.pix_price, 359.9);
    assert.equal(payment.card_price, 399.9);
    assert.equal(payment.installments, 10);
    assert.equal(payment.installment_value, 39.99);
    assert.equal(payment.interest_free, true);
    assert.equal(payment.shipping_cost, 12.5);
    assert.equal(payment.effective_price, 372.4);
  });

  await test("5 - comparador separa PIX/cartao/efetivo e ignora outlier baixo", async () => {
    const comparison = compareMarketOffers([
      { id: "radar", marketplace: "radar", pix_price: 359.9, card_price: 399.9, shipping_cost: 0, match_score: 100 },
      { id: "amazon", marketplace: "amazon", pix_price: 379.9, card_price: 389.9, shipping_cost: 0, match_score: 98 },
      { id: "ml", marketplace: "mercadolivre", pix_price: 389, card_price: 399, shipping_cost: 0, match_score: 97 },
      { id: "shopee", marketplace: "shopee", pix_price: 369.9, card_price: 379.9, shipping_cost: 0, match_score: 91 },
      { id: "bad", marketplace: "unknown", pix_price: 99, card_price: 99, shipping_cost: 0, match_score: 92 },
    ], "radar");

    assert.equal(comparison.outlier_count, 1);
    assert.deepEqual(comparison.outlier_offer_ids, ["bad"]);
    assert.equal(comparison.lowest_effective_price, 359.9);
    assert.equal(comparison.lowest_pix_price, 359.9);
    assert.equal(comparison.lowest_card_price, 379.9);
    assert.equal(comparison.median_price, 374.9);
    assert.ok(comparison.market_confidence_score >= 70, JSON.stringify(comparison));
  });

  await test("6 - teste unitario nao chama rede externa", async () => {
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
