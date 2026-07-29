/**
 * test-video-pipeline.ts
 * Testa o pipeline completo: Remotion → FFmpeg → Supabase Storage
 * Uso: npx tsx scripts/test-video-pipeline.ts
 */
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';

// Garante que as env vars foram carregadas
const requiredEnvs = ['AI_VIDEO_PROVIDER', 'FFMPEG_PATH', 'REMOTION_OUTPUT_DIR'];
for (const env of requiredEnvs) {
  if (!process.env[env]) {
    console.error(`❌ Variável de ambiente ausente: ${env}`);
    process.exit(1);
  }
}

console.log('\n🎬 Radar Smart — Teste de Pipeline de Vídeo');
console.log('=============================================');
console.log(`📹 Provider: ${process.env.AI_VIDEO_PROVIDER}`);
console.log(`🔧 FFmpeg:   ${process.env.FFMPEG_PATH}`);
console.log(`📁 Output:   ${process.env.REMOTION_OUTPUT_DIR}`);
console.log('');

async function main() {
  // Importa dinamicamente para respeitar as env vars carregadas
  const { AIFactory } = await import('../lib/ai/index.js');
  const { publishVideoToSupabase } = await import('../lib/ai/publish.js');

  // 1. Gerar texto
  console.log('📝 [1/4] Gerando texto com OpenAI...');
  const textResult = await AIFactory.generateText({
    productName: 'Creatina Monohidratada 250g Growth',
    description: 'Creatina monohidratada pura, 5g por porção, sem sabor, aumenta força e recuperação muscular.',
    price: 'R$ 39,90',
    targetAudience: 'Quem treina musculação e quer ganhar força',
    platform: 'tiktok',
    durationSeconds: 8,
  });

  if (textResult.status === 'error') {
    console.error(`❌ Texto falhou: ${textResult.error}`);
    process.exit(1);
  }
  console.log(`   ✅ Text provider: ${textResult.provider}`);
  console.log(`   Hook: "${textResult.hook}"`);

  // 2. Selecionar imagem (usa URL existente, não gera nova)
  console.log('\n🖼️  [2/4] Selecionando imagem do produto...');
  const imageResult = await AIFactory.generateImage({
    productName: 'Creatina Monohidratada 250g Growth',
    description: 'Creatina monohidratada pura',
    sourceImageUrl: 'https://http2.mlstatic.com/D_Q_NP_2X_662415-MLA97812910758_112025-F.webp',
  });

  if (imageResult.status === 'error') {
    console.error(`❌ Imagem falhou: ${imageResult.error}`);
    process.exit(1);
  }
  console.log(`   ✅ Image provider: ${imageResult.provider}`);
  console.log(`   URL: ${imageResult.outputUrl?.slice(0, 60)}...`);

  // 3. Render Remotion + FFmpeg
  const videoInput = {
    imageUrl: imageResult.outputUrl,
    productName: 'Creatina Monohidratada 250g Growth',
    jobId: `test-${Date.now()}`,
    script: {
      hook: textResult.hook,
      body: textResult.body,
      cta: textResult.cta,
      duration: 8,
    },
  };

  console.log('\n🎥 [3/4] Renderizando vídeo com Remotion + FFmpeg...');
  console.log('   ⏳ Isso pode levar 1-3 minutos na primeira vez (bundle do Remotion)...');
  const startTime = Date.now();

  const renderResult = await AIFactory.renderVideo(videoInput);

  if (renderResult.status === 'error') {
    console.error(`❌ Render falhou: ${renderResult.error}`);
    process.exit(1);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`   ✅ Render provider: ${renderResult.provider} (${elapsed}s)`);
  console.log(`   MP4: ${renderResult.localFilePath}`);

  // Confirma que o arquivo existe
  if (renderResult.localFilePath) {
    const stat = await fs.stat(renderResult.localFilePath).catch(() => null);
    if (stat) {
      console.log(`   Tamanho: ${(stat.size / 1024).toFixed(1)} KB`);
    } else {
      console.error('❌ Arquivo MP4 não encontrado no disco!');
      process.exit(1);
    }
  }

  // 4. Upload para Supabase Storage
  console.log('\n☁️  [4/4] Publicando no Supabase Storage (bucket: ugc-videos)...');
  const publishResult = await publishVideoToSupabase({
    localFilePath: renderResult.localFilePath,
    bucket: 'ugc-videos',
    fileName: 'creatina-growth-test.mp4',
    metadata: {
      productName: 'Creatina Monohidratada 250g Growth',
      testRun: true,
    },
  });

  if (publishResult.status === 'error') {
    console.error(`❌ Publish falhou: ${publishResult.error}`);
    process.exit(1);
  }

  console.log(`   ✅ Upload concluído!`);
  console.log(`\n🏆 PIPELINE COMPLETO — SUCESSO!\n`);
  console.log(`   🎬 URL pública do MP4:`);
  console.log(`   ${publishResult.publicUrl}\n`);

  // Limpa o arquivo local
  if (renderResult.localFilePath) {
    await fs.unlink(renderResult.localFilePath).catch(() => null);
    console.log('   🗑️  Arquivo local removido (MP4 está no Storage)');
  }
}

main().catch((err) => {
  console.error('\n❌ Erro inesperado:', err);
  process.exit(1);
});
