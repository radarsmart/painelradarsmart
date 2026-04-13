import * as dotenv from "dotenv";
import path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
import { generateUGCScript } from "../lib/ugc/script-generator";
import { removeBackground, generateImage, animateImage } from "../lib/ugc/freepik";
import { UGC_VOICES } from "../lib/ugc/voices";

// Carrega variáveis do .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const found = args.find(a => a.startsWith(`--${name}=`));
    return found ? found.split('=')[1].replace(/^["']|["']$/g, '') : null;
  };

  const title = getArg('title');
  const price = getArg('price');
  const original = getArg('original');
  const image = getArg('image');

  if (!title || !price || !image) {
    console.error("❌ Uso: npx tsx scripts/criar-conteudo.ts --title='...' --price=... --original=... --image='...' ");
    return;
  }

  const timestamp = Date.now();
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  try {
    console.log(`\n🚀 INICIANDO PIPELINE MODELO A (FREEPIK PREMIUM)`);
    console.log(`📦 Produto: ${title}\n`);

    // 1. Remove o fundo da imagem original
    console.log("Step 1/6: Removendo fundo...");
    const bgRemovedUrl = await removeBackground(image);

    // 2. Gera Imagem Premium (E-commerce Style)
    console.log("Step 2/6: Gerando imagem premium com Mystic...");
    const promptMystic = `Professional product advertisement, ultra-realistic e-commerce style, clean background, ${title}, premium studio lighting, soft shadows, 9:16 vertical format, high quality 8k`;
    const premiumImageUrl = await generateImage(promptMystic);

    // 3. Anima com Kling 2.5 Pro (5s)
    console.log("Step 3/6: Animando imagem com Kling 2.5 Pro...");
    const promptKling = `Cinematic slow motion pan around the ${title}, showcasing shiny textures and premium build, product commercial style, high quality video`;
    const videoUrl = await animateImage(premiumImageUrl, promptKling);

    // 4. Gera Roteiro (GPT-4o)
    console.log("Step 4/6: Gerando roteiro persuasivo...");
    const offer = { 
      title, 
      price: parseFloat(price), 
      originalPrice: parseFloat(original || '0'), 
      imageUrl: premiumImageUrl, 
      discountPct: 0, 
      marketplace: 'Mercado Livre' 
    };
    if (offer.originalPrice > offer.price) {
      offer.discountPct = Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 100);
    }
    const script = await generateUGCScript(offer);

    // 5. Gera Áudio (ElevenLabs - Mateus)
    console.log("Step 5/6: Sintetizando voz do Mateus...");
    const audioPath = path.join(tempDir, `audio_${timestamp}.mp3`);
    const audioRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${UGC_VOICES.mateus.id}`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ 
        text: script.full_text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      }),
    });
    if (!audioRes.ok) throw new Error(`ElevenLabs Error: ${audioRes.statusText}`);
    fs.writeFileSync(audioPath, Buffer.from(await audioRes.arrayBuffer()));

    // 6. Mixagem Final (Download e FFmpeg)
    console.log("Step 6/6: Mixagem final com FFmpeg...");
    const rawVideoPath = path.join(tempDir, `video_raw_${timestamp}.mp4`);
    const videoDataRes = await fetch(videoUrl);
    fs.writeFileSync(rawVideoPath, Buffer.from(await videoDataRes.arrayBuffer()));

    const finalPath = path.join(tempDir, `conteudo_final_${timestamp}.mp4`);
    const FFMPEG_PATH = `"C:\\Users\\User\\AppData\\Local\\CapCut\\Apps\\8.1.1.3417\\ffmpeg.exe"`;
    
    // -stream_loop -1 faz o vídeo repetir até o áudio acabar
    const mergeCmd = `${FFMPEG_PATH} -stream_loop -1 -i "${rawVideoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${finalPath}" -y`;
    execSync(mergeCmd, { stdio: 'ignore' });

    console.log("\n" + "=".repeat(50));
    console.log(`✅ CONTEÚDO PREMIUM GERADO COM SUCESSO!`);
    console.log(`📁 Arquivo: ${finalPath}`);
    console.log(`📝 Script: ${script.full_text}`);
    console.log("=".repeat(50));

  } catch (error: any) {
    console.error("\n❌ FALHA NO PIPELINE:", error.message);
    if (error.message.includes("free trial") || error.message.includes("403") || error.message.includes("402")) {
      console.log("💡 Nota: A conta Freepik atingiu o limite ou requer upgrade para estes modelos avançados.");
    }
  }
}

main();
