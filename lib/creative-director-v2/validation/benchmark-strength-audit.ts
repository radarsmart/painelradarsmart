// Radar Creative AI - Creative Director V2 / Validation / Benchmark Strength Audit
//
// NAO recalcula os checks de compareAgainstBenchmark() - so anota cada
// criterio ja calculado com uma confidence (o quanto aquele PASS realmente
// discrimina storyboard bom de generico). A confidence e uma tabela
// DETERMINISTICA E DOCUMENTADA por criterio (nao ha como medir isso em
// runtime sem rodar dezenas de campanhas reais) - o raciocinio de cada uma
// esta no comentario ao lado, para que a decisao seja auditavel, nao vibe.

import type { BenchmarkComparisonResult, CreativeBenchmarkProfile } from "@/lib/creative-director-v2/types";
import type { BenchmarkConfidence, BenchmarkCriterionAudit, BenchmarkStrengthAudit } from "@/lib/creative-director-v2/validation/types";

const CONFIDENCE_BY_CRITERION: Record<string, { level: BenchmarkConfidence; reason: string }> = {
  oneIdeaPerScene: {
    level: "LOW",
    reason:
      '"distinctObjectives === length" passa quase sempre porque buildVisualObjective() ja gera um texto diferente por purpose SEMPRE (scene-blueprint-builder.ts) - nao distingue storyboard criativo de generico, so confirma que os purposes sao diferentes (o que ja e garantido por construcao em V1).',
  },
  noEmptyScenes: {
    level: "MEDIUM",
    reason: 'so falha quando subjectPriority==="ENVIRONMENT" (sem personagem, sem produto em foco, sem overlay ao mesmo tempo) - caso raro mas real, ja observado em campanha sem persona oficial e categoria "geral".',
  },
  highMobileClarity: {
    level: "LOW",
    reason: "limiar de 6s/cena e folgado pro perfil de duracao que V1 ja produz tipicamente (media observada 3-4s/cena) - quase nunca reprova, entao nao discrimina nada.",
  },
  hookImmediate: {
    level: "MEDIUM",
    reason: "ligado a um score real (HookStrengthEvaluation), mas o score mede PRESENCA de sinais estruturais no plano (personagem/overlay/motion), nao a execucao visual de fato - so um video renderizado confirma isso.",
  },
  productLarge: {
    level: "MEDIUM",
    reason: "ligado a estrategia de apresentacao real escolhida, mas productScaleTarget e uma INTENCAO registrada - nada no pipeline ainda garante que o produto sai grande no frame renderizado.",
  },
  visualOffer: {
    level: "MEDIUM",
    reason: "ligado a preco real (nunca inventado), mas so confirma que existe overlay planejado - nao avalia se a hierarquia visual de fato comunica bem no video final.",
  },
  clearCta: {
    level: "MEDIUM",
    reason: "ligado a overlay real de CTA, mas so confirma presenca de texto - nao avalia a forca comunicativa real do CTA no video renderizado.",
  },
};

const LOW_CONFIDENCE_RECOMMENDATIONS: Record<string, string> = {
  oneIdeaPerScene: 'trocar por comparacao de SIMILARIDADE semantica entre visualObjective de cenas adjacentes, nao so "sao strings diferentes".',
  highMobileClarity: "considerar tambem densidade de informacao por segundo (quantos elementos/overlay por cena), nao so duracao bruta.",
};

export function auditBenchmarkStrength(comparisonResult: BenchmarkComparisonResult, benchmark: CreativeBenchmarkProfile): BenchmarkStrengthAudit {
  const criteria: BenchmarkCriterionAudit[] = comparisonResult.checks.map((check) => {
    const confidence = CONFIDENCE_BY_CRITERION[check.criterion]?.level ?? "MEDIUM";
    return {
      criterion: check.criterion,
      expected: `benchmark "${benchmark.slug}" exige ${check.criterion}`,
      actual: check.detail,
      score: check.met,
      whyPassed: check.met ? check.detail : `NAO passou: ${check.detail}`,
      confidence,
    };
  });

  const lowConfidenceCount = criteria.filter((c) => c.confidence === "LOW").length;
  const overallAuditVerdict = lowConfidenceCount / criteria.length >= 0.5 ? "TOO_PERMISSIVE" : "RELIABLE";

  const recommendations = criteria
    .filter((c) => c.confidence === "LOW" && LOW_CONFIDENCE_RECOMMENDATIONS[c.criterion])
    .map((c) => `${c.criterion}: ${LOW_CONFIDENCE_RECOMMENDATIONS[c.criterion]}`);

  return {
    benchmarkSlug: comparisonResult.benchmarkSlug,
    criteria,
    overallAuditVerdict,
    recommendations,
  };
}
