# Radar Smart - Relatorio Tecnico Atualizado

Documento de referencia para configuracao de skills, agentes e automacoes de contexto do projeto Radar Smart.

Ultima revisao: 2026-04-10

## 1. Stack Atual

### Framework principal
- Next.js `14.2.35`
- React `18.3.1`
- React DOM `18.3.1`
- TypeScript `5`

### UI e frontend
- TailwindCSS `3.4.17`
- PostCSS `8.5.6`
- `clsx` `2.1.1`
- `framer-motion` `12.23.24`
- `lucide-react` `0.544.0`
- `recharts` `2.15.4`

### Backend e integracoes
- Supabase JS `2.50.5`
- `cheerio` `1.2.0`
- `undici` `6.21.2`

### Utilitarios
- `pdfkit` `0.18.0`
- ESLint `8.57.1`
- `eslint-config-next` `14.2.35`

### Observacoes
- O projeto nao usa Vite. A base atual e Next.js App Router.
- O frontend e o backend HTTP do projeto estao no mesmo repositorio.
- A organizacao do app segue a estrutura `app/` do Next.js.

## 2. Estrutura de Pastas

### Raiz
- `app/`: paginas, layouts e rotas HTTP (`app/api`)
- `components/`: componentes reutilizaveis
- `lib/`: regras de negocio, integracoes e acesso a dados
- `public/`: assets estaticos
- `docs/`: documentacao tecnica e operacional
- `scripts/`: scripts utilitarios
- `supabase/`: migrations versionadas

### app/

#### app/admin/(protected)
Contem o painel administrativo e seus modulos:
- `amazon/`
- `awin/`
- `blog/`
- `canais/`
- `configuracoes/`
- `curadoria/`
- `envios/`
- `extrator/`
- `fila/`
- `hub-awin/`
- `infoprodutos/`
- `landing-pages/`
- `lomadee/`
- `mercadolivre/`
- `ofertas/`
- `produtos/`
- `shopee/`
- `tendencias/`

#### app/api/
Contem as rotas HTTP internas e publicas:
- `admin/`: APIs protegidas do painel
- `awin/`: APIs publicas/operacionais da integracao AWIN
- `click/`: tracking de cliques
- `cron/`: rotas chamadas por cron na Vercel
- `grupo/`: tracking de entrada em grupo
- `health/`: healthcheck
- `home/`: dados do frontend publico
- `infoproducts/`: click tracking de infoprodutos
- `landing-pages/`: tracking publico de CTAs
- `ml/`: cache/listagem ML
- `shopee/`: listagem Shopee

#### app/lp/
- Paginas publicas de landing page por slug
- Preview publico/privado conforme status

#### app/p/
- Paginas publicas de infoprodutos

### components/

#### components/admin
Componentes do painel:
- `AdminSidebar`
- `CuradoriaDashboard`
- `CuradoriaInbox`
- `EnviosNocPage`
- `LandingPagesManager`
- `AwinAutomationPanel`
- `RefreshSiteOffersButton`
- `TabelaOfertas`
- `DeleteQueueItemButton`

#### components/layout
Componentes globais do frontend:
- `Header`
- `Footer`
- `OfferTicker`
- `BrandWordmark`

#### components/landing
Componentes especificos de LP:
- `LandingPageView`
- `TrackedCtaLink`

#### components/vitrine
Componentes da home e listas publicas:
- `CardOferta`
- `GridOfertas`
- `CategoriasScroll`
- `MLHub`

#### components/comparativo
- `ComparativoClient`

#### components/blog
- `BlogProductCard`

### lib/

#### lib/supabase.ts
- cliente publico
- cliente admin
- funcoes utilitarias de acesso a banco

#### lib/distribution/
- fila e distribuicao para canais

#### lib/scraping/
- extratores por marketplace
- ML oficial
- ML Bright Data
- ML Zenscrape
- Amazon Rainforest
- Shopee HTML

#### lib/awin/
- cliente AWIN
- automacao AWIN
- configuracao da automacao

#### lib/offers/
- visibilidade publica
- refresh de preco

#### lib/home/
- composicao de dados da home

#### lib/ml/
- cache e curadoria ML

#### lib/shopee/
- cliente da API afiliada da Shopee

#### lib/lomadee/
- cliente Lomadee

#### lib/ai/
- integracao Gemini

