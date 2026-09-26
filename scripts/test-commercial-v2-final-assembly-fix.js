// Radar Creative AI - COMMERCIAL V2 FINAL ASSEMBLY FIX V1 - Test Suite
//
// Cobre os itens 2/3/4/6/7 do pedido: FREEZE_LAST_FRAME padding policy,
// guardrail de padding excessivo, responsive CTA overlay (fontSize/wrap/
// BLOCKED_OVERLAY_LAYOUT), e TIMELINE_DURATION_CONSISTENCY no Commercial
// Quality Gate. Mesmo padrao dos scripts anteriores: sem Jest, transpile
// on-the-fly, fetch bloqueado (garante zero chamada de rede so por rodar
// estes testes).

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

const {
  resolveCtaOverlayLayout,
  wrapTextGreedy,
  estimateTextWidthPx,
  DEFAULT_CTA_OVERLAY_LAYOUT_POLICY,
} = require("../lib/commercial-video/cta-overlay-layout.ts");
const { resolveSceneDurationAdjustment, DEFAULT_SCENE_DURATION_PADDING_POLICY } = require("../lib/commercial-video/scene-duration-padding.ts");
const { buildCtaDrawtextFilter } = require("../lib/commercial-video/overlay-renderer.ts");
const { buildScenePrepareFilterGraph } = require("../lib/commercial-video/commercial-video-composer.ts");
const { assessCommercialQuality, buildAudioQualityFromMeasuredFacts } = require("../lib/commercial-video/quality/commercial-quality-gate.ts");

const FRAME_WIDTH = 1080;

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
  }
}

function baseSceneAsset(overrides = {}) {
  return {
    sceneId: "scene-5",
    sceneOrder: 5,
    purpose: "CTA",
    inputVideoPath: "/fake/path.mp4",
    status: "READY",
    durationSeconds: 4.89,
    startTime: 15.11,
    endTime: 20,
    transitionIn: "CUT",
    transitionOut: "CUT",
    overlays: { priceText: null, discountText: null, ctaText: null },
    safeAreaDirection: "BOTTOM",
    brandOverlayRequired: false,
    provider: "heygen-image-avatar",
    ...overrides,
  };
}

