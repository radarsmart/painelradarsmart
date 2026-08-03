"use client";

// Helpers pra disparar evento de conversao nos 3 pixels instalados em
// AnalyticsScripts (GA4, Meta, TikTok) a partir de qualquer client component,
// sem cada chamador precisar saber o nome do evento em cada plataforma.
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: {
      track: (event: string, params?: Record<string, unknown>) => void;
      page: () => void;
    };
  }
}

// Clique em "Entrar no Grupo" (WhatsApp/Telegram) — a principal conversao do
// site hoje, e o sinal que os pixels de Meta/TikTok usam pra aprender
// publico parecido (lookalike) quando a gente comecar a rodar anuncio.
export function trackGroupJoinClick(channel: "whatsapp" | "telegram", origin: string) {
  if (typeof window === "undefined") return;
  window.gtag?.("event", "generate_lead", { method: channel, content_name: origin });
  window.fbq?.("track", "Lead", { content_name: `grupo_${channel}`, content_category: origin });
  window.ttq?.track("SubmitForm", { content_type: "group_join", description: `${channel}_${origin}` });
}

// Clique no WhatsApp de suporte (duvida, nao e entrada no grupo de ofertas).
export function trackSupportContactClick(origin: string) {
  if (typeof window === "undefined") return;
  window.gtag?.("event", "contact", { method: "whatsapp", content_name: origin });
  window.fbq?.("track", "Contact");
  window.ttq?.track("Contact");
}
