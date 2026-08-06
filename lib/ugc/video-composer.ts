import * as dotenv from "dotenv";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { chromium } from "playwright";
import { UGCOfferContext } from "./types";
import {
  animateImage,
  generateImage,
  removeBackground,
  textToVideo,
} from "./freepik";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// Função para localizar o FFmpeg de forma dinâmica
function findFfmpegPath(): string {
  // 1. Verificar variável de ambiente
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  // 2. Tentar comando 'where' no Windows ou 'which' no Linux
  try {
    const command = process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    const result = execSync(command).toString().split("\n")[0].trim();
    if (result && fs.existsSync(result)) {
      return result;
    }
  } catch {
    // ignorar erro se não encontrar
  }

  // 3. Fallback para o caminho do CapCut (apenas para ambiente local do usuário)
  const capcutPath = path.join(
    process.env.LOCALAPPDATA || "",
    "CapCut",
    "Apps",
    "8.1.1.3417",
    "ffmpeg.exe",
  );
  
  if (fs.existsSync(capcutPath)) {
    return capcutPath;
  }

  // 4. Último recurso: assumir que está no PATH global
  return "ffmpeg";
}

const FFMPEG_PATH = findFfmpegPath();
ffmpeg.setFfmpegPath(FFMPEG_PATH);

export interface VideoScene {
  type: "freepik-animate" | "freepik-text2video" | "pexels-stock" | "ffmpeg-text" | "heygen-avatar";
  duration: number;
  prompt?: string;
  imageUrl?: string;
  text?: string;
  subtext?: string;
  searchQuery?: string;
  backgroundColor?: string;
  // So usado por cenas heygen-avatar: audio (hook ou cta) que o OmniHuman
  // usa como referencia pra sincronizar os labios — o video resultante ja
  // sai com esse audio "embutido" (mas normalizeClip tira o audio de toda
  // cena por simplicidade; a faixa final e remontada concatenando os
  // arquivos de audio originais na mesma ordem das cenas, ver
  // video-jobs/compose/route.ts).
  audioUrl?: string;
  // Preenchido pela fila assincrona (worker-ugc-video) depois que a cena ja
  // foi resolvida no provedor (Freepik/Pexels/OmniHuman) — quando presente,
  // composeVideoFromResolvedScenes usa isso direto, sem chamar nenhuma API
  // de geracao aqui.
  resolvedUrl?: string;
}

interface PexelsVideoFile {
  link: string;
  quality?: string;
}

interface PexelsVideo {
  video_files: PexelsVideoFile[];
}

interface PexelsSearchResponse {
  videos?: PexelsVideo[];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro desconhecido";
}

async function getPexelsVideo(query: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("PEXELS_API_KEY não configurada no .env.local");

  const response = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait`,
    { headers: { Authorization: apiKey } },
  );

  const data = (await response.json()) as PexelsSearchResponse;
  if (!data.videos?.length) {
    throw new Error(`Nenhum vídeo Pexels encontrado para a busca: "${query}"`);
  }

  const video = data.videos[0];
  const videoFile =
    video.video_files.find((file) => file.quality === "hd") ||
    video.video_files[0];

  if (!videoFile?.link) {
    throw new Error(`Pexels não retornou link direto para a busca: "${query}"`);
  }

  return videoFile.link;
}

async function normalizeClip(
  inputPath: string,
  outputPath: string,
  duration: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-c:v mpeg4",
        "-r 30",
        "-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        "-t",
        duration.toString(),
        "-an",
      ])
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .save(outputPath);
  });
}

async function generateTextClip(
  outputPath: string,
  duration: number,
  text: string,
  bgColor = "#0A0F1E",
  subtext?: string,
): Promise<void> {
  console.log(`Renderizando slide de texto via Playwright: "${text}"`);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
  });

  const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          margin: 0;
          background: ${bgColor};
          color: #C9973A;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          text-align: center;
          padding: 80px;
          box-sizing: border-box;
        }
        h1 {
          font-size: 110px;
          margin-bottom: 30px;
          line-height: 1.1;
          font-weight: 800;
          text-transform: uppercase;
          text-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        h2 {
          font-size: 60px;
          color: rgba(255,255,255,0.95);
          font-weight: 500;
          margin-top: 0;
        }
      </style>
    </head>
    <body>
      <div>
        <h1>${text}</h1>
        ${subtext ? `<h2>${subtext}</h2>` : ""}
      </div>
    </body>
  </html>
  `;

  await page.setContent(html);
  const pngPath = outputPath.replace(".mp4", ".png");
  await page.screenshot({ path: pngPath });
  await browser.close();

  // Pedido do prompt mestre: "texto com animacoes rapidas", nao um slide
  // parado. zoompan da um punch-in continuo e fade da uma entrada rapida —
  // simples de fazer em cima da mesma screenshot estatica, sem precisar de
  // gravacao de video no Playwright.
  const totalFrames = Math.round(duration * 30);
  const filter = `zoompan=z='min(zoom+0.0015,1.12)':d=${totalFrames}:s=1080x1920:fps=30,fade=t=in:st=0:d=0.25`;
  const command = `"${FFMPEG_PATH}" -loop 1 -i "${pngPath}" -t ${duration} -vf "${filter}" -c:v mpeg4 -r 30 -pix_fmt yuv420p "${outputPath}" -y`;

  execSync(command, { stdio: "ignore" });
}

