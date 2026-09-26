// Radar Creative AI - PRODUCT INTELLIGENCE GROUNDING & CONTAMINATION GUARD V1 - Test Suite
//
// Mesmo padrao dos scripts anteriores desta sessao: sem Jest, transpile
// on-the-fly, fetch bloqueado. Cobre identity/category/claim grounding,
// contamination score, gate, cleaned-input-adapter, environment trace, e
// (o mais importante, item 17 do pedido) os 8 fixtures anti-gaming A-H.

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

const { DOMAIN_CLUSTERS, detectClustersInText, clustersWithHits } = require("../lib/product-intelligence-grounding/domain-clusters.ts");
const { buildProductIdentityProfile } = require("../lib/product-intelligence-grounding/product-identity-profile.ts");
const { groundProductCategory } = require("../lib/product-intelligence-grounding/category-grounding.ts");
const { groundProductIntelligenceClaims } = require("../lib/product-intelligence-grounding/claim-domain-grounding.ts");
const { scoreProductIntelligenceContamination } = require("../lib/product-intelligence-grounding/contamination-score.ts");
const { buildGroundedProductIntelligence } = require("../lib/product-intelligence-grounding/grounded-product-intelligence.ts");
const { buildCleanedProductIntelligenceInput } = require("../lib/product-intelligence-grounding/cleaned-input-adapter.ts");
const { buildProductIntelligenceGroundingGate } = require("../lib/product-intelligence-grounding/grounding-gate.ts");
const { buildRemoteDataRepairRecommendation, buildKnownCodeDefectFindings } = require("../lib/product-intelligence-grounding/remote-data-repair-recommendation.ts");
const { buildEnvironmentContaminationTrace } = require("../lib/product-intelligence-grounding/environment-contamination-trace.ts");
const { selectVisualStyle } = require("../lib/commercial-director/creative-style.ts");
const {
  FIXTURE_A_OFFER, FIXTURE_A_PACKAGING, FIXTURE_A_PI,
  FIXTURE_B_OFFER, FIXTURE_B_PACKAGING, FIXTURE_B_PI,
  FIXTURE_C_OFFER, FIXTURE_C_PACKAGING, FIXTURE_C_PI,
  FIXTURE_D_OFFER, FIXTURE_D_PACKAGING, FIXTURE_D_PI,
  FIXTURE_E_OFFER, FIXTURE_E_PACKAGING, FIXTURE_E_PI,
  FIXTURE_F_OFFER, FIXTURE_F_PACKAGING, FIXTURE_F_PI,
  FIXTURE_G_OFFER, FIXTURE_G_PACKAGING, FIXTURE_G_PI,
  FIXTURE_H_OFFER, FIXTURE_H_PACKAGING, FIXTURE_H_PI,
} = require("../lib/product-intelligence-grounding/anti-gaming-fixtures.ts");

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

// Dados REAIS da campanha Kokeshi (ja verificados nesta sessao) -
// reproduzidos como fixture, nao re-consultados aqui.
const KOKESHI_OFFER = { title: "Creme Gel Regenerador Facial Gota de Colágeno Kokeshi", price: 13.16, originalPrice: null, discountPct: 0, marketplace: "tiktokshop", brand: null };
const KOKESHI_PACKAGING = [
  { text: "ÓLEO DE COPAÍBA", observedVia: "frame-0-0pct.png" },
  { text: "Firmeza", observedVia: "frame-0-0pct.png" },
  { text: "Densidade", observedVia: "frame-0-0pct.png" },
  { text: "Textura leve, rápida absorção", observedVia: "frame-0-0pct.png" },
  { text: "Creme Gel Gota de Colágeno", observedVia: "frame-0-0pct.png" },
  { text: "FACIAL", observedVia: "frame-0-0pct.png" },
  { text: "45g", observedVia: "frame-0-0pct.png" },
];
const KOKESHI_PI = {
  category: "suplementos",
  painPoints: ["falta de energia ou resultado lento no treino", "dificuldade de manter consistencia na rotina", "preco alto dos suplementos de marca conhecida"],
  desires: ["ver resultado fisico mais rapido", "ter mais disposicao no dia a dia", "economizar sem abrir mao de qualidade"],
  objections: ["duvida se funciona de verdade", "medo de efeito colateral ou produto sem procedencia", "achar caro para testar sem garantia"],
  purchaseMotivations: ["prova social (avaliacoes)", "preco abaixo do usual", "urgencia de estoque"],
  keyBenefits: ["praticidade no consumo diario"],
  emotionalBenefits: ["confianca no proprio corpo", "sensacao de disciplina e progresso"],
  functionalBenefits: ["mais energia", "recuperacao muscular", "suporte nutricional"],
};

