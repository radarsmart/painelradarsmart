import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { TikTokRemotionInput } from "../types";

// ─── Paleta ────────────────────────────────────────────────────────────────────
const BRAND_DARK = "#0A0F1E";
const BRAND_GOLD = "#C9973A";
const BRAND_RED = "#E74C3C";
const BRAND_WHITE = "#FFFFFF";
const BRAND_GREEN = "#22C55E";

// ─── Timing ────────────────────────────────────────────────────────────────────
const INTRO_END_RATIO = 0.18;
const PRICE_WAR_END_RATIO = 0.55;
const SAVINGS_END_RATIO = 0.78;
// 78-100% = CTA

function getZones(dur: number) {
  return {
    introEnd: Math.round(dur * INTRO_END_RATIO),
    priceWarEnd: Math.round(dur * PRICE_WAR_END_RATIO),
    savingsEnd: Math.round(dur * SAVINGS_END_RATIO),
    ctaStart: Math.round(dur * SAVINGS_END_RATIO),
  };
}

function getSpringIn(frame: number, fps: number, delay = 0) {
  const p = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 14, stiffness: 140 },
  });
  return {
    opacity: p,
    transform: `translateY(${interpolate(p, [0, 1], [40, 0])}px)`,
  };
}

function getScalePop(frame: number, fps: number, delay = 0) {
  const p = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 10, stiffness: 220, mass: 0.5 },
  });
  return {
    opacity: p,
    transform: `scale(${interpolate(p, [0, 0.5, 1], [0.3, 1.1, 1])})`,
  };
}

function getPulse(frame: number, fps: number) {
  const cycle = Math.round(fps / 2);
  const scale = 1 + 0.035 * Math.sin(((frame % cycle) / cycle) * Math.PI * 2);
  return { transform: `scale(${scale})` };
}

