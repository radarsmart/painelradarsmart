# Garimpar — extensão de captação (Radar Smart)

Extensão de navegador (Manifest V3) que captura ofertas de Shopee, Amazon, Mercado Livre e
AliExpress enquanto você navega manualmente, e manda pra fila de curadoria do painel
(`/admin/garimpar`), de onde o sistema de distribuição já existente do Radar Smart pega
pra postar. Não substitui nem duplica nada da distribuição atual.

## Como instalar (modo desenvolvedor)

1. Abra `chrome://extensions` no Chrome (ou `edge://extensions` no Edge).
2. Ative "Modo do desenvolvedor" no canto superior direito.
3. Clique em "Carregar sem compactação" e selecione esta pasta (`extension/garimpar`).
4. Clique no ícone da extensão na barra de ferramentas.

## Configurar

No popup da extensão:
- **URL do painel**: use `https://radarsmart.com.br` em produção. Use
  `http://localhost:3000` apenas em desenvolvimento, com o painel local rodando.
- **Token**: o valor de `GARIMPAR_API_TOKEN` do `.env.local`.
- **Etiqueta de afiliado do Mercado Livre**: a etiqueta ("tag") da sua conta de afiliado
  do ML (a mesma que aparece em "Etiqueta em uso" no painel de afiliados deles). Se
  deixar em branco, usa `radarsmart` como padrão.

Clique em "Salvar configuração".

## Como usar

1. Navegue até uma página de produto ou uma lista/busca em Shopee, Amazon, Mercado
   Livre ou AliExpress.
2. Clique no ícone da extensão.
3. **Capturar este produto**: captura só a página atual.
   **Capturar esta lista**: rola a página automaticamente pra carregar mais itens e
   captura todos os produtos visíveis.
4. Itens capturados aparecem na lista do popup. Pode repetir em outras páginas — os
   itens vão se acumulando (sem duplicar por URL).
5. Clique em "Enviar para o Radar Smart".

## Mercado Livre: geração de link automática

O ML não tem API pública documentada pra gerar link de afiliado, mas a extensão
replica a mesma chamada que a ferramenta oficial de afiliados do ML usa
(`createLink`), direto no navegador, usando sua própria sessão logada — sem depender
de nenhum servidor externo. Isso foi confirmado inspecionando ao vivo a ferramenta
oficial do ML (`/afiliados/linkbuilder`), não veio de código de terceiro.

Pra isso funcionar, você precisa estar **logado no Mercado Livre com uma conta de
afiliado** no mesmo navegador enquanto usa a extensão. Se a geração falhar por
qualquer motivo (sessão não afiliada, token de segurança ausente na página, erro de
rede), o item fica pendente no popup com um campo pra você colar o link manualmente
(gerado pelo botão nativo "Compartilhar e ganhar" do próprio ML) — nunca é
descartado, e nunca trava a captura dos outros itens.

## AliExpress: geração de link automática

Igual Amazon, o link da AliExpress é reescrita determinística de URL — não depende de
sessão nem chamada externa. Usa o mesmo mecanismo que a extensão oficial da AWIN
(MyAwin) usa: um deep link `cread.php?awinmid=...&awinaffid=...&ued=...`, construído
com a API oficial da AWIN que o projeto já integra (`lib/awin/client.ts`), sem
nenhuma engenharia reversa. **Este script de captura ainda não foi testado contra a
página real do AliExpress** — os seletores são a melhor estimativa (JSON-LD como
fonte principal); é bem provável precisar de ajuste ao vivo, igual aconteceu com o
Mercado Livre.

## Escopo

- Shopee, Amazon, Mercado Livre e AliExpress. Magalu fica de fora por enquanto (sem
  programa de afiliado configurado no projeto ainda).
- Regra dura: item de ML sem link de afiliado (automático ou colado manualmente)
  nunca entra na fila de curadoria — sem link não tem como monetizar o clique.
