# AI Factory — Arquitetura de Providers Abstratos

## ✅ O que foi implementado

Uma arquitetura **modular e desacoplada** para geração de criativos (imagem, texto, vídeo) com:
- **Contratos estáveis**: Interfaces padronizadas para cada tipo de geração
- **Providers intercambiáveis**: OpenAI, Mock, e placeholders para Remotion/HeyGen
- **Fallback automático**: Se um provider falha, tenta o próximo na lista
- **Registry e Factory**: Gerenciamento centralizado de providers
- **APIs REST separadas**: Cada função tem seu próprio endpoint

---

## 📁 Estrutura Criada

```
lib/ai/
├── contracts/
│   ├── image.ts       → IImageProvider (interface estável)
│   ├── text.ts        → ITextProvider (interface estável)
│   └── video.ts       → IVideoProvider (interface estável)
├── providers/
│   ├── image/
│   │   ├── openai.ts  → Implementação com DALL-E
│   │   ├── mock.ts    → Mock para testes
│   │   └── index.ts   → Factory (createImageProvider)
│   ├── text/
│   │   ├── openai.ts  → Implementação com GPT-4
│   │   ├── mock.ts    → Mock para testes
│   │   └── index.ts   → Factory (createTextProvider)
│   └── video/
│       ├── remotion.ts → Placeholder para Remotion (Fase 2)
│       ├── mock.ts    → Mock para testes
│       └── index.ts   → Factory (createVideoProvider)
├── registry.ts        → Singleton com lista de providers
├── factory.ts         → AIFactory com fallback automático
└── index.ts           → Exports públicos

app/api/ai/
├── image/route.ts       → POST /api/ai/image
├── text/route.ts        → POST /api/ai/text
├── video/
│   ├── compose/route.ts → POST /api/ai/video/compose
│   └── render/route.ts  → POST /api/ai/video/render
└── preview/route.ts     → POST /api/ai/preview (ambos)
```

---

## 🎯 Benefícios Principais

| Benefício | Como Funciona |
|-----------|---------------|
| **Trocar OpenAI sem refazer código** | Muda `AI_IMAGE_PROVIDER=stability` e implementa `StabilityImageProvider` |
| **Testar sem APIs reais** | Usa `AI_IMAGE_PROVIDER=mock` em desenvolvimento |
| **Fallback automático** | OpenAI falha → tenta Mock automaticamente, sem erro |
| **Adicionar novos providers** | Implementa interface, registra no factory, configura env |
| **APIs estáveis** | Cliente sempre conversaBASICom mesmo contrato, mesmo que implementação mude |
| **Logs padronizados** | Factory registra todas as tentativas e fallbacks |

---

## 🔧 Como Usar

### 1. **Configurar Ambiente**

Crie `.env.local`:

```env
# Mock (sem custos, para desenvolvimento)
AI_IMAGE_PROVIDER=mock
AI_TEXT_PROVIDER=mock
AI_VIDEO_PROVIDER=mock

# Ou com APIs reais
AI_IMAGE_PROVIDER=openai
AI_TEXT_PROVIDER=openai
AI_VIDEO_PROVIDER=remotion

OPENAI_API_KEY=sk-...
REMOTION_API_KEY=...
```

### 2. **Via API REST**

#### Image Generation
```bash
POST /api/ai/image
Content-Type: application/json

{
  "productName": "iPhone 16 Pro",
  "description": "Smartphone flagship com câmera avançada",
  "price": "R$ 8.999",
  "style": "modern, vibrant"
}

Response:
{
  "status": "success",
  "provider": "openai",     // ou "mock"
  "outputUrl": "https://...",
  "prompt": "...",
  "metadata": { ... }
}
```

#### Text Generation (Script)
```bash
POST /api/ai/text
{
  "productName": "iPhone 16 Pro",
  "description": "Smartphone flagship...",
  "targetAudience": "Tech enthusiasts",
  "platform": "tiktok"
}

Response:
{
  "status": "success",
  "provider": "openai",
  "hook": "🚀 Conheça o iPhone 16 Pro!",
  "body": "Com câmera revolucionária...",
  "cta": "Compre agora no Radar Smart",
  "duration": 35,
  "metadata": { ... }
}
```

#### Preview Completo (Imagem + Texto)
```bash
POST /api/ai/preview
{
  "productName": "iPhone 16 Pro",
  "description": "Smartphone flagship...",
  "price": "R$ 8.999",
  "targetAudience": "Tech enthusiasts",
  "platform": "tiktok"
}

Response:
{
  "image": {
    "status": "success",
    "provider": "openai",
    "outputUrl": "https://...",
    "prompt": "..."
  },
  "text": {
    "status": "success",
    "provider": "openai",
    "hook": "...",
    "body": "...",
    "cta": "...",
    "duration": 35
  }
}
```

### 3. **Via TypeScript/Node.js**

