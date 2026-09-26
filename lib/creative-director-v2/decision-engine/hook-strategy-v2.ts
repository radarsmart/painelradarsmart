// Radar Creative AI - Creative Director V2 / Decision Engine / Hook Strategy V2
//
// Espaco de estrategias de hook MAIOR que o de V1 (10 valores em
// lib/commercial-director/types.ts#HookStrategy). Como evaluateHookStrength()
// (hook-engine.ts, REUSADA sem alteracao) so entende o enum de V1, cada
// HookStrategyV2 mapeia pra um HookStrategy de V1 SO para fins de pontuacao -
// a riqueza real fica no staging (camera/motion/textOverlay/personagem), que
// e o que de fato muda o resultado visual.

import type { CharacterExpression, CharacterPose, CharacterShot } from "@/lib/brand-character/character-types";
import type { HookStrategy, SellingArgument } from "@/lib/commercial-director/types";

export type HookStrategyV2 =
  | "PRICE_SHOCK"
  | "HERO_PRODUCT_REVEAL"
  | "VISUAL_TRANSFORMATION"
  | "CURIOSITY_REVEAL"
  | "PROBLEM_SOLUTION"
  | "BENEFIT_FIRST"
  | "CHARACTER_DIRECT_HOOK"
  | "COMPARISON_HOOK"
  | "LUXURY_REVEAL";

// Mapa documentado - cada linha e uma escolha deliberada de qual sub-tabela
// de pontuacao de V1 (visualContrast/curiosity em hook-engine.ts) mais se
// aproxima do efeito pretendido pela estrategia V2.
export const HOOK_STRATEGY_V2_TO_V1: Record<HookStrategyV2, HookStrategy> = {
  PRICE_SHOCK: "PRICE_SHOCK",
  // reveal do produto como heroi tem a mesma qualidade de contraste de um
  // "antes (produto nao visivel) -> depois (produto revelado)" - mais
  // proximo de TRANSFORMATION do que de DEMONSTRATION (que mostra o produto
  // EM USO, nao sendo revelado).
  HERO_PRODUCT_REVEAL: "TRANSFORMATION",
  VISUAL_TRANSFORMATION: "TRANSFORMATION",
  CURIOSITY_REVEAL: "CURIOSITY",
  PROBLEM_SOLUTION: "VISUAL_PROBLEM",
  BENEFIT_FIRST: "BENEFIT_FIRST",
  // personagem falando direto pro publico ainda gera curiosidade/atencao,
  // mas sem contraste visual "chocante" - DISCOVERY e o mais proximo.
  CHARACTER_DIRECT_HOOK: "DISCOVERY",
  COMPARISON_HOOK: "COMPARISON",
  // reveal de luxo e um contraste visual forte (like transformation) sem
  // ser literalmente antes/depois.
  LUXURY_REVEAL: "TRANSFORMATION",
};

export type HookStagingV2 = {
  camera: string;
  motion: string;
  textOverlay: string | null;
  characterDirection: { expression: CharacterExpression; pose: CharacterPose; shot: CharacterShot } | null;
  productAction: string;
};

const NO_CHARACTER = null;