#### lib/landing-pages.ts
- acesso e normalizacao de landing pages

## 3. Banco de Dados

### Tabelas referenciadas no codigo
- `admins`
- `affiliate_programs`
- `awin_automation_config`
- `blog_post_offers`
- `blog_posts`
- `categories`
- `clicks`
- `grupo_membros`
- `hub_offers`
- `inbox_cache`
- `infoproducts`
- `landing_page_clicks`
- `landing_pages`
- `mercadolivre_auth`
- `ml_products_cache`
- `offers`
- `post_queue`
- `post_targets`
- `price_history`
- `radar_smart_boost`
- `radar_smart_rank`
- `scrape_jobs`
- `v_revenue_by_marketplace`

### Migrations versionadas no repositorio
- `20260326_create_ml_products_cache.sql`
- `20260329123000_add_blog_offer_links.sql`
- `20260330014500_create_infoproducts.sql`
- `20260407105000_add_offer_publication_window.sql`
- `20260407150000_create_awin_automation_config.sql`
- `20260407162000_update_awin_automation_price_min.sql`
- `20260407163000_enforce_awin_automation_price_range.sql`
- `20260408090000_add_offer_price_tracking_columns.sql`
- `20260409123000_create_landing_pages.sql`
- `20260409143000_create_landing_page_clicks.sql`
- `20260409162000_add_landing_page_utm_fields.sql`

### Fluxo de dados das ofertas

#### Entrada
As ofertas entram por:
- Central de Oferta
- Hubs de marketplace
- webhook do n8n
- automacao AWIN
- insercao manual no admin

#### Extracao
O preview e extraido em:
- `app/api/admin/scraper/route.ts`

Camadas principais:
- Mercado Livre: API oficial -> Bright Data -> HTML -> Zenscrape/Apify -> manual
- Amazon: Rainforest API -> fallback de HTML rotacionado -> manual
- Shopee: HTML + shortlink afiliado
- AWIN: feed/programmes/deep link

#### Persistencia
Persistencia principal:
- `salvarOferta()` em `lib/supabase.ts`
- rota operacional: `app/api/admin/extrator/dispatch/route.ts`

#### Publicacao no site
Uma oferta so aparece no site quando:
- `status = active`
- `affiliate_url` preenchido
- `slot_type` valido (`flash`, `best`, `comparator`)
- curadoria aprovada ou override manual
- `expires_at` ainda valido
- `quality_score` e `is_priority` calculados

Regras centrais:
- `lib/offers/site-visibility.ts`
- `lib/offers/quality-score.ts` (Calculo de 0-100: Desconto 40%, Titulo 20%, Imagem 20%, Afiliado 20%)

#### Consumo no frontend
Rotas publicas de dados:
- `app/api/home/offers/route.ts`
- `app/api/home/page-data/route.ts`

### RPCs e funcoes SQL utilizadas
- `increment_infoproduct_clicks`
- `get_last_scheduled_at`

### Triggers SQL versionadas no repo
- Nenhuma trigger SQL versionada no repositorio atual

### Edge Functions / funcoes externas usadas pelo app
- `worker-process-offer`
- `channel-whatsapp-control`
- `channel-telegram-control`

Observacao:
- Essas funcoes sao consumidas pelo app, mas nao estao versionadas neste repositorio.

## 4. APIs e Integracoes Ativas

### APIs/integracoes ativas
- Supabase (DB/Auth)
- Mercado Livre OAuth + API oficial
- Bright Data Unlocker
- Zenscrape
- Apify
- Rainforest API
- Shopee Affiliate GraphQL
- AWIN API + feeds
- Lomadee API
- Gemini API
- Freepik API (Kling 3 / Mystic)
- Pexels API (Stock Footage Fallback)
- n8n webhook

### APIs em construcao ou desativadas parcialmente
- busca automatica Amazon no admin: desativada, retorno `manual_only`
- busca automatica ML no admin: desativada, retorno `manual_only`
- discover/sniper na curadoria: desativado temporariamente

### Estado atual do scraper ML
- Extracao automatica existe e funciona por camadas
- Ainda pode falhar dependendo da URL e da superficie do marketplace
- Fallback manual continua necessario em alguns casos

Pipeline atual (Cascata Linear):
- API oficial (Timeout: 5s)
- HTML publico (Timeout: 4s)
- Bright Data (Timeout: 10s)
- Zenscrape
- Apify
- manual (Fallback final)