```typescript
import { AIFactory } from '@/lib/ai';

// Gerar imagem
const image = await AIFactory.generateImage({
  productName: 'iPhone 16 Pro',
  description: 'Smartphone flagship',
});

// Gerar texto
const text = await AIFactory.generateText({
  productName: 'iPhone 16 Pro',
  description: 'Smartphone flagship',
  platform: 'tiktok',
});

// Compor vídeo
const video = await AIFactory.composeVideo({
  imageUrl: image.outputUrl,
  script: {
    hook: text.hook,
    body: text.body,
    cta: text.cta,
    duration: text.duration,
  },
  productName: 'iPhone 16 Pro',
});
```

---

## 🔄 Fluxo de Fallback

```
AIFactory.generateImage(input)
  ↓
Registry.getImageProviders()  // [OpenAIImageProvider, MockImageProvider]
  ↓
1. Tenta OpenAI
   ├─ Success? → Retorna resultado com provider='openai'
   └─ Falha? → Tenta próximo
2. Tenta Mock
   ├─ Success? → Retorna resultado com provider='mock'
   └─ Falha? → Retorna error
```

**Logs automáticos:**
```
[AIFactory] Attempting Image with openai
[AIFactory] Image generation failed with openai: API key not configured
[AIFactory] Attempting Image with mock
[AIFactory] Image succeeded with mock
```

---

## 🛠️ Adicionar Novo Provider

### Exemplo: Adicionar Stability AI para Imagens

1. **Implemente a interface:**

```typescript
// lib/ai/providers/image/stability.ts
import { IImageProvider, ImageInput, ImageOutput } from '../../contracts/image';

export class StabilityImageProvider implements IImageProvider {
  name = 'stability';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.STABILITY_API_KEY || '';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async generate(input: ImageInput): Promise<ImageOutput> {
    // Implementar chamada à API Stability
    // ...
  }
}
```

2. **Registre no factory:**

```typescript
// lib/ai/providers/image/index.ts
case 'stability':
  return new StabilityImageProvider();
```

3. **Configure env:**

```env
AI_IMAGE_PROVIDER=stability
STABILITY_API_KEY=your-key
```

Pronto! Sistema usa Stability sem refazer mais nada.

---

## 📊 Resposta Padronizada

Toda resposta segue o mesmo contrato:

```typescript
interface AnyOutput {
  status: 'success' | 'error';
  provider: string;           // 'openai', 'mock', 'stability', etc.
  [resultFields]: any;        // outputUrl, hook, body, etc.
  error?: string;             // Se status='error'
  metadata?: Record<string, unknown>;  // Dados adicionais
}
```

Isso facilita:
- ✓ Tratamento genérico de erros
- ✓ Logging centralizado
- ✓ Fallback automático
- ✓ Teste sem APIs reais

---

## 🚀 Próximas Fases

### Fase 2: Video Composition
- [ ] Implementar `RemotionVideoProvider`
- [ ] Criar templates de cenas em `remotion/templates/`
- [ ] Renderizar composição para vídeo 9:16

### Fase 3: Publisher
- [ ] Implementar `PublisherProvider` abstrato
- [ ] Upload para Supabase Storage
- [ ] Persistir metadata em BD
- [ ] Registrar status e logs

### Fase 4: Performance & Analytics
- [ ] Variações de hook (A/B testing)
- [ ] Métricas de engajamento
- [ ] Recomendações automáticas
- [ ] Cache de renderizações

---

## ✅ Verificação da Implementação

```bash
# Verificar estrutura
node scripts/verify-ai-factory.js

# Testar com mock (sem APIs)
$env:AI_IMAGE_PROVIDER='mock'
$env:AI_TEXT_PROVIDER='mock'
npm run dev

# Testar endpoint
curl -X POST http://localhost:3000/api/ai/preview \
  -H "Content-Type: application/json" \
  -d '{
    "productName": "iPhone 16",
    "description": "Flagship smartphone"
  }'
```

---

## 📝 Resumo da Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    API REST Routes                      │
│    /image  /text  /video/compose  /video/render        │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                    AIFactory                            │
│  • generateImage()  • generateText()  • composeVideo()  │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                 Registry (Singleton)                    │
│  image: [OpenAI, Mock]                                  │
│  text: [OpenAI, Mock]                                   │
│  video: [Remotion, Mock]                                │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│            Providers (Intercambiáveis)                  │
│  • Contratos estáveis (IImageProvider, etc.)            │
│  • Implementações (OpenAI, Mock, Remotion, etc.)        │
│  • Fallback automático entre providers                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🎓 Conceitos-chave

- **Interface Segregation**: Cada contrato é pequenininho e focado
- **Dependency Injection**: Providers injetados via registry
- **Strategy Pattern**: Trocar estratégia (provider) sem refazer código
- **Fallback Pattern**: Tentar alternativas automaticamente
- **Singleton Pattern**: Registry é único em toda a aplicação

---

## 📚 Próximo Passo

Para começar Fase 2 (Remotion video composition), execute:
```bash
npm install remotion
# Implementar RemotionVideoProvider.compose() e .render()
# Criar templates em remotion/templates/
```

---

**Documentação**: [docs/ai-factory-architecture.md](../docs/ai-factory-architecture.md)
