// Radar Creative AI - Creative Brain / Presenter Mode
//
// Apenas estrutura a decisao futura de "quem aparece no video" - NAO
// substitui nem religa o algoritmo atual de selecao de persona
// (orchestrator.ts continua escolhendo por score normalmente). Isso existe
// pra deixar explicito, desde ja, que a Garota Radar nao e obrigatoria em
// 100% dos criativos.

export type PresenterMode =
  | "AUTO"
  | "GAROTA_RADAR"
  | "PERSONA_DO_NICHO"
  | "SEM_APRESENTADOR";

export const PRESENTER_MODES: PresenterMode[] = [
  "AUTO",
  "GAROTA_RADAR",
  "PERSONA_DO_NICHO",
  "SEM_APRESENTADOR",
];

/**
 * Placeholder da decisao futura. Hoje sempre retorna "AUTO" (deixa o
 * scoring de persona existente decidir) - a logica real de quando preferir
 * a Garota Radar, uma persona de nicho, ou nenhum apresentador (ex:
 * produto que se demonstra sozinho) sera implementada numa fase futura,
 * quando o Creative Brain tiver dados de performance (CTR/retencao) pra
 * basear essa escolha.
 */
export function resolvePresenterMode(): PresenterMode {
  return "AUTO";
}