/**
 * Gera uma lista padrão de cenas baseada no contexto da oferta
 */
export function generateDefaultScenes(offer: UGCOfferContext, imageUrl?: string): VideoScene[] {
  const productImg = imageUrl || "https://http2.mlstatic.com/D_NQ_NP_977123-MLB51493722216_092022-O.webp";
  
  return [
    { 
      type: 'freepik-animate', 
      duration: 5, 
      imageUrl: productImg, 
      prompt: `Produto em destaque: ${offer.title}` 
    },
    { 
      type: 'pexels-stock', 
      duration: 5, 
      searchQuery: offer.category || offer.title 
    },
    { 
      type: 'freepik-text2video', 
      duration: 5, 
      prompt: `person using ${offer.title}, high quality demonstration` 
    },
    { 
      type: 'ffmpeg-text', 
      duration: 5, 
      text: "OFERTA SMART",
      subtext: offer.title
    },
    { 
      type: 'ffmpeg-text', 
      duration: 5, 
      text: `R$ ${offer.price.toFixed(2).replace(".", ",")}`,
      subtext: offer.discountPct ? `${offer.discountPct}% OFF` : "Melhor preço"
    },
    { 
      type: 'ffmpeg-text', 
      duration: 5, 
      text: "GARANTA JÁ",
      subtext: "Link na bio da Radar Smart"
    }
  ];
}

