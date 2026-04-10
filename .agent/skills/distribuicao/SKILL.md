---
name: distribuicao
description: Usar ao construir ou modificar distribuicao de ofertas para site, WhatsApp e Telegram.
---

## Como oferta vira publica no site

offers precisa ter: status active, affiliate_url preenchido, slot valido e
curadoria aprovada ou override ativo. Home le flash, best e comparator via
app/api/home/offers/route.ts.

## Distribuicao WhatsApp e Telegram

Fluxo central: lib/distribution/legacy-dispatch.ts Primeiro tenta
worker-process-offer (Edge Function). Se houver bloqueio de aprovacao, entra
direto em post_queue. Janela de envio: 08h00 as 22h00, slots a cada 20 minutos.

## Edge Functions ativas (Supabase)

channel-whatsapp-control channel-telegram-control worker-process-offer
elite-flush (cron para distribuicao automatica elite)

## Tabelas envolvidas

post_queue: fila de envio post_targets: destinos configurados grupo_membros:
rastreia entradas no grupo

## Criacao de Conteudo UGC (Fase 2)

O sistema gera videos curtiveis automaticamente para distribuicao social:
- **Modelo C (Screen Simulation)**: Simula navegacao humana no `radarsmart.com.br` via Playwright ou usa fluxos combinados (FFmpeg) de vídeo mobile pré-gravado com locução ElevenLabs gerada automaticamente.
- **Localizacao**: `lib/ugc/` contém o core (`script-generator.ts`, `model-c-screen.ts`). Scripts avulsos em `scripts/` (ex: `generate-audio-only.ts`, `merge-video-audio.ts`).
- **Scripts**: Gerados por GPT-4o (`OPENAI_API_KEY`) com extração de dados reais via Firecrawl. Tom casual e gago proposital.
- **Voz**: ElevenLabs (`ELEVENLABS_API_KEY`). Voz oficial: **Mateus Moretti** (`id: F7823wtD50WK1gnmgBk5`).
- **Como rodar (Local)**: 
  - Fluxo completo Playwright: `npx tsx scripts/generate-ugc.ts --voice=mateus`
  - Apenas Áudio (Sem simulação Playwright): `npx tsx scripts/generate-audio-only.ts`
  - Merge Vídeo + Áudio Manual: `npx tsx scripts/merge-video-audio.ts`

O CTA e obrigatorio e sempre direciona para: *"Corre lá, entra no Radar Smart pelo link na bio e garante antes de esgotar!"*.

## Webhook opcional

N8N_WEBHOOK_URL para entrada de ofertas externas (opcional).

## Regras

Sempre usar affiliate_url, nunca link direto do marketplace. Registrar cada
envio com canal, offer_id, status e timestamp.