Este fluxo e "short-circuit": se uma camada retorna dados validos, as seguintes nao sao chamadas. 
Logs: Procure por `[ML Preview]` no console para identificar qual camada foi acionada.

### Estado atual do scraper Amazon
- Preview de produto usa Rainforest API
- Search/sniper automatico esta desativado
- Operacao atual depende de hub + central + preview manual/assistido

### Estado atual do scraper Shopee
- Busca top products via GraphQL afiliado
- Gera shortlink afiliado
- Extracao HTML de pagina quando necessario

## 5. Painel Admin

### O que o painel faz hoje
- dashboard operacional
- curadoria geral
- central de oferta
- gestao de ofertas publicadas
- painel de envios/fila
- landing pages
- hubs por marketplace
- blog e reviews
- infoprodutos
- canais
- configuracoes

### Funcionalidades prontas

#### Operacao
- criar oferta manual
- extrair por URL
- publicar para site
- enfileirar para Telegram e WhatsApp
- editar e excluir ofertas
- limpar fila com falhas

#### Curadoria
- inbox de ofertas
- aprovacao/reprovacao
- enrich de preview
- filtros e acoes operacionais

#### Landing Pages
- CRUD
- preview de rascunho
- pagina publica por slug
- tracking de CTA
- analytics por landing
- exportacao CSV
- geracao de copy por Gemini
- UTM por campanha

#### AWIN
- status e health
- lista de programas
- feed/lista de produtos
- deep link builder
- analytics AWIN
- automacao com configuracao no banco

#### Blog
- gerar pauta/artigo
- gerenciar posts
- preview
- publicacao
- vinculo com ofertas

#### Infoprodutos
- cadastro e pagina publica
- click tracking

#### Canais
- healthcheck Telegram
- healthcheck WhatsApp
- acoes operacionais de reconexao/status

### O que ainda falta implementar ou estabilizar
- sniper automatico real para ML e Amazon
- versionamento das Edge Functions criticas fora do app
- pixels/eventos de midia paga nas landing pages
- estabilizacao final do funil automatizado de ML

## 6. Distribuicao

### Como as ofertas chegam ao site
- Central de Oferta salva em `offers`
- aprovacao define `status`, `curations_status`, `slot_type`
- home/ofertas/comparativo consomem ofertas visiveis por regra de negocio

### Como chegam ao Telegram e WhatsApp
- fluxo principal em `lib/distribution/legacy-dispatch.ts`
- tenta `worker-process-offer`
- se houver bloqueio/aprovacao, cai em fila direta `post_queue`
- `post_targets` define destinos ativos

### Janela de envio
- timezone: `America/Sao_Paulo`
- horario: `08:00` ate `22:00`
- intervalo entre agendamentos: `20 minutos`

### Webhooks e bots ativos
- `channel-whatsapp-control`
- `channel-telegram-control`
- `worker-process-offer`
- `N8N_WEBHOOK_URL` opcional
- `N8N_WEBHOOK_SECRET` opcional

### Rotas cron versionadas
- `app/api/admin/distribution/elite-flush/route.ts`
- `app/api/admin/offers/expire/route.ts`
- `app/api/cron/public-offers-refresh/route.ts`
- `app/api/cron/comparator-refresh/route.ts`
- `app/api/awin/automation/run/route.ts`

## 7. Afiliados

### Plataformas integradas
- Mercado Livre
- Amazon
- Shopee
- AWIN
- Lomadee

### Como o tracking funciona hoje

#### Mercado Livre
- normalizacao de URL com `source` e `matt_tool`
- utilitario: `lib/mercadolivre.ts`

#### Amazon
- usa affiliate tag/store id
- preview e extracao vinculados ao link informado

#### Shopee
- shortlink afiliado via `generateShortLink`
- GraphQL afiliado oficial

#### AWIN
- deep link via `awin1.com/cread.php`
- feed e programas para composicao de oferta

#### Lomadee
- cliente proprio para produtos e shortlink

#### Tracking interno do site
- cliques de ofertas em `clicks`
- entrada de grupo em `grupo_membros`
- cliques de landing page em `landing_page_clicks`
- cliques de infoproduto via RPC de incremento

## 8. O que Mudou Recentemente

