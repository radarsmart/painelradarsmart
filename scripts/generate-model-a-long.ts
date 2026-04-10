import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generateUGCScript } from "../lib/ugc/script-generator";
import { UGCOfferContext } from "../lib/ugc/types";
import { composeVideo, VideoScene } from "../lib/ugc/video-composer";
import { UGC_VOICES } from "../lib/ugc/voices";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const ffmpeg = require('fluent-ffmpeg');
  const FFMPEG_PATH = "C:\\Users\\User\\AppData\\Local\\CapCut\\Apps\\8.1.1.3417\\ffmpeg.exe";
  process.env.FFMPEG_PATH = FFMPEG_PATH;
  ffmpeg.setFfmpegPath(FFMPEG_PATH);

  const productImg = "https://http2.mlstatic.com/D_NQ_NP_977123-MLB51493722216_092022-O.webp"; 
  
  const offer: UGCOfferContext = {
    title: "Limpa Vidros Magnético com Super Ímã",
    price: 24.56,
    originalPrice: 30.88,
    discountPct: 21,
    marketplace: "Mercado Livre",
    productUrl: "https://www.mercadolivre.com.br/limpa-vidros-magnetico"
  };

  const audioPath = path.join(tempDir, "audio_model_a_long.mp3");

  // 1. Gerar script e áudio automaticamente
  console.log(`📝 Gerando roteiro via GPT-4o...`);
  const script = await generateUGCScript(offer);
  
  console.log(`🎙️ Gerando áudio via ElevenLabs...`);
  const audioRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${UGC_VOICES.mateus.id}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: script.full_text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.4, similarity_boost: 0.8 }
      })
    }
  );

  if (!audioRes.ok) {
    throw new Error(`Erro ElevenLabs: ${audioRes.statusText} - ${await audioRes.text()}`);
  }

  fs.writeFileSync(audioPath, Buffer.from(await audioRes.arrayBuffer()));
  console.log("🎙️ Áudio gerado:", audioPath);

  // 2. Definição das 8 cenas (5s cada = 40s)
  const scenes: VideoScene[] = [
    { 
      type: 'freepik-animate', 
      duration: 5, 
      imageUrl: productImg, 
      prompt: "Produto em destaque fundo branco premium" 
    },
    { 
      type: 'pexels-stock', 
      duration: 5, 
      searchQuery: "dirty window cleaning" 
    },
    { 
      type: 'freepik-animate', 
      duration: 5, 
      imageUrl: productImg, 
      prompt: "Close detalhado no material do limpador magnético" 
    },
    { 
      type: 'freepik-text2video', 
      duration: 5, 
      prompt: "magnetic window cleaner being used on glass, satisfying clean result, product demonstration" 
    },
    { 
      type: 'pexels-stock', 
      duration: 5, 
      searchQuery: "clean window sunlight" 
    },
    { 
      type: 'ffmpeg-text', 
      duration: 5, 
      text: "⭐⭐⭐⭐⭐",
      subtext: "+500 compradores satisfeitos"
    },
    { 
      type: 'ffmpeg-text', 
      duration: 5, 
      text: "De R$30,88 por R$24,56",
      subtext: "21% de desconto"
    },
    { 
      type: 'ffmpeg-text', 
      duration: 5, 
      text: "Corre no Radar Smart!",
      subtext: "Link na bio 👆"
    }
  ];

  const outputPath = path.join(tempDir, "model_a_long_final.mp4");

  console.log("\n🚀 Enviando para o orquestrador multi-cena...");
  await composeVideo(offer, scenes, audioPath, outputPath);
  console.log("\n🎉 UGC Longo Finalizado:", outputPath);
}

main().catch(console.error);
