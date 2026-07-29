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

import type { TikTokRemotionInput } from "@/lib/tiktok-engine/remotion/types";

const BACKGROUND = "#0f172a";

function getTemplateAccent(template: TikTokRemotionInput["template"]) {
  switch (template) {
    case "problem_solution":
      return "#ef4444";
    case "comparison":
      return "#3b82f6";
    case "price_duel":
      return "#10b981";
    case "social_proof":
      return "#f59e0b";
    default:
      return "#8b5cf6";
  }
}

function formatList(text: string, limit = 3) {
  return text
    .split(/\n|\d+\./)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

const badgeStyle: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 999,
  fontSize: 28,
  fontWeight: 800,
  lineHeight: 1,
};

export const TikTokProductVideo: React.FC<TikTokRemotionInput> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const accent = getTemplateAccent(props.template);

  const mainScale = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 130 },
  });

  const imageUrls = props.imageUrls.length
    ? props.imageUrls
    : [`https://placehold.co/1080x1920/0f172a/ffffff?text=${encodeURIComponent(props.productName)}`];
  const imageIndex = Math.min(
    imageUrls.length - 1,
    Math.floor((frame / Math.max(durationInFrames / imageUrls.length, 1)) % imageUrls.length),
  );

  const bodyBlocks = props.body.filter(Boolean).slice(0, 3);
  const hookEnd = Math.round(durationInFrames * 0.24);
  const ctaStart = Math.round(durationInFrames * 0.78);
  const bodyWindow = Math.max(ctaStart - hookEnd, 1);
  const bodyIndex = Math.min(
    bodyBlocks.length - 1,
    Math.floor(((frame - hookEnd) / Math.max(bodyWindow / Math.max(bodyBlocks.length, 1), 1))),
  );

  const overlayOpacity = interpolate(frame, [0, 12, durationInFrames - 18, durationInFrames], [0, 1, 1, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BACKGROUND,
        color: "#ffffff",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <Audio src={props.audioUrl} />

      <AbsoluteFill>
        <Img
          src={imageUrls[imageIndex]}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${1 + mainScale * 0.06})`,
            filter: "brightness(0.75) saturate(1.1)",
          }}
        />
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(180deg, rgba(15,23,42,0.15) 0%, rgba(15,23,42,0.55) 35%, rgba(15,23,42,0.9) 100%)",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ padding: 48, justifyContent: "space-between", opacity: overlayOpacity }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span style={{ ...badgeStyle, backgroundColor: accent }}>{props.productPrice}</span>
            {props.productDiscount ? (
              <span style={{ ...badgeStyle, backgroundColor: "#ffffff", color: "#0f172a" }}>
                {props.productDiscount}
              </span>
            ) : null}
          </div>

          <div
            style={{
              backgroundColor: "rgba(15,23,42,0.72)",
              border: `2px solid ${accent}`,
              borderRadius: 32,
              padding: "24px 28px",
              boxShadow: "0 18px 48px rgba(15,23,42,0.35)",
            }}
          >
            <div style={{ fontSize: 58, fontWeight: 900, lineHeight: 1.02, marginBottom: 12 }}>
              {frame < hookEnd ? props.hook : bodyBlocks[bodyIndex] ?? props.hook}
            </div>
            <div style={{ fontSize: 30, opacity: 0.9, lineHeight: 1.2 }}>{props.productName}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {props.competitorPrice ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 18,
                backgroundColor: "rgba(255,255,255,0.95)",
                color: "#0f172a",
                borderRadius: 28,
                padding: "18px 24px",
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              <span>{props.competitorName || "Concorrente"}</span>
              <span>{props.competitorPrice}</span>
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "1fr",
            }}
          >
            {props.onScreenText.slice(0, 3).map((item, index) => (
              <div
                key={`${item}-${index}`}
                style={{
                  backgroundColor: index === 2 ? accent : "rgba(255,255,255,0.12)",
                  borderRadius: 22,
                  padding: "16px 20px",
                  fontSize: 28,
                  fontWeight: 700,
                  lineHeight: 1.15,
                }}
              >
                {item}
              </div>
            ))}
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              color: "#0f172a",
              borderRadius: 28,
              padding: "22px 24px",
              borderLeft: `12px solid ${accent}`,
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 900, marginBottom: 8 }}>
              {frame >= ctaStart ? props.cta : "Clique no link e veja a oferta"}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, opacity: 0.72 }}>
              {props.shopUrl ? "Oferta disponivel no link da vitrine" : "Toque para conferir agora"}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export function buildBenefitsForTemplate(text: string) {
  return formatList(text, 4);
}
