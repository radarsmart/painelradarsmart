import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";

// Carrega variáveis e paths
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
const FFMPEG_PATH = path.join(process.env.LOCALAPPDATA || "", "CapCut", "Apps", "8.1.1.3417", "ffmpeg.exe");
ffmpeg.setFfmpegPath(FFMPEG_PATH);

import { removeBackground, generateImage, animateImage } from "../lib/ugc/freepik";
import { generateUGCScript } from "../lib/ugc/script-generator";
import { UGCOfferContext } from "../lib/ugc/types";
import { UGC_VOICES } from "../lib/ugc/voices";

async function main() {
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // A) Mock do Produto (Substitua por extração dinâmica no futuro)
  console.log("🛠️ Inciando UGC Modelo A (Produto + Logo)...");
  
  // URL de exemplo estática para remover o fundo; 
  // No fluxo real isso viria do scraper do mercado livre.
  const productImageUrl = "https://http2.mlstatic.com/D_NQ_NP_977123-MLB51493722216_092022-O.webp"; 
  
  const offer: UGCOfferContext = {
    title: "Limpa Vidros Magnético com Super Ímã",
    price: 24.56,
    discountPct: 0,
    marketplace: "Mercado Livre",
    productUrl: "https://www.mercadolivre.com.br/limpa-vidros-magnetico"
  };

  try {
    // B) Remove Background com Freepik
    const noBgUrl = await removeBackground(productImageUrl);

    // C) Gerador de Imagem com Contexto Background + Flux Dev
    const renderPrompt = `Professional product advertisement, clean white background, ${offer.title}, premium quality, e-commerce style, brazilian market, 9:16 vertical format. The product is featured prominently in the center. Reference texture from: ${noBgUrl}`;
    const generatedImage = await generateImage(renderPrompt);

    // D) Anima a Imagem
    const animatedVideoUrl = await animateImage(generatedImage, `Dynamic pan and subtle zoom, 3d product spin effect of ${offer.title}, clean elegant motion`);
    
    // Baixando vídeo gerado pela Freepik
    const videoLocalPath = path.join(tempDir, "model_a_raw.mp4");
    console.log("⬇️ Baixando vídeo gerado pela Freepik...");
    const videoResponse = await fetch(animatedVideoUrl);
    fs.writeFileSync(videoLocalPath, Buffer.from(await videoResponse.arrayBuffer()));

    // E e F) Gera o Áudio com Mateus
    console.log(`📝 Gerando roteiro via GPT-4o...`);
    const script = await generateUGCScript(offer);
    
    console.log(`🎙️ Gerando áudio via ElevenLabs...`);
    const audioPath = path.join(tempDir, "audio_model_a.mp3");
    const audioRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${UGC_VOICES.mateus.id}`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: script.full_text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      }),
    });
    fs.writeFileSync(audioPath, Buffer.from(await audioRes.arrayBuffer()));

    // G) FFmpeg (Merge Vídeo + Áudio + Watermark Logo)
    const logoPath = path.join(process.cwd(), "public", "logo-radar-smart.png");
    const finalOutputPath = path.join(tempDir, "model_a_ugc_final.mp4");

    console.log(`🎬 Realizando Merge Video + Audio + Logo...`);
    
    if (!fs.existsSync(logoPath)) {
       console.warn("⚠️ public/logo-radar-smart.png não encontrado. Será gerado sem a marca d'água.");
    }

    await new Promise((resolve, reject) => {
      let command = ffmpeg().input(videoLocalPath).input(audioPath);
      
      if (fs.existsSync(logoPath)) {
        command = command.input(logoPath)
          .complexFilter([
            "[2:v]scale=120:-1[logo]",
            "[0:v][logo]overlay=W-w-20:H-h-20[outv]"
          ])
          .outputOptions([
            '-map [outv]',
            '-map 1:a:0',
            '-c:v mpeg4',
            '-c:a aac',
            '-shortest'
          ]);
      } else {
        command
          .outputOptions([
             '-map 0:v:0',
             '-map 1:a:0', 
             '-c:v mpeg4',
             '-c:a aac',
             '-shortest'
          ]);
      }

      command
        .on('end', () => resolve(true))
        .on('error', (err) => reject(err))
        .save(finalOutputPath);
    });

    console.log(`\n🎉 Modelo A Finalizado com Sucesso!`);
    console.log(`📁 PATH: ${finalOutputPath}`);
  } catch (e) {
    console.error("❌ Erro Pipeline UGC Modelo A:", e);
  }
}

main().catch(console.error);
