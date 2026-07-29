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
const BRAND_WHITE = "#FFFFFF";

// ─── Timing ────────────────────────────────────────────────────────────────────
//  [0 → 25%]  Produto destaque + hook
//  [25 → 55%] Story lines sequenciais (on_screen_text)
//  [55 → 80%] Benefícios em cards
//  [80 → 100%] CTA dourado pulsante
const REVEAL_END_RATIO = 0.25;
const STORY_END_RATIO = 0.55;
const BENEFITS_END_RATIO = 0.8;

function getZones(dur: number) {
  return {
    revealEnd: Math.round(dur * REVEAL_END_RATIO),
    storyEnd: Math.round(dur * STORY_END_RATIO),
    benefitsEnd: Math.round(dur * BENEFITS_END_RATIO),
    ctaStart: Math.round(dur * BENEFITS_END_RATIO),
  };
}

function getSpringIn(frame: number, fps: number, delay = 0) {
  const p = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 16, stiffness: 110 },
  });
  return {
    opacity: p,
    transform: `translateY(${interpolate(p, [0, 1], [50, 0])}px)`,
  };
}

function getScalePop(frame: number, fps: number, delay = 0) {
  const p = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 12, stiffness: 180, mass: 0.7 },
  });
  return {
    opacity: p,
    transform: `scale(${interpolate(p, [0, 0.6, 1], [0.4, 1.08, 1])})`,
  };
}

function getPulse(frame: number, fps: number) {
  const cycle = Math.round(fps / 2);
  const scale = 1 + 0.04 * Math.sin(((frame % cycle) / cycle) * Math.PI * 2);
  return { transform: `scale(${scale})` };
}

// ─── Reveal do Produto ─────────────────────────────────────────────────────────
function ProductReveal({
  imageUrls,
  productName,
  productPrice,
  productDiscount,
  hook,
  frame,
  fps,
  revealEnd,
}: {
  imageUrls: string[];
  productName: string;
  productPrice: string;
  productDiscount?: string;
  hook: string;
  frame: number;
  fps: number;
  revealEnd: number;
}) {
  if (frame >= revealEnd) return null;
  const urls =
    imageUrls.length > 0
      ? imageUrls
      : [`https://placehold.co/1080x1920/${BRAND_DARK.replace("#", "")}/C9973A?text=Produto`];
  const kenBurns = spring({ frame, fps, config: { damping: 200, stiffness: 8 } });
  const textAnim = getSpringIn(frame, fps, 6);
  const badgeAnim = getScalePop(frame, fps, 10);

  return (
    <AbsoluteFill>
      <Img
        src={urls[0]!}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${1 + kenBurns * 0.08})`,
          filter: "brightness(0.58) saturate(1.2)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(10,15,30,0.05) 0%, rgba(10,15,30,0.4) 45%, rgba(10,15,30,0.97) 100%)",
        }}
      />

      {/* Preço badge — centro superior */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 16,
          ...badgeAnim,
        }}
      >
        <div
          style={{
            backgroundColor: BRAND_GOLD,
            borderRadius: 999,
            padding: "14px 36px",
            fontSize: 52,
            fontWeight: 900,
            color: BRAND_DARK,
            boxShadow: `0 0 50px rgba(201,151,58,0.5)`,
            fontFamily: "Inter, Arial, sans-serif",
          }}
        >
          R$ {productPrice}
        </div>
        {productDiscount ? (
          <div
            style={{
              backgroundColor: "#E74C3C",
              borderRadius: 999,
              padding: "14px 28px",
              fontSize: 36,
              fontWeight: 800,
              color: BRAND_WHITE,
              fontFamily: "Inter, Arial, sans-serif",
              alignSelf: "center",
            }}
          >
            {productDiscount}
          </div>
        ) : null}
      </div>

      {/* Hook + nome */}
      <div
        style={{
          position: "absolute",
          bottom: "14%",
          left: 48,
          right: 48,
          ...textAnim,
        }}
      >
        <div
          style={{
            fontSize: 62,
            fontWeight: 900,
            color: BRAND_WHITE,
            lineHeight: 1.05,
            textShadow: "0 4px 24px rgba(0,0,0,0.7)",
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
            marginTop: 14,
            fontFamily: "Inter, Arial, sans-serif",
          }}
        >
          {productName}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Story lines sequenciais ────────────────────────────────────────────────────
function StoryLines({
  body,
  frame,
  fps,
  revealEnd,
  storyEnd,
}: {
  body: string[];
  frame: number;
  fps: number;
  revealEnd: number;
  storyEnd: number;
}) {
  if (frame < revealEnd || frame >= storyEnd) return null;

  const items = body.filter(Boolean).slice(0, 4);
  const window = Math.max(storyEnd - revealEnd, 1);
  const itemWindow = Math.floor(window / Math.max(items.length, 1));
  const currentIdx = Math.min(
    Math.floor((frame - revealEnd) / Math.max(itemWindow, 1)),
    items.length - 1,
  );

  const currentItem = items[currentIdx] ?? "";
  const itemStart = revealEnd + currentIdx * itemWindow;
  const anim = getSpringIn(frame, fps, itemStart + 2);

  // Barra de progresso narrativa
  const progressPct = ((frame - revealEnd) / window) * 100;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND_DARK,
        justifyContent: "center",
        padding: "80px 56px",
        flexDirection: "column",
        gap: 32,
      }}
    >
      {/* Barra de progresso da história */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          backgroundColor: "rgba(255,255,255,0.12)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progressPct}%`,
            backgroundColor: BRAND_GOLD,
            transition: "width 0.1s",
          }}
        />
      </div>

      {/* Indicador de cena */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: BRAND_GOLD,
          opacity: 0.7,
          letterSpacing: 2,
          textTransform: "uppercase",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        {currentIdx + 1} / {items.length}
      </div>

      {/* Texto da cena atual */}
      <div style={{ ...anim }}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: BRAND_WHITE,
            lineHeight: 1.08,
            fontFamily: "Inter, Arial, sans-serif",
          }}
        >
          {currentItem}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Cards de Benefício ────────────────────────────────────────────────────────