async function run() {
  // ===================== DOMAIN CLUSTERS =====================

  await test("1 - DOMAIN_CLUSTERS tem exatamente 7 clusters genericos, nenhum menciona produto especifico", async () => {
    const ids = Object.keys(DOMAIN_CLUSTERS);
    assert.equal(ids.length, 7);
    for (const id of ids) {
      const all = [...DOMAIN_CLUSTERS[id].identityKeywords, ...DOMAIN_CLUSTERS[id].domainLanguageKeywords].join(" ");
      assert.ok(!all.toLowerCase().includes("kokeshi"));
    }
  });

  await test("2 - detectClustersInText detecta SKINCARE no titulo real Kokeshi", async () => {
    const hits = detectClustersInText(KOKESHI_OFFER.title, (c) => c.identityKeywords);
    assert.ok(hits.SKINCARE.length > 0);
    assert.ok(clustersWithHits(hits).includes("SKINCARE"));
  });

  // ===================== PRODUCT IDENTITY PROFILE =====================

  let kokeshiIdentity;
  await test("3 - buildProductIdentityProfile detecta SKINCARE com HIGH confidence para o Kokeshi real", async () => {
    kokeshiIdentity = buildProductIdentityProfile(KOKESHI_OFFER, KOKESHI_PI.category, KOKESHI_PACKAGING);
    assert.deepEqual(kokeshiIdentity.identityClusters, ["SKINCARE"]);
    assert.equal(kokeshiIdentity.confidence, "HIGH");
  });

  await test("4 - identity SEM evidencia (sem titulo/embalagem com sinal) fica UNKNOWN, nunca inventa", async () => {
    const identity = buildProductIdentityProfile(FIXTURE_D_OFFER, FIXTURE_D_PI.category, FIXTURE_D_PACKAGING);
    assert.equal(identity.confidence, "UNKNOWN");
    assert.deepEqual(identity.identityClusters, []);
  });

  // ===================== CATEGORY GROUNDING =====================

  let kokeshiCategoryGrounding;
  await test("5 - groundProductCategory: suplementos declarado x SKINCARE real = CONTRADICTED, propoe beleza", async () => {
    kokeshiCategoryGrounding = groundProductCategory(kokeshiIdentity);
    assert.equal(kokeshiCategoryGrounding.status, "CONTRADICTED");
    assert.equal(kokeshiCategoryGrounding.groundedCategoryProposal, "beleza");
  });

  await test("6 - groundProductCategory nunca CONTRADICTED quando identidade e UNKNOWN (vira AMBIGUOUS)", async () => {
    const identity = buildProductIdentityProfile(FIXTURE_D_OFFER, FIXTURE_D_PI.category, FIXTURE_D_PACKAGING);
    const result = groundProductCategory(identity);
    assert.equal(result.status, "AMBIGUOUS");
  });

  // ===================== CLAIM DOMAIN GROUNDING =====================

  let kokeshiClaims;
  await test("7 - groundProductIntelligenceClaims marca claims de treino/consumo-diario como CONTAMINATED para o Kokeshi real (direcional: topico descrito como ingerivel tambem conta)", async () => {
    kokeshiClaims = groundProductIntelligenceClaims(KOKESHI_PI, kokeshiIdentity);
    const contaminated = kokeshiClaims.filter((c) => c.groundingStatus === "CONTAMINATED");
    assert.ok(contaminated.length >= 3, `esperado >=3 contaminadas, obtido ${contaminated.length}`);
    assert.ok(contaminated.some((c) => c.originalText.includes("treino")));
    assert.ok(contaminated.some((c) => c.originalText.includes("recuperacao muscular")));
    assert.ok(contaminated.some((c) => c.originalText.includes("consumo diario")), "creme facial descrito com linguagem de ingestao ('consumo diario') deveria ser CONTAMINATED, nao um falso-hibrido");
  });

  await test("8 - claim que menciona desconto com discountPct=0 vira CONTRADICTED (nunca CONTAMINATED)", async () => {
    const identity = buildProductIdentityProfile(FIXTURE_H_OFFER, FIXTURE_H_PI.category, FIXTURE_H_PACKAGING);
    const claims = groundProductIntelligenceClaims(FIXTURE_H_PI, identity);
    const discountClaim = claims.find((c) => c.originalText.includes("desconto"));
    assert.equal(discountClaim.groundingStatus, "CONTRADICTED");
  });

  // ===================== CONTAMINATION SCORE =====================

  let kokeshiContamination;
  await test("9 - scoreProductIntelligenceContamination: score alto para o Kokeshi real, audienceMismatch sempre 0 (documentado)", async () => {
    kokeshiContamination = scoreProductIntelligenceContamination(kokeshiCategoryGrounding, kokeshiClaims);
    assert.ok(kokeshiContamination.score >= 50, `esperado score>=50, obtido ${kokeshiContamination.score}`);
    assert.equal(kokeshiContamination.audienceMismatchPoints, 0);
  });

  // ===================== GROUNDED PRODUCT INTELLIGENCE (orquestrador) =====================

  let kokeshiGrounded;
  await test("10 - buildGroundedProductIntelligence: groundingQuality=LOW para o Kokeshi real, quarantine != delete", async () => {
    kokeshiGrounded = buildGroundedProductIntelligence(KOKESHI_OFFER, KOKESHI_PI, KOKESHI_PACKAGING);
    assert.equal(kokeshiGrounded.groundingQuality, "LOW");
    assert.equal(kokeshiGrounded.allClaims.length, kokeshiGrounded.trustedClaims.length + kokeshiGrounded.quarantinedClaims.length + kokeshiGrounded.unknownClaims.length);
    assert.ok(kokeshiGrounded.quarantinedClaims.length > 0);
  });

  // ===================== CLEANED INPUT ADAPTER =====================

  let kokeshiCleanedInput;
  await test("11 - buildCleanedProductIntelligenceInput usa categoria corrigida e so claims trusted (nenhuma de treino/academia)", async () => {
    kokeshiCleanedInput = buildCleanedProductIntelligenceInput(kokeshiGrounded);
    assert.equal(kokeshiCleanedInput.category, "beleza");
    const allText = [...kokeshiCleanedInput.painPoints, ...kokeshiCleanedInput.desires, ...kokeshiCleanedInput.functionalBenefits].join(" ").toLowerCase();
    assert.ok(!allText.includes("treino"));
    assert.ok(!allText.includes("muscular"));
  });

  // ===================== GROUNDING GATE =====================

  await test("12 - buildProductIntelligenceGroundingGate: FAIL para o Kokeshi real, downstreamReady=false", async () => {
    const gate = buildProductIntelligenceGroundingGate(kokeshiGrounded);
    assert.equal(gate.status, "FAIL");
    assert.equal(gate.downstreamReady, false);
    const categoryCheck = gate.checks.find((c) => c.name === "CATEGORY_GROUNDING");
    assert.equal(categoryCheck.status, "FAIL");
  });

  // ===================== REMOTE DATA REPAIR RECOMMENDATION (nunca executado) =====================

  await test("13 - buildRemoteDataRepairRecommendation propoe category=beleza mas NUNCA executa (executed=false)", async () => {
    const recommendation = buildRemoteDataRepairRecommendation("fake-pi-id", kokeshiGrounded);
    assert.equal(recommendation.executed, false);
    assert.equal(recommendation.proposedValue.category, "beleza");
    assert.equal(recommendation.currentValue.category, "suplementos");
  });

  await test("14 - buildRemoteDataRepairRecommendation retorna null quando categoria nao esta CONTRADICTED", async () => {
    const identityA = buildProductIdentityProfile(FIXTURE_A_OFFER, FIXTURE_A_PI.category, FIXTURE_A_PACKAGING);
    const groundedA = buildGroundedProductIntelligence(FIXTURE_A_OFFER, FIXTURE_A_PI, FIXTURE_A_PACKAGING);
    void identityA;
    assert.equal(buildRemoteDataRepairRecommendation("fake-id", groundedA), null);
  });

  await test("15 - buildKnownCodeDefectFindings nunca marca executed=true", async () => {
    const findings = buildKnownCodeDefectFindings();
    assert.ok(findings.length > 0);
    assert.ok(findings.every((f) => f.executed === false));
  });

  // ===================== ENVIRONMENT CONTAMINATION TRACE =====================

  await test("16 - buildEnvironmentContaminationTrace prova a cadeia real via selectVisualStyle (funcao de producao real)", async () => {
    const { style: expectedStyle } = selectVisualStyle("suplementos");
    assert.equal(expectedStyle, "FITNESS");
    const trace = buildEnvironmentContaminationTrace({
      declaredCategory: "suplementos",
      categoryGrounding: kokeshiCategoryGrounding,
      contaminatedClaims: kokeshiGrounded.quarantinedClaims,
      realVisualWorld: "FITNESS",
      realEnvironmentDescriptions: ["ambiente ativo consistente, variando o nivel de acao de fundo; texturas de tecido/suor/movimento"],
    });
    assert.equal(trace.proven, true);
    assert.equal(trace.steps.length, 5);
  });

  await test("17 - buildEnvironmentContaminationTrace nunca marca proven=true sem dados reais de comparacao", async () => {
    const trace = buildEnvironmentContaminationTrace({
      declaredCategory: "suplementos",
      categoryGrounding: kokeshiCategoryGrounding,
      contaminatedClaims: kokeshiGrounded.quarantinedClaims,
      realVisualWorld: null,
      realEnvironmentDescriptions: [],
    });
    assert.equal(trace.proven, false);
  });

  // ===================== ANTI-GAMING FIXTURES A-H =====================

  await test("18 - FIXTURE A (CORRECT_CATEGORY_CORRECT_CLAIMS): gate nunca FAIL, downstreamReady=true", async () => {
    const grounded = buildGroundedProductIntelligence(FIXTURE_A_OFFER, FIXTURE_A_PI, FIXTURE_A_PACKAGING);
    const gate = buildProductIntelligenceGroundingGate(grounded);
    assert.notEqual(gate.status, "FAIL", `checks: ${JSON.stringify(gate.checks.map((c) => [c.name, c.status]))}`);
    assert.equal(gate.downstreamReady, true);
    assert.equal(grounded.categoryGrounding.status, "MATCH");
  });

  await test("19 - FIXTURE B (WRONG_CATEGORY): gate FAIL", async () => {
    const grounded = buildGroundedProductIntelligence(FIXTURE_B_OFFER, FIXTURE_B_PI, FIXTURE_B_PACKAGING);
    const gate = buildProductIntelligenceGroundingGate(grounded);
    assert.equal(gate.status, "FAIL");
    assert.equal(grounded.categoryGrounding.status, "CONTRADICTED");
  });

  await test("20 - FIXTURE C (MIXED_CLAIMS): quarentena material mesmo com categoria correta (ruido isolado, nao sistemico)", async () => {
    const grounded = buildGroundedProductIntelligence(FIXTURE_C_OFFER, FIXTURE_C_PI, FIXTURE_C_PACKAGING);
    assert.equal(grounded.categoryGrounding.status, "MATCH");
    assert.ok(grounded.quarantinedClaims.length >= 1);
    const gate = buildProductIntelligenceGroundingGate(grounded);
    const domainConsistency = gate.checks.find((c) => c.name === "DOMAIN_CONSISTENCY");
    assert.notEqual(domainConsistency.status, "FAIL", "1 claim isolada nao deveria contar como contaminacao sistemica");
  });

  await test("21 - FIXTURE D (UNKNOWN_CATEGORY): nunca inventa MATCH/CONTRADICTED, todas as claims ficam UNSUPPORTED", async () => {
    const grounded = buildGroundedProductIntelligence(FIXTURE_D_OFFER, FIXTURE_D_PI, FIXTURE_D_PACKAGING);
    assert.equal(grounded.categoryGrounding.status, "AMBIGUOUS");
    assert.ok(grounded.allClaims.every((c) => c.groundingStatus === "UNSUPPORTED"));
  });

  await test("22 - FIXTURE E (PLAUSIBLE_CROSS_CATEGORY): suplemento ingerivel com beneficio de pele/cabelo NAO gera falso positivo", async () => {
    const grounded = buildGroundedProductIntelligence(FIXTURE_E_OFFER, FIXTURE_E_PI, FIXTURE_E_PACKAGING);
    const peleClaim = grounded.allClaims.find((c) => c.originalText.includes("pele"));
    const cabeloClaim = grounded.allClaims.find((c) => c.originalText.includes("cabelo"));
    assert.notEqual(peleClaim.groundingStatus, "CONTAMINATED");
    assert.notEqual(cabeloClaim.groundingStatus, "CONTAMINATED");
    assert.equal(grounded.categoryGrounding.status, "MATCH");
  });

  await test("23 - FIXTURE F (STRONG_CREATIVE_BUT_BAD_GROUNDING): claim persuasiva de dominio errado ainda e CONTAMINATED", async () => {
    const grounded = buildGroundedProductIntelligence(FIXTURE_F_OFFER, FIXTURE_F_PI, FIXTURE_F_PACKAGING);
    const treinoClaim = grounded.allClaims.find((c) => c.originalText.includes("treino"));
    assert.equal(treinoClaim.groundingStatus, "CONTAMINATED");
    assert.ok(grounded.quarantinedClaims.some((c) => c.id === treinoClaim.id));
  });

  await test("24 - FIXTURE G (SAFE_PRICE_ANGLE): preco real sem desconto nunca e CONTRADICTED/CONTAMINATED", async () => {
    const grounded = buildGroundedProductIntelligence(FIXTURE_G_OFFER, FIXTURE_G_PI, FIXTURE_G_PACKAGING);
    const priceClaim = grounded.allClaims.find((c) => c.field === "purchaseMotivations");
    assert.notEqual(priceClaim.groundingStatus, "CONTRADICTED");
    assert.notEqual(priceClaim.groundingStatus, "CONTAMINATED");
  });

  await test("25 - FIXTURE H (FAKE_DISCOUNT): discount_pct=0 + claim de desconto = CONTRADICTED", async () => {
    const grounded = buildGroundedProductIntelligence(FIXTURE_H_OFFER, FIXTURE_H_PI, FIXTURE_H_PACKAGING);
    const discountClaim = grounded.allClaims.find((c) => c.field === "purchaseMotivations");
    assert.equal(discountClaim.groundingStatus, "CONTRADICTED");
    assert.ok(grounded.quarantinedClaims.some((c) => c.id === discountClaim.id));
  });

  // ===================== DETERMINISMO =====================

  await test("26 - mesma entrada produz exatamente o mesmo resultado (determinismo)", async () => {
    const run1 = buildGroundedProductIntelligence(KOKESHI_OFFER, KOKESHI_PI, KOKESHI_PACKAGING);
    const run2 = buildGroundedProductIntelligence(KOKESHI_OFFER, KOKESHI_PI, KOKESHI_PACKAGING);
    assert.equal(run1.contamination.score, run2.contamination.score);
    assert.equal(run1.groundingQuality, run2.groundingQuality);
    assert.deepEqual(run1.allClaims.map((c) => c.groundingStatus), run2.allClaims.map((c) => c.groundingStatus));
  });

  // ===================== ESTRUTURAL: nunca escreve no Supabase =====================

  await test("27 - nenhum arquivo desta camada chama fetch/insert/update/upsert do Supabase", async () => {
    const dir = path.join(root, "lib", "product-intelligence-grounding");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      assert.ok(!/await fetch\(/.test(content), `${file} nao deveria chamar fetch`);
      assert.ok(!/\.(insert|update|upsert|delete)\(/.test(content), `${file} nao deveria escrever no Supabase`);
    }
  });

  const failed = results.filter((r) => r.status === "FAIL");
  for (const r of results) {
    console.log(`${r.status === "PASS" ? "OK  " : "FAIL"} - ${r.name}${r.error ? ` :: ${r.error}` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} testes passaram. fetchCalls=${fetchCalls}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run();
