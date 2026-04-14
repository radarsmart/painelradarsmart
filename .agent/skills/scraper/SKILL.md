> Leia AGENTS.md antes de usar esta skill.

---
name: scraper
description: Usar ao coletar ou extrair ofertas do Mercado Livre ou Amazon. Cobre pipeline de scraping, fallbacks e formato de output padrao.
---

## Pipeline ML (ordem obrigatoria)

1. API oficial via lib/scraping/mercadolivre-official.ts
2. Bright Data Unlocker (fallback HTML)
3. HTML publico direto
4. Zenscrape ou Apify como ultimo fallback
5. Manual se todos falharem

## Pipeline Amazon

Preview usa Rainforest API via lib/scraping/amazon-rainforest.ts. Busca
automatica esta desativada. Operacao atual e hub + builder manual.

## Arquivo central de scraping

app/api/admin/scraper/route.ts

## Output padrao obrigatorio

title, price, original_price, discount_pct, url, image_url, marketplace
(mercadolivre | amazon | shopee), scraped_at (ISO), affiliate_url, raw_data

## Regras

Nunca salvar direto no banco. Resultado vai para preview em
app/api/admin/scraper/route.ts antes de qualquer persistencia. Persistencia
passa por app/api/admin/extrator/dispatch/route.ts e salvarOferta. Oferta entra
em offers com status pending, slot e TTL de 48h. Logar erros e fallbacks usados.
