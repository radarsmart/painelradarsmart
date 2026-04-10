# Home Data Architecture

## Objetivo

Transformar a home da Radar Smart em uma página comercial forte sem acoplar o frontend às tabelas do Supabase.

A regra passa a ser:

- backend monta um payload único da home
- frontend só renderiza seções com dados já normalizados
- novas seções são adicionadas no contrato, não com query espalhada no client

## Ponto único de dados

- Loader server-side: [get-home-page-data.ts](c:\Users\User\Desktop\Radar Smart - Vercel\radar-smart\lib\home\get-home-page-data.ts)
- Tipos: [home-types.ts](c:\Users\User\Desktop\Radar Smart - Vercel\radar-smart\lib\home\home-types.ts)
- Mapeadores: [home-mappers.ts](c:\Users\User\Desktop\Radar Smart - Vercel\radar-smart\lib\home\home-mappers.ts)
- API pública: [route.ts](c:\Users\User\Desktop\Radar Smart - Vercel\radar-smart\app\api\home\page-data\route.ts)

## Fontes atuais no Supabase

- `categories`
- `radar_smart_rank`
- `radar_smart_boost`
- `blog_posts`

## Contrato atual da home

```ts
type HomePageData = {
  categorySlug: string | null;
  categories: HomeCategory[];
  approvedOffers: OfertaCard[];
  hero: {
    totalOffers: number;
    nextRefreshAt: string;
  };
  stats: {
    totalOffers: number;
    totalCategories: number;
    totalHighlights: number;
    totalBlogPosts: number;
  };
  highlights: HomeHighlight[];
  recentPosts: HomeBlogPost[];
  sections: {
    hero: HomeHeroSection;
    proofBar: HomeProofItem[];
    flashShelf: HomeOfferShelf;
    bestShelf: HomeOfferShelf;
    comparator: HomeComparatorSpotlight;
    content: HomeContentSection;
    communityCta: HomeCommunityCta;
  };
};
```

## Seções da home premium

### 1. Hero

Origem:
- `sections.hero`

Uso:
- headline
- subtitle
- CTAs principais
- card da oferta em destaque

### 2. Proof Bar

Origem:
- `sections.proofBar`

Uso:
- métricas rápidas
- prova de volume, categorias, desconto médio e conteúdo

### 3. Oferta relâmpago

Origem:
- `sections.flashShelf`

Uso:
- bloco editorial mais urgente
- ofertas curtas e visuais

### 4. Melhores do dia

Origem:
- `sections.bestShelf`

Uso:
- base principal de conversão afiliada

### 5. Comparativos

Origem:
- `sections.comparator`

Uso:
- cards de decisão
- CTA para `/comparativo`

### 6. Conteúdo / SEO

Origem:
- `sections.content`

Uso:
- guias
- reviews
- posts recentes

### 7. CTA de grupo

Origem:
- `sections.communityCta`

Uso:
- WhatsApp
- Telegram
- recorrência do funil

## Regra de frontend

O frontend não deve:

- consultar Supabase diretamente em cada bloco
- conhecer nome de tabela
- reproduzir regra editorial no client

O frontend deve:

- consumir `HomePageData`
- renderizar cada seção a partir de props
- pedir expansão do payload quando faltar dado

## Regra de evolução

Se o frontend quiser uma nova seção, a ordem correta é:

1. definir a seção em `home-types.ts`
2. montar os dados em `get-home-page-data.ts`
3. expor pela rota `/api/home/page-data`
4. só depois criar o bloco visual

## Próximas expansões recomendadas

1. slots editoriais reais por `offers.slot_type`
2. score editorial na home
3. carrossel de destaques vindo de `radar_smart_boost`
4. blocos por categoria
5. seção de comparativo com slug e CTA direto
6. prova social e contadores de clique
