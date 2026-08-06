// Fonte unica da identidade visual da Radar Smart pros videos gerados.
// Antes essas cores estavam espalhadas em 3 lugares diferentes e
// desconectados (video-composer.ts, lib/tiktok-engine/gemini-prompt.ts, e
// .agent/skills/criativos/SKILL.md) — confirmado com o dono que a paleta
// oficial e a que ja roda hoje em video-composer.ts.

export const BRAND_COLOR_DARK = "#0A0F1E";
export const BRAND_COLOR_GOLD = "#C9973A";

export const BRAND_NAME = "Radar Smart";

// Linha exata do "prompt mestre" cinematografico do dono (registrado
// 2026-08-06) — usar sempre esse texto literal como CTA final, nao
// parafrasear.
export const BRAND_CTA_LINE = "Acesse o Radar Smart e aproveite essa oferta antes que ela acabe.";

export const BRAND_LOGO_PUBLIC_PATH = "public/logo-radar-smart.png";

// Prompt (estilo Freepik/Kling) do card de encerramento — mesma tecnica ja
// validada em lib/tiktok-engine/gemini-prompt.ts's OUTRO_BRAND_CARD, so que
// escrito pra um modelo de imagem/video em vez de copy-paste manual.
export const OUTRO_BRAND_CARD_PROMPT =
  `Minimal premium closing card for an online ad, solid dark graphite background (${BRAND_COLOR_DARK}), ` +
  `centered circular emblem logo in gold (${BRAND_COLOR_GOLD}) with a subtle radar/cart icon, ` +
  `bold gold text below reading "${BRAND_NAME}", clean modern sans-serif typography, ` +
  "9:16 vertical format, no people, no clutter, high-end e-commerce brand aesthetic.";

// Texto do slide de fechamento quando a cena e renderizada localmente
// (ffmpeg-text), pra manter consistencia com o card acima quando nao vale a
// pena gastar uma chamada de IA so pro encerramento.
export const OUTRO_TEXT_TITLE = "GARANTA JÁ";
export const OUTRO_TEXT_SUBTITLE = BRAND_CTA_LINE;
