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

// ─── Paleta Radar Smart ────────────────────────────────────────────────────────
const BRAND_DARK = "#0A0F1E";
const BRAND_GOLD = "#C9973A";
const BRAND_RED = "#E74C3C";
const BRAND_WHITE = "#FFFFFF";

// ─── Constantes de timing ─────────────────────────────────────────────────────
const HOOK_END_RATIO = 0.22; // 22% do vídeo = zona do hook
const PRICE_BOMB_END_RATIO = 0.45; // 22-45% = bomba de preço
const BENEFITS_END_RATIO = 0.78; // 45-78% = benefícios sequenciais
// 78-100% = CTA pulsante

function getZones(durationInFrames: number) {
  const hookEnd = Math.round(durationInFrames * HOOK_END_RATIO);
  const priceBombEnd = Math.round(durationInFrames * PRICE_BOMB_END_RATIO);
  const benefitsEnd = Math.round(durationInFrames * BENEFITS_END_RATIO);
  const ctaStart = benefitsEnd;
  return { hookEnd, priceBombEnd, benefitsEnd, ctaStart };
}

// ─── Animations ────────────────────────────────────────────────────────────────
function getSlideUp(frame: number, fps: number, startAt = 0) {
  const progress = spring({
    frame: Math.max(0, frame - startAt),
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });
  return {
    transform: `translateY(${interpolate(progress, [0, 1], [60, 0])}px)`,
    opacity: interpolate(progress, [0, 0.3, 1], [0, 0.7, 1]),
  };
}

function getScalePop(frame: number, fps: number, startAt = 0) {
  const progress = spring({
    frame: Math.max(0, frame - startAt),
    fps,
    config: { damping: 10, stiffness: 200, mass: 0.6 },
  });
  return {
    transform: `scale(${interpolate(progress, [0, 0.6, 1], [0.2, 1.12, 1])})`,
    opacity: progress,
  };
}

function getPulse(frame: number, fps: number) {
  // Pulsa 2x por segundo
  const cycleFrames = Math.round(fps / 2);
  const cycleProgress = (frame % cycleFrames) / cycleFrames;
  const scale = 1 + 0.04 * Math.sin(cycleProgress * Math.PI * 2);
  return { transform: `scale(${scale})` };
}

// ─── Sub-componentes ────────────────────────────────────────────────────────────
function ProductBackground({
  imageUrls,
  frame,
  durationInFrames,
  fps,
}: {
  imageUrls: string[];
  frame: number;
  durationInFrames: number;
  fps: number;
}) {
  const urls =
    imageUrls.length > 0
      ? imageUrls
      : [`https://placehold.co/1080x1920/${BRAND_DARK.replace("#", "")}/${BRAND_GOLD.replace("#", "")}?text=Radar+Smart`];

  const framesPerImage = Math.max(Math.floor(durationInFrames / urls.length), 1);
  const imageIndex = Math.min(Math.floor(frame / framesPerImage), urls.length - 1);

  const kenBurns = spring({ frame, fps, config: { damping: 200, stiffness: 10 } });
  const scale = 1 + kenBurns * 0.08;

  return (
    <AbsoluteFill>
      <Img
        src={urls[imageIndex]!}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
          filter: "brightness(0.65) saturate(1.15)",
        }}
      />
      {/* Gradiente dramático — mais escuro na base para os overlays */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(10,15,30,0.08) 0%, rgba(10,15,30,0.45) 40%, rgba(10,15,30,0.92) 100%)",
        }}
      />
    </AbsoluteFill>
  );
}

