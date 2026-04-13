---
trigger: always_on
---

Stack: Next.js 14.2 App Router, React 18, TypeScript 5, TailwindCSS 3,
framer-motion, lucide-react, recharts, Supabase 2.50, Vercel. Cores da marca:
gold #C9973A, dark #0A0F1E. Sempre Tailwind.

Estrutura principal: /app (rotas publicas e APIs), /app/admin/(protected)
(painel admin por modulo), /components (admin, layout, vitrine, blog, awin,
landing, comparativo), /lib (supabase, scraping, distribution, offers,
affiliates, landing).

Banco Supabase: tabela central e offers com status, slot, TTL 48h, affiliate_url
e raw_data. Visibilidade publica controlada por lib/offers/site-visibility.ts.
Oferta so aparece no site se tiver status active, affiliate_url preenchido e
slot valido. Nunca salvar oferta direto no banco — sempre passar pelo preview em
app/api/admin/scraper/route.ts e depois dispatch em
app/api/admin/extrator/dispatch/route.ts.

Pipeline ML: API oficial primeiro, depois Bright Data, HTML publico,
Zenscrape/Apify, manual como ultimo recurso. Pipeline Amazon: Rainforest API
para preview. Busca automatica desativada. Shopee: API GraphQL oficial ativa.
Rate limiting obrigatorio: maximo 1 req/seg por dominio nos scrapers.

Painel admin protegido por Supabase Auth. Verificar tabela admins. Modulos
existentes: Dashboard, Curadoria, Central de Oferta, Ofertas Publicadas, Painel
de Envios, Landing Pages, Hubs ML/Shopee/Lomadee/AWIN/ Amazon, Tendencias,
Produtos e SEO, Blog, Infoprodutos, Canais, Configuracoes. Antes de criar
componente novo verificar se ja existe em components/admin.

Distribuicao via lib/distribution/legacy-dispatch.ts. Janela 08h-22h, slots a
cada 20min. Maximo 5 mensagens/hora no WhatsApp. Edge Functions ativas:
channel-whatsapp-control, channel-telegram-control, worker-process-offer,
elite-flush.

Afiliados integrados: ML, Amazon, AWIN, Shopee, Lomadee. Toda oferta precisa de
affiliate_url. Sem ele nao aparece no site. Cliques rastreados em tabela clicks
via app/api/click/route.ts. UTM padrao: utm_source=radarsmart,
utm_medium={canal}, utm_campaign=oferta.

Nunca commitar .env ou tokens. Nunca usar link direto do marketplace — sempre
affiliate_url rastreado.
