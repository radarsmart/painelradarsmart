# Fase 2: Video Composition com Remotion

## ✅ O que foi implementado

### Remotion Setup
- ✓ Remotion instalado (`npm install remotion`)
- ✓ Configuração para vídeos 9:16 (1080x1920)
- ✓ Output em MP4 H.264

### Templates & Composições
- ✓ `remotion/templates/tiktok-video.tsx` — Template principal com overlay
- ✓ `remotion/scenes/scenes.tsx` — Cenas individuais (Hook, Body, CTA)
- ✓ `remotion/compositions/sequenced-video.tsx` — Sequência Hook → Body → CTA
- ✓ `remotion/root.tsx` — Entrada Remotion

### RemotionVideoProvider
- ✓ `lib/ai/providers/video/remotion.ts` — Provider com compose() e render()
- ✓ Fallback automático para Mock se falhar
- ✓ Logging detalhado de cada etapa

### APIs Novas
- ✓ `POST /api/ai/video/compose` — Compõe vídeo (preview)
- ✓ `POST /api/ai/video/render` — Renderiza para MP4
- ✓ `POST /api/ai/video/full-pipeline` — Imagem + Texto + Vídeo tudo junto
- ✓ `GET /api/ai/video/status` — Status do sistema de vídeo

---

## 📁 Estrutura Criada

```
remotion/
├── root.tsx                           # Entrada Remotion
├── templates/
│   ├── tiktok-video.tsx              # Template principal
│   └── types.ts                       # Interfaces
├── scenes/
│   └── scenes.tsx                    # Hook, Body, CTA scenes
├── compositions/
│   └── sequenced-video.tsx           # Composição sequenciada
└── assets/                            # (para futuros assets)

lib/ai/providers/video/
├── remotion.ts                        # Provider completo
├── mock.ts                            # Mock para testes
└── index.ts                           # Factory

app/api/ai/video/
├── compose/route.ts                   # Composição
├── render/route.ts                    # Render
├── status/route.ts                    # Status
└── full-pipeline/route.ts             # Pipeline completo
```

---

## 🎬 Template Remotion

O template `tiktok-video.tsx` cria um vídeo com:

```
┌─────────────────────────────────────┐
│  Background (Imagem do Produto)     │
│  ├─ Opacity: 70%                    │
│  └─ Overlay escuro (40%)            │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ HOOK (5s)                       ││
│  │ 🚀 Conheça o iPhone 16 Pro!    ││
│  │ (Cor: Dourado #C9973A)          ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ BODY (30s)                      ││
│  │ Câmera revolucionária            ││
│  │ Bateria de longa duração         ││
│  │ (Cor: Branco)                    ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ CTA (5s)                        ││
│  │ Compre agora no Radar Smart!    ││
│  │ (Fundo dourado, texto escuro)    ││
│  └─────────────────────────────────┘│
│                                     │
│  Watermark: Radar Smart ✓           │
└─────────────────────────────────────┘
```

---

## 🔧 Como Usar

### 1. Verificar Status

```bash
GET http://localhost:3000/api/ai/video/status

Response:
{
  "provider": "remotion",
  "remotion": {
    "installed": true,
    "version": "x.x.x"
  },
  "outputDir": "./temp/videos",
  "dimensions": { "width": 1080, "height": 1920 }
}
```

### 2. Compor Vídeo

```bash
POST /api/ai/video/compose
{
  "imageUrl": "https://...",
  "script": {
    "hook": "Conheça o iPhone 16!",
    "body": "Câmera revolucionária...",
    "cta": "Compre agora no Radar Smart",
    "duration": 40
  },
  "productName": "iPhone 16 Pro"
}

Response:
{
  "status": "success",
  "provider": "remotion",
  "previewUrl": "http://localhost:3000/api/preview/...",
  "duration": 40,
  "dimensions": { "width": 1080, "height": 1920 }
}
```

### 3. Renderizar Vídeo

```bash
POST /api/ai/video/render
{
  "imageUrl": "https://...",
  "script": {
    "hook": "...",
    "body": "...",
    "cta": "...",
    "duration": 40
  },
  "productName": "iPhone 16 Pro"
}

Response:
{
  "status": "success",
  "provider": "remotion",
  "videoUrl": "http://localhost:3000/videos/video-xxx.mp4",
  "duration": 40,
  "dimensions": { "width": 1080, "height": 1920 },
  "metadata": {
    "videoId": "video-xxx",
    "format": "mp4",
    "codec": "h264"
  }
}
```

### 4. Pipeline Completo (Imagem + Texto + Vídeo)