### Funcionalidades adicionadas recentemente
- modulo completo de landing pages
- preview de rascunho de landing
- analytics e tracking de CTA
- geracao de copy via Gemini
- AWIN hub completo
- automacao AWIN com configuracao persistida
- painel de canais
- refresh automatico de precos publicos
- Bright Data no pipeline de ML
- blog admin com fluxo de geracao/publicacao
- modulo de infoprodutos
- modulo Lomadee
- melhorias grandes no storefront e responsividade
- reorganizacao do dashboard admin
- cron jobs adicionais na Vercel
- estabilizacao de RLS, seguranca e performance no Supabase (resolucao padrao do auth_rls_initplan e blindagem de 10+ tabelas apenas para admins)
- implementacao do Inteligencia de Curadoria: `quality_score` e `is_priority` (automacao de prioridade para score >= 70)
- refatoracao do Scraper ML para cascata linear com timeouts otimizados (economia de custos e latencia)
- novos componentes de UI admin: `QualityScoreBadge` e filtros de prioridade alta
- **Fase 2 UGC:** Implementacao do Modelo C (Screen Simulation) e **Modelo A Longo (Multi-cena inteligente)** finalizadas!
- **Producao Multi-Cena (`video-composer.ts`):** Orquestrador de ate 60s usando Freepik, Pexels e Playwright (Text Slides).
- **Voz oficial UGC:** Mateus Moretti (ElevenLabs ID: `F7823wtD50WK1gnmgBk5`).
- **Scripts:** `generate-model-a-long.ts`, `generate-audio-only.ts`, `merge-video-audio.ts`.

### O que esta em andamento
- estabilizacao da extracao automatica de ML
- refinamento das landing pages para trafego pago
- consolidacao de skills e documentacao operacional
- possivel versionamento de Edge Functions fora do repo principal

## 9. Variaveis de Ambiente Relevantes

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Mercado Livre
- `MERCADOLIVRE_APP_ID`
- `MERCADOLIVRE_CLIENT_SECRET`
- `MERCADOLIVRE_ACCESS_TOKEN`
- `MERCADOLIVRE_REDIRECT_URI`
- `ML_AFFILIATE_ID`

### Amazon
- `RAPIDAPI_KEY`
- `RAINFOREST_API_KEY`
- `AMAZON_AFFILIATE_TAG`
- `AMAZON_STORE_ID`

### Shopee
- `SHOPEE_APP_ID`
- `SHOPEE_SECRET_KEY`

### Apify / scraping
- `APIFY_TOKEN`
- `APIFY_ML_TASK_ID`
- `APIFY_AMAZON_TASK_ID`
- `ZENSCRAPE_API_KEY`
- `BRIGHTDATA_API_KEY`
- `BRIGHTDATA_ZONE`

### AWIN
- `AWIN_PUBLISHER_ID`
- `AWIN_API_TOKEN`
- `AWIN_PRODUCT_FEED_LIST_URL`
- `AWIN_PRODUCT_FEED_DOWNLOAD_URL`

### Automacao e operacao
- `CRON_SECRET`
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`
- `PUSH_NOTIFICATION_WEBHOOK_URL`

### Gemini / OpenAI / ElevenLabs
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `OPENAI_API_KEY` (UGC GPT-4o)
- `ELEVENLABS_API_KEY` (UGC Voice)
- `ELEVENLABS_VOICE_ID` (Padrao: Mateus Moretti)

### Grupo/social
- `NEXT_PUBLIC_SUPPORT_WHATSAPP`
- `NEXT_PUBLIC_WHATSAPP_GROUP_URL`
- `NEXT_PUBLIC_TELEGRAM_URL`

### Lomadee
- `LOMADEE_API_KEY`

## 10. Leitura Executiva

### O que ja esta solido
- painel admin
- curadoria
- publicacao de ofertas
- distribuicao por fila
- LPs de performance
- AWIN
- tracking interno
- storefront publico

### Principais gargalos tecnicos hoje
- ML automatico ainda instavel
- Amazon automatico ainda desativado no search/sniper
- Edge Functions importantes existem em producao, mas nao estao neste repo

### Recomendacao para skills/agentes
- skill de `operacao-ofertas`
- skill de `landing-pages`
- skill de `awin`
- skill de `scraping-ml`
- skill de `distribuicao-canais`
- skill de `blog-seo`
- skill de `diagnostico-supabase`