// ─── Produto em destaque — intro ───────────────────────────────────────────────
function ProductIntro({
  imageUrls,
  productName,
  hook,
  frame,
  fps,
  introEnd,
}: {
  imageUrls: string[];
  productName: string;
  hook: string;
  frame: number;
  fps: number;
  introEnd: number;
}) {
  if (frame >= introEnd) return null;
  const urls =
    imageUrls.length > 0
      ? imageUrls
      : [`https://placehold.co/1080x1920/${BRAND_DARK.replace("#", "")}/C9973A?text=Radar+Smart`];
  const bgScale = spring({ frame, fps, config: { damping: 200, stiffness: 8 } });
  const textAnim = getSpringIn(frame, fps, 6);

  return (
    <AbsoluteFill>
      <Img
        src={urls[0]!}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${1 + bgScale * 0.07})`,
          filter: "brightness(0.6) saturate(1.2)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(10,15,30,0.1) 0%, rgba(10,15,30,0.5) 50%, rgba(10,15,30,0.95) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "22%",
          left: 48,
          right: 48,
          ...textAnim,
        }}
      >
        <div
          style={{
            fontSize: 60,
            fontWeight: 900,
            color: BRAND_WHITE,
            lineHeight: 1.05,
            textShadow: "0 4px 20px rgba(0,0,0,0.6)",
            fontFamily: "Inter, Arial, sans-serif",
          }}
        >
          {hook}
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: BRAND_GOLD,
            marginTop: 12,
            fontFamily: "Inter, Arial, sans-serif",
          }}
        >
          {productName}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Guerra de preços ───────────────────────────────────────────────────────────
function PriceWarZone({
  productName,
  productPrice,
  productDiscount,
  competitorName,
  competitorPrice,
  frame,
  fps,
  introEnd,
  priceWarEnd,
}: {
  productName: string;
  productPrice: string;
  productDiscount?: string;
  competitorName?: string;
  competitorPrice?: string;
  frame: number;
  fps: number;
  introEnd: number;
  priceWarEnd: number;
}) {
  if (frame < introEnd || frame >= priceWarEnd) return null;
  const leftAnim = getSpringIn(frame, fps, introEnd + 2);
  const rightAnim = getScalePop(frame, fps, introEnd + 8);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND_DARK,
        padding: "60px 40px",
        justifyContent: "center",
        gap: 24,
        flexDirection: "column",
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: BRAND_GOLD,
          textAlign: "center",
          letterSpacing: 2,
          fontFamily: "Inter, Arial, sans-serif",
          textTransform: "uppercase",
          ...getSpringIn(frame, fps, introEnd),
        }}
      >
        Compare e decida
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
        {/* Concorrente — lado esquerdo */}
        <div
          style={{
            flex: 1,
            backgroundColor: "rgba(231,76,60,0.12)",
            border: `2px solid ${BRAND_RED}44`,
            borderRadius: 28,
            padding: "32px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            ...leftAnim,
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: BRAND_RED,
              opacity: 0.8,
              fontFamily: "Inter, Arial, sans-serif",
            }}
          >
            {competitorName || "Concorrente"}
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 900,
              color: BRAND_WHITE,
              opacity: 0.5,
              textDecoration: "line-through",
              lineHeight: 1,
              fontFamily: "Inter, Arial, sans-serif",
            }}
          >
            {competitorPrice || "R$???"}
          </div>
          <div
            style={{
              backgroundColor: BRAND_RED,
              borderRadius: 999,
              padding: "6px 18px",
              fontSize: 20,
              fontWeight: 700,
              color: BRAND_WHITE,
              fontFamily: "Inter, Arial, sans-serif",
            }}
          >
            CARO DEMAIS
          </div>
        </div>

        {/* Nosso preço — lado direito */}
        <div
          style={{
            flex: 1,
            backgroundColor: `${BRAND_GOLD}18`,
            border: `3px solid ${BRAND_GOLD}`,
            borderRadius: 28,
            padding: "32px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            boxShadow: `0 0 60px rgba(201,151,58,0.3)`,
            ...rightAnim,
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: BRAND_GOLD,
              fontFamily: "Inter, Arial, sans-serif",
            }}
          >
            Radar Smart
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 900,
              color: BRAND_GOLD,
              lineHeight: 1,
              fontFamily: "Inter, Arial, sans-serif",
            }}
          >
            R${productPrice}
          </div>
          {productDiscount ? (
            <div
              style={{
                backgroundColor: BRAND_GOLD,
                borderRadius: 999,
                padding: "6px 18px",
                fontSize: 20,
                fontWeight: 800,
                color: BRAND_DARK,
                fontFamily: "Inter, Arial, sans-serif",
              }}
            >
              {productDiscount} OFF
            </div>
          ) : (
            <div
              style={{
                backgroundColor: BRAND_GREEN,
                borderRadius: 999,
                padding: "6px 18px",
                fontSize: 20,
                fontWeight: 700,
                color: BRAND_WHITE,
                fontFamily: "Inter, Arial, sans-serif",
              }}
            >
              MELHOR PREÇO
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: BRAND_WHITE,
          opacity: 0.75,
          textAlign: "center",
          fontFamily: "Inter, Arial, sans-serif",
          transform: getSpringIn(frame, fps, introEnd + 15).transform,
        }}
      >
        {productName}
      </div>
    </AbsoluteFill>
  );
}

// ─── Economia em destaque ───────────────────────────────────────────────────────
function SavingsHighlight({
  benefits,
  frame,
  fps,
  priceWarEnd,
  savingsEnd,
}: {
  benefits: string[];
  frame: number;
  fps: number;
  priceWarEnd: number;
  savingsEnd: number;
}) {
  if (frame < priceWarEnd || frame >= savingsEnd) return null;
  const items = benefits.filter(Boolean).slice(0, 3);
  const anim = getSpringIn(frame, fps, priceWarEnd + 4);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND_DARK,
        padding: "60px 48px",
        justifyContent: "center",
        gap: 20,
        flexDirection: "column",
      }}
    >
      <div style={{ ...anim, display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            fontSize: 38,
            fontWeight: 900,
            color: BRAND_WHITE,
            textAlign: "center",
            fontFamily: "Inter, Arial, sans-serif",
          }}
        >
          Por que vale a pena?
        </div>
        {items.map((item, idx) => (
          <div
            key={`${item}-${idx}`}
            style={{
              backgroundColor: idx === 0 ? `${BRAND_GOLD}25` : "rgba(255,255,255,0.07)",
              border: `2px solid ${idx === 0 ? BRAND_GOLD : "rgba(255,255,255,0.1)"}`,
              borderRadius: 20,
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <span style={{ fontSize: 36 }}>{["✅", "⚡", "🔥"][idx] ?? "✅"}</span>
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: BRAND_WHITE,
                fontFamily: "Inter, Arial, sans-serif",
                lineHeight: 1.2,
              }}
            >
              {item}
            </span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ─── CTA ───────────────────────────────────────────────────────────────────────
function CTASection({
  cta,
  shopUrl,
  frame,
  fps,
  ctaStart,
}: {
  cta: string;
  shopUrl?: string;
  frame: number;
  fps: number;
  ctaStart: number;
}) {
  if (frame < ctaStart) return null;
  const enter = getScalePop(frame, fps, ctaStart + 2);
  const pulse = getPulse(frame, fps);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND_DARK,
        justifyContent: "flex-end",
        padding: "0 48px 100px",
      }}
    >
      <div style={{ ...enter }}>
        <div
          style={{
            ...pulse,
            backgroundColor: BRAND_GOLD,
            borderRadius: 28,
            padding: "32px 36px",
            textAlign: "center",
            boxShadow: `0 0 80px rgba(201,151,58,0.55), 0 20px 40px rgba(0,0,0,0.4)`,
          }}
        >
          <div
            style={{
              fontSize: 44,
              fontWeight: 900,
              color: BRAND_DARK,
              lineHeight: 1.1,
              fontFamily: "Inter, Arial, sans-serif",
            }}
          >
            {cta || "Corre no Radar Smart — link na bio!"}
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              color: BRAND_DARK,
              opacity: 0.7,
              marginTop: 10,
              fontFamily: "Inter, Arial, sans-serif",
            }}
          >
            {shopUrl ? "Disponível na vitrine 👆" : "Antes que acabe o estoque 👆"}
          </div>
        </div>
        <div
          style={{
            textAlign: "right",
            marginTop: 12,
            fontSize: 20,
            fontWeight: 700,
            color: BRAND_WHITE,
            opacity: 0.5,
            letterSpacing: 1,
          }}
        >
          RADAR SMART
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Componente Principal ──────────────────────────────────────────────────────
export const ComparacaoPrecoTemplate: React.FC<TikTokRemotionInput> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { introEnd, priceWarEnd, savingsEnd, ctaStart } = getZones(durationInFrames);

  const globalOpacity = interpolate(
    frame,
    [0, 8, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND_DARK,
        fontFamily: "Inter, Arial, sans-serif",
        opacity: globalOpacity,
      }}
    >
      <Audio src={props.audioUrl} />
      <ProductIntro
        imageUrls={props.imageUrls}
        productName={props.productName}
        hook={props.hook}
        frame={frame}
        fps={fps}
        introEnd={introEnd}
      />
      <PriceWarZone
        productName={props.productName}
        productPrice={props.productPrice}
        productDiscount={props.productDiscount}
        competitorName={props.competitorName}
        competitorPrice={props.competitorPrice}
        frame={frame}
        fps={fps}
        introEnd={introEnd}
        priceWarEnd={priceWarEnd}
      />
      <SavingsHighlight
        benefits={props.benefits}
        frame={frame}
        fps={fps}
        priceWarEnd={priceWarEnd}
        savingsEnd={savingsEnd}
      />
      <CTASection
        cta={props.cta}
        shopUrl={props.shopUrl}
        frame={frame}
        fps={fps}
        ctaStart={ctaStart}
      />
    </AbsoluteFill>
  );
};