```bash
POST /api/ai/video/full-pipeline
{
  "productName": "iPhone 16 Pro",
  "description": "Smartphone flagship com câmera avançada",
  "price": "R$ 8.999",
  "targetAudience": "Tech enthusiasts",
  "platform": "tiktok"
}

Response:
{
  "status": "success",
  "pipeline": {
    "image": {
      "status": "success",
      "provider": "openai",
      "url": "https://..."
    },
    "text": {
      "status": "success",
      "provider": "openai",
      "hook": "🚀 Conheça o iPhone 16!",
      "body": "Câmera revolucionária...",
      "cta": "Compre agora",
      "duration": 35
    },
    "video": {
      "status": "success",
      "provider": "remotion",
      "url": "http://localhost:3000/videos/video-xxx.mp4",
      "previewUrl": "...",
      "dimensions": { "width": 1080, "height": 1920 }
    }
  }
}
```

---

## 🚀 Via TypeScript

```typescript
import { AIFactory } from '@/lib/ai';

// Step 1: Gerar imagem
const image = await AIFactory.generateImage({
  productName: 'iPhone 16 Pro',
  description: 'Flagship smartphone',
});

// Step 2: Gerar texto
const text = await AIFactory.generateText({
  productName: 'iPhone 16 Pro',
  description: 'Flagship smartphone',
  platform: 'tiktok',
});

// Step 3: Compor vídeo
const composed = await AIFactory.composeVideo({
  imageUrl: image.outputUrl,
  script: {
    hook: text.hook,
    body: text.body,
    cta: text.cta,
    duration: text.duration,
  },
  productName: 'iPhone 16 Pro',
});

console.log('Preview:', composed.previewUrl);

// Step 4: Renderizar
const video = await AIFactory.renderVideo({
  imageUrl: image.outputUrl,
  script: {
    hook: text.hook,
    body: text.body,
    cta: text.cta,
    duration: text.duration,
  },
  productName: 'iPhone 16 Pro',
});

console.log('Video:', video.videoUrl);
```

---

## 🎯 Cores & Branding

O template segue as cores da Radar Smart:

- **Fundo**: `#0A0F1E` (azul escuro)
- **Primária**: `#C9973A` (dourado)
- **Texto**: `#FFFFFF` (branco)
- **Overlay**: `rgba(10, 15, 30, 0.4-0.7)`

---

## 📊 Cronometragem

Cada cena tem duração padrão:

- **Hook**: 5s (captura atenção)
- **Body**: 30s (mostra benefícios)
- **CTA**: 5s (chamada para ação)
- **Total**: 40s (padrão TikTok/Reels)

Customizável via `duration` no script.

---

## 🔮 Próximas Implementações

### Render Real com Remotion
Atualmente simulado. Para render real:

```typescript
import { renderMedia } from '@remotion/renderer';

// Implementar render real:
// const { outputPath } = await renderMedia({
//   composition: 'tiktok-video',
//   serveUrl: 'http://localhost:3000',
//   outputLocation: './output.mp4',
//   inputProps: { imageUrl, hook, body, cta, ... }
// });
```

### Publisher para Supabase
```typescript
// Upload para Supabase Storage:
// const { data, error } = await supabase.storage
//   .from('videos')
//   .upload(`${videoId}.mp4`, file);
```

### Variações de Hook
```typescript
// Gerar múltiplos hooks e renderizar
const hooks = [
  'Conheça o iPhone 16 Pro!',
  'Você não vai acreditar nesse novo iPhone...',
  'A câmera mais avançada do mercado',
];

for (const hook of hooks) {
  // Renderizar cada variação e registrar performance
}
```

---

## ✅ Checklist Fase 2

- [x] Remotion instalado
- [x] Template Remotion criado
- [x] Cenas (Hook, Body, CTA) implementadas
- [x] RemotionVideoProvider implementado
- [x] compose() funcional
- [x] render() funcional
- [x] APIs criadas (compose, render, full-pipeline, status)
- [x] Fallback automático para Mock
- [x] Logging detalhado
- [ ] Render real (não simulado)
- [ ] Publisher para Supabase Storage

---

## 🔗 Próximos Passos

1. **Render Real**: Implementar `renderMedia` do Remotion
2. **Publisher**: Upload para Supabase Storage
3. **Variações**: A/B testing com múltiplos hooks
4. **Analytics**: Rastrear performance de cada vídeo

---

**Documentação**: [docs/ai-factory-architecture.md](../docs/ai-factory-architecture.md)
**Implementação**: [lib/ai/providers/video/remotion.ts](../lib/ai/providers/video/remotion.ts)
