import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// Configuração de Binários do CapCut
const FFMPEG_PATH = path.join(process.env.LOCALAPPDATA || "", "CapCut", "Apps", "8.1.1.3417", "ffmpeg.exe");
ffmpeg.setFfmpegPath(FFMPEG_PATH);

async function main() {
  const tempDir = path.join(process.cwd(), "temp");
  const videoInput = path.join(tempDir, "video_celular.mp4");
  const audioInput = path.join(tempDir, "audio_final.mp3");
  const videoOutput = path.join(tempDir, "ugc_merged_final.mp4");

  if (!fs.existsSync(videoInput)) {
    console.error(`❌ Erro: Vídeo não encontrado em ${videoInput}`);
    return;
  }
  
  if (!fs.existsSync(audioInput)) {
    console.error(`❌ Erro: Áudio não encontrado em ${audioInput}`);
    return;
  }

  console.log(`🎬 Iniciando merge do vídeo e áudio...`);
  console.log(`📌 Vídeo: ${videoInput}`);
  console.log(`📌 Áudio: ${audioInput}`);
  console.log(`👉 Aguarde, processando...`);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoInput)
      .input(audioInput)
      .outputOptions([
        '-c:v mpeg4', // Codificador de vídeo compatível
        '-c:a aac',   // Codificador de áudio padrão
        '-b:a 192k',  // Bitrate do áudio
        '-pix_fmt yuv420p',
        '-map 0:v:0', // Extrai o canal de vídeo do input 0 (vídeo)
        '-map 1:a:0', // Extrai o canal de áudio do input 1 (áudio)
        '-shortest'   // Corta no final da stream mais curta (áudio ou vídeo)
      ])
      .on('end', () => {
        console.log(`\n✅ Merge concluído com sucesso!`);
        console.log(`📁 Salvo em: ${videoOutput}`);
        resolve(true);
      })
      .on('error', (err) => {
        console.error(`\n❌ Erro durante o merge no FFmpeg:`, err);
        reject(err);
      })
      .save(videoOutput);
  });
}

main().catch(console.error);