export async function composeVideo(
  offer: UGCOfferContext,
  scenes: VideoScene[],
  audioPath: string,
  outputPath: string,
): Promise<string> {
  const tempDir = path.join(process.cwd(), "temp", "composer");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const normalizedClips: string[] = [];

  console.log(`Compilador de Vídeo Inteligente iniciado (${scenes.length} cenas)`);

  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    const rawScenePath = path.join(tempDir, `scene_${i}_raw.mp4`);
    const normScenePath = path.join(tempDir, `scene_${i}_norm.mp4`);

    console.log(`Processando cena ${i + 1}/${scenes.length} [${scene.type}]`);

    if (fs.existsSync(normScenePath)) {
      console.log(`Cena ${i + 1} já normalizada. Pulando...`);
      normalizedClips.push(normScenePath);
      continue;
    }

    let sourceUrl = "";

    try {
      if (scene.type === "freepik-animate") {
        if (!scene.imageUrl || !scene.prompt) {
          throw new Error("Cena freepik-animate exige imageUrl e prompt");
        }

        try {
          const noBgUrl = await removeBackground(scene.imageUrl);
          const mysticPrompt = `Professional product advertisement, clean white background, ${offer.title}, ${scene.prompt}, premium quality, e-commerce style, brazilian market, 9:16 vertical format. Reference texture from: ${noBgUrl}`;
          const generatedImage = await generateImage(mysticPrompt);
          sourceUrl = await animateImage(
            generatedImage,
            `Dynamic pan and subtle zoom, 3d product spin effect of ${offer.title}, clean elegant motion`,
          );
        } catch (error: unknown) {
          console.warn(
            `Freepik Animate falhou (${getErrorMessage(error)}). Fallback Pexels...`,
          );
          sourceUrl = await getPexelsVideo(scene.prompt || offer.title);
        }
      } else if (scene.type === "freepik-text2video") {
        if (!scene.prompt) {
          throw new Error("Cena freepik-text2video exige prompt");
        }

        try {
          sourceUrl = await textToVideo(scene.prompt);
        } catch (error: unknown) {
          console.warn(
            `Freepik Text2Video falhou (${getErrorMessage(error)}). Fallback Pexels...`,
          );
          sourceUrl = await getPexelsVideo(scene.prompt);
        }
      } else if (scene.type === "pexels-stock") {
        if (!scene.searchQuery) {
          throw new Error("Cena pexels-stock exige searchQuery");
        }
        sourceUrl = await getPexelsVideo(scene.searchQuery);
      }

      if (scene.type === "ffmpeg-text") {
        if (!scene.text) throw new Error("Cena ffmpeg-text exige text");
        await generateTextClip(
          normScenePath,
          scene.duration,
          scene.text,
          scene.backgroundColor,
          scene.subtext,
        );
        normalizedClips.push(normScenePath);
        continue;
      }

      console.log(`Baixando base de vídeo da Web...`);
      const downloadResponse = await fetch(sourceUrl);
      fs.writeFileSync(rawScenePath, Buffer.from(await downloadResponse.arrayBuffer()));

      console.log("Normalizando frame e escala do clipe...");
      await normalizeClip(rawScenePath, normScenePath, scene.duration);
      normalizedClips.push(normScenePath);
    } catch (error) {
      console.error(`Erro na geração da cena ${i + 1}:`, error);
      throw error;
    }
  }

  const listPath = path.join(tempDir, "concat_list.txt");
  const listContent = normalizedClips
    .map((clipPath) => `file '${clipPath.replace(/\\/g, "/")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listContent);

  const concatTempPath = path.join(tempDir, "concat_muted.mp4");

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .on("end", () => resolve(true))
      .on("error", (error) => reject(error))
      .save(concatTempPath);
  });

  await new Promise((resolve, reject) => {
    let command = ffmpeg().input(concatTempPath).input(audioPath);
    const logoPath = path.join(process.cwd(), "public", "logo-radar-smart.png");

    if (fs.existsSync(logoPath)) {
      command = command
        .input(logoPath)
        .complexFilter([
          "[2:v]scale=120:-1[logo]",
          "[0:v][logo]overlay=W-w-20:H-h-20[outv]",
        ])
        .outputOptions([
          "-map [outv]",
          "-map 1:a:0",
          "-c:v mpeg4",
          "-c:a aac",
          "-shortest",
        ]);
    } else {
      command = command.outputOptions([
        "-map 0:v:0",
        "-map 1:a:0",
        "-c:v copy",
        "-c:a aac",
        "-shortest",
      ]);
    }

    command
      .on("end", () => resolve(true))
      .on("error", (error) => reject(error))
      .save(outputPath);
  });

  console.log("Finalizado com sucesso.");
  return outputPath;
}

/**
 * Mesma montagem final de composeVideo (baixar/normalizar clipe, concatenar,
 * sobrepor logo, mixar audio) mas SEM chamar Freepik/Pexels — espera que
 * cada cena ja tenha `resolvedUrl` (freepik-animate/freepik-text2video/
 * pexels-stock) ou os campos de texto (ffmpeg-text) prontos. A resolucao
 * das cenas nos provedores de IA agora acontece antes, passo a passo, na
 * Edge Function worker-ugc-video — nao cabe mais dentro de uma unica
 * chamada sincrona (era exatamente isso que fazia o pipeline antigo travar
 * em timeout e cair silenciosamente pra estoque generico numa falha).
 */
export async function composeVideoFromResolvedScenes(
  scenes: VideoScene[],
  audioPath: string,
  outputPath: string,
): Promise<string> {
  const tempDir = path.join(process.cwd(), "temp", "composer");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const normalizedClips: string[] = [];

  console.log(`Montagem final (cenas ja resolvidas): ${scenes.length} cenas`);

  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    const rawScenePath = path.join(tempDir, `resolved_scene_${i}_raw.mp4`);
    const normScenePath = path.join(tempDir, `resolved_scene_${i}_norm.mp4`);

    if (scene.type === "ffmpeg-text") {
      if (!scene.text) throw new Error(`Cena ${i + 1} ffmpeg-text exige text`);
      await generateTextClip(
        normScenePath,
        scene.duration,
        scene.text,
        scene.backgroundColor,
        scene.subtext,
      );
      normalizedClips.push(normScenePath);
      continue;
    }

    if (!scene.resolvedUrl) {
      throw new Error(
        `Cena ${i + 1} (${scene.type}) sem resolvedUrl — precisa ser resolvida antes de chamar a montagem final.`,
      );
    }

    console.log(`Baixando midia ja resolvida da cena ${i + 1}...`);
    const downloadResponse = await fetch(scene.resolvedUrl);
    if (!downloadResponse.ok) {
      throw new Error(`Falha ao baixar midia da cena ${i + 1}: ${downloadResponse.status}`);
    }
    fs.writeFileSync(rawScenePath, Buffer.from(await downloadResponse.arrayBuffer()));

    await normalizeClip(rawScenePath, normScenePath, scene.duration);
    normalizedClips.push(normScenePath);
  }

  const listPath = path.join(tempDir, "concat_list_resolved.txt");
  const listContent = normalizedClips
    .map((clipPath) => `file '${clipPath.replace(/\\/g, "/")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listContent);

  const concatTempPath = path.join(tempDir, "concat_muted_resolved.mp4");

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .on("end", () => resolve(true))
      .on("error", (error) => reject(error))
      .save(concatTempPath);
  });

  await new Promise((resolve, reject) => {
    let command = ffmpeg().input(concatTempPath).input(audioPath);
    const logoPath = path.join(process.cwd(), "public", "logo-radar-smart.png");

    if (fs.existsSync(logoPath)) {
      command = command
        .input(logoPath)
        .complexFilter([
          "[2:v]scale=120:-1[logo]",
          "[0:v][logo]overlay=W-w-20:H-h-20[outv]",
        ])
        .outputOptions([
          "-map [outv]",
          "-map 1:a:0",
          "-c:v mpeg4",
          "-c:a aac",
          "-shortest",
        ]);
    } else {
      command = command.outputOptions([
        "-map 0:v:0",
        "-map 1:a:0",
        "-c:v copy",
        "-c:a aac",
        "-shortest",
      ]);
    }

    command
      .on("end", () => resolve(true))
      .on("error", (error) => reject(error))
      .save(outputPath);
  });

  console.log("Montagem final concluida.");
  return outputPath;
}

/**
 * Concatena os 3 arquivos de audio (hook/body/cta, gerados separados desde
 * a fase de avatar — ver app/api/admin/criativos/audio/route.ts) numa unica
 * faixa, na mesma ordem das cenas do video. Mesma tecnica de concat list
 * ja usada pra video em composeVideo/composeVideoFromResolvedScenes; como
 * os 3 arquivos vem do mesmo provedor (ElevenLabs, mesmo codec), da pra
 * concatenar com "-c copy" sem re-codificar.
 */
export async function concatAudioFiles(inputPaths: string[], outputPath: string): Promise<void> {
  const tempDir = path.join(process.cwd(), "temp", "composer");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const listPath = path.join(tempDir, `audio_concat_${Date.now()}.txt`);
  const listContent = inputPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
  fs.writeFileSync(listPath, listContent);

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .on("end", () => resolve(true))
      .on("error", (error) => reject(error))
      .save(outputPath);
  });
}
