# Relatorio Completo do Projeto Radar Smart

Data de referencia: 2026-04-24
Base analisada: codigo-fonte local do repositorio `radar-smart`

## 1. Resumo Executivo

O Radar Smart e uma plataforma full-stack de curadoria, publicacao e distribuicao de ofertas afiliadas. O projeto combina:

- storefront publico em Next.js App Router
- painel administrativo protegido com operacao de ofertas
- scraping multi-fonte para Mercado Livre, Amazon e Shopee
- integracoes afiliadas com AWIN e Lomadee
- distribuicao automatizada para WhatsApp e Telegram
- modulo de landing pages e infoprodutos
- camada recente de UGC e TikTok Engine para criativos automatizados

O repositorio esta significativamente mais avancado do que um site simples de ofertas. Hoje ele opera como uma plataforma editorial e operacional de afiliacao com backoffice, automacoes, observabilidade parcial e pipelines de criativos.

## 2. Estado Atual do Repositorio

### Estrutura medida no codigo

- `app/`: 150 arquivos
- `app/api/`: 94 arquivos
- `app/admin/`: 31 arquivos
- `components/`: 54 arquivos
- `lib/`: 65 arquivos
- `scripts/`: 23 arquivos
- `supabase/migrations/`: 29 arquivos

### Stack principal confirmada

- Next.js `14.2.35`
- React `18.3.1`
- TypeScript `5`
- TailwindCSS `3.4.17`
- Supabase JS `2.50.5`
- framer-motion
- recharts
- cheerio
- undici
- Playwright
- Remotion
- fluent-ffmpeg
- pdfkit

### Observacoes relevantes

- O projeto usa `strict: true` em TypeScript, mas ainda aceita arquivos `.js` com `allowJs: true`.
- Existe pelo menos um componente administrativo importante ainda em JavaScript: `components/admin/TikTokVideoSystem.jsx`.
- O `README.md` ainda e o padrao do `create-next-app`, entao a documentacao operacional real esta espalhada em `docs/`, skills e codigo.

## 3. Arquitetura Geral

### Frontend publico

O frontend publico entrega:

- home comercial
- listagem de ofertas
- paginas de oferta
- comparativos
- blog
- landing pages publicas por slug
- paginas de infoprodutos
- pagina de grupo
- links e cupons

Rotas publicas principais identificadas:

- `/`
- `/ofertas`
- `/ofertas/[id]`
- `/comparativo`
- `/comparativo/[slug]`
- `/blog`
- `/blog/[slug]`
- `/lp/[slug]`
- `/lp/preview/[id]`
- `/p/[slug]`
- `/grupo`
- `/links`
- `/cupons`
- `/buscar`
- `/go/[id]`

### Painel administrativo

O admin protegido em `app/admin/(protected)` cobre:

- dashboard
- curadoria
- extrator
- ofertas
- envios
- fila
- configuracoes
- canais
- blog
- landing pages
- infoprodutos
- hubs de marketplace
- criativos
- TikTok Engine
- tendencias
- produtos

### Camada de API

O projeto concentra praticamente toda a logica operacional em `app/api`. Ha grupos claros de rotas:

- `app/api/admin/*`: operacao protegida do painel
- `app/api/home/*`: dados do storefront
- `app/api/cron/*`: refresh e jobs recorrentes
- `app/api/awin/*`: automacao e feed AWIN
- `app/api/tiktok-engine/*`: criativos automatizados
- `app/api/scrape/*`: extracao generica
- `app/api/click`, `app/api/grupo`, `app/api/landing-pages/click`, `app/api/infoproducts/click`: tracking

## 4. Fluxos de Negocio Principais

### 4.1 Ciclo de vida de uma oferta

Fluxo consolidado no codigo:

1. A oferta entra por admin, hub, scraper ou integracao.
2. O preview e extraido por `app/api/admin/scraper/route.ts`.
3. A persistencia passa por `app/api/admin/extrator/dispatch/route.ts` e `salvarOferta()` em `lib/supabase.ts`.
4. Ao salvar, o sistema calcula obrigatoriamente `quality_score` e `is_priority`.
5. A visibilidade publica depende de regras em `lib/offers/site-visibility.ts`.
6. A distribuicao pode seguir para fila e canais via `lib/distribution/legacy-dispatch.ts`.

### 4.2 Regras de visibilidade no site

A funcao `isOfferVisibleOnSite()` exige:

- `status = active`
- `affiliate_url` presente
- `slot_type` valido
- curadoria aprovada ou override manual
- janela publica de 48h
- `expires_at` ainda valido, quando preenchido

Slots publicos validos:

- `flash`
- `best`
- `comparator`

### 4.3 Quality Score

O calculo em `lib/offers/quality-score.ts` usa:

- desconto real ou referencia historica: 40%
- qualidade do titulo: 20%
- imagem valida: 20%
- affiliate URL valida: 20%

