import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { UGCOfferContext } from "./types";
import { removeBackground, generateImage, animateImage, textToVideo } from "./freepik";

// Garante variáveis
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// Configura FFMPEG do CapCut no Windows
const FFMPEG_PATH = path.join(process.env.LOCALAPPDATA || "", "CapCut", "Apps", "8.1.1.3417", "ffmpeg.exe");
ffmpeg.setFfmpegPath(FFMPEG_PATH);

export interface VideoScene {
  type: 'freepik-animate' | 'freepik-text2video' | 'pexels-stock' | 'ffmpeg-text';
  duration: number; // segundos
  prompt?: string;
  imageUrl?: string;
  text?: string;
  subtext?: string;
  searchQuery?: string;
  backgroundColor?: string;
}

/**
 * Puxar vídeo da Pexels 
 */
async function getPexelsVideo(query: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("PEXELS_API_KEY não configurada no .env.local");

  const response = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait`,
    { headers: { Authorization: apiKey } }
  );

  const data = await response.json();
  if (!data?.videos?.length) {
    throw new Error(`Nenhum vídeo Pexels encontrado para a busca: "${query}"`);
  }

  // Pega o primeiro vídeo válido e acha o link HD (para vertical geralmente width < height)
  const video = data.videos[0];
  const videoFile = video.video_files.find((f: any) => f.quality === "hd") || video.video_files[0];
  
  if (!videoFile?.link) {
    throw new Error(`Pexels não retornou link direto para a busca: "${query}"`);
  }

  return videoFile.link;
}

/**
 * Normaliza um clipe garantindo Framerate(30), Escala(1080x1920 recortado), Audio Mock(Mute).
 */
async function normalizeClip(inputPath: string, outputPath: string, duration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v mpeg4',
        '-r 30', // 30 FPS fixo
        '-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920', // Preenche tela 9:16 cortando bordas
        '-t', duration.toString(), // Força duração
        '-an' // Sem áudio (será subistituído no final)
      ])
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}

/**
 * Gera um clipe puramente de texto
 */
async function generateTextClip(outputPath: string, duration: number, text: string, bgColor: string = '#0A0F1E', subtext?: string): Promise<void> {
  const { chromium } = require('playwright');
  const { execSync } = require('child_process');
  
  console.log(`🎬 Renderizando slide de texto via Playwright: "${text}"`);
  
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 }
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
        ${subtext ? `<h2>${subtext}</h2>` : ''}
      </div>
    </body>
  </html>
  `;
  
  await page.setContent(html);
  const pngPath = outputPath.replace('.mp4', '.png');
  await page.screenshot({ path: pngPath });
  await browser.close();

  const ffmpegPath = `"${process.env.FFMPEG_PATH || 'ffmpeg'}"`;
  const command = `${ffmpegPath} -loop 1 -i "${pngPath}" -t ${duration} -c:v mpeg4 -r 30 -pix_fmt yuv420p "${outputPath}" -y`;
  
  execSync(command, { stdio: 'ignore' });
}

/**
 * Composição multi-cena completa do vídeo
 */
