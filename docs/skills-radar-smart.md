# Radar Smart — Documentação de Skills e Estado do Projeto

> Arquivo gerado para servir de base às skills do Antigravity e documentação
> operacional do projeto. Atualizar sempre que houver mudança relevante de
> stack, fluxo ou integrações.

---

## 1. Stack Atual

| Camada       | Tecnologia                   | Versão         |
| ------------ | ---------------------------- | -------------- |
| Framework    | Next.js App Router           | 14.2.35        |
| UI           | React + React DOM            | 18.3.1         |
| Estilo       | TailwindCSS + PostCSS + clsx | 3.4.17         |
| Animações    | framer-motion                | 12.23.24       |
| Ícones       | lucide-react                 | 0.544.0        |
| Gráficos     | recharts                     | 2.15.4         |
| Banco + Auth | @supabase/supabase-js        | 2.50.5         |
| Scraping     | cheerio + undici             | 1.2.0 / 6.21.2 |
| PDF          | pdfkit                       | 0.18.0         |
| Linguagem    | TypeScript                   | 5              |
| Linting      | ESLint                       | 8.57.1         |

**Cores da marca:** gold `#C9973A` — dark `#0A0F1E`

---

## 2. Estrutura de Pastas

```
/
├── app/
│   ├── (public)/           # Páginas públicas do site
│   ├── admin/(protected)/  # Painel admin por módulo
│   └── api/                # Todas as rotas de API
│       ├── admin/          # APIs do painel admin
│       │   ├── scraper/    # Extração e preview de ofertas
│       │   ├── extrator/   # Dispatch e persistência
│       │   ├── ml/         # Hub Mercado Livre
│       │   ├── amazon/     # Hub Amazon
│       │   ├── shopee/     # Hub Shopee
│       │   ├── lomadee/    # Hub Lomadee
│       │   ├── awin/       # Hub AWIN
│       │   ├── curadoria/  # Discover/sniper (em construção)
│       │   └── blog/       # Gestão do blog
│       ├── home/offers/    # Ofertas públicas para o site
│       ├── click/          # Rastreamento de cliques
│       └── grupo/          # Rastreamento de entradas no grupo
├── components/
│   ├── admin/              # Componentes do painel admin
│   ├── layout/             # Header, footer, nav
│   ├── landing/            # Componentes de landing pages
│   ├── vitrine/            # Storefront público
│   ├── comparativo/        # Comparador de preços
│   ├── blog/               # Blog público
│   └── awin/               # Componentes específicos AWIN
├── lib/
│   ├── supabase.ts         # Cliente Supabase
│   ├── scraping/           # Parsers e scrapers por marketplace
│   │   ├── mercadolivre-official.ts
│   │   └── amazon-rainforest.ts
│   ├── distribution/       # Lógica de distribuição
│   │   └── legacy-dispatch.ts
│   ├── offers/
│   │   └── site-visibility.ts  # Regras de visibilidade pública
│   ├── affiliates/         # Integrações de afiliados
│   └── landing/            # Lógica de landing pages
├── supabase/
│   └── migrations/         # Migrations versionadas do schema
├── scripts/                # Utilitários (seed, apostila, etc)
├── docs/                   # Documentação operacional e técnica
└── public/                 # Assets estáticos
```

---

## 3. Banco de Dados (Supabase)

### Tabelas principais

