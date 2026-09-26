// Radar Creative AI - Commercial Video Pipeline / Real Scene Asset - Types
//
// Contrato de integracao entre o que o resto do pipeline ja produz
// (Generation Orchestrator, Hybrid Product Compositor) e o Scene Asset
// Resolver do Commercial Video Pipeline. Nao substitui scene-asset-resolver.ts
// (que continua resolvendo o caso LOCAL_ASSET/fixture puro) - adiciona a
// camada que sabe interpretar SceneExecutionResult/HybridCompositeResult
// reais e decidir qual vira o arquivo final da cena.

// GENERATION_RESULT - saida de lib/generation-orchestrator (mock-executor.ts
// hoje, um adapter real amanha) - ver SceneExecutionResult/VideoCanaryResult.
// HYBRID_COMPOSITE - saida de lib/compositor/hybrid-product-compositor.ts -
// SEMPRE o output final (produto real + fundo), nunca o background bruto.
// LOCAL_ASSET - arquivo local ja conhecido, fora do fluxo de geracao (ex:
// asset de marca, cena gravada manualmente).
// MOCK - fixture/teste local, nunca usado em campanha real - existe so pra
// completar timelines de teste quando nao ha asset real disponivel.
export type SceneAssetSource = "GENERATION_RESULT" | "HYBRID_COMPOSITE" | "LOCAL_ASSET" | "MOCK";

// Vocabulario de qualidade desta camada de integracao. GAP CONHECIDO
// (documentado no relatorio, nao escondido): nenhum resultado real hoje
// (SceneExecutionResult, HybridCompositeResult, VideoCanaryResult) persiste
// um veredito de qualidade estruturado - os unicos "quality gates" que
// existem no codigo sao por-imagem (ProductCutoutQuality, PASS/PARTIAL/FAIL
// em lib/product-cutout/quality-gate.ts), nao por-cena-de-timeline. Por
// isso `quality` e sempre OPCIONAL no candidato: quando ausente, a cena e
// tratada como "sem avaliacao" (elegivel, ver scoreCandidate em
// candidate-selection.ts) em vez de bloqueada ou aprovada as cegas.
export type SceneQualityStatus = "PASS" | "PASS_WITH_OBSERVATIONS" | "PARTIAL" | "FAIL";

export type GenerationResultCandidate = {
  source: "GENERATION_RESULT";
  sceneId: string;
  provider: string;
  // taskId/requestId do provider quando disponivel (ex: VideoCanaryResult.taskId) -
  // null quando o executor nao expoe um id (ex: mock-executor.ts hoje).
  generationId: string | null;
  status: "COMPLETED" | "FAILED" | "SKIPPED";
  outputUrl: string | null;
  durationSeconds: number;
  quality?: SceneQualityStatus | null;
  completedAt?: string | null;
  // Presente SOMENTE quando o candidato veio de uma execucao real do
  // EXECUTE V1 (ver lib/commercial-video/runner/execute/scene-fingerprint.ts).
  // Candidatos de DRY_RUN/fixture nunca preenchem isso - ausencia de
  // fingerprint sempre passa pelo filtro de reuso do EXECUTE (nunca
  // rejeitado so por nao ter fingerprint, ver reusable-candidates.ts).
  fingerprint?: string | null;
};

// output SEMPRE local (HybridCompositeResult.outputPath nunca e uma URL
// remota - o compositor roda FFmpeg localmente) - nunca passa pelo
// materializador de download.
export type HybridCompositeCandidate = {
  source: "HYBRID_COMPOSITE";
  sceneId: string;
  status: "COMPLETED" | "FAILED";
  outputPath: string | null;
  durationSeconds: number;
  quality?: SceneQualityStatus | null;
  completedAt?: string | null;
  // Ver GenerationResultCandidate.fingerprint acima - mesmo contrato.
  fingerprint?: string | null;
};

export type LocalAssetCandidate = {
  source: "LOCAL_ASSET" | "MOCK";
  sceneId: string;
  localPath: string;
  durationSeconds: number;
  quality?: SceneQualityStatus | null;
  completedAt?: string | null;
};

export type SceneAssetCandidate = GenerationResultCandidate | HybridCompositeCandidate | LocalAssetCandidate;

export type ResolvedCommercialSceneAssetStatus = "READY" | "MISSING_ASSET";

export type ResolvedCommercialSceneAsset = {
  sceneId: string;
  // null quando nenhum candidato elegivel foi encontrado (ver rejectionReason).
  source: SceneAssetSource | null;
  inputVideoPath: string | null;
  provider: string | null;
  generationId: string | null;
  hybridComposite: boolean;
  durationSeconds: number;
  status: ResolvedCommercialSceneAssetStatus;
  // Sempre preenchido quando status === "MISSING_ASSET" - motivo exato
  // (status reprovado, quality reprovada, HYBRID exigido sem resultado,
  // download falhou, etc) para traceability/debug - nunca um buraco silencioso.
  rejectionReason: string | null;
};

export type SceneAssetResolutionOptions = {
  // Ambos default false - "permitir somente se explicitamente configurado"
  // (PASS_WITH_OBSERVATIONS) e "bloquear por padrao" (PARTIAL), conforme
  // especificado. FAIL nunca tem override.
  allowPassWithObservations?: boolean;
  allowPartialQuality?: boolean;
  // strategy real por cena (extraida de CampaignExecutionPlan.scenes[].productGenerationStrategy) -
  // quando a cena for HYBRID_PRODUCT_COMPOSITE, somente candidatos
  // HYBRID_COMPOSITE sao elegiveis - o background bruto (GENERATION_RESULT)
  // NUNCA e usado como substituto, mesmo que COMPLETED.
  productGenerationStrategyByScene?: Record<string, string | null | undefined>;
  // Diretorio de cache de downloads (ver asset-materializer.ts) - obrigatorio
  // pra resolver qualquer candidato GENERATION_RESULT com outputUrl remota.
  cacheDir: string;
};

export type SceneAssetTraceEntry = {
  source: SceneAssetSource | null;
  provider: string | null;
  generationId: string | null;
  hybridComposite: boolean;
  status: ResolvedCommercialSceneAssetStatus;
  rejectionReason: string | null;
};
