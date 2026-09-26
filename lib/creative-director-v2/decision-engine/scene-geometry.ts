// Radar Creative AI - Creative Director V2 / Decision Engine / Scene Geometry
//
// Direcao de composicao real por PURPOSE (nunca por cena especifica - o
// pedido explicitamente proibe hardcodar uma cena). Usada pra montar as
// strings de camera/motion da CommercialScene, mais variadas e decididas que
// a tabela fixa PURPOSE_STAGING de V1 (scene-planner.ts).

import type { ScenePurpose } from "@/lib/commercial-director/types";

export type SubjectScaleV2 = "SMALL" | "MEDIUM" | "LARGE" | "HERO";
export type SubjectPositionV2 = "CENTER" | "LEFT" | "RIGHT";
export type CameraDistanceV2 = "MACRO" | "CLOSE" | "MEDIUM" | "WIDE";
export type CameraAngleV2 = "EYE_LEVEL" | "SLIGHT_HIGH" | "SLIGHT_LOW" | "OVERHEAD";
export type CameraMotionV2 = "STATIC" | "PUSH_IN" | "PULL_OUT" | "ORBIT" | "SLOW_ZOOM" | "WHIP" | "GRAPHIC_PUSH";
export type VisualDepthV2 = "SHALLOW" | "MEDIUM" | "DEEP";

export type SceneGeometryV2 = {
  subjectScale: SubjectScaleV2;
  subjectPosition: SubjectPositionV2;
  cameraDistance: CameraDistanceV2;
  cameraAngle: CameraAngleV2;
  cameraMotion: CameraMotionV2;
  visualDepth: VisualDepthV2;
  foregroundElements: string;
  backgroundActivity: string;
};

const GEOMETRY_BY_PURPOSE: Record<ScenePurpose, SceneGeometryV2> = {
  HOOK: {
    subjectScale: "HERO",
    subjectPosition: "CENTER",
    cameraDistance: "CLOSE",
    cameraAngle: "EYE_LEVEL",
    cameraMotion: "PUSH_IN",
    visualDepth: "SHALLOW",
    foregroundElements: "sujeito principal (produto ou personagem) dominando o quadro",
    backgroundActivity: "fundo desfocado com leve movimento",
  },
  PROBLEM: {
    subjectScale: "MEDIUM",
    subjectPosition: "CENTER",
    cameraDistance: "MEDIUM",
    cameraAngle: "EYE_LEVEL",
    cameraMotion: "STATIC",
    visualDepth: "MEDIUM",
    foregroundElements: "situacao/dor cotidiana em primeiro plano",
    backgroundActivity: "ambiente neutro, sem distracao",
  },
  PRODUCT: {
    subjectScale: "LARGE",
    subjectPosition: "CENTER",
    cameraDistance: "MEDIUM",
    cameraAngle: "SLIGHT_HIGH",
    cameraMotion: "ORBIT",
    visualDepth: "MEDIUM",
    foregroundElements: "produto em uso ativo",
    backgroundActivity: "ambiente de contexto real do uso",
  },
  BENEFIT: {
    subjectScale: "LARGE",
    subjectPosition: "CENTER",
    cameraDistance: "MACRO",
    cameraAngle: "EYE_LEVEL",
    cameraMotion: "SLOW_ZOOM",
    visualDepth: "SHALLOW",
    foregroundElements: "detalhe do beneficio principal",
    backgroundActivity: "totalmente desfocado, foco no detalhe",
  },
  PROOF: {
    subjectScale: "MEDIUM",
    subjectPosition: "LEFT",
    cameraDistance: "MEDIUM",
    cameraAngle: "EYE_LEVEL",
    cameraMotion: "STATIC",
    visualDepth: "MEDIUM",
    foregroundElements: "elemento de prova real (avaliacao/confianca do marketplace)",
    backgroundActivity: "neutro, espaco reservado para overlay de prova",
  },
  OFFER: {
    subjectScale: "HERO",
    subjectPosition: "CENTER",
    cameraDistance: "CLOSE",
    cameraAngle: "SLIGHT_LOW",
    cameraMotion: "GRAPHIC_PUSH",
    visualDepth: "SHALLOW",
    foregroundElements: "produto + preco em destaque grafico",
    backgroundActivity: "desfocado, espaco reservado pro overlay de preco",
  },
  CTA: {
    subjectScale: "MEDIUM",
    subjectPosition: "RIGHT",
    cameraDistance: "MEDIUM",
    cameraAngle: "EYE_LEVEL",
    cameraMotion: "STATIC",
    visualDepth: "MEDIUM",
    foregroundElements: "apresentadora/produto + espaco para CTA",
    backgroundActivity: "identidade visual Radar Smart (dourado sobre fundo escuro)",
  },
};

export function buildSceneGeometry(purpose: ScenePurpose): SceneGeometryV2 {
  return GEOMETRY_BY_PURPOSE[purpose];
}

export function renderGeometryToCameraString(geometry: SceneGeometryV2): string {
  return `${geometry.cameraDistance.toLowerCase()}, angulo ${geometry.cameraAngle.toLowerCase()}, sujeito ${geometry.subjectScale.toLowerCase()} em ${geometry.subjectPosition.toLowerCase()} - ${geometry.foregroundElements}`;
}

const DYNAMIC_CAMERA_MOTIONS = new Set<CameraMotionV2>(["PUSH_IN", "PULL_OUT", "ORBIT", "WHIP", "GRAPHIC_PUSH"]);

export function renderGeometryToMotionString(geometry: SceneGeometryV2): string {
  // "dinamico" so quando o movimento de camera realmente e ativo
  // (PUSH_IN/PULL_OUT/ORBIT/WHIP/GRAPHIC_PUSH) - STATIC continua descrito
  // como estatico (cena de CTA calma e uma escolha valida, nao forcada).
  const energyQualifier = DYNAMIC_CAMERA_MOTIONS.has(geometry.cameraMotion) ? "movimento dinamico de camera" : "camera contida";
  return `${geometry.cameraMotion.toLowerCase()} (${energyQualifier}), profundidade ${geometry.visualDepth.toLowerCase()} - ${geometry.backgroundActivity}`;
}
