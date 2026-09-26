// Radar Creative AI - Creative Director / Version Flag
//
// Escolha explicita entre V1 (lib/commercial-director/**, arquitetura
// validada, default seguro) e V2 (lib/creative-director-v2/decision-engine/**,
// READY_FOR_V2_PIPELINE_INTEGRATION=YES). Persistido em
// creative_brief.creativeDirectorVersion - AUSENTE = "V1" em todo lugar que
// le isso (nunca migra campanha antiga silenciosamente).

export type CreativeDirectorVersion = "V1" | "V2";

export const DEFAULT_CREATIVE_DIRECTOR_VERSION: CreativeDirectorVersion = "V1";

export function resolveCreativeDirectorVersion(value: unknown): CreativeDirectorVersion {
  return value === "V2" ? "V2" : DEFAULT_CREATIVE_DIRECTOR_VERSION;
}