Regras atuais:

- score de `0` a `100`
- `is_priority = true` quando `quality_score >= 70`

## 5. Scraping e Coleta de Dados

### Mercado Livre

O projeto tem um pipeline amplo e defensivo para ML, com varias camadas e timeouts:

- API oficial
- HTML publico
- Bright Data
- Zenscrape
- Apify
- fallback manual

O arquivo central e `app/api/admin/scraper/route.ts`, que hoje esta grande e concentra bastante regra de extracao, enriquecimento, validacao, persistencia opcional e fallback.

Diagnostico:

- funcionalmente robusto
- alto acoplamento
- arquivo extenso, custoso de manter
- ponto unico de fragilidade operacional

### Amazon

O preview usa Rainforest API com normalizacao adicional de imagem, preco e URL. A busca automatica continua limitada comparada ao pipeline de ML.

### Shopee

Ha suporte a extracao HTML e integracao afiliada para shortlink/affiliate URL.

### Conclusao do scraping

O projeto tem uma infraestrutura de scraping madura em breadth, mas parte dela ainda depende de fallbacks e servicos terceirizados com custo, latencia e variacao de confiabilidade.

## 6. Distribuicao e Automacao de Canais

### Distribuicao para Telegram e WhatsApp

A distribuicao usa:

- feature flags
- janela de envio
- escalonamento por canal
- fila em `post_queue`
- destinos em `post_targets`
- Edge Function `worker-process-offer`

Janela operacional observada:

- timezone: `America/Sao_Paulo`
- horario base: 08:00 ate 22:00
- intervalo padrao: 20 minutos

### Cron jobs na Vercel

Crons configurados em `vercel.json`:

- sync de blog elite
- flush de distribuicao elite
- expiracao de ofertas
- refresh publico de ofertas
- refresh de comparativos
- automacao AWIN

### Maturidade

Esse bloco ja esta acima de um MVP. Existe logica de agendamento, dedupe, limite diario, fallback de enfileiramento e separacao por canal.

## 7. Modulo de Criativos, UGC e TikTok Engine

Esta e a area que mais cresceu recentemente no repositorio.

### Componentes identificados

- `lib/ugc/*`
- `lib/tiktok-engine/*`
- `app/api/tiktok-engine/*`
- `scripts/generate-ugc.ts`
- `scripts/generate-model-a-long.ts`
- `scripts/generate-audio-only.ts`
- `scripts/merge-video-audio.ts`

### Capacidades atuais

- geracao de roteiro
- escolha de hooks
- producao de audio
- composicao de video
- uso de Playwright, Remotion e FFmpeg
- distribuicao agendada para criativos
- briefings e jobs persistidos no banco

### Leitura tecnica

O Radar Smart deixou de ser apenas um agregador de ofertas e passou a incorporar uma mini-plataforma de criativos performance-driven para distribuicao social.

## 8. Banco de Dados e Supabase

### Tendencia do schema

As migrations mostram quatro macrodominios:

- ofertas e afiliacao
- landing pages e tracking
- UGC/criativos
- TikTok Engine/distribuicao

### Evidencias de maturidade

- 29 migrations versionadas
- RLS explicitamente ativado em varias tabelas
- politicas de leitura publica e acesso admin
- funcoes SQL/RPC usadas pelo app
- endurecimento recente de politicas de leitura e escrita

### Tabelas e dominios confirmados

Pelo codigo e migrations, aparecem pelo menos estes grupos:

- `offers`, `price_history`, `clicks`, `post_queue`, `post_targets`
- `landing_pages`, `landing_page_clicks`
- `blog_posts`, `blog_post_offers`
- `infoproducts`
- `mercadolivre_auth`, `ml_products_cache`
- `awin_automation_config`, `awin_product_enrichment_cache`
- `ugc_creatives`, `ugc_personas`, `ugc_projects`, `ugc_templates`, `ugc_angles`, `ugc_project_assets`
- `tiktok_engine_*`
- `scrape_attempt_events`

### Observacoes de seguranca

- O codigo confirma uso de `supabase` publico e `supabaseAdmin` server-side.
- `lib/env-check.ts` falha cedo no servidor quando faltam variaveis criticas do Supabase.
- O health check testa tanto cliente anonimo quanto admin.

## 9. Seguranca e Controles

### Pontos positivos

