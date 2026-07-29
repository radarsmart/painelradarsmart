/**
 * deploy-remotion-lambda.ts
 * Deploy da função Lambda e do site Remotion na AWS.
 * Uso: npx tsx scripts/deploy-remotion-lambda.ts
 *
 * Pré-requisitos:
 *   - AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY no ambiente (ou .env.local)
 *   - @remotion/lambda instalado
 */
import 'dotenv/config';

const REGION = (process.env.REMOTION_AWS_REGION || 'us-east-1') as Parameters<
  typeof import('@remotion/lambda')['deployFunction']
>[0]['region'];

const SITE_NAME = 'radar-smart';
const MEMORY_MB = 3008;
const TIMEOUT_SECONDS = 240;

async function main() {
  console.log('\n🚀 Radar Smart — Deploy Remotion Lambda');
  console.log('========================================');
  console.log(`📍 Região: ${REGION}`);
  console.log(`💾 Memória: ${MEMORY_MB} MB`);
  console.log(`⏱️  Timeout: ${TIMEOUT_SECONDS}s\n`);

  // Configurar credenciais AWS a partir das env vars do Remotion
  if (process.env.REMOTION_AWS_ACCESS_KEY_ID) {
    process.env.AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID;
  }
  if (process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    process.env.AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Configure REMOTION_AWS_ACCESS_KEY_ID e REMOTION_AWS_SECRET_ACCESS_KEY no .env.local');
    process.exit(1);
  }

  const { deployFunction, deploySite, getOrCreateBucket } = await import('@remotion/lambda');

  // 1. Criar/verificar bucket S3
  console.log('🪣 [1/3] Criando bucket S3...');
  const { bucketName } = await getOrCreateBucket({ region: REGION });
  console.log(`   ✅ Bucket: ${bucketName}`);

  // 2. Deploy da função Lambda
  console.log('\n⚡ [2/3] Fazendo deploy da função Lambda...');
  const { functionName } = await deployFunction({
    region: REGION,
    timeoutInSeconds: TIMEOUT_SECONDS,
    memorySizeInMb: MEMORY_MB,
    createCloudWatchLogGroup: true,
    // architecture arm64 é o padrão no Remotion v4 (não há parâmetro explícito)
  });
  console.log(`   ✅ Função: ${functionName}`);

  // 3. Deploy do site Remotion (bundle no S3)
  console.log('\n🌐 [3/3] Fazendo deploy do site Remotion no S3...');
  const { serveUrl } = await deploySite({
    bucketName,
    entryPoint: './remotion/root.tsx',
    region: REGION,
    siteName: SITE_NAME,
    options: {
      webpackOverride: (config) => {
        const projectRoot = process.cwd();
        config.resolve = config.resolve ?? {};
        config.resolve.alias = {
          ...(config.resolve.alias as Record<string, string> | undefined),
          '@': projectRoot,
        };
        return config;
      },
    },
  });
  console.log(`   ✅ Serve URL: ${serveUrl}`);

  console.log('\n🏆 DEPLOY CONCLUÍDO!\n');
  console.log('══════════════════════════════════════════════════');
  console.log('📋 Adicione estas variáveis no .env.local e na Vercel:');
  console.log('══════════════════════════════════════════════════\n');
  console.log(`AI_VIDEO_PROVIDER=remotion-lambda`);
  console.log(`REMOTION_AWS_ACCESS_KEY_ID=${process.env.AWS_ACCESS_KEY_ID}`);
  console.log(`REMOTION_AWS_SECRET_ACCESS_KEY=<sua_secret_key>`);
  console.log(`REMOTION_AWS_REGION=${REGION}`);
  console.log(`REMOTION_LAMBDA_FUNCTION_NAME=${functionName}`);
  console.log(`REMOTION_SERVE_URL=${serveUrl}`);
  console.log('\n══════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n❌ Deploy falhou:', err);
  process.exit(1);
});
