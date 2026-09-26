// Radar Creative AI - Creative Director V2 / Decision Engine / Transition Variety
//
// Reusa selectTransitionIntent() (pacing-director.ts, Fase 1) como base por
// cena - so ajusta quando o resultado repetiria o MESMO intent 2x seguidas,
// rotacionando pro proximo transition do mesmo "grupo de energia" (evita
// trocar um corte rapido por um crossfade lento so pra variar).

import type { ScenePurpose } from "@/lib/commercial-director/types";
import { selectTransitionIntent } from "@/lib/creative-director-v2/pacing-director";
import type { PacingStyleV2, TransitionIntentV2 } from "@/lib/creative-director-v2/types";

const ENERGY_GROUPS: TransitionIntentV2[][] = [
  ["WHIP", "FLASH"],
  ["CUT", "MATCH_CUT", "MOTION_CUT", "ZOOM"],
  ["CROSSFADE", "REVEAL"],
];

function groupOf(intent: TransitionIntentV2): TransitionIntentV2[] {
  return ENERGY_GROUPS.find((group) => group.includes(intent)) ?? ENERGY_GROUPS[1];
}

function nextInGroup(intent: TransitionIntentV2): TransitionIntentV2 {
  const group = groupOf(intent);
  if (group.length <= 1) return intent;
  const index = group.indexOf(intent);
  return group[(index + 1) % group.length];
}

export function assignTransitionSequence(purposes: ScenePurpose[], pacingStyle: PacingStyleV2): TransitionIntentV2[] {
  const sequence: TransitionIntentV2[] = [];

  purposes.forEach((purpose) => {
    let intent = selectTransitionIntent(purpose, pacingStyle);
    const previous = sequence[sequence.length - 1];

    if (previous && intent === previous) {
      const rotated = nextInGroup(intent);
      intent = rotated !== intent ? rotated : intent;
    }

    sequence.push(intent);
  });

  return sequence;
}
