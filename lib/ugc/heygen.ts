import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const HEYGEN_API_URL = "https://api.heygen.com";

function getApiKey(): string {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error("HEYGEN_API_KEY missing");
  return apiKey;
}

/**
 * Lista os avatars disponíveis (v2)
 */
export async function listAvatars() {
  const apiKey = getApiKey();
  const response = await fetch(`${HEYGEN_API_URL}/v2/avatars`, {
    headers: { "x-api-key": apiKey }
  });
  const data = await response.json();
  // Log para debug se necessário
  // console.log("DEBUG HeyGen Avatars:", JSON.stringify(data).slice(0, 500));
  return data?.data?.avatars || data?.data?.list || [];
}

/**
 * Submete tarefa de geração de vídeo (v2)
 */
export async function generateVideoV2(avatarId: string, audioUrl: string, backgroundUrl?: string) {
  const apiKey = getApiKey();
  const response = await fetch(`${HEYGEN_API_URL}/v2/video/generate`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      video_inputs: [{
        character: {
          type: "avatar",
          avatar_id: avatarId,
          avatar_style: "normal"
        },
        voice: {
          type: "audio",
          audio_url: audioUrl
        },
        background: backgroundUrl ? {
          type: "image",
          url: backgroundUrl
        } : {
          type: "color",
          value: "#0A0F1E"
        }
      }],
      dimension: { width: 1080, height: 1920 },
      aspect_ratio: "9:16"
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`HeyGen Error: ${JSON.stringify(data)}`);
  return data?.data?.video_id;
}

/**
 * Submete tarefa de geração de vídeo CINEMÁTICO (Avatar IV / Seedance 2.0)
 */
export async function generateCinematicVideo(avatarId: string, audioUrl: string, motionPrompt: string, expressiveness: 'high' | 'medium' | 'low' = 'high') {
  const apiKey = getApiKey();
  
  // Algumas pesquisas indicam v2/videos para motion_prompt com estrutura plana
  const response = await fetch(`${HEYGEN_API_URL}/v2/videos`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      avatar_id: avatarId,
      audio_url: audioUrl,
      motion_prompt: motionPrompt,
      avatar_expressiveness: expressiveness,
      aspect_ratio: "9:16",
      resolution: "1080p"
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`HeyGen Cinematic Error: ${JSON.stringify(data)}`);
  return data?.data?.video_id;
}

/**
 * Poll do status do vídeo (v1)
 */
export async function videoStatus(videoId: string) {
  const apiKey = getApiKey();
  const response = await fetch(`${HEYGEN_API_URL}/v1/video_status.get?video_id=${videoId}`, {
    headers: { "x-api-key": apiKey }
  });
  const data = await response.json();
  return data?.data;
}
