export type OpportunityEngineFlags = {
  OPPORTUNITY_ENGINE_MODE: "off" | "shadow" | "enforce";
  PRODUCT_NORMALIZER_ENABLED: boolean;
  PRICE_COMPARISON_ENABLED: boolean;
  PRICE_HISTORY_ENABLED: boolean;
  TREND_ENGINE_ENABLED: boolean;
  PURCHASE_INTENT_ENABLED: boolean;
  OPPORTUNITY_EVALUATION_ENABLED: boolean;
  OPPORTUNITY_AUTO_PUBLISH_ENABLED: boolean;
  OPPORTUNITY_ENGINE_ENABLED: boolean;
  PUBLISHING_GATE_ENABLED: boolean;
};

function envFlag(name: keyof OpportunityEngineFlags, defaultValue = false): boolean {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return defaultValue;
  return ["1", "true", "yes", "on", "enabled"].includes(value);
}

function envMode(): OpportunityEngineFlags["OPPORTUNITY_ENGINE_MODE"] {
  const value = String(process.env.OPPORTUNITY_ENGINE_MODE ?? "").trim().toLowerCase();
  if (value === "off" || value === "shadow" || value === "enforce") return value;
  if (envFlag("PUBLISHING_GATE_ENABLED")) return "enforce";
  if (envFlag("OPPORTUNITY_ENGINE_ENABLED") || envFlag("OPPORTUNITY_EVALUATION_ENABLED")) {
    return "shadow";
  }
  return "off";
}

export function getOpportunityEngineFlags(): OpportunityEngineFlags {
  const mode = envMode();
  return {
    OPPORTUNITY_ENGINE_MODE: mode,
    PRODUCT_NORMALIZER_ENABLED: envFlag("PRODUCT_NORMALIZER_ENABLED"),
    PRICE_COMPARISON_ENABLED: envFlag("PRICE_COMPARISON_ENABLED"),
    PRICE_HISTORY_ENABLED: envFlag("PRICE_HISTORY_ENABLED"),
    TREND_ENGINE_ENABLED: envFlag("TREND_ENGINE_ENABLED"),
    PURCHASE_INTENT_ENABLED: envFlag("PURCHASE_INTENT_ENABLED"),
    OPPORTUNITY_EVALUATION_ENABLED:
      mode !== "off" || envFlag("OPPORTUNITY_EVALUATION_ENABLED"),
    OPPORTUNITY_AUTO_PUBLISH_ENABLED:
      mode === "enforce" && envFlag("OPPORTUNITY_AUTO_PUBLISH_ENABLED", true),
    OPPORTUNITY_ENGINE_ENABLED: mode !== "off" || envFlag("OPPORTUNITY_ENGINE_ENABLED"),
    PUBLISHING_GATE_ENABLED: mode === "enforce" || envFlag("PUBLISHING_GATE_ENABLED"),
  };
}

export function shouldEnforceOpportunityGate(): boolean {
  return getOpportunityEngineFlags().OPPORTUNITY_ENGINE_MODE === "enforce";
}