| Tabela                     | Função                                                     |
| -------------------------- | ---------------------------------------------------------- |
| `offers`                   | Ofertas com status, slot, TTL 48h, affiliate_url, raw_data |
| `price_history`            | Histórico de preços por oferta                             |
| `hub_offers`               | Ofertas por hub/marketplace                                |
| `ml_products_cache`        | Cache de produtos ML                                       |
| `inbox_cache`              | Cache de entrada de ofertas                                |
| `scrape_jobs`              | Fila de jobs de scraping                                   |
| `post_queue`               | Fila de distribuição WhatsApp/Telegram                     |
| `post_targets`             | Destinos de distribuição configurados                      |
| `clicks`                   | Rastreamento de cliques do site                            |
| `grupo_membros`            | Rastreamento de entradas no grupo VIP                      |
| `admins`                   | Usuários com acesso ao painel                              |
| `categories`               | Categorias de ofertas                                      |
| `blog_posts`               | Posts do blog                                              |
| `blog_post_offers`         | Relação blog ↔ ofertas                                     |
| `infoproducts`             | Infoprodutos afiliados                                     |
| `landing_pages`            | Landing pages geradas                                      |
| `landing_page_clicks`      | Cliques em landing pages                                   |
| `affiliate_programs`       | Programas de afiliados cadastrados                         |
| `awin_automation_config`   | Configuração de automação AWIN                             |
| `mercadolivre_auth`        | Tokens OAuth ML                                            |
| `radar_smart_boost`        | Boost de visibilidade de ofertas                           |
| `radar_smart_rank`         | Ranking de ofertas                                         |
| `v_revenue_by_marketplace` | View de receita por marketplace                            |

### Fluxo de dados das ofertas

```
URL / Hub / Manual
       ↓
app/api/admin/scraper/route.ts
(gera preview — nada salvo ainda)
       ↓
Admin aprova no painel
       ↓
app/api/admin/extrator/dispatch/route.ts → salvarOferta()
       ↓
tabela offers
(status, slot, TTL 48h, affiliate_url, raw_data)
       ↓
lib/offers/site-visibility.ts
(decide se oferta aparece publicamente)
       ↓
app/api/home/offers/route.ts
(home lê flash, best, comparator)
```

### RPCs ativas

- `increment_infoproduct_clicks` — contabiliza cliques em infoprodutos
- `get_last_scheduled_at` — usada na fila de distribuição

### Edge Functions (Supabase)

- `channel-whatsapp-control` — controle do canal WhatsApp
- `channel-telegram-control` — controle do canal Telegram
- `worker-process-offer` — processamento da fila de ofertas
- `elite-flush` — cron de distribuição automática elite

> ⚠️ Edge Functions existem em produção mas não estão versionadas no
> repositório.

---

## 4. APIs e Integrações

### Ativas hoje

| Integração                | Função                                 | Arquivo/Local                         |
| ------------------------- | -------------------------------------- | ------------------------------------- |
| Supabase DB/Auth          | Banco e autenticação                   | lib/supabase.ts                       |
| Mercado Livre OAuth + API | Produtos e itens ML                    | lib/scraping/mercadolivre-official.ts |
| Bright Data Unlocker      | Fallback HTML ML                       | Pipeline scraper ML                   |
| Zenscrape                 | Fallback legado ML                     | Pipeline scraper ML                   |
| Apify                     | Hub ML/Amazon fallback                 | Pipeline scraper                      |
| Rainforest API            | Preview Amazon                         | lib/scraping/amazon-rainforest.ts     |
| Shopee Affiliate GraphQL  | Shortlinks afiliados                   | lib/affiliates/                       |
| AWIN API + Feed           | Hub + automação + analytics            | components/awin/                      |
| Lomadee API               | Hub Lomadee                            | lib/                                  |
| Gemini                    | Geração de copy para landing pages     | lib/landing/                          |
| N8N Webhook               | Entrada de ofertas externas (opcional) | N8N_WEBHOOK_URL                       |

### Em construção ou desativadas

| Integração                      | Status                             |
| ------------------------------- | ---------------------------------- |
| Amazon search/sniper automático | Desativado — retorna `manual_only` |
| ML search automático            | Desativado — retorna `manual_only` |
| Curadoria discover/sniper       | Desativado                         |
| Pixels/eventos pagos em landing | Não implementado ainda             |

### Pipeline de scraping ML (ordem de fallback)

```
1. API oficial → lib/scraping/mercadolivre-official.ts
2. Bright Data Unlocker
3. HTML público direto
4. Zenscrape / Apify
5. Manual
```

### Pipeline Amazon

```
Preview → Rainforest API
Busca automática → DESATIVADA
Operação atual → Hub manual + builder
```

---

## 5. Painel Admin

### Módulos prontos

