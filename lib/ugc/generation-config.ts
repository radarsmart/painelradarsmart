// Configuracao compartilhada da fila de geracao de video (fase 1 da
// "fabrica de criativos"). Antes nao existia nenhum controle de custo/retry
// — qualquer falha do Freepik caia direto pra Pexels sem tentar de novo, e
// nao havia limite de quantos videos por dia o sistema podia gerar.

export const MAX_SCENE_ATTEMPTS = Number(process.env.UGC_MAX_SCENE_ATTEMPTS || 3);

export const DAILY_VIDEO_GENERATION_CAP = Number(
  process.env.UGC_DAILY_VIDEO_CAP || 5,
);

// Custo por cena, em centavos de REAL — medido com uma chamada real ao
// Kling 2.5 Pro (image-to-video) via API no plano Premium+ do Magnific
// (antigo Freepik): 325 creditos pra 5s, 650 creditos pra 10s — escala
// linear em 65 creditos/segundo. O plano Premium+ custa R$180/mes por
// 45.000 creditos (R$0,004/credito = 0,4 centavo/credito), o que da
// ~260 centavos (R$2,60) por cena de 10s. O rotulo "ILIMITADO" que a
// pagina de precos mostra pro Kling 2.5 NAO vale pra chamadas de API,
// so pro uso manual no app — confirmado gastando credito de verdade.
// freepik-text2video usa outro modelo (Kling v3 Omni), sem numero medido
// ainda — assumido igual por ora ate termos um teste real dele tambem.
const CREDIT_COST_CENTAVOS = 0.4; // R$180 / 45.000 creditos
const KLING_CREDITS_PER_SECOND = 65; // confirmado: 325cr/5s e 650cr/10s

export const ESTIMATED_COST_CENTS_PER_SCENE: Record<string, number> = {
  "freepik-animate": Math.round(10 * KLING_CREDITS_PER_SECOND * CREDIT_COST_CENTAVOS), // 260 (cena de 10s)
  "freepik-text2video": Math.round(10 * KLING_CREDITS_PER_SECOND * CREDIT_COST_CENTAVOS), // 260 (estimado igual ao i2v)
  "pexels-stock": 0,
  "ffmpeg-text": 0,
  // OmniHuman 1.5 (avatar falando) — ainda sem numero real medido (feito
  // em 2026-08-06 pro Kling, nao pro OmniHuman). Chutando na mesma ordem
  // de grandeza do Kling por cena de ~5s ate testarmos de verdade.
  "heygen-avatar": Math.round(5 * KLING_CREDITS_PER_SECOND * CREDIT_COST_CENTAVOS),
};

export function estimateJobCostCents(sceneTypes: string[]): number {
  return sceneTypes.reduce(
    (total, type) => total + (ESTIMATED_COST_CENTS_PER_SCENE[type] ?? 0),
    0,
  );
}

// Mesma logica de chave de data em fuso de Sao Paulo ja usada em
// app/api/admin/criativos/video-jobs/route.ts, extraida aqui pra ser
// compartilhada sem criar dependencia entre os dois pipelines.
export function getSaoPauloDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