async function run() {
  // ===================== CTA OVERLAY LAYOUT (item 4/6) =====================

  await test("1 - CTA curto cabe em 1 linha, fontSize default", async () => {
    const result = resolveCtaOverlayLayout("Acesse o Radar Smart.", FRAME_WIDTH);
    assert.equal(result.status, "OK");
    assert.equal(result.lines.length, 1);
    assert.equal(result.fontSize, DEFAULT_CTA_OVERLAY_LAYOUT_POLICY.defaultFontSize);
  });

  await test("2 - CTA medio pode quebrar em 2 linhas sem reduzir fontSize", async () => {
    const result = resolveCtaOverlayLayout("Aproveite essa oferta especial por tempo limitado.", FRAME_WIDTH);
    assert.equal(result.status, "OK");
    assert.ok(result.lines.length <= 2);
  });

  await test("3 - CTA longo real do CANARY (65 chars) - caso que estourava - agora cabe em 2 linhas", async () => {
    const text = "Acesse o Radar Smart e aproveite essa oferta antes que ela acabe.";
    const result = resolveCtaOverlayLayout(text, FRAME_WIDTH);
    assert.equal(result.status, "OK", `deveria caber - obtido: ${JSON.stringify(result)}`);
    assert.ok(result.lines.length <= 2);
    for (const line of result.lines) {
      const width = estimateTextWidthPx(line, result.fontSize);
      assert.ok(width <= FRAME_WIDTH * DEFAULT_CTA_OVERLAY_LAYOUT_POLICY.maxTextWidthRatio, `linha "${line}" (${width}px) deveria caber`);
    }
    // Reconstroi o texto original a partir das linhas (garante que nao perdemos nenhuma palavra)
    assert.equal(result.lines.join(" "), text);
  });

  await test("4 - texto com preco (numeros/simbolos) e medido normalmente", async () => {
    const result = resolveCtaOverlayLayout("Garanta o seu por R$ 13,16 agora mesmo!", FRAME_WIDTH);
    assert.equal(result.status, "OK");
  });

  await test("5 - texto com acentos/caracteres portugueses nao quebra a logica", async () => {
    const result = resolveCtaOverlayLayout("Não perca essa promoção incrível e exclusiva da Radar Smart hoje.", FRAME_WIDTH);
    assert.ok(result.status === "OK" || result.status === "BLOCKED_OVERLAY_LAYOUT");
    if (result.status === "OK") assert.equal(result.lines.join(" "), "Não perca essa promoção incrível e exclusiva da Radar Smart hoje.");
  });

  await test("6 - texto proximo ao limite (cabe justo em 2 linhas no fontSize minimo)", async () => {
    // ~90 chars - deve exigir reducao de fontSize e/ou 2 linhas
    const text = "Aproveite agora mesmo essa oferta especial exclusiva antes que o estoque acabe de vez.";
    const result = resolveCtaOverlayLayout(text, FRAME_WIDTH);
    if (result.status === "OK") {
      assert.ok(result.lines.length <= DEFAULT_CTA_OVERLAY_LAYOUT_POLICY.maxLines);
      assert.ok(result.fontSize <= DEFAULT_CTA_OVERLAY_LAYOUT_POLICY.defaultFontSize);
    } else {
      assert.equal(result.status, "BLOCKED_OVERLAY_LAYOUT");
    }
  });

  await test("7 - texto impossivel de encaixar (muito longo) -> BLOCKED_OVERLAY_LAYOUT, nunca cortado silenciosamente", async () => {
    const text =
      "Esta e uma frase de call to action absurdamente longa que nenhum humano decente escreveria para um " +
      "video vertical de rede social porque simplesmente nao cabe em nenhuma quantidade razoavel de linhas " +
      "ou tamanho de fonte legivel para um espectador mobile real.";
    const result = resolveCtaOverlayLayout(text, FRAME_WIDTH);
    assert.equal(result.status, "BLOCKED_OVERLAY_LAYOUT");
    assert.ok(result.reason.length > 0);
  });

  await test("8 - palavra unica maior que a largura maxima ainda vira 1 linha (sem hifenizacao) - wrapTextGreedy nao trava", async () => {
    const lines = wrapTextGreedy("Supercalifragilisticexpialidocious", 44, 100);
    assert.equal(lines.length, 1);
  });

  await test("9 - buildCtaDrawtextFilter (overlay-renderer.ts) integra o layout responsivo - texto curto gera 1 drawtext", async () => {
    const result = buildCtaDrawtextFilter("/fake/font.ttf", "Acesse o Radar Smart.", "BOTTOM", FRAME_WIDTH);
    assert.equal(result.layout.status, "OK");
    assert.equal((result.filter.match(/drawtext=/g) || []).length, 1);
  });

  await test("10 - buildCtaDrawtextFilter com o texto longo real gera 2 drawtext encadeados (2 linhas)", async () => {
    const text = "Acesse o Radar Smart e aproveite essa oferta antes que ela acabe.";
    const result = buildCtaDrawtextFilter("/fake/font.ttf", text, "BOTTOM", FRAME_WIDTH);
    assert.equal(result.layout.status, "OK");
    assert.equal((result.filter.match(/drawtext=/g) || []).length, result.layout.lines.length);
    assert.ok(result.layout.lines.length >= 1 && result.layout.lines.length <= 2);
  });

  await test("11 - buildCtaDrawtextFilter com texto impossivel devolve filter=null e layout BLOCKED (nunca gera drawtext cortado)", async () => {
    const text =
      "Esta e uma frase de call to action absurdamente longa que nenhum humano decente escreveria para um " +
      "video vertical de rede social porque simplesmente nao cabe em nenhuma quantidade razoavel de linhas " +
      "ou tamanho de fonte legivel para um espectador mobile real.";
    const result = buildCtaDrawtextFilter("/fake/font.ttf", text, "BOTTOM", FRAME_WIDTH);
    assert.equal(result.filter, null);
    assert.equal(result.layout.status, "BLOCKED_OVERLAY_LAYOUT");
  });

  await test("12 - ctaText null continua retornando filter/layout null (comportamento identico ao anterior)", async () => {
    const result = buildCtaDrawtextFilter("/fake/font.ttf", null, "BOTTOM", FRAME_WIDTH);
    assert.equal(result.filter, null);
    assert.equal(result.layout, null);
  });

  // ===================== SCENE DURATION PADDING (item 2/3) =====================

  await test("13 - asset ja >= planejado -> NONE (comportamento anterior preservado)", async () => {
    const adj = resolveSceneDurationAdjustment({ provider: "freepik-kling-i2v", originalDurationSeconds: 10, plannedDurationSeconds: 6.05 });
    assert.equal(adj.type, "NONE");
  });

  await test("14 - HeyGen mais curto que o planejado, dentro da policy -> FREEZE_LAST_FRAME (caso real do CANARY)", async () => {
    const adj = resolveSceneDurationAdjustment({ provider: "heygen-image-avatar", originalDurationSeconds: 1.6, plannedDurationSeconds: 4.89 });
    assert.equal(adj.type, "FREEZE_LAST_FRAME");
    assert.equal(adj.originalDuration, 1.6);
    assert.equal(adj.targetDuration, 4.89);
    assert.ok(Math.abs(adj.paddingDuration - 3.29) < 0.001);
  });

  await test("15 - provider fora da eligibleProviders list (ex: freepik-kling-i2v curto) -> BLOCKED_SCENE_DURATION_MISMATCH, nunca estica silenciosamente", async () => {
    const adj = resolveSceneDurationAdjustment({ provider: "freepik-kling-i2v", originalDurationSeconds: 2, plannedDurationSeconds: 6 });
    assert.equal(adj.type, "BLOCKED_SCENE_DURATION_MISMATCH");
  });

  await test("16 - provider null/desconhecido -> BLOCKED (nunca assume elegibilidade sem provider conhecido)", async () => {
    const adj = resolveSceneDurationAdjustment({ provider: null, originalDurationSeconds: 1, plannedDurationSeconds: 5 });
    assert.equal(adj.type, "BLOCKED_SCENE_DURATION_MISMATCH");
  });

  await test("17 - padding excessivo (> maxPaddingRatio ou > maxPaddingSeconds) -> BLOCKED mesmo para provider elegivel", async () => {
    const adj = resolveSceneDurationAdjustment({ provider: "heygen-image-avatar", originalDurationSeconds: 0.5, plannedDurationSeconds: 20 });
    assert.equal(adj.type, "BLOCKED_SCENE_DURATION_MISMATCH");
    assert.ok(adj.reason.includes("excede"));
  });

  await test("18 - threshold da policy documentado bate com o caso real calibrado (70%/6s)", async () => {
    assert.equal(DEFAULT_SCENE_DURATION_PADDING_POLICY.maxPaddingRatio, 0.7);
    assert.equal(DEFAULT_SCENE_DURATION_PADDING_POLICY.maxPaddingSeconds, 6);
    assert.deepEqual(DEFAULT_SCENE_DURATION_PADDING_POLICY.eligibleProviders, ["heygen-image-avatar"]);
  });

  // ===================== INTEGRACAO COM O FILTER GRAPH (item 2) =====================

  await test("19 - buildScenePrepareFilterGraph injeta tpad quando durationAdjustment=FREEZE_LAST_FRAME", async () => {
    const scene = baseSceneAsset();
    const adjustment = { type: "FREEZE_LAST_FRAME", originalDuration: 1.6, targetDuration: 4.89, paddingDuration: 3.29 };
    const result = buildScenePrepareFilterGraph(scene, 1080, 1920, 24, null, false, adjustment);
    assert.equal(result.status, "OK");
    assert.ok(result.filterGraph.includes("tpad=stop_mode=clone:stop_duration=3.290"));
  });

  await test("20 - buildScenePrepareFilterGraph SEM adjustment (NONE) nunca injeta tpad (comportamento anterior preservado)", async () => {
    const scene = baseSceneAsset();
    const result = buildScenePrepareFilterGraph(scene, 1080, 1920, 24, null, false, { type: "NONE" });
    assert.equal(result.status, "OK");
    assert.ok(!result.filterGraph.includes("tpad"));
  });

  await test("21 - buildScenePrepareFilterGraph propaga BLOCKED_OVERLAY_LAYOUT quando o CTA nao cabe (nunca renderiza cortado)", async () => {
    const impossibleText =
      "Esta e uma frase de call to action absurdamente longa que nenhum humano decente escreveria para um " +
      "video vertical de rede social porque simplesmente nao cabe em nenhuma quantidade razoavel de linhas " +
      "ou tamanho de fonte legivel para um espectador mobile real.";
    const scene = baseSceneAsset({ overlays: { priceText: null, discountText: null, ctaText: impossibleText } });
    const result = buildScenePrepareFilterGraph(scene, 1080, 1920, 24, "/fake/font.ttf", false, { type: "NONE" });
    assert.equal(result.status, "BLOCKED_OVERLAY_LAYOUT");
  });

  // ===================== TIMELINE_DURATION_CONSISTENCY (item 7) =====================

  function baseRunnerResult(overrides = {}) {
    return {
      campaignId: "test", mode: "EXECUTE", status: "COMPLETED", startedAt: null, completedAt: null, durationMs: null,
      transitions: [], scenes: [], narrationPlan: { campaignId: "test", language: "pt-BR", scenes: [], totalCharacters: 0, estimatedCredits: 0, status: "READY" },
      narrationQualityResult: { status: "PASS", reasons: [] }, costPreview: {}, videoCostGuard: { status: "OK", reason: null },
      usdCostGuard: { status: "OK", reason: null }, ttsCostGuard: { status: "OK", reason: null },
      quality: { sceneEligibility: "PASS", assetResolution: "PASS", narrationQuality: "PASS", audioQuality: "PASS", finalVideoQuality: "PASS", finalStatus: "PASS" },
      traceability: [], finalVideoPath: "/fake.mp4", finalVideoUrl: null, executionGuard: { status: "OK", reason: null },
      executionReadiness: { status: "READY", canProduceFinalCommercial: true, scenes: [], reasons: [] },
      sceneExecutionRecords: [], narrationExecutionRecords: [], errors: [],
      ...overrides,
    };
  }

  const goodProbe = { valid: true, durationSeconds: 20, width: 1080, height: 1920, fps: 24, videoCodec: "h264", videoEncoder: "Lavc h264_mf", audioCodec: "aac", audioStreamCount: 1, error: null };
  const goodAudioQuality = buildAudioQualityFromMeasuredFacts({ videoDurationSeconds: 20, audioDurationSeconds: 20, narrationSegments: [], peakLevelDb: -6, audioStreamPresent: true, masterLoudnessLUFS: -14 });

  await test("22 - plannedTimelineDurationSeconds omitido -> checagem pulada (comportamento anterior preservado)", async () => {
    const result = assessCommercialQuality({
      runnerResult: baseRunnerResult(), offer: { price: 10, priceText: "R$ 10,00", originalPrice: null, discountPercent: 0, discountText: null },
      visualClaims: [], finalVideoProbe: { ...goodProbe, durationSeconds: 16.67 }, audioQuality: goodAudioQuality, allowLegacyEncoderObservation: false,
    });
    assert.equal(result.finalVideoTechnicalQuality.issues.filter((i) => i.category === "TIMELINE_DURATION_MISMATCH").length, 0);
  });

  await test("23 - duracao final diverge do plano alem da tolerancia -> TIMELINE_DURATION_MISMATCH CRITICAL, status FAIL, publishReady=false (caso real do CANARY: 16.67s vs 20.00s)", async () => {
    const result = assessCommercialQuality({
      runnerResult: baseRunnerResult(), offer: { price: 10, priceText: "R$ 10,00", originalPrice: null, discountPercent: 0, discountText: null },
      visualClaims: [], finalVideoProbe: { ...goodProbe, durationSeconds: 16.666667 }, audioQuality: goodAudioQuality,
      allowLegacyEncoderObservation: false, plannedTimelineDurationSeconds: 20,
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.publishReady, false);
    assert.ok(result.blockingReasons.some((r) => r.includes("Duracao final")));
  });

  await test("24 - duracao final dentro da tolerancia -> nenhum issue de timeline", async () => {
    const result = assessCommercialQuality({
      runnerResult: baseRunnerResult(), offer: { price: 10, priceText: "R$ 10,00", originalPrice: null, discountPercent: 0, discountText: null },
      visualClaims: [], finalVideoProbe: { ...goodProbe, durationSeconds: 19.3 }, audioQuality: goodAudioQuality,
      allowLegacyEncoderObservation: false, plannedTimelineDurationSeconds: 20,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.publishReady, true);
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