- Dashboard
- Curadoria
- Central de Oferta
- Ofertas Publicadas
- Painel de Envios
- Landing Pages
- Hubs: ML / Shopee / Lomadee / AWIN / Amazon
- Tendências
- Produtos & SEO
- Blog
- Infoprodutos
- Canais
- Configurações

### O que está funcionando

- Curadoria e aprovação de ofertas
- Extração manual e assistida por URL
- Publicação em site e canais
- Gestão de ofertas públicas
- Monitoramento de fila de envio
- Automação AWIN completa
- Landing pages com preview, tracking, UTM e Gemini
- Blog admin com geração e publicação
- Infoprodutos com analytics
- Canais WhatsApp e Telegram
- Price refresh público automático

### O que ainda falta

- Sniper e descoberta automática ML e Amazon
- Edge Functions versionadas no repositório
- Pixels e eventos pagos nas landing pages

---

## 6. Distribuição

### Visibilidade pública no site

Oferta aparece quando em `offers`:

- `status = active`
- `affiliate_url` preenchido
- slot válido
- curadoria aprovada ou override ativo

Lógica centralizada em `lib/offers/site-visibility.ts`

### WhatsApp e Telegram

```
lib/distribution/legacy-dispatch.ts
       ↓
worker-process-offer (Edge Function)
       ↓ (se bloqueio de aprovação)
post_queue (fila direta)
```

**Janela de envio:** 08h00 às 22h00 **Frequência:** slots a cada 20 minutos
**WhatsApp:** máximo 5 mensagens/hora para evitar ban

---

## 7. Afiliados e Rastreamento

### Plataformas integradas

| Plataforma    | Método                                      | Observação               |
| ------------- | ------------------------------------------- | ------------------------ |
| Mercado Livre | Link normalizado com `source` e `matt_tool` | OAuth ativo              |
| Amazon        | Affiliate tag no link sanitizado            | Sem PA API oficial       |
| AWIN          | `awin1.com/cread.php`                       | Analytics próprio no hub |
| Shopee        | Shortlink via GraphQL                       | API oficial ativa        |
| Lomadee       | Integrado via lib                           | Módulo ativo no admin    |

### Rastreamento

- Cliques do site → tabela `clicks` via `app/api/click/route.ts`
- Entrada no grupo → tabela `grupo_membros` via `app/api/grupo/route.ts`
- Revenue por marketplace → view `v_revenue_by_marketplace`

### UTM padrão

```
utm_source=radarsmart
utm_medium= site | whatsapp | telegram | instagram
utm_campaign=oferta
```

> Toda oferta publicada precisa ter `affiliate_url` preenchido. Sem
> `affiliate_url` a oferta não aparece no site.

---

## 8. Histórico de Mudanças Recentes

### Entrou recentemente

- Módulo completo de landing pages com Gemini
- AWIN hub + automação + analytics
- Painel de canais WhatsApp/Telegram
- Blog admin com geração e publicação de conteúdo
- Infoprodutos + Lomadee
- Refresh automático de preços públicos
- Bright Data no pipeline ML
- Melhorias no storefront e responsividade
- Cron jobs configurados em `vercel.json`

### Em andamento

- Estabilização da extração automática ML
- Refinamento de funnels e landing pages para tráfego pago
- Documentação operacional mais completa
- Versionamento das Edge Functions no repositório

---

## 9. Variáveis de Ambiente Necessárias

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Mercado Livre
ML_CLIENT_ID=
ML_CLIENT_SECRET=
ML_ACCESS_TOKEN=

# Amazon
AMAZON_AFFILIATE_TAG=
RAINFOREST_API_KEY=

# Shopee
SHOPEE_APP_ID=
SHOPEE_SECRET=

# AWIN
AWIN_PUBLISHER_ID=
AWIN_API_TOKEN=

# Lomadee
LOMADEE_SOURCE_ID=
LOMADEE_TOKEN=

# Scraping
BRIGHT_DATA_TOKEN=
ZENSCRAPE_API_KEY=
APIFY_TOKEN=

# IA
GEMINI_API_KEY=

# Distribuição
N8N_WEBHOOK_URL=
```

---

> Última atualização: Abril 2026 Gerado com base no relatório do Codex — manter
> sincronizado com o código.