function HookZone({
  hook,
  frame,
  fps,
  hookEnd,
}: {
  hook: string;
  frame: number;
  fps: number;
  hookEnd: number;
}) {
  const visible = frame < hookEnd;
  if (!visible) return null;
  const slide = getSlideUp(frame, fps, 4);
  return (
    <div
      style={{
        position: "absolute",
        top: "14%",
        left: 48,
        right: 48,
        ...slide,
      }}
    >
      {/* Badge DESTAQUE */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          backgroundColor: BRAND_GOLD,
          borderRadius: 999,
          padding: "8px 20px",
          marginBottom: 20,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 800, color: BRAND_DARK, letterSpacing: 1 }}>
          🔥 OFERTA IMPERDÍVEL
        </span>
      </div>

      {/* Texto do hook */}
      <div
        style={{
          fontSize: 68,
          fontWeight: 900,
          lineHeight: 1.05,
          color: BRAND_WHITE,
          textShadow: "0 4px 24px rgba(0,0,0,0.7)",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        {hook}
      </div>
    </div>
  );
}

function PriceBomb({
  productName,
  productPrice,
  productDiscount,
  frame,
  fps,
  hookEnd,
  priceBombEnd,
}: {
  productName: string;
  productPrice: string;
  productDiscount?: string;
  frame: number;
  fps: number;
  hookEnd: number;
  priceBombEnd: number;
}) {
  const visible = frame >= hookEnd && frame < priceBombEnd;
  if (!visible) return null;
  const pop = getScalePop(frame, fps, hookEnd + 2);
  return (
    <div
      style={{
        position: "absolute",
        top: "12%",
        left: 48,
        right: 48,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        ...pop,
      }}
    >
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: BRAND_WHITE,
          opacity: 0.85,
          textAlign: "center",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        {productName}
      </div>
      <div
        style={{
          backgroundColor: BRAND_GOLD,
          borderRadius: 28,
          padding: "28px 48px",
          textAlign: "center",
          boxShadow: `0 0 60px rgba(201,151,58,0.6), 0 24px 48px rgba(0,0,0,0.4)`,
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 600, color: BRAND_DARK, opacity: 0.75 }}>
          por apenas
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 900,
            color: BRAND_DARK,
            lineHeight: 1,
            fontFamily: "Inter, Arial, sans-serif",
          }}
        >
          R$ {productPrice}
        </div>
        {productDiscount ? (
          <div
            style={{
              display: "inline-block",
              backgroundColor: BRAND_RED,
              borderRadius: 999,
              padding: "6px 20px",
              fontSize: 28,
              fontWeight: 800,
              color: BRAND_WHITE,
              marginTop: 12,
            }}
          >
            {productDiscount} OFF
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BenefitsStrip({
  onScreenText,
  frame,
  fps,
  priceBombEnd,
  benefitsEnd,
}: {
  onScreenText: string[];
  frame: number;
  fps: number;
  priceBombEnd: number;
  benefitsEnd: number;
}) {
  if (frame < priceBombEnd || frame >= benefitsEnd) return null;
  const items = onScreenText.filter(Boolean).slice(0, 4);
  if (items.length === 0) return null;
  const window = Math.max(benefitsEnd - priceBombEnd, 1);
  const itemWindow = Math.floor(window / items.length);
  const currentIndex = Math.min(
    Math.floor((frame - priceBombEnd) / Math.max(itemWindow, 1)),
    items.length - 1,
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: "28%",
        left: 48,
        right: 48,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {items.map((item, idx) => {
        const itemStart = priceBombEnd + idx * itemWindow;
        const slide = getSlideUp(frame, fps, itemStart);
        const isVisible = frame >= itemStart;
        const isActive = idx === currentIndex;

        return (
          <div
            key={`${item}-${idx}`}
            style={{
              ...slide,
              opacity: isVisible ? (isActive ? 1 : 0.65) : 0,
              backgroundColor: idx === 0 ? `${BRAND_GOLD}22` : "rgba(255,255,255,0.1)",
              border: `2px solid ${isActive ? BRAND_GOLD : "rgba(255,255,255,0.15)"}`,
              borderRadius: 20,
              padding: "18px 24px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span style={{ fontSize: 32 }}>✅</span>
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: BRAND_WHITE,
                fontFamily: "Inter, Arial, sans-serif",
                lineHeight: 1.2,
              }}
            >
              {item}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CTAPulse({
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
  const enterAnim = getScalePop(frame, fps, ctaStart + 2);
  const pulse = getPulse(frame, fps);
  const textCta = cta || "Entra no Radar Smart pelo link na bio!";

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 48,
        right: 48,
        ...enterAnim,
      }}
    >
      <div
        style={{
          ...pulse,
          backgroundColor: BRAND_GOLD,
          borderRadius: 28,
          padding: "28px 32px",
          textAlign: "center",
          boxShadow: `0 0 80px rgba(201,151,58,0.5), 0 20px 40px rgba(0,0,0,0.5)`,
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 900,
            color: BRAND_DARK,
            lineHeight: 1.1,
            fontFamily: "Inter, Arial, sans-serif",
          }}
        >
          {textCta}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: BRAND_DARK,
            opacity: 0.7,
            marginTop: 10,
          }}
        >
          {shopUrl ? "Garanta pelo link da vitrine 👆" : "Link na bio — antes que esgote 👆"}
        </div>
      </div>

      {/* Logo Radar Smart — canto inferior direito, discreto */}
      <div
        style={{
          position: "absolute",
          bottom: -60,
          right: 0,
          fontSize: 20,
          fontWeight: 700,
          color: BRAND_WHITE,
          opacity: 0.55,
          letterSpacing: 1,
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        RADAR SMART
      </div>
    </div>
  );
}

// ─── Componente Principal ──────────────────────────────────────────────────────
export const HookChoqueTemplate: React.FC<TikTokRemotionInput> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { hookEnd, priceBombEnd, benefitsEnd, ctaStart } = getZones(durationInFrames);

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

      {/* Camada 1: produto como fundo */}
      <ProductBackground
        imageUrls={props.imageUrls}
        frame={frame}
        durationInFrames={durationInFrames}
        fps={fps}
      />

      {/* Camada 2: overlays de conteúdo */}
      <HookZone hook={props.hook} frame={frame} fps={fps} hookEnd={hookEnd} />
      <PriceBomb
        productName={props.productName}
        productPrice={props.productPrice}
        productDiscount={props.productDiscount}
        frame={frame}
        fps={fps}
        hookEnd={hookEnd}
        priceBombEnd={priceBombEnd}
      />
      <BenefitsStrip
        onScreenText={props.onScreenText}
        frame={frame}
        fps={fps}
        priceBombEnd={priceBombEnd}
        benefitsEnd={benefitsEnd}
      />
      <CTAPulse
        cta={props.cta}
        shopUrl={props.shopUrl}
        frame={frame}
        fps={fps}
        ctaStart={ctaStart}
      />
    </AbsoluteFill>
  );
};
