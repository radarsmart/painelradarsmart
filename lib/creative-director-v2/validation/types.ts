// Radar Creative AI - Creative Director V2 / Validation / Types
//
// Contratos da camada de VALIDACAO do V2 - le a saida de
// CommercialCreativeDirectionV2 e produz diagnostico, nunca decide nada do
// storyboard em si (nenhum arquivo deste diretorio e importado por
// lib/creative-director-v2/creative-director-v2.ts). Puro, sem I/O, sem
// provider.

import type { ScenePurpose } from "@/lib/commercial-director/types";
import type {
  BenchmarkComparisonResult,
  CharacterRole,
  CreativeQualityStatus,
  GenericAdRiskResult,
  ProductScaleTarget,
  SubjectPriority,
} from "@/lib/creative-director-v2/types";

// --- Storyboard Preview ------------------------------------------------------

export type StoryboardScenePreview = {
  scene: string;
  purpose: ScenePurpose;
  durationSeconds: number;
  creativeIntent: string;
  whatUserSees: string;
  productRole: string;
  productScale: string;
  productPosition: string;
  characterRole: CharacterRole;
  characterAction: string;
  camera: string;
  motion: string;
  environment: string;
  visualEffects: string;
  narrationIntent: string;
  offerElements: string;
  overlays: string;
  cta: string;
  transition: string;
  whyThisSceneExists: string;
};

export type StoryboardPreview = {
  campaignSummary: string;
  scenes: StoryboardScenePreview[];
};

// --- V1 vs V2 diff -----------------------------------------------------------

export type V1ScenePreview = {
  scene: string;
  purpose: ScenePurpose;
  camera: string;
  motion: string;
  lighting: string;
  textOverlay: string | null;
  voiceoverIntent: string;
  transitionIntent: string;
  presenter: string;
};

export type ComparisonQuestionVerdict = "YES" | "NO" | "PARTIAL";

export type ComparisonQuestionAnswer = {
  question: string;
  verdict: ComparisonQuestionVerdict;
  evidence: string;
};

export type V1V2StoryboardDiff = {
  v1Scenes: V1ScenePreview[];
  v2Scenes: StoryboardScenePreview[];
  questions: ComparisonQuestionAnswer[];
};

// --- Benchmark strength audit --------------------------------------------

export type BenchmarkConfidence = "LOW" | "MEDIUM" | "HIGH";

export type BenchmarkCriterionAudit = {
  criterion: string;
  expected: string;
  actual: string;
  score: boolean;
  whyPassed: string;
  confidence: BenchmarkConfidence;
};

export type BenchmarkStrengthAuditVerdict = "RELIABLE" | "TOO_PERMISSIVE";

export type BenchmarkStrengthAudit = {
  benchmarkSlug: string;
  criteria: BenchmarkCriterionAudit[];
  overallAuditVerdict: BenchmarkStrengthAuditVerdict;
  recommendations: string[];
};

// --- Hook audit ------------------------------------------------------------

export type HookSubscoreAudit = {
  name: string;
  score: number;
  reason: string;
  evidence: string;
  possibleImprovement: string | null;
};

export type HookAudit = {
  overallScore: number;
  passesMinimum: boolean;
  subscores: HookSubscoreAudit[];
};

// --- Product-first score -----------------------------------------------------

export type ProductFirstScore = {
  score: number;
  firstProductAppearanceSecond: number | null;
  appearanceTimingScore: number;
  screenCoverageRatio: number;
  screenCoverageScore: number;
  productScaleTarget: ProductScaleTarget;
  productScaleScore: number;
  productMovementIntentPresent: boolean;
  productMovementScore: number;
};

// --- Creative density --------------------------------------------------------

export type SceneDensityBreakdown = {
  sceneId: string;
  purpose: ScenePurpose;
  signalsPresent: string[];
  signalsTotal: number;
  score: number;
};

export type CreativeDensityScore = {
  overallScore: number;
  scenes: SceneDensityBreakdown[];
};

// --- Scene redundancy ---------------------------------------------------

export type SceneRedundancyRisk = "LOW" | "MEDIUM" | "HIGH";

export type SceneRedundancyPair = {
  sceneA: string;
  sceneB: string;
  matchedFields: string[];
  similarityReason: string;
  risk: SceneRedundancyRisk;
};

export type SceneRedundancyAnalysis = {
  pairs: SceneRedundancyPair[];
  overallRisk: SceneRedundancyRisk;
};

// --- Character performance -------------------------------------------------

export type CharacterPerformanceDirection = {
  sceneId: string;
  purpose: ScenePurpose;
  role: CharacterRole;
  interactsWithCta: boolean;
  interactsWithProduct: boolean;
  staticPresenceRisk: boolean;
  reason: string;
};

// --- Commercial arc -----------------------------------------------------

export type CommercialArcStage = "ATTENTION" | "DESIRE" | "BENEFIT" | "OFFER" | "ACTION";

export type CommercialArcCoverage = {
  covered: CommercialArcStage[];
  missing: CommercialArcStage[];
  note: string;
};

// --- Cinematic benchmark ------------------------------------------------

export type CinematicBenchmarkProfile = {
  slug: string;
  name: string;
  minHookScore: number;
  minProductScaleTarget: ProductScaleTarget;
  maxAverageSceneDurationSeconds: number;
  minCreativeDensityScore: number;
  maxSceneRedundancyRisk: SceneRedundancyRisk;
  disallowsStaticPresence: boolean;
  minCommercialArcStagesCovered: number;
};

// --- Root validation result -----------------------------------------------

export type CreativeValidationResult = {
  v1Score: number;
  v2Score: number;
  premiumBenchmarkScore: number;
  cinematicBenchmarkScore: number;
  hookScore: number;
  productFirstScore: number;
  creativeDensityScore: number;
  commercialArcScore: number;
  genericAdRisk: GenericAdRiskResult["risk"];
  sceneRedundancyRisk: SceneRedundancyRisk;
  storyboardQualityGateStatus: CreativeQualityStatus;
  readyForV2PipelineIntegration: boolean;
  readyForV2PipelineIntegrationReasons: string[];
  benchmarkStrengthAudit: BenchmarkStrengthAudit;
  hookAudit: HookAudit;
  productFirst: ProductFirstScore;
  creativeDensity: CreativeDensityScore;
  sceneRedundancy: SceneRedundancyAnalysis;
  characterPerformance: CharacterPerformanceDirection[];
  commercialArc: CommercialArcCoverage;
  cinematicBenchmark: BenchmarkComparisonResult;
  storyboardDiff: V1V2StoryboardDiff;
};

// Reexport de conveniencia.
export type { SubjectPriority };
