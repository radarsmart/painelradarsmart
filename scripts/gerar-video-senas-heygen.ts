import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { listAvatars, generateCinematicVideo, videoStatus, downloadVideo } from '../lib/ugc/heygen';

// Configuração Supabase Local (necessário para upload do áudio)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET_NAME = 'ugc';

async function main() {
  const args = process.argv.slice(2);
  const avatarArg = args.find(a => a.startsWith('--avatar='));
  const audioPathArg = args.find(a => a.startsWith('--audio='));
  const promptArg = args.find(a => a.startsWith('--prompt='));
  
  // Avatar padrão: Abigail (Avatar IV) - jovem, expressiva e moderna
  const defaultAvatar = 'Abigail_public_20240311';
  let avatarId = avatarArg ? avatarArg.split('=')[1] : null;
  const audioPath = audioPathArg ? audioPathArg.split('=')[1] : 'temp/audio_final_completo.mp3';
  
  if (avatarId === 'list') {
    console.log('\n🔍 Listando avatars recomendados (Avatar IV / Jovens):');
    const avatars = await listAvatars();
    if (!avatars || !Array.isArray(avatars)) {
      console.log('❌ Lista de avatars vazia ou inválida.');
      return;
    }
    const filtered = avatars.filter((a: any) => 
      a.name && (
        a.name.toLowerCase().includes('abigail') || 
        a.name.toLowerCase().includes('skylar') ||
        a.name.toLowerCase().includes('adrian') ||
        a.name.toLowerCase().includes('allison') ||
        a.name.toLowerCase().includes('claudia')
      )
    );
    
    if (filtered.length === 0) {
      console.log('⚠️ Nenhum avatar encontrado com esses nomes. Mostrando os primeiros 20:');
      avatars.slice(0, 20).forEach((a: any) => console.log(`- ${a.avatar_id} (${a.name || 'Sem nome'})`));
    } else {
      filtered.slice(0, 20).forEach((a: any) => console.log(`- ${a.avatar_id} (${a.name})`));
    }
    return;
  }

  // Se não passou nada, usa o default
  if (!avatarId) avatarId = defaultAvatar;

  // Prompt cinemático baseado na imagem que o usuário mandou (Seedance 2.0 / Avatar IV)
  const motionPrompt = promptArg 
    ? promptArg.split('=')[1] 
    : "A young woman wearing a white casual t-shirt, standing outdoors in a vibrant, sunlit city street with blurred buildings in the background. She is looking directly at the camera with a warm, authentic smile, gesturing naturally as she speaks. High-end cinematic cinematography, soft bokeh background, golden hour lighting, 4k ultra-detailed.";

  if (!fs.existsSync(audioPath)) {
    console.log(`❌ Áudio não encontrado: ${audioPath}`);
    return;
  }

  console.log('🚀 Iniciando Geração Cinemática (Seedance 2.0)...');

  // 1. Upload do áudio para o Supabase (público)
  console.log('📤 Fazendo upload do áudio para o Radar Smart Storage...');
  const fileBuffer = fs.readFileSync(audioPath);
  const fileName = `audio_cinematic_${Date.now()}.mp3`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, fileBuffer, { contentType: 'audio/mpeg', upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  console.log(`✅ Áudio público: ${publicUrl}`);

  // 2. Gerar Vídeo com Motion Prompt
  console.log(`🎬 Solicitando vídeo cinemático para avatar: ${avatarId}`);
  console.log(`📝 Motion Prompt: "${motionPrompt}"`);
  
  const videoId = await generateCinematicVideo(avatarId, publicUrl, motionPrompt, 'high');
  console.log(`✅ Tarefa criada! ID: ${videoId}`);

  // 3. Polling de Status
  console.log('⏳ Aguardando renderização (pode levar alguns minutos)...');
  let status = 'processing';
  let videoUrl = '';

  while (status === 'processing' || status === 'waiting') {
    await new Promise(r => setTimeout(r, 10000)); // Espera 10s
    const result = await videoStatus(videoId);
    status = result.status;
    console.log(`   Status atual: ${status} ${result.progress ? `(${result.progress}%)` : ''}`);
    
    if (status === 'completed') {
      videoUrl = result.video_url;
      break;
    }
    if (status === 'failed') {
      throw new Error(`Geração falhou: ${result.error?.message || 'Erro desconhecido'}`);
    }
  }

  // 4. Download e Finalização
  const tempOutput = `temp/heygen_raw_${Date.now()}.mp4`;
  const finalOutput = `temp/cgu_premium_${Date.now()}.mp4`;

  console.log('📥 Baixando vídeo do HeyGen...');
  await downloadVideo(videoUrl, tempOutput);

  // 5. Merge de Áudio (FFmpeg) para garantir qualidade máxima
  // O HeyGen às vezes comprime o áudio, vamos forçar o som crystal clear do ElevenLabs
  console.log('🔀 Mixando com áudio original (ElevenLabs) via FFmpeg...');
  const ffmpegPath = `C:\\Users\\User\\AppData\\Local\\CapCut\\Apps\\8.1.1.3417\\ffmpeg.exe`;
  
  const spawn = require('child_process').spawnSync;
  const result = spawn(ffmpegPath, [
    '-i', tempOutput,
    '-i', audioPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-shortest',
    finalOutput
  ]);

  if (result.status !== 0) {
    console.log('⚠️ Erro no FFmpeg, mas o vídeo raw foi gerado.');
    console.log(`Arquivo raw: ${tempOutput}`);
  } else {
    console.log('\n✨ VÍDEO CINEMÁTICO GERADO COM SUCESSO! ✨');
    console.log(`✅ Resultado: ${finalOutput}`);
    // Limpar temp raw
    fs.unlinkSync(tempOutput);
  }
}

main().catch(console.error);
