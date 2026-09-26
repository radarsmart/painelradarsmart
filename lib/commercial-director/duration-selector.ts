// Radar Creative AI - Commercial Director / Duration Selector

import type { StoryStructure } from "@/lib/commercial-director/types";

export function selectDuration(storyStructure: StoryStructure): { durationSeconds: number; reason: string } {
  switch (storyStructure) {
    case "DIRECT_OFFER":
      return { durationSeconds: 9, reason: "oferta extremamente direta funciona melhor entre 8-10s" };
    case "DEMONSTRATION":
      return { durationSeconds: 20, reason: "demonstracao precisa de tempo para mostrar o produto em uso" };
    case "REVIEW":
      return { durationSeconds: 20, reason: "review precisa de tempo para dor + avaliacao + veredito" };
    case "STORYTELLING":
      return { durationSeconds: 28, reason: "storytelling precisa de mais tempo para construir a narrativa (25-30s)" };
    case "COMPARISON":
      return { durationSeconds: 18, reason: "comparacao precisa mostrar dois lados antes do CTA" };
    case "DISCOVERY":
    case "UGC":
    case "PROBLEM_SOLUTION":
    default:
      return { durationSeconds: 15, reason: "formato de performance/trafego pago padrao (15s)" };
  }
}
