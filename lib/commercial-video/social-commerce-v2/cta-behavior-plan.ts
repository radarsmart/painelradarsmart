import type { CtaBehaviorPlan } from "@/lib/commercial-video/social-commerce-v2/types";

export function buildCtaBehaviorPlan(input: { finalLine?: string | null; objective?: "GROUP" | "SITE" }): CtaBehaviorPlan {
  const destination = input.objective === "SITE" ? "RADAR_SMART_SITE" : "RADAR_SMART_GROUP_VIP";
  return {
    version: "CTA_BEHAVIOR_PLAN_V1",
    finalLine: input.finalLine && input.finalLine.includes("Radar Smart")
      ? input.finalLine
      : "Quer achar ofertas assim? Entra no Grupo VIP da Radar Smart.",
    closerFraming: "CTA_INVITATION",
    invitationGesture: "closer mid shot, direct eye contact, one hand inviting the viewer toward the CTA overlay",
    destination,
    overlayHierarchy: destination === "RADAR_SMART_GROUP_VIP"
      ? ["Grupo VIP", "Radar Smart", "ofertas como essa"]
      : ["Radar Smart", "ver oferta", "preco de hoje"],
    actionBeats: [
      "closer mid shot with come-with-me gesture",
      "point to CTA-safe overlay area",
      "final smiling look to camera so the presenter does not freeze",
    ],
    staticPresenterRisk: "LOW",
  };
}
