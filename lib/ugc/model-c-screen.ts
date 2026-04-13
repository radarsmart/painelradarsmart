import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import ffmpeg from "fluent-ffmpeg";
import { UGCOfferContext, UGCModelCResponse } from "./types";
import { generateUGCScript } from "./script-generator";

// Configuração de Binários do CapCut
const FFMPEG_PATH = path.join(process.env.LOCALAPPDATA || "", "CapCut", "Apps", "8.1.1.3417", "ffmpeg.exe");
ffmpeg.setFfmpegPath(FFMPEG_PATH);

/**
 * Função Auxiliar: Grava um clipe curto de forma isolada
 */
async function recordSimpleClip(
  url: string,
  durationMs: number,
  name: string,
  action?: (page: Page) => Promise<void>,
): Promise<string> {
  const tempDir = path.join(process.cwd(), "temp");
  const clipsDir = path.join(tempDir, "clips_raw");
  if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    recordVideo: { 
      dir: clipsDir, 
      size: { width: 390, height: 844 } 
    }
  });

  const page = await context.newPage();
  
  try {
    console.log(`🎥 Gravando clipe: ${name}...`);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => { if (document.body) document.body.style.zoom = '1'; });
    
    if (action) await action(page);
    
    await page.waitForTimeout(durationMs);
    const videoPath = await page.video()?.path();
    await browser.close();

    if (!videoPath) throw new Error(`Falha ao gravar clipe ${name}`);
    return videoPath;
  } catch (err) {
    if (browser) await browser.close();
    throw err;
  }
}

/**
 * Extrai dados reais do produto usando Firecrawl API
 */
export async function extractProductData(url: string) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY não configurada.");

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      formats: ['json'],
      jsonOptions: {
        prompt: "Extract product title and price",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            price: { type: "number" }
          },
          required: ["title", "price"]
        }
      }
    })
  });
  
  if (!response.ok) return { title: "Produto Incrível", price: 0 };
  const data = await response.json();
  return data.data?.json || { title: "Produto Incrível", price: 0 };
}

/**
 * Função Auxiliar: Gera Áudio via ElevenLabs
 */
async function generateSimpleAudio(text: string, outputId: string, voiceId?: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const targetVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID;
  const tempDir = path.join(process.cwd(), "temp");
  const audioPath = path.join(tempDir, `audio_${outputId}.mp3`);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });

  if (!response.ok) throw new Error(`ElevenLabs error: ${response.statusText}`);
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(audioPath, Buffer.from(arrayBuffer));
  return audioPath;
}

/**
 * FUNÇÃO PRINCIPAL: Geração do UGC Modelo C Sincronizado
 */
export async function generateModelCVideo(offer: UGCOfferContext, options: { voiceId?: string } = {}): Promise<UGCModelCResponse> {
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const outputId = Date.now().toString();

  // PASSO 1: Script & Áudio (Duração fixa configurada)
  console.log("📝 Gerando roteiro e áudio ElevenLabs...");
  const script = await generateUGCScript(offer);
  const audioPath = await generateSimpleAudio(script.full_text, outputId, options.voiceId);

  // PASSO 2: Gravação dos 3 Clipes (Home 3s, Ofertas 3s, Produto 4s)
  // Nota: Tempo de 4.1s no clipe final para garantir o sync da narração
  const clip1 = await recordSimpleClip('https://www.radarsmart.com.br', 3000, `h_${outputId}`);
  
  const clip2 = await recordSimpleClip('https://www.radarsmart.com.br/ofertas', 3000, `o_${outputId}`, async (page) => {
    await page.evaluate(async () => {
      window.scrollBy({ top: 300, behavior: 'smooth' });
    });
  });

  console.log(`🔗 Abrindo URL final do produto: ${offer.productUrl}`);
  const clip3 = await recordSimpleClip(offer.productUrl, 4100, `p_${outputId}`, async (page) => {
    // Aguarda um pouco antes de rolar
    await page.waitForTimeout(500);
    
    await page.evaluate(() => {
      // Tenta achar o container de preço específico do ML, depois fallbacks
      const priceSelectors = [
        '.ui-pdp-price',
        '[class*="andes-money"]',
        '[class*="price__amount"]',
        '[class*="price"]', 
        '[class*="valor"]'
      ];
      
      let priceEl = null;
      for (const selector of priceSelectors) {
         priceEl = document.querySelector(selector);
         if (priceEl) break;
      }
      
      if (priceEl) {
        priceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // Fallback robusto se não achar nada
        window.scrollBy({ top: 400, behavior: 'smooth' });
      }
    });
    
    // Aguarda o restante do clipe focado no preço
    await page.waitForTimeout(2000);
  });

  // PASSO 3: Concatenação via FFmpeg
  console.log("🎬 Unindo clipes e áudio final...");
  const finalVideoPath = path.join(tempDir, `ugc_final_${outputId}.mp4`);
  const concatFilePath = path.join(tempDir, `list_${outputId}.txt`);
  
  // IMPORTANTE Windows: Paths com / e prefixo file
  const concatContent = [clip1, clip2, clip3]
    .map(p => `file '${p.replace(/\\/g, '/')}'`)
    .join('\n');
    
  fs.writeFileSync(concatFilePath, concatContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFilePath)
      .inputOptions(['-f concat', '-safe 0'])
      .input(audioPath)
      .outputOptions([
        '-c:v mpeg4',
        '-pix_fmt yuv420p',
        '-map 0:v:0',
        '-map 1:a:0',
        '-shortest'
      ])
      .on('end', () => resolve({ success: true, script, videoUrl: finalVideoPath }))
      .on('error', (err) => reject(err))
      .save(finalVideoPath);
  });
}