export function buildHookStagingForStrategy(
  strategyV2: HookStrategyV2,
  context: { hasOfficialCharacter: boolean; productTitle: string },
): HookStagingV2 {
  const character = (expression: CharacterExpression, pose: CharacterPose, shot: CharacterShot) =>
    context.hasOfficialCharacter ? { expression, pose, shot } : NO_CHARACTER;

  switch (strategyV2) {
    case "PRICE_SHOCK":
      return {
        camera: "close-up extremo no preco/produto",
        motion: "corte rapido, zoom de choque",
        textOverlay: "preco/desconto em choque visual",
        characterDirection: character("SURPRISED", "POINTING", "HALF_BODY"),
        productAction: `${context.productTitle} revelado junto ao preco`,
      };
    case "HERO_PRODUCT_REVEAL":
      return {
        camera: "close-to-wide reveal do produto em HERO, centralizado no quadro",
        motion: "reveal rapido com push-in no produto",
        textOverlay: "frase curta de descoberta",
        characterDirection: NO_CHARACTER,
        productAction: `${context.productTitle} revelado como protagonista imediato`,
      };
    case "VISUAL_TRANSFORMATION":
      return {
        camera: "split ou corte rapido antes/depois",
        motion: "corte de transformacao (whip entre estados)",
        textOverlay: "frase curta de transformacao",
        characterDirection: character("EXCITED", "PRESENTING", "HALF_BODY"),
        productAction: `${context.productTitle} mostrado transformando a situacao`,
      };
    case "CURIOSITY_REVEAL":
      return {
        camera: "close parcial, produto/detalhe escondido no quadro",
        motion: "movimento lento de revelacao parcial",
        textOverlay: "pergunta ou frase de curiosidade",
        characterDirection: character("THOUGHTFUL", "HAND_ON_CHIN", "HALF_BODY"),
        productAction: `${context.productTitle} parcialmente revelado, gerando curiosidade`,
      };
    case "PROBLEM_SOLUTION":
      return {
        camera: "plano medio no problema/situacao",
        motion: "estatico com leve zoom no problema",
        textOverlay: "frase curta nomeando a dor",
        characterDirection: character("THOUGHTFUL", "NEUTRAL", "HALF_BODY"),
        productAction: "situacao/dor mostrada antes do produto entrar",
      };
    case "BENEFIT_FIRST":
      return {
        camera: "close no beneficio principal em uso",
        motion: "push-in rapido no beneficio principal",
        textOverlay: "beneficio principal em destaque",
        characterDirection: character("SMILING", "PRESENTING", "HALF_BODY"),
        productAction: `${context.productTitle} entregando o beneficio principal`,
      };
    case "CHARACTER_DIRECT_HOOK":
      return {
        camera: "close-up na apresentadora, olhar direto pra camera",
        motion: "corte rapido de aproximacao ate o close, fala direta",
        textOverlay: null,
        characterDirection: character("CONFIDENT", "NEUTRAL", "CLOSE_UP"),
        productAction: "produto mencionado verbalmente pela apresentadora, sem estar em quadro ainda",
      };
    case "COMPARISON_HOOK":
      return {
        camera: "split screen ou corte rapido entre duas opcoes",
        motion: "corte rapido alternando os dois lados",
        textOverlay: "frase curta de comparacao",
        characterDirection: character("CONFIDENT", "POINTING", "HALF_BODY"),
        productAction: `${context.productTitle} comparado com a alternativa comum`,
      };
    case "LUXURY_REVEAL":
      return {
        camera: "close cinematografico, luz dourada, produto centralizado",
        motion: "reveal lento e controlado",
        textOverlay: null,
        characterDirection: character("CONFIDENT", "PRESENTING", "HALF_BODY"),
        productAction: `${context.productTitle} revelado como objeto de desejo`,
      };
    default:
      return {
        camera: "close-up dinamico",
        motion: "corte rapido",
        textOverlay: null,
        characterDirection: NO_CHARACTER,
        productAction: "produto em destaque",
      };
  }
}

const HIGH_DISCOUNT_THRESHOLD = 30;

// Mesmo estilo de lib/commercial-director/hook-selector.ts: ordem
// deterministica por sinal real disponivel. Devolve candidatos em ordem de
// prioridade - o motor de decisao (hook-decision-engine.ts) testa nessa
// ordem ate bater o score minimo ou esgotar MAX_HOOK_ATTEMPTS.
export function rankHookCandidates(
  input: { discountPct: number | null; category: string; rating: number | null; reviewsCount: number | null },
  sellingArgument: SellingArgument,
  hasOfficialCharacter: boolean,
): HookStrategyV2[] {
  const candidates: HookStrategyV2[] = [];

  if ((input.discountPct ?? 0) >= HIGH_DISCOUNT_THRESHOLD) candidates.push("PRICE_SHOCK");

  if (sellingArgument === "DEMONSTRATION") candidates.push("HERO_PRODUCT_REVEAL");
  if (sellingArgument === "EMOTIONAL_BENEFIT" || sellingArgument === "EXCLUSIVITY") candidates.push("LUXURY_REVEAL", "VISUAL_TRANSFORMATION");
  // BENEFIT_FIRST antes de PROBLEM_SOLUTION de proposito: ambos servem o
  // argumento pratico, mas BENEFIT_FIRST ja mostra o produto no proprio
  // staging (productAction preenchido) - PROBLEM_SOLUTION mostra a dor antes
  // do produto. Campanhas product-centric preferem o produto aparecer cedo
  // (item 5 do pedido), entao a estrategia que ja carrega produto vem
  // primeiro na ordem de tentativa.
  if (sellingArgument === "PRACTICAL_BENEFIT") candidates.push("BENEFIT_FIRST", "PROBLEM_SOLUTION");
  if (sellingArgument === "SOCIAL_PROOF" && (input.rating || input.reviewsCount)) candidates.push("COMPARISON_HOOK");
  if (hasOfficialCharacter) candidates.push("CHARACTER_DIRECT_HOOK");

  candidates.push("HERO_PRODUCT_REVEAL", "CURIOSITY_REVEAL", "VISUAL_TRANSFORMATION", "BENEFIT_FIRST");

  return Array.from(new Set(candidates));
}

// Estrategias cujo staging (buildHookStagingForStrategy) ja mostra o produto
// diretamente no HOOK - usado so pra relatorio/diagnostico (ver
// decision-engine.ts), nao redecide nada sozinho.
const PRODUCT_CARRYING_STRATEGIES = new Set<HookStrategyV2>([
  "PRICE_SHOCK",
  "HERO_PRODUCT_REVEAL",
  "VISUAL_TRANSFORMATION",
  "BENEFIT_FIRST",
  "COMPARISON_HOOK",
  "LUXURY_REVEAL",
]);

export function hookStrategyCarriesProduct(strategyV2: HookStrategyV2): boolean {
  return PRODUCT_CARRYING_STRATEGIES.has(strategyV2);
}
