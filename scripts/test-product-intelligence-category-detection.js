// Radar Creative AI - Product Intelligence Category Detection V2 - Test Suite
//
// Mesmo padrao dos scripts anteriores: sem Jest, transpile on-the-fly,
// fetch bloqueado. Cobre os 8 casos pedidos (item 4 do pedido) + o caso
// real generalizado (nunca hardcodado) que reproduz o bug real do Kokeshi.

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

const { detectCategoryWithEvidence } = require("../lib/product-intelligence/category-detection.ts");
const { analyzeProductWithClaimsAudit } = require("../lib/product-intelligence/analyze.ts");

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

function offer(title, category) {
  return { id: "fixture", title, category: category ?? null };
}

async function run() {
  await test("1 - creme facial com colageno -> beleza", async () => {
    const result = detectCategoryWithEvidence(offer("Creme Facial Hidratante com Colágeno"));
    assert.equal(result.category, "beleza");
    assert.equal(result.status, "CONFIDENT");
  });

  await test("2 - serum facial -> beleza", async () => {
    const result = detectCategoryWithEvidence(offer("Sérum Facial Antioxidante Vitamina C"));
    assert.equal(result.category, "beleza");
    assert.equal(result.status, "CONFIDENT");
  });

  await test("3 - mascara facial -> beleza", async () => {
    const result = detectCategoryWithEvidence(offer("Máscara Facial de Argila Purificante"));
    assert.equal(result.category, "beleza");
  });

  await test("4 - colageno em po -> suplementos", async () => {
    const result = detectCategoryWithEvidence(offer("Colágeno em Pó Sabor Neutro 300g"));
    assert.equal(result.category, "suplementos");
    assert.equal(result.status, "CONFIDENT");
  });

  await test("5 - whey -> suplementos", async () => {
    const result = detectCategoryWithEvidence(offer("Whey Protein Isolado 900g"));
    assert.equal(result.category, "suplementos");
  });

  await test("6 - creatina -> suplementos", async () => {
    const result = detectCategoryWithEvidence(offer("Creatina Monohidratada Pura 300g"));
    assert.equal(result.category, "suplementos");
  });

  await test("7 - produto ambiguo (creme de colageno, sem sinal forte de nenhum lado) -> UNKNOWN/AMBIGUOUS, nunca escolhido arbitrariamente", async () => {
    const result = detectCategoryWithEvidence(offer("Creme de Colágeno"));
    assert.equal(result.category, "geral");
    assert.equal(result.status, "AMBIGUOUS");
  });

  await test("8 - palavra isolada (colageno) nunca domina sinal forte contrario (caso REAL generalizado do bug Kokeshi, sem hardcode)", async () => {
    const result = detectCategoryWithEvidence(offer("Creme Gel Regenerador Facial Gota de Colágeno Kokeshi"));
    assert.equal(result.category, "beleza", `esperado beleza, obtido ${result.category} - evidence=${JSON.stringify(result.evidence)}`);
    assert.equal(result.status, "CONFIDENT");
    const suplementosEvidence = result.evidence.find((e) => e.category === "suplementos");
    assert.ok(!suplementosEvidence || suplementosEvidence.matchedStrongSignals.length === 0, "suplementos nao deveria ter nenhum sinal FORTE para este produto");
  });

  await test("9 - produto totalmente sem sinal -> UNKNOWN (nunca inventa geral com falsa confianca)", async () => {
    const result = detectCategoryWithEvidence(offer("Item XPTO-9000"));
    assert.equal(result.category, "geral");
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.confidence, "UNKNOWN");
  });

  await test("10 - analyzeProductWithClaimsAudit expõe categoryDetection (aditivo) e usa a categoria corrigida", async () => {
    const { draft, categoryDetection } = analyzeProductWithClaimsAudit(offer("Sérum Facial Antioxidante com Colágeno"));
    assert.equal(draft.category, "beleza");
    assert.equal(categoryDetection.category, "beleza");
    assert.equal(categoryDetection.status, "CONFIDENT");
  });

  await test("11 - eletronicos/pet/moda continuam funcionando normalmente (regressao das categorias nao tocadas pela ambiguidade)", async () => {
    assert.equal(detectCategoryWithEvidence(offer("Fone de Ouvido Bluetooth")).category, "eletronicos");
    assert.equal(detectCategoryWithEvidence(offer("Ração para Gatos Adultos")).category, "pet");
    assert.equal(detectCategoryWithEvidence(offer("Tênis Esportivo Confort")).category, "moda");
  });

  await test("12 - determinismo (mesma entrada produz o mesmo resultado)", async () => {
    const a = detectCategoryWithEvidence(offer("Creme Facial com Colágeno"));
    const b = detectCategoryWithEvidence(offer("Creme Facial com Colágeno"));
    assert.deepEqual(a, b);
  });

  const failed = results.filter((r) => r.status === "FAIL");
  for (const r of results) {
    console.log(`${r.status === "PASS" ? "OK  " : "FAIL"} - ${r.name}${r.error ? ` :: ${r.error}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram. fetchCalls=${fetchCalls}`);
  if (failed.length > 0) process.exitCode = 1;
}

run();