- TypeScript strict ativo
- autenticacao admin centralizada em `lib/admin-auth.ts`
- validacao por tabela `admins`
- fallback por email admin
- middleware de canonical host
- headers de seguranca em `next.config.mjs`
- HSTS, CSP, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`
- RLS reforcado em migrations recentes

### Pontos de atencao

- `allowJs: true` reduz uniformidade da base tipada
- ha bypass otimista em dev local dentro de `validateAdminToken()`
- o frontend publico ainda consulta Supabase diretamente em `app/page.tsx`, apesar da arquitetura documentada recomendar payload server-side unico
- CSP atual permite `unsafe-inline` para `style-src` e `script-src`

## 10. Ambiente e Integracoes

### Integracoes confirmadas pelo codigo e docs

- Supabase
- Mercado Livre OAuth/API
- Amazon via Rainforest
- Shopee afiliado
- AWIN
- Lomadee
- Gemini
- OpenAI
- ElevenLabs
- Bright Data
- Zenscrape
- Apify
- Playwright
- Remotion
- Freepik
- Pexels
- n8n

### Observacao sobre configuracao

O arquivo `.env.local.example` esta incompleto em relacao ao que o projeto realmente consome hoje. A base atual pede revisao de documentacao de ambiente, especialmente por causa da camada de UGC/TikTok Engine e automacoes novas.

## 11. Deploy e Operacao

### Infra principal

- deploy em Vercel
- App Router com rotas Node.js
- cron jobs nativos da Vercel
- integracao com Supabase

### Comportamentos de runtime relevantes

- varias rotas usam `dynamic = "force-dynamic"`
- rotas mais pesadas possuem `maxDuration` aumentado
- `middleware.ts` faz canonical redirect de `www` para dominio principal

## 12. Divida Tecnica e Riscos

### Risco alto

- `app/api/admin/scraper/route.ts` esta grande demais e mistura muitas responsabilidades.
- Parte da operacao depende de Edge Functions e servicos externos fora deste repositorio.
- O `README.md` nao representa o produto real.

### Risco medio

- A home publica ainda mistura acesso direto ao Supabase no client com uma arquitetura documentada que previa composicao server-side.
- A documentacao de ambiente nao acompanha todo o escopo atual.
- Ha worktree ativa com mudancas nao consolidadas, incluindo TikTok Engine e observabilidade de scraping.

### Risco estrutural

- O projeto esta evoluindo de maneira rapida em multiplas frentes: afiliacao, editorial, LPs, UGC, distribuicao e video. Sem consolidacao arquitetural, a manutencao tende a ficar mais cara e sujeita a regressao.

## 13. Pontos Fortes

- stack coerente para operacao web moderna
- backoffice funcional e amplo
- regras de negocio claras para publicacao de ofertas
- RLS e endurecimento de seguranca em progresso real
- distribuicao com fila e agendamento
- camada de criativos como diferencial competitivo
- boa separacao por dominios em `lib/`
- uso consistente de Supabase como backend operacional

## 14. Principais Gaps

- falta uma documentacao central viva do produto
- falta consolidacao do fluxo oficial da home
- falta reduzir o tamanho e o acoplamento do scraper principal
- falta inventario oficial de Edge Functions externas e contratos
- falta padronizar a parte ainda em JavaScript
- falta ampliar testes automatizados e verificacoes formais

## 15. Recomendacoes Prioritarias

### Curto prazo

1. Atualizar `README.md` para refletir o projeto real.
2. Criar um inventario oficial de variaveis de ambiente por dominio.
3. Extrair o `app/api/admin/scraper/route.ts` em modulos menores.
4. Consolidar a home em torno de `lib/home/get-home-page-data.ts` e `/api/home/page-data`.
5. Documentar Edge Functions externas consumidas pelo app.

### Medio prazo

1. Migrar os arquivos `.js/.jsx` remanescentes para TypeScript.
2. Criar testes de regressao para visibilidade de oferta, quality score e distribuicao.
3. Padronizar observabilidade de scraping, distribuicao e jobs de criativos.
4. Separar melhor os contextos de oferta, criativos e TikTok Engine em modulos mais fechados.

### Estrategico

1. Tratar o Radar Smart como uma plataforma de afiliacao + editorial + creative ops, nao apenas como storefront.
2. Definir um mapa de dominios tecnicos oficial: ofertas, afiliados, distribuicao, landing pages, blog, UGC e TikTok Engine.
3. Estabelecer uma arquitetura de produto com contratos claros entre frontend, APIs e jobs externos.

## 16. Conclusao

O Radar Smart hoje e um projeto robusto, com escopo acima da media para um repositorio unico de afiliacao. Ele ja opera como plataforma integrada de:

- curadoria de ofertas
- publicacao editorial
- comparacao e storefront
- automacao de distribuicao
- criacao de ativos UGC e videos de performance

O principal desafio deixou de ser "construir funcionalidade" e passou a ser "organizar complexidade". A base tem valor real, diferencial operacional e varias frentes prontas ou avancadas, mas agora precisa de consolidacao arquitetural, documentacao viva e modularizacao para sustentar a proxima fase com menos risco.

## 17. Observacao sobre a worktree

Durante esta analise, a worktree local ja continha alteracoes em andamento em areas como TikTok Engine, scraping e seguranca. Este relatorio foi gerado sem modificar esses arquivos e deve ser lido como retrato tecnico do estado local atual, nao como inventario exclusivo do branch remoto.
