> Leia AGENTS.md antes de usar esta skill.

---
name: admin-panel
description: Usar ao construir ou modificar qualquer modulo do painel administrativo da Radar Smart em app/admin.
---

## Protecao de rotas

Todas as rotas em app/admin/(protected) exigem sessao Supabase Auth. Verificar
tabela admins. Nunca expor rota sem checar sessao.

## Modulos existentes (nao recriar, apenas editar)

Dashboard, Curadoria, Central de Oferta, Ofertas Publicadas, Painel de Envios,
Landing Pages, Hubs (ML/Shopee/Lomadee/AWIN/Amazon), Tendencias, Produtos e SEO,
Blog, Infoprodutos, Canais, Configuracoes.

## Fluxo de curadoria

1. URL entra pela Central ou hub
2. Extracao gera preview via app/api/admin/scraper/route.ts
3. Admin aprova → app/api/admin/extrator/dispatch/route.ts → salvarOferta
4. offers recebe: status, curadoria, slot, TTL 48h, affiliate_url, raw_data, quality_score, is_priority
5. Visibilidade publica decidida por lib/offers/site-visibility.ts

## Pipeline de Extracao (Cascata Linear)

O scraper de Mercado Livre em `app/api/admin/scraper/route.ts` opera em cascata linear com timeouts curtos para maximizar sucesso e minimizar custo:
1. **API Oficial**: 5s de timeout (Prioridade total)
2. **HTML Publico**: 4s de timeout (Fallback rapido)
3. **Bright Data**: 10s de timeout (Fallback pago)
4. **Apify/Zenscrape**: Ultimo recurso
5. **Manual**: Se todos falharem

Ao depurar, verifique os logs `[ML Preview]` para ver qual metodo foi invocado.

## Stack de UI

Next.js 14 App Router, React 18, TailwindCSS 3, framer-motion, lucide-react,
recharts para graficos, clsx para classes.

## Cores da marca

gold #C9973A, dark #0A0F1E. Sempre Tailwind.

## Componentes reutilizaveis

Ficam em components/admin. Antes de criar novo, verificar se ja existe.
Exemplo: `QualityScoreBadge.tsx` para apresentar o score inteligente da oferta (Verde >=70, Amarelo 40-69, Vermelho <40).

## Intelligence de Curadoria e Quality Score

Foi implementado um sistema de Quality Score (0-100) calculado dinamicamente em `lib/offers/quality-score.ts` sendo integrado a `salvarOferta` em `lib/supabase.ts`.
A tabela `offers` conta com as colunas `quality_score` (integer) e `is_priority` (boolean). 
Ofertas com score >= 70 ganham prioridade automaticamente.
No painel (ex: `CuradoriaInbox.tsx`, `TabelaOfertas.tsx`), as listagens podem ser filtradas por `is_priority` e vem ordenadas com `quality_score DESC` como regra primária.

## Implementacoes recentes em CuradoriaInbox.tsx

### Validacao visual de link afiliado

Funcao classifyAffiliateUrl() ja existe — nao recriar. Detecta marketplace e
valida parametros:

- Amazon: exige ?tag=
- ML: exige ?matt_tool=
- Shopee: verifica shope.ee Estados visuais do input:
- Verde: link valido com parametro de rastreamento
- Ambar: URL valida mas sem parametro (avisa, nao bloqueia)
- Vermelho: nao e URL valida (bloqueia aprovacao)

### Persistencia de links

sessionStorage ja implementado via dois useEffect. Carrega ao montar, salva a
cada digitacao, limpa ao fechar aba. Nao adicionar localStorage — comportamento
intencional.

### Aprovacao em requisicao unica

route.ts ja retorna copy_text via buildAidaCopy() no payload publish. O segundo
fetch para prepare_group foi removido intencional mente. Aprovacao agora leva
350-500ms. Nao reintroduzir o fetch duplo.

## Protecao de comissionamento (Amazon e ML)

Funcao requiresManualAffiliateUrl() ja existe em curadoria/route.ts — nao
recriar. Identifica Amazon e Mercado Livre como marketplaces manuais.

Regras ativas:
- action "publish" sem affiliateOverride: bloqueado (400) para qualquer marketplace
- action "prepare_group" sem affiliateOverride + Amazon/ML: bloqueado (400)
- prepare_group sem affiliateOverride + outros marketplaces (Shopee, AWIN, Lomadee): permitido

Nunca remover esses bloqueios. Auto-gerar link Amazon/ML sem portal oficial
nao garante comissionamento.

## Seguranca e RLS (Banco de Dados)

O Supabase do projeto esta com RLS fortificado nas tabelas principais e operacionais:
- Vulnerabilidades de performance como `auth_rls_initplan` nas tabelas foram resolvidas encapsulando as condicoes com `(select auth.uid())` e `(select auth.role())`.
- Acesso a escrita em tabelas do site/admin (como `offers`, `products`, `blog_posts`, `site_banners`, `categories`) exige que o usuario logado exista na tabela protegida `admins`. Politicas de `write` verificam ativamente esse acesso (`EXISTS (SELECT 1 FROM admins...)`).
- A tabela `price_history` e bloqueada para `escrita direta` na API, mantendo apenas visibilidade publica. Insercoes so devem acontecer pelo service layer ou postgres root.
- A tabela `user_wishlist` e restrita. Cada usuario so gerencia (`SELECT`, `INSERT`, `UPDATE`) a propria wishlist baseado no `(select auth.uid()) = user_id`. Nao modifique isso.
Ao desenvolver tabelas novas, nao recrie vulnerabilidades `USING (true)`. Mantenha a blindagem garantida nesse fluxo.
