# Radar Smart Mercado Livre Actor

## Objetivo

Criar um Actor privado no Apify para substituir o Actor de terceiros usado hoje no `Mercado Livre Hub`.

## Motivação

- controlar custo
- controlar o schema de saída
- controlar versionamento
- reduzir dependência do mantenedor externo
- adaptar melhor a curadoria do Radar Smart

## Input desejado

```json
{
  "searchQuery": "iphone",
  "categoryLabel": "Celulares",
  "maxResults": 100,
  "includeReviews": true
}
```

## Output desejado

```json
[
  {
    "id": "MLB123456789",
    "title": "iPhone 15 128GB",
    "price": 4299,
    "original_price": 4799,
    "discount_pct": 10,
    "condition": "Novo",
    "rating": 4.9,
    "reviews_count": 1200,
    "thumbnail": "https://...",
    "url": "https://www.mercadolivre.com.br/..."
  }
]
```

## Regras do Actor

1. Buscar por `searchQuery` no Mercado Livre Brasil
2. Coletar até `maxResults`
3. Normalizar preço, desconto, avaliação e URL
4. Remover duplicados por item id ou permalink
5. Retornar JSON limpo, sem HTML cru

## Stack sugerida

- `Crawlee`
- `PlaywrightCrawler`
- parsing por seletor
- fallback por leitura de JSON embutido da página quando existir

## Fluxo sugerido

1. montar URL de busca no Mercado Livre
2. abrir página com Playwright
3. esperar lista de produtos
4. extrair cards
5. normalizar campos
6. salvar em dataset

## Campos críticos para o hub

- `title`
- `price`
- `original_price`
- `discount_pct`
- `thumbnail`
- `url`
- `condition`
- `rating`
- `reviews_count`

## Estratégia de rollout

1. manter Actor atual de terceiros em produção
2. criar Actor privado Radar Smart
3. comparar resultado dos dois
4. trocar `APIFY_ML_TASK_ID` quando o privado estiver estável
