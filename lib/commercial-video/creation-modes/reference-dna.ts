import type { CreativeDNA, CreativeRemixGuard, ReferenceVideoContract } from "@/lib/commercial-video/creation-modes/types";

export function buildReferenceFixtureDna(source: "REFERENCE_A" | "REFERENCE_B"): CreativeDNA {
  if (source === "REFERENCE_A") {
    return {
      source,
      durationSeconds: 15,
      hookMechanism: "product-first macro reveal with immediate benefit promise",
      pacing: "FAST",
      averageShotLengthSeconds: 2.5,
      presenterUsage: "none",
      presenterContinuity: "product remains the visual anchor across every scene",
      productFirstAppearanceSecond: 0,
      productUsageDemonstration: "hands demonstrate texture, scale, and use without changing package identity",
      shotSequence: ["macro product", "use detail", "benefit close", "offer packshot", "CTA packshot"],
      cameraSequence: ["macro", "locked close-up", "slow push-in", "static offer", "static CTA"],
      motionSequence: ["snap cut", "gentle product move", "slow zoom", "price pop", "brand end beat"],
      offerTimingSecond: 11,
      ctaTimingSecond: 13,
      emotionalArc: ["curiosity", "clarity", "desire", "urgency", "action"],
      narrativePattern: "show the product, prove relevance, reveal offer, send to Radar Smart",
      visualEnergy: "HIGH",
    };
  }

  return {
    source,
    durationSeconds: 20,
    hookMechanism: "presenter discovery hook framed as an authentic find",
    pacing: "MEDIUM",
    averageShotLengthSeconds: 4,
    presenterUsage: "presenter opens and closes, product owns the middle",
    presenterContinuity: "same presenter returns at the CTA but does not cover every product beat",
    productFirstAppearanceSecond: 3,
    productUsageDemonstration: "presenter introduces use, then product-only scene preserves fidelity",
    shotSequence: ["presenter hook", "product handoff", "demo close", "offer overlay", "presenter CTA"],
    cameraSequence: ["handheld medium", "over-shoulder", "macro", "static product", "front CTA"],
    motionSequence: ["quick lean-in", "natural hand movement", "slow demo", "price reveal", "direct invite"],
    offerTimingSecond: 15,
    ctaTimingSecond: 17,
    emotionalArc: ["discovery", "trust", "proof of use", "value", "action"],
    narrativePattern: "creator finds product, demonstrates it, then directs viewer to Radar Smart",
    visualEnergy: "MEDIUM",
  };
}

export function buildCreativeDnaFromReference(reference: ReferenceVideoContract | null | undefined): CreativeDNA | null {
  if (!reference?.sourceUrl) return null;

  const base = reference.preserveStructure || reference.preserveProductPresentationMechanism
    ? buildReferenceFixtureDna("REFERENCE_A")
    : buildReferenceFixtureDna("REFERENCE_B");

  return {
    ...base,
    source: "USER_REFERENCE_URL",
    hookMechanism: reference.preserveHookMechanism ? base.hookMechanism : "Radar Smart compliant adapted hook",
    pacing: reference.preservePacing ? base.pacing : "MEDIUM",
    cameraSequence: reference.preserveCameraLanguage ? base.cameraSequence : ["front hook", "product locked shot", "offer static", "CTA front"],
    ctaTimingSecond: reference.preserveCtaMechanism ? base.ctaTimingSecond : Math.max(8, base.durationSeconds - 3),
    narrativePattern: "adapted mechanics from user reference, with all specific identity, brand, lines, and product replaced",
  };
}

export function evaluateCreativeRemixGuard(reference: ReferenceVideoContract | null | undefined): CreativeRemixGuard | null {
  if (!reference?.sourceUrl) return null;

  const preservedMechanics = [
    reference.preserveStructure ? "structure" : null,
    reference.preservePacing ? "pacing" : null,
    reference.preserveHookMechanism ? "hook mechanism" : null,
    reference.preserveCameraLanguage ? "camera language" : null,
    reference.preserveProductPresentationMechanism ? "product presentation mechanism" : null,
    reference.preserveCtaMechanism ? "CTA mechanism" : null,
  ].filter((entry): entry is string => Boolean(entry));

  const replacedSpecifics = [
    "person or influencer identity",
    "environment",
    "product",
    "spoken lines",
    "brand identity",
    "on-screen text",
    "specific gestures",
    "music",
    "frame-by-frame composition",
  ];

  const cloneRisk = preservedMechanics.length >= 5
    ? ["many mechanics preserved; storyboard must keep product, person, lines, brand, environment, and frames distinct"]
    : [];

  return {
    status: cloneRisk.length ? "PASS_WITH_OBSERVATIONS" : "PASS",
    preservedMechanics,
    replacedSpecifics,
    blockedCloneRisks: cloneRisk,
    notes: [
      "External URL is treated only as a future ingestion reference; no downloader or scraping is used here.",
      "The remix may preserve advertising mechanics but must not clone protected expressive details.",
    ],
  };
}
