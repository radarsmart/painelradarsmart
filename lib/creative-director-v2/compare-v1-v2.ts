// Radar Creative AI - Creative Director V2 / Compare V1 x V2
//
// Diff estruturado entre a saida de V1 (CommercialDirection) e V2
// (CommercialCreativeDirectionV2), usado pelo DRY-RUN real. Puro, sem I/O.

import type { CommercialDirection } from "@/lib/commercial-director/types";
import type { CommercialCreativeDirectionV2 } from "@/lib/creative-director-v2/types";

export type CreativeDirectionComparisonEntry = {
  field: string;
  v1Value: string;
  v2Value: string;
  improved: boolean | null;
  note: string;
};

export type CreativeDirectionComparisonV1V2 = {
  entries: CreativeDirectionComparisonEntry[];
};

export function compareCreativeDirections(v1: CommercialDirection, v2: CommercialCreativeDirectionV2): CreativeDirectionComparisonV1V2 {
  const entries: CreativeDirectionComparisonEntry[] = [
    {
      field: "hook",
      v1Value: `${v1.hookStrategy} (sem score)`,
      v2Value: `${v2.hookStrategy} - score ${v2.hookStrength.overallScore}/100 (minimo ${v2.qualityTargets.hookStrengthMinimum})`,
      improved: true,
      note: "V1 so escolhe a estrategia de gancho; V2 avalia a forca do gancho com 6 subscores mensuraveis.",
    },
    {
      field: "firstProductAppearance",
      v1Value: "nao calculado em V1",
      v2Value: v2.firstProductAppearanceSecond !== null ? `${v2.firstProductAppearanceSecond}s` : "produto nao aparece",
      improved: true,
      note: "V2 calcula explicitamente quando o produto aparece pela primeira vez e cobra isso no GenericAdRisk.",
    },
    {
      field: "sceneCount",
      v1Value: String(v1.sceneCount),
      v2Value: String(v2.sceneBlueprints.length),
      improved: null,
      note: "V2 reaproveita as mesmas cenas de V1 (nao replaneja timing) - numero deve ser identico.",
    },
    {
      field: "pacing",
      v1Value: v1.pace,
      v2Value: `${v2.pacingStyle.style} (media ${v2.pacingStyle.averageSceneDurationSeconds}s/cena, ${v2.pacingStyle.cutsPerMinute} cortes/min)`,
      improved: true,
      note: "V2 deriva guidance de ritmo (duracao media, cortes/min, densidade) a partir dos dados reais da campanha.",
    },
    {
      field: "productPresence",
      v1Value: "sem estrategia de apresentacao estruturada",
      v2Value: v2.productPresentationStrategy ?? "nenhuma cena product-centric",
      improved: true,
      note: "V2 escolhe uma estrategia visual explicita (HERO_REVEAL, MACRO_DETAIL etc.) para a cena-heroi do produto.",
    },
    {
      field: "offerHierarchy",
      v1Value: "OfferStrategy sem priorizacao explicita entre preco/desconto/urgencia/CTA",
      v2Value: `price=${v2.offerPresentation.pricePriority}, discount=${v2.offerPresentation.discountPriority}, urgency=${v2.offerPresentation.urgencyAllowed}, cta=${v2.offerPresentation.ctaPriority}`,
      improved: true,
      note: "V2 ranqueia a hierarquia visual da oferta, sempre derivada de OfferStrategy real (nunca inventada).",
    },
    {
      field: "cta",
      v1Value: `${v1.ctaStrategy.ctaText} / ${v1.ctaStrategy.ctaVisual}`,
      v2Value: `acao=${v2.ctaDirection.ctaVisualAction}, gesto=${v2.ctaDirection.ctaCharacterGesture ?? "nenhum"}`,
      improved: true,
      note: "V2 planeja o CTA como cena visual (acao/gesto), nao so como texto - intencao criativa, sem garantia do provider.",
    },
    {
      field: "characterRole",
      v1Value: v1.presenterStrategy,
      v2Value: v2.characterRoleSummary.appears ? v2.characterRoleSummary.rolesUsed.join(", ") : "NONE",
      improved: true,
      note: "V2 rotula a funcao comercial da apresentadora por cena (por que ela aparece), sem mudar SE ela aparece (isso continua V1).",
    },
    {
      field: "genericAdRisk",
      v1Value: "nao avaliado em V1",
      v2Value: `${v2.genericAdRisk.risk} (${v2.genericAdRisk.reasons.length} motivo(s))`,
      improved: true,
      note: "V2 introduz deteccao de risco de anuncio generico - inexistente em V1.",
    },
  ];

  return { entries };
}
