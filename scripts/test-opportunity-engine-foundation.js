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
const { normalizePaymentTerms, getPaymentSummary, buildOfferPresentation } = require("../lib/opportunity-engine/price-normalizer.ts");
const { compareMarketOffers } = require("../lib/opportunity-engine/market-comparison-service.ts");
const { calculateRadarRealDiscount } = require("../lib/opportunity-engine/price-history.ts");
const { evaluatePublishingGate } = require("../lib/opportunity-engine/publishing-gate-service.ts");

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

function daysAgo(days, base = new Date("2026-08-13T12:00:00.000Z")) {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function run() {
  await test("1 - mesmo produto Mondial AFN-50-BI 5L tem match alto", async () => {
    const result = matchProducts(
      { title: "Air Fryer Mondial Family AFN-50-BI 5L 1900W 127V" },
      { title: "Fritadeira Mondial AFN50BI Family Inox 5 Litros 1900 W 110V" },
    );
    assert.ok(result.match_score >= 80, JSON.stringify(result));
    assert.notEqual(result.match_status, "REJECTED");
  });

  await test("2 - iPhone 16 128GB vs 256GB nao e mesmo SKU", async () => {
    const result = matchProducts(
      { title: "Apple iPhone 16 128GB Preto" },
      { title: "Apple iPhone 16 256GB Preto" },
    );
    assert.equal(result.match_status, "REJECTED");
    assert.ok(result.conflicts.some((conflict) => conflict.includes("storage_gb")));
  });

  await test("3 - perfume 50ml vs 100ml gera conflito de volume", async () => {
    const result = matchProducts(
      { title: "Perfume Natura Kaiak Masculino 50ml" },
      { title: "Perfume Natura Kaiak Masculino 100ml" },
    );
    assert.equal(result.match_status, "REJECTED");
    assert.ok(result.conflicts.some((conflict) => conflict.includes("volume_ml")));
  });

  await test("4 - kit 3 calcula unit_price corretamente", async () => {
    const payment = normalizePaymentTerms({ price: 49.9, quantity: 3 });
    assert.equal(payment.effective_price, 49.9);
    assert.equal(payment.unit_price, 16.63);
    assert.equal(payment.unit_price_basis, "unit");
  });

  await test("5 - PIX explicito na apresentacao", async () => {
    const payment = normalizePaymentTerms({
      regular_price: 399.9,
      pix_price: 359.9,
      card_price: 399.9,
      installment_count: 10,
      installment_amount: 39.99,
      installment_interest_free: true,
    });
    const summary = getPaymentSummary(payment).replace(/\s/g, " ");
    assert.ok(summary.includes("R$ 359,90 no PIX"), summary);
    assert.ok(summary.includes("10x de R$ 39,99 no cartão de crédito sem juros"), summary);
    const presentation = buildOfferPresentation(payment);
    assert.equal(presentation.headline_price.replace(/\s/g, " "), "R$ 359,90 no PIX");
  });

  await test("6 - frete entra no effective_price e muda melhor oferta", async () => {
    const comparison = compareMarketOffers([
      { id: "a", marketplace: "amazon", price: 299, shipping_cost: 0 },
      { id: "b", marketplace: "mercadolivre", price: 269, shipping_cost: 47 },
    ]);
    assert.equal(comparison.best_offer_id, "a");
    assert.equal(comparison.lowest_effective_price, 299);
  });

  await test("7 - desconto falso difere desconto informado de Radar Real Discount", async () => {
    const result = calculateRadarRealDiscount({
      current_effective_price: 399,
      now: new Date("2026-08-13T12:00:00.000Z"),
      history: [
        { effective_price: 405, captured_at: daysAgo(3) },
        { effective_price: 406, captured_at: daysAgo(7) },
        { effective_price: 404, captured_at: daysAgo(14) },
        { effective_price: 405, captured_at: daysAgo(21) },
      ],
    });
    assert.equal(result.reference_window_days, 30);
    assert.ok(result.radar_real_discount_pct > 1 && result.radar_real_discount_pct < 2, JSON.stringify(result));
  });

  await test("8 - Publishing Gate bloqueia sem estoque mesmo com score 95", async () => {
    const gate = evaluatePublishingGate({
      title: "Oferta real",
      price: 99,
      affiliate_url: "https://radarsmart.com.br/go/abc",
      stock_status: "out_of_stock",
      opportunity_score: 95,
    });
    assert.equal(gate.status, "BLOCKED");
    assert.ok(gate.reasons.some((reason) => reason.includes("Estoque indisponivel")));
  });

  await test("9 - condition compatible nao equivale a produto novo original", async () => {
    const normalized = normalizeProduct({ title: "Carregador compativel iPhone 16 128GB" });
    assert.equal(normalized.condition, "COMPATIBLE");
    const gate = evaluatePublishingGate({
      title: normalized.title_original,
      price: 59.9,
      affiliate_url: "https://radarsmart.com.br/go/abc",
      condition: normalized.condition,
    });
    assert.equal(gate.status, "BLOCKED");
  });

  await test("10 - camada pura nao chama rede", async () => {
    assert.equal(fetchCalls, 0);
  });

  await test("11 - normalizador corrige Pix maior que preco principal do ML", async () => {
    const payment = normalizePaymentTerms({
      price: 95.92,
      regular_price: 95.92,
      pix_price: 119.9,
      cash_price: 119.9,
      installment_count: 6,
      installment_amount: 19.98,
      installment_interest_free: true,
    });

    assert.equal(payment.regular_price, 95.92);
    assert.equal(payment.pix_price, 95.92);
    assert.equal(payment.cash_price, 95.92);
    assert.equal(payment.card_price, 119.88);
    assert.equal(payment.installments, 6);
    assert.equal(payment.installment_value, 19.98);
    assert.equal(payment.interest_free, true);
  });

  const failed = results.filter((result) => result.status === "FAIL");
  for (const result of results) {
    console.log(`${result.status === "PASS" ? "OK  " : "FAIL"} - ${result.name}${result.error ? ` :: ${result.error}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram. fetchCalls=${fetchCalls}`);
  if (failed.length > 0) process.exitCode = 1;
}

run();