function BenefitCards({
  onScreenText,
  frame,
  fps,
  storyEnd,
  benefitsEnd,
}: {
  onScreenText: string[];
  frame: number;
  fps: number;
  storyEnd: number;
  benefitsEnd: number;
}) {
  if (frame < storyEnd || frame >= benefitsEnd) return null;
  const items = onScreenText.filter(Boolean).slice(0, 4);
  const containerAnim = getSpringIn(frame, fps, storyEnd + 4);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND_DARK,
        justifyContent: "center",
        padding: "60px 48px",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div
        style={{
          fontSize: 36,
          fontWeight: 900,
          color: BRAND_WHITE,
          textAlign: "center",
          marginBottom: 8,
          fontFamily: "Inter, Arial, sans-serif",
          ...getSpringIn(frame, fps, storyEnd),
        }}
      >
        O que você leva:
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, ...containerAnim }}>
        {items.map((item, idx) => (
          <div
            key={`${item}-${idx}`}
            style={{
              backgroundColor: `${BRAND_GOLD}${idx === 0 ? "22" : "12"}`,
              border: `2px solid ${idx === 0 ? BRAND_GOLD : `${BRAND_GOLD}40`}`,
              borderRadius: 22,
              padding: "20px 26px",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <span style={{ fontSize: 34 }}>{["🌟", "✅", "⚡", "🔥"][idx] ?? "✅"}</span>
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: BRAND_WHITE,
                lineHeight: 1.2,
                fontFamily: "Inter, Arial, sans-serif",
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

// ─── CTA Final ─────────────────────────────────────────────────────────────────
function CTAFinal({
  cta,
  productPrice,
  shopUrl,
  frame,
  fps,
  ctaStart,
}: {
  cta: string;
  productPrice: string;
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
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Mini preço lembrete */}
      <div
        style={{
          textAlign: "center",
          fontSize: 28,
          fontWeight: 600,
          color: BRAND_WHITE,
          opacity: 0.7,
          fontFamily: "Inter, Arial, sans-serif",
          transform: getSpringIn(frame, fps, ctaStart).transform,
        }}
      >
        Por apenas <strong style={{ color: BRAND_GOLD }}>R$ {productPrice}</strong>
      </div>

      <div style={{ ...enter }}>
        <div
          style={{
            ...pulse,
            backgroundColor: BRAND_GOLD,
            borderRadius: 28,
            padding: "30px 36px",
            textAlign: "center",
            boxShadow: `0 0 80px rgba(201,151,58,0.5), 0 20px 40px rgba(0,0,0,0.4)`,
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
            {cta || "Entra no Radar Smart pelo link na bio!"}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: BRAND_DARK,
              opacity: 0.7,
              marginTop: 10,
              fontFamily: "Inter, Arial, sans-serif",
            }}
          >
            {shopUrl ? "Disponível na vitrine 👆" : "Antes que esgote 👆"}
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
export const StorytellingBeneficioTemplate: React.FC<TikTokRemotionInput> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { revealEnd, storyEnd, benefitsEnd, ctaStart } = getZones(durationInFrames);

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
      <ProductReveal
        imageUrls={props.imageUrls}
        productName={props.productName}
        productPrice={props.productPrice}
        productDiscount={props.productDiscount}
        hook={props.hook}
        frame={frame}
        fps={fps}
        revealEnd={revealEnd}
      />
      <StoryLines
        body={props.body}
        frame={frame}
        fps={fps}
        revealEnd={revealEnd}
        storyEnd={storyEnd}
      />
      <BenefitCards
        onScreenText={props.onScreenText}
        frame={frame}
        fps={fps}
        storyEnd={storyEnd}
        benefitsEnd={benefitsEnd}
      />
      <CTAFinal
        cta={props.cta}
        productPrice={props.productPrice}
        shopUrl={props.shopUrl}
        frame={frame}
        fps={fps}
        ctaStart={ctaStart}
      />
    </AbsoluteFill>
  );
};
