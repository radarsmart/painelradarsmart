# Radar Smart - Arquitetura do modulo de videos TikTok

## Objetivo

Criar criativos verticais 9:16 com blocos independentes e providers trocaveis:

- Image API: gera ou seleciona imagem do produto.
- Text API: gera hook, roteiro, CTA, variacoes e cenas.
- Preview API: junta imagem, texto e plano de cenas antes do render.
- Video API: compoe e renderiza MP4 com Remotion.
- Publish API: envia MP4 ao Supabase Storage.

Cada bloco usa contrato fixo de entrada/saida para trocar OpenAI, mock ou outro provider sem reescrever o fluxo.

## Pastas

```txt
lib/ai/
  contracts/
    image.ts
    text.ts
    video.ts
    publish.ts
  providers/
    image/
      openai.ts
      mock.ts
      index.ts
    text/
      openai.ts
      mock.ts
      index.ts
    video/
      remotion.ts
      mock.ts
      index.ts
  factory.ts
  registry.ts
  publish.ts
  video-jobs.ts

app/api/ai/
  image/route.ts
  text/route.ts
  preview/route.ts
  publish/route.ts
  video/
    compose/route.ts
    render/route.ts
    status/route.ts
    full-pipeline/route.ts
```

## Contratos principais

- `ImageInput`: `productName`, `description`, `price`, `style`, `sourceImageUrl`.
- `ImageOutput`: `status`, `provider`, `outputUrl`, `prompt`, `dimensions`, `metadata`, `error`.
- `TextInput`: `productName`, `description`, `price`, `targetAudience`, `platform`, `durationSeconds`.
- `TextOutput`: `status`, `provider`, `hook`, `body`, `cta`, `duration`, `variations`, `scenes`.
- `TextScene`: `index`, `startSecond`, `endSecond`, `visual`, `overlayText`.
- `VideoInput`: `imageUrl`, `script`, `productName`, `templateId`, `jobId`.
- `VideoOutput`: `status`, `provider`, `videoUrl`, `localFilePath`, `duration`, `dimensions`, `storage`, `metadata`, `error`.
- `PublishInput`: `localFilePath`, `videoUrl`, `fileName`, `bucket`, `jobId`, `metadata`.
- `PublishOutput`: `status`, `provider`, `bucket`, `path`, `publicUrl`, `metadata`, `error`.

## Endpoints

### `POST /api/ai/image`

Protegido por admin. Gera imagem 9:16 ou retorna `sourceImageUrl` quando ja existe imagem do produto.

### `POST /api/ai/text`

Protegido por admin. Gera roteiro curto em PT-BR com CTA para Radar Smart, sem citar marketplace.

### `POST /api/ai/preview`

Protegido por admin. Executa Image API e Text API em paralelo e devolve imagem, roteiro, variacoes, cenas e `renderReady`.

### `POST /api/ai/video/compose`

Protegido por admin. Valida o pacote de video e devolve metadata de composicao.

### `POST /api/ai/video/render`

Protegido por admin. Renderiza MP4 local em `temp/videos` com Remotion para frames e FFmpeg externo usando `-c:v mpeg4`.

### `POST /api/ai/publish`

Protegido por admin. Publica `localFilePath` ou `videoUrl` no Supabase Storage. Bucket padrao: `ugc-videos`.

### `POST /api/ai/video/full-pipeline`

Protegido por admin. Executa imagem, texto, composicao, render e publicacao. Use `publish: false` para renderizar sem enviar ao Storage.

### `GET /api/ai/video/status`

Protegido por admin. Sem `jobId`, retorna status do sistema. Com `jobId`, consulta `ai_video_jobs`.

## Fluxo de execucao

1. Admin envia produto, descricao, preco e opcionalmente imagem existente.
2. Full Pipeline cria job `preview_generating`.
3. Image/Text rodam em paralelo.
4. Job vira `preview_ready`.
5. Remotion renderiza frames 1080x1920.
6. FFmpeg externo monta MP4 com `mpeg4`.
7. Job vira `rendered`.
8. Publish API envia MP4 ao Supabase Storage.
9. Job vira `published`.

## Status do job

```txt
draft
preview_generating
preview_ready
render_queued
rendering
rendered
uploading
published
failed
cancelled
```

## Supabase

Migration:

```txt
supabase/migrations/20260505120000_create_ai_video_jobs.sql
```

A tabela `ai_video_jobs` tem RLS ativo e politicas restritas a admins. O upload usa service role no backend e nunca expoe chaves no cliente.

## Codec

Regra do projeto: nunca usar `libx264`.

O render usa:

```txt
Remotion renderFrames -> FFmpeg externo -> -c:v mpeg4 -pix_fmt yuv420p
```

O caminho padrao do FFmpeg e:

```txt
C:\Users\User\AppData\Local\CapCut\Apps\8.1.1.3417\ffmpeg.exe
```

Tambem pode ser sobrescrito por `FFMPEG_PATH`.
