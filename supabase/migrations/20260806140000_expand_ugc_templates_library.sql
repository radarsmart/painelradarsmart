-- "Modulo 2 — Biblioteca de roteiros": expande de 5 pra 10 templates de
-- video. Os outros 3 pedidos pelo dono ja existiam com outro slug (Review =
-- review-curto, Pessoa Utilizando = demonstracao-curta, Comparativo =
-- comparacao-preco) — aqui entram os 7 que faltavam. Mesmo padrao exato de
-- 20260411170000_create_ugc_templates_and_angles.sql (upsert por slug).

insert into public.ugc_templates (
  slug,
  name,
  objective,
  description,
  hook_framework,
  structure_steps,
  recommended_duration,
  cta_style,
  editing_notes,
  sort_order
) values
  (
    'oferta-relampago',
    'Oferta relampago',
    'conversion',
    'Criativo de urgencia extrema para ofertas com janela curta de tempo.',
    'Urgencia imediata + preco + prova rapida + CTA urgente',
    array['Hook de urgencia', 'Preco e desconto', 'Prova visual rapida', 'CTA urgente'],
    '8 a 12 segundos',
    'urgencia extrema',
    '{"captions":"grandes", "cut_pace":"muito alto", "visual_proof":"contador ou selo de tempo limitado"}'::jsonb,
    60
  ),
  (
    'antes-depois',
    'Antes e depois',
    'conversion',
    'Contraste entre o problema sem o produto e o resultado com ele.',
    'Problema visivel + transformacao + beneficio + CTA',
    array['Antes: problema real', 'Depois: resultado com o produto', 'Reforco do beneficio', 'CTA final'],
    '12 a 18 segundos',
    'transformacao',
    '{"captions":"medias", "cut_pace":"medio", "visual_proof":"corte antes/depois"}'::jsonb,
    70
  ),
  (
    'problema-solucao',
    'Problema e solucao',
    'conversion',
    'Estrutura classica de dor identificada seguida da solucao com o produto.',
    'Problema comum + solucao + prova + CTA',
    array['Problema comum', 'Solucao com o produto', 'Prova de resultado', 'CTA direto'],
    '12 a 18 segundos',
    'consultivo',
    '{"captions":"medias", "cut_pace":"medio", "visual_proof":"produto resolvendo o problema"}'::jsonb,
    80
  ),
  (
    'top-5',
    'Top 5',
    'engagement',
    'Formato ranking rapido, bom para reter atencao e levar ao produto principal no fechamento.',
    'Ranking + curiosidade + melhor item + CTA',
    array['Hook do ranking', 'Item 1 e 2 rapido', 'Item 3 e 4 rapido', 'Melhor item e CTA'],
    '15 a 22 segundos',
    'ranking',
    '{"captions":"grandes", "cut_pace":"alto", "visual_proof":"lista numerada na tela"}'::jsonb,
    90
  ),
  (
    'vale-a-pena',
    'Vale a pena?',
    'conversion',
    'Formato review com pergunta inicial e veredito, gera confianca antes do CTA.',
    'Pergunta + analise + veredito + CTA de decisao',
    array['Pergunta inicial: vale a pena?', 'Analise rapida do produto', 'Veredito e beneficio', 'CTA de decisao'],
    '15 a 20 segundos',
    'veredito',
    '{"captions":"medias", "cut_pace":"medio", "visual_proof":"produto em uso + nota ou veredito"}'::jsonb,
    100
  ),
  (
    'unboxing',
    'Unboxing',
    'engagement',
    'Abertura de caixa/primeira impressao, formato nativo de creator que gera curiosidade.',
    'Abertura + primeira impressao + detalhe + CTA',
    array['Abertura da caixa', 'Primeira impressao', 'Detalhe do produto', 'Preco e CTA'],
    '15 a 22 segundos',
    'curiosidade nativa',
    '{"captions":"medias", "cut_pace":"medio-alto", "visual_proof":"unboxing em close"}'::jsonb,
    110
  ),
  (
    'tiktok-viral',
    'TikTok viral',
    'awareness',
    'Ritmo rapido estilo TikTok nativo, hook nos 2 primeiros segundos e corte agressivo.',
    'Hook imediato + demonstracao + prova social + CTA nativo',
    array['Hook nos 2 primeiros segundos', 'Demonstracao rapida', 'Prova social ou resultado', 'CTA estilo TikTok'],
    '10 a 15 segundos',
    'nativo TikTok',
    '{"captions":"grandes", "cut_pace":"muito alto", "visual_proof":"demonstracao rapida + numeros/resultado"}'::jsonb,
    120
  )
on conflict (slug) do update set
  name = excluded.name,
  objective = excluded.objective,
  description = excluded.description,
  hook_framework = excluded.hook_framework,
  structure_steps = excluded.structure_steps,
  recommended_duration = excluded.recommended_duration,
  cta_style = excluded.cta_style,
  editing_notes = excluded.editing_notes,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();
