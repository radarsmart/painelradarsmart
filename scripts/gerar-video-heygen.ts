import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createClient } from "@supabase/supabase-js";

// 1. Carrega env ANTES de qualquer outro import interno
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// 2. Imports internos agora que o env está pronto
import { listAvatars, generateVideoV2, videoStatus, downloadVideo } from "../lib/ugc/heygen";

async function main() {
  const args = process.argv.slice(2);
  const avatarArg = args.find(a => a.startsWith("--avatar="))?.split("=")[1];
  const audioPathArg = args.find(a => a.startsWith("--audio="))?.split("=")[1];
  const bgPathArg = args.find(a => a.startsWith("--bg="))?.split("=")[1];

  // Supabase Client local para evitar problemas de hoisting/env-check
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas no .env.local");
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const BUCKET_NAME = "ugc";
  
  try {
    const audioPath = audioPathArg ? path.join(process.cwd(), audioPathArg) : path.join(process.cwd(), "temp/audio_final_completo.mp3");
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Arquivo de áudio não encontrado: ${audioPath}`);
    }

    // 1. Lista Avatars
    console.log("👥 Buscando avatars masculinos realistas no HeyGen...");
    const avatars = await listAvatars();
    const recommendedMale = avatars.filter((av: any) => 
      av.gender === 'male' && (
        av.avatar_id.includes('nik') || 
        av.avatar_id.includes('chad') || 
        av.avatar_id.includes('wade') ||
        av.avatar_id.includes('expressive')
      )
    );

    console.log("\nTop Avatars Masculinos Sugeridos:");
    recommendedMale.slice(0, 15).forEach((av: any) => {
      console.log(`- ID: ${av.avatar_id} | Nome: ${av.avatar_name || av.name}`);
    });

    const defaultAvatar = "5d8e2be335a9495db883c05111759ba4";
    const selectedAvatar = avatarId || defaultAvatar;
    console.log(`\n👤 Avatar para geração: ${selectedAvatar}`);

    // 2. Upload para Supabase
    console.log("\n☁️  Fazendo upload do áudio para o Supabase Storage...");
    const fileBuffer = fs.readFileSync(audioPath);
    const fileName = `audio_${Date.now()}.mp3`;
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        contentType: "audio/mpeg",
        upsert: true
      });

    if (uploadError) throw new Error(`Erro no upload Supabase: ${uploadError.message}`);

    const { data: publicData } = supabase
      .storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);
    
    const audioUrl = publicData.publicUrl;
    console.log(`✅ Áudio disponível em: ${audioUrl}`);

    // 2. Upload do background (opcional)
    let backgroundUrl = '';
    if (bgPathArg && fs.existsSync(bgPathArg)) {
      console.log('🖼️ Fazendo upload do background personalizado...');
      const bgBuffer = fs.readFileSync(bgPathArg);
      const bgFileName = `bg_${Date.now()}.png`;
      const { data: bgUpload } = await supabase.storage.from(BUCKET_NAME).upload(bgFileName, bgBuffer, { contentType: 'image/png' });
      if (bgUpload) {
        backgroundUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(bgFileName).data.publicUrl;
        console.log(`✅ Background público: ${backgroundUrl}`);
      }
    }

    // 3. Gera vídeo no HeyGen
    console.log(`🎬 Solicitando geração de vídeo para o avatar: ${selectedAvatar}...`);
    const videoId = await generateVideoV2(selectedAvatar, audioUrl, backgroundUrl);
    console.log(`🚀 Tarefa criada! ID: ${videoId}`);

    // 4. Polling
    console.log("⏳ Aguardando processamento (isso pode levar alguns minutos)...");
    const startTime = Date.now();
    const timeout = 10 * 60 * 1000; // 10 minutos
    let videoUrl = "";

    while (Date.now() - startTime < timeout) {
      const status = await videoStatus(videoId);
      console.log(`   Status: ${status.status} (${status.progress || 0}%)`);
      
      if (status.status === "completed") {
        videoUrl = (status as any).video_url || (status as any).video_url_caption;
        break;
      }
      if (status.status === "failed") {
        throw new Error(`Geração falhou no HeyGen: ${status.error?.message || "Erro desconhecido"}`);
      }
      
      await new Promise(r => setTimeout(r, 10000)); // Aguarda 10s
    }

    if (!videoUrl) throw new Error("Timeout na geração do vídeo.");

    // 5. Baixa o vídeo
    console.log("📥 Baixando vídeo gerado...");
    const timestamp = Date.now();
    const videoHeyGenPath = path.join(process.cwd(), `temp/video_heygen_${timestamp}.mp4`);
    const videoRes = await fetch(videoUrl);
    fs.writeFileSync(videoHeyGenPath, Buffer.from(await videoRes.arrayBuffer()));

    // 6. Merge final com áudio HQ via FFmpeg
    console.log("🎵 Fazendo mixagem final com áudio HQ do ElevenLabs...");
    const finalPath = path.join(process.cwd(), `temp/conteudo_final_avatar_${timestamp}.mp4`);
    const FFMPEG_PATH = `"C:\\Users\\User\\AppData\\Local\\CapCut\\Apps\\8.1.1.3417\\ffmpeg.exe"`;
    
    // Substitui o áudio do vídeo pelo original do ElevenLabs
    // Substitui o áudio do vídeo pelo original do ElevenLabs e adiciona grão de filme e correção de cor
    const mergeCmd = `${FFMPEG_PATH} -i "${videoHeyGenPath}" -i "${audioPath}" -vf "noise=alls=15:allf=t+u, eq=contrast=1.05:brightness=0.02:saturation=1.1" -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalPath}" -y`;
    execSync(mergeCmd, { stdio: 'ignore' });

    console.log("\n" + "=".repeat(50));
    console.log(`✅ Avatar selecionado: ${selectedAvatar}`);
    console.log(`✅ Vídeo gerado pelo HeyGen`);
    console.log(`✅ Áudio do Mateus sincronizado (HQ)`);
    console.log(`✅ Arquivo final: ${finalPath}`);
    console.log("=".repeat(50));

  } catch (error: any) {
    console.error(`\n❌ ERRO: ${error.message}`);
  }
}

main();
