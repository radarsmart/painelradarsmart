import { chromium, devices } from "playwright";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { UGCOfferContext, UGCModelCResponse } from "./types";
import { generateUGCScript } from "./script-generator";

async function generateElevenLabsAudio(text: string, outputId: string, customVoiceId?: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = customVoiceId || process.env.ELEVENLABS_VOICE_ID;
  
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY não configurada.");
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID não configurada.");

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs error: ${response.status} ${await response.text()}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  
  const audioPath = path.join(tempDir, `audio_${outputId}.mp3`);
  fs.writeFileSync(audioPath, buffer);
  return audioPath;
}

export async function generateModelCVideo(offer: UGCOfferContext, options: { voiceId?: string } = {}): Promise<UGCModelCResponse> {
  const tempDir = path.join(process.cwd(), "temp");
  const videosDir = path.join(tempDir, "videos");
  if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

  const outputId = Date.now().toString();
  const script = await generateUGCScript(offer);
  
  // 1. Playwright Setup (iPhone 13 9:16)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    recordVideo: { 
      dir: videosDir, 
      size: { width: 390, height: 844 } 
    }
  });

  const page = await context.newPage();
  
  try {
    // Identifica a URL de destino
    let targetUrl = offer.productUrl || "https://radarsmart.com.br/ofertas";
    if (targetUrl === "https://radarsmart.com.br" || targetUrl === "radarsmart.com.br") {
      targetUrl = "https://radarsmart.com.br/ofertas";
    }

    // TIMELINE UGC
    
    // [0-2s] HOOK ANIMADO: Navegação direta para a oferta ou hub
    await page.goto(targetUrl, { waitUntil: "networkidle" });
    // Movimento de mouse mais lento e orgânico
    await page.mouse.move(200, 400, { steps: 30 }); 
    await page.waitForTimeout(2000);

    // [2-7s] TELA MOSTRA PRODUTO REAL: Scroll lento de 300px
    await page.evaluate(async () => {
      for (let i = 0; i < 40; i++) {
        window.scrollBy(0, 7.5); // 300 / 40 = 7.5px por step
        await new Promise(r => setTimeout(r, 50));
      }
    });

    try {
      // Tenta localizar a oferta pelo título
      const offerSelector = `text=${offer.title.substring(0, 30)}`;
      await page.waitForSelector(offerSelector, { timeout: 3000 });
      await page.click(offerSelector, { delay: 150 });
      await page.waitForTimeout(4000); 
    } catch {
      await page.waitForTimeout(4000);
    }

    // [7-10s] FOCO NO CONTEÚDO (Sem resize brusco)
    await page.evaluate(() => {
        const priceEl = document.querySelector('[class*="price"], [class*="valor"]') || document.body;
        priceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(3000);

    // [10-13s] CTA DIRETO
    await page.waitForTimeout(3000);

    const videoPath = await page.video()?.path();
    await browser.close();

    if (!videoPath) throw new Error("Falha ao gravar vídeo.");

    // 3. Audio ElevenLabs
    const audioPath = await generateElevenLabsAudio(script.full_text, outputId, options.voiceId);

    // 4. FFmpeg: Tremida + Audio + Timing final
    const finalVideoPath = path.join(tempDir, `ugc_final_${outputId}.mp4`);
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .input(audioPath)
        .videoFilters([
          // Crop sutil: apenas 8px de margem com jitter leve
          "crop=iw-8:ih-8:4+2*sin(t*8):4+2*cos(t*6)"
        ])
        .outputOptions([
          "-pix_fmt yuv420p",
          "-shortest" // Termina o vídeo quando o áudio acabar (ou vice-versa)
        ])
        .on("end", () => resolve({ success: true, script, videoUrl: finalVideoPath }))
        .on("error", (err) => reject(err))
        .save(finalVideoPath);
    });

  } catch (error) {
    await browser.close();
    throw error;
  }
}