export async function composeVideo(
  offer: UGCOfferContext,
  scenes: VideoScene[],
  audioPath: string,
  outputPath: string
): Promise<string> {
  const tempDir = path.join(process.cwd(), "temp", "composer");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const normalizedClips: string[] = [];
  
  console.log(`🎬 Compilador de Vídeo Inteligente Iniciado (${scenes.length} Cenas)`);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const rawScenePath = path.join(tempDir, `scene_${i}_raw.mp4`);
    const normScenePath = path.join(tempDir, `scene_${i}_norm.mp4`);
    
    console.log(`\n🎞️ Processando Cena ${i + 1}/${scenes.length} [Tipo: ${scene.type}]...`);

    // Pular se já estiver normalizado (permite retomar execução)
    if (fs.existsSync(normScenePath)) {
      console.log(`⏩ Cena ${i + 1} já normalizada. Pulando...`);
      normalizedClips.push(normScenePath);
      continue;
    }

    let sourceUrl = "";

    try {
      // 1. Busca a fonte do vídeo e baixa
      if (scene.type === 'freepik-animate') {
        if (!scene.imageUrl || !scene.prompt) throw new Error("Cena freepik-animate exige imageUrl e prompt");
        try {
          const noBgUrl = await removeBackground(scene.imageUrl);
          const mysticPrompt = `Professional product advertisement, clean white background, ${offer.title}, ${scene.prompt}, premium quality, e-commerce style, brazilian market, 9:16 vertical format. Reference texture from: ${noBgUrl}`;
          const generatedImage = await generateImage(mysticPrompt);
          sourceUrl = await animateImage(generatedImage, `Dynamic pan and subtle zoom, 3d product spin effect of ${offer.title}, clean elegant motion`);
        } catch (e: any) {
          console.warn(`⚠️ Freepik Animate falhou (${e.message}). Fallback Pexels...`);
          sourceUrl = await getPexelsVideo(scene.prompt || offer.title);
        }
      } 
      else if (scene.type === 'freepik-text2video') {
        if (!scene.prompt) throw new Error("Cena freepik-text2video exige prompt");
        try {
          sourceUrl = await textToVideo(scene.prompt);
        } catch (e: any) {
          console.warn(`⚠️ Freepik Text2Video falhou (${e.message}). Fallback Pexels...`);
          sourceUrl = await getPexelsVideo(scene.prompt);
        }
      } 
      else if (scene.type === 'pexels-stock') {
        if (!scene.searchQuery) throw new Error("Cena pexels-stock exige searchQuery");
        sourceUrl = await getPexelsVideo(scene.searchQuery);
      }

      // 2. Transforma localmente a cena crua ou constrói
      if (scene.type === 'ffmpeg-text') {
        if (!scene.text) throw new Error("Cena ffmpeg-text exige text");
        console.log("✏️ Gerando painel de texto nativo...");
        await generateTextClip(normScenePath, scene.duration, scene.text, scene.backgroundColor, scene.subtext);
        normalizedClips.push(normScenePath);
        continue; // Já foi gerado normatizado
      }
      
      // Download da raw
      console.log(`⬇️ Baixando base de vídeo da Web... [Origem: ${sourceUrl.substring(0,60)}...]`);
      const dlRes = await fetch(sourceUrl);
      fs.writeFileSync(rawScenePath, Buffer.from(await dlRes.arrayBuffer()));

      // 3. Normalização
      console.log("⏱️ Normalizando frame/escala do clipe...");
      await normalizeClip(rawScenePath, normScenePath, scene.duration);
      normalizedClips.push(normScenePath);

    } catch (err) {
      console.error(`❌ Erro Geração Cena ${i + 1}:`, err);
      throw err;
    }
  }

  // 4. File-list para Concatenação
  console.log("\n🔗 Concatenando todos os clipes normalizados...");
  const listPath = path.join(tempDir, "concat_list.txt");
  const listContent = normalizedClips.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(listPath, listContent);

  const concatTempPath = path.join(tempDir, "concat_muted.mp4");

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .on('end', () => resolve(true))
      .on('error', (e) => reject(e))
      .save(concatTempPath);
  });

  // 5. Aplicar o Áudio + Fim Customizado (Opcional watermark aqui, omitido por simplicidade)
  console.log(`🎙️ Aplicando mixagem final de narração...`);
  await new Promise((resolve, reject) => {
    let cmd = ffmpeg()
      .input(concatTempPath) // 0:v
      .input(audioPath);     // 1:a

    // Caso o cliente queira logo aqui, poderia carregar um input(logoPath) e usar overlay
    const logoPath = path.join(process.cwd(), "public", "logo-radar-smart.png");
    
    if (fs.existsSync(logoPath)) {
      cmd = cmd.input(logoPath) // 2:v
        .complexFilter([
          "[2:v]scale=120:-1[logo]",
          "[0:v][logo]overlay=W-w-20:H-h-20[outv]"
        ])
        .outputOptions([
          '-map [outv]',
          '-map 1:a:0',
          '-c:v mpeg4',
          '-c:a aac',
          '-shortest', // sincroniza a duração do video em relacao ao audio
        ]);
    } else {
      cmd.outputOptions([
        '-map 0:v:0',
        '-map 1:a:0',
        '-c:v copy',
        '-c:a aac',
        '-shortest',
      ]);
    }

    cmd
      .on('end', () => resolve(true))
      .on('error', (e) => reject(e))
      .save(outputPath);
  });

  console.log("✅ Finalizado com sucesso!");
  return outputPath;
}
