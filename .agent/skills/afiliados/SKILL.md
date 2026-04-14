> Leia AGENTS.md antes de usar esta skill.

---
name: afiliados
description: Usar ao gerar links de afiliado, integrar novas plataformas ou modificar rastreamento de cliques na Radar Smart.
---

## Plataformas integradas hoje

Mercado Livre: link normalizado com source e matt_tool Amazon: affiliate tag no
link sanitizado (sem PA API oficial) AWIN: tracking via awin1.com/cread.php —
lib em components/awin Shopee: shortlink afiliado gerado via GraphQL Lomadee:
integrado via lib — modulo ativo no admin

## Rastreamento de cliques

Cliques do site: tabela clicks via app/api/click/route.ts Entrada no grupo:
tabela grupo_membros via app/api/grupo/route.ts AWIN tem analytics proprio no
hub de automacao.

## Regras

Toda oferta publicada precisa ter affiliate_url preenchido em offers. Sem
affiliate_url a oferta nao fica visivel no site (ver site-visibility.ts). Nunca
publicar link direto do marketplace.

## UTM padrao

utm_source=radarsmart utm_medium= site | whatsapp | telegram | instagram
utm_campaign=oferta

## Estrutura de arquivos afiliados

lib/ contem integracao de cada plataforma separada. components/awin/ contem
componentes especificos AWIN.
