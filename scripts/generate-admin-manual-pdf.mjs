import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const outputPath = path.resolve("docs", "apostila-radar-smart-painel-admin.pdf");

const doc = new PDFDocument({
  size: "A4",
  margin: 48,
  bufferPages: true,
  info: {
    Title: "Apostila Radar Smart - Painel Administrativo",
    Author: "OpenAI Codex",
    Subject: "Manual operacional do painel administrativo da Radar Smart",
    Keywords: "Radar Smart, admin, painel, manual, operacao, afiliados",
  },
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
doc.pipe(fs.createWriteStream(outputPath));

const colors = {
  ink: "#151515",
  muted: "#5F6772",
  gold: "#FFC300",
  goldDark: "#9E6A18",
  navy: "#1A1A1A",
  line: "#D9DDE4",
  soft: "#F5F1ED",
  blue: "#0F62FE",
  green: "#0F9D58",
  red: "#B42318",
};

function pageWidth() {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(height = 80) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function textBlock(text, options = {}) {
  const {
    size = 11,
    color = colors.ink,
    gap = 10,
    font = "Helvetica",
    indent = 0,
    continued = false,
  } = options;

  doc.font(font).fontSize(size).fillColor(color).text(text, doc.page.margins.left + indent, doc.y, {
    width: pageWidth() - indent,
    align: "left",
    continued,
  });
  if (!continued) doc.moveDown(gap / 14);
}

function heading(text, level = 2) {
  ensureSpace(level === 2 ? 50 : 34);
  const config =
    level === 1
      ? { size: 28, gap: 10 }
      : level === 2
        ? { size: 20, gap: 8 }
        : { size: 15, gap: 6 };

  doc.font("Helvetica-Bold").fontSize(config.size).fillColor(colors.navy).text(text, {
    width: pageWidth(),
  });
  doc.moveDown(config.gap / 12);
}

function subLabel(text) {
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(colors.muted)
    .text(text.toUpperCase(), { characterSpacing: 1.2 });
  doc.moveDown(0.3);
}

function bulletList(items) {
  items.forEach((item) => {
    ensureSpace(26);
    doc.circle(doc.page.margins.left + 3, doc.y + 6, 1.8).fill(colors.goldDark);
    doc
      .fillColor(colors.ink)
      .font("Helvetica")
      .fontSize(11)
      .text(item, doc.page.margins.left + 12, doc.y - 1, {
        width: pageWidth() - 12,
      });
    doc.moveDown(0.55);
  });
  doc.moveDown(0.2);
}

function numberedList(items) {
  items.forEach((item, index) => {
    ensureSpace(28);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(colors.navy)
      .text(`${index + 1}.`, doc.page.margins.left, doc.y, { width: 18 });
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor(colors.ink)
      .text(item, doc.page.margins.left + 20, doc.y - 13, {
        width: pageWidth() - 20,
      });
    doc.moveDown(0.55);
  });
  doc.moveDown(0.2);
}

function noteBox(title, text, tone = "info") {
  ensureSpace(74);
  const palettes = {
    info: { fill: "#EEF5FF", stroke: "#B3CDFD", title: colors.blue },
    warn: { fill: "#FFF1F1", stroke: "#FFB4B4", title: colors.red },
    ok: { fill: "#ECFFF3", stroke: "#8DD9A6", title: colors.green },
    note: { fill: "#FFF7DF", stroke: "#F8D477", title: colors.goldDark },
  };
  const palette = palettes[tone] || palettes.info;

  const x = doc.page.margins.left;
  const y = doc.y;
  const width = pageWidth();
  const height = 58;

  doc.roundedRect(x, y, width, height, 10).fillAndStroke(palette.fill, palette.stroke);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(palette.title)
    .text(title, x + 14, y + 12, { width: width - 28 });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(colors.ink)
    .text(text, x + 14, y + 28, { width: width - 28 });
  doc.y = y + height + 12;
}

function moduleHeader(title, route, group) {
  ensureSpace(44);
  heading(title, 2);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(colors.muted)
    .text(route, { continued: true });
  doc
    .font("Helvetica-Bold")
    .fillColor(colors.goldDark)
    .text(`   ${group}`);
  doc.moveDown(0.6);
}

function drawCover() {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.navy);
  doc.save();
  doc.fillColor(colors.gold).roundedRect(48, 56, 54, 54, 12).fill();
  doc
    .font("Helvetica-Bold")
    .fontSize(30)
    .fillColor("#000000")
    .text("R", 64, 67);
  doc.restore();

  doc
    .font("Helvetica-Bold")
    .fontSize(26)
    .fillColor("#FFFFFF")
    .text("RADAR ", 118, 70, { continued: true })
    .fillColor(colors.gold)
    .text("SMART");

  doc.moveDown(4.2);
  doc
    .font("Helvetica-Bold")
    .fontSize(30)
    .fillColor("#FFFFFF")
    .text("Apostila do Painel Administrativo", 48, 170, {
      width: 480,
    });
  doc
    .font("Helvetica")
    .fontSize(15)
    .fillColor("#E5E7EB")
    .text(
      "Manual operacional completo do projeto Radar Smart, com passo a passo detalhado de cada modulo do painel administrativo, fluxos de curadoria, publicacao, distribuicao e automacao.",
      48,
      228,
      { width: 500, lineGap: 4 },
    );

  const cardsY = 360;
  const cardWidth = 150;
  const gap = 12;
  [
    ["Projeto", "Radar Smart"],
    ["Escopo", "Painel admin e operacao diaria"],
    ["Data", "09/04/2026"],
  ].forEach(([label, value], index) => {
    const x = 48 + index * (cardWidth + gap);
    doc.roundedRect(x, cardsY, cardWidth, 86, 12).fillAndStroke("#202938", "#394254");
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#C6D0DD")
      .text(label.toUpperCase(), x + 14, cardsY + 14, { characterSpacing: 1.2 });
    doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor("#FFFFFF")
      .text(value, x + 14, cardsY + 36, { width: cardWidth - 28 });
  });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#C6D0DD")
    .text(
      "Documento tecnico-operacional criado para treinar o uso do painel, padronizar a operacao e reduzir erros no fluxo de ofertas, hubs, canais e landing pages.",
      48,
      720,
      { width: 500 },
    );

  doc.addPage();
}

function drawTable(headers, rows, widths) {
  ensureSpace(90);
  const x = doc.page.margins.left;
  let y = doc.y;
  const totalWidth = widths.reduce((sum, item) => sum + item, 0);

  doc.fillColor("#F8FAFC").rect(x, y, totalWidth, 24).fill();
  doc.strokeColor(colors.line).rect(x, y, totalWidth, 24).stroke();

  let colX = x;
  headers.forEach((header, index) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(colors.navy)
      .text(header, colX + 6, y + 7, { width: widths[index] - 12 });
    colX += widths[index];
  });

  y += 24;
  rows.forEach((row) => {
    let rowHeight = 0;
    row.forEach((cell, index) => {
      const h = doc.heightOfString(String(cell), {
        width: widths[index] - 12,
        align: "left",
      });
      rowHeight = Math.max(rowHeight, h + 12);
    });

    ensureSpace(rowHeight + 10);
    colX = x;
    doc.strokeColor(colors.line).rect(x, y, totalWidth, rowHeight).stroke();
    row.forEach((cell, index) => {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(colors.ink)
        .text(String(cell), colX + 6, y + 6, { width: widths[index] - 12 });
      colX += widths[index];
    });
    y += rowHeight;
    doc.y = y;
  });
  doc.moveDown(0.5);
}

const tocItems = [
  "Visao geral do painel administrativo",
  "Fluxo operacional do Radar Smart",
  "Dashboard",
  "Curadoria Geral",
  "Central de Oferta",
  "Ofertas Publicadas",
  "Painel de Envios",
  "Landing Pages",
  "Mercado Livre Hub",
  "Shopee Hub",
  "Lomadee",
  "AWIN",
  "AWIN Analytics",
  "Hub AWIN",
  "Automacao AWIN",
  "Amazon Hub",
  "Tendencias (IA)",
  "Produtos & SEO",
  "Blog & Reviews",
  "Infoprodutos",
  "Canais",
  "Configuracoes",
  "Rotina diaria recomendada",
  "Erros comuns e como agir",
  "Checklist antes de divulgar o site",
];

const sections = [
  {
    title: "3. Dashboard",
    route: "/admin",
    group: "Operacao",
    intro:
      "O Dashboard e o centro de monitoramento do projeto. Ele serve para visualizar o estado geral da operacao, gargalos de publicacao, cards de KPI e atalhos para monitoramento do dia.",
    bullets: [
      "Use no inicio do dia para checar saude operacional.",
      "Compare volume de ofertas publicadas com o esperado para o dia.",
      "Observe filas, falhas de distribuicao e cards de momentum.",
      "Use os atalhos de refresh quando desconfiar de dado stale.",
    ],
    steps: [
      "Abra o Dashboard no inicio do expediente.",
      "Leia os cards principais e compare com o volume esperado.",
      "Revise a tabela de ofertas publicadas e identifique itens com preco ou data desatualizada.",
      "Se houver gargalo, siga para Curadoria, Ofertas Publicadas ou Painel de Envios.",
    ],
  },
  {
    title: "4. Curadoria Geral",
    route: "/admin/curadoria",
    group: "Operacao",
    intro:
      "A Curadoria Geral e o ponto de revisao editorial. Ela recebe ofertas que ainda precisam de avaliacao antes de aparecer no site ou seguirem algum fluxo interno de aprovacao.",
    bullets: [
      "Filtre por marketplace para revisar origem especifica.",
      "Valide titulo, preco, link afiliado, imagem, copy e destino sugerido.",
      "Aprove somente quando a oferta estiver coerente comercialmente.",
      "Use para revisar itens vindos de automacao AWIN.",
    ],
    steps: [
      "Abra a fila da curadoria.",
      "Selecione o marketplace ou tipo de oferta desejado.",
      "Revise a oferta e escolha o bloco correto se for liberar para o site.",
      "Se a oferta estiver incompleta, devolva para revisao ou descarte.",
    ],
    note: [
      "Importante",
      "A automacao AWIN hoje manda para curadoria antes da publicacao final. Isso evita publicacao automatica sem seu criterio editorial.",
      "note",
    ],
  },
  {
    title: "5. Central de Oferta",
    route: "/admin/ofertas/nova",
    group: "Operacao",
    intro:
      "Este e o modulo mais importante do painel. Nele voce extrai uma oferta por URL, gera preview, ajusta copy, escolhe o destino e publica para site, Telegram e WhatsApp.",
    bullets: [
      "Marketplaces suportados: Mercado Livre, Amazon e AWIN.",
      "O link afiliado e obrigatorio para o site.",
      "Existe fluxo manual para os tres marketplaces.",
      "A mesma oferta pode ser enviada para Site, Telegram e WhatsApp na mesma acao.",
    ],
    steps: [
      "Escolha o marketplace correto.",
      "Preencha a URL do produto.",
      "Preencha o link de afiliado obrigatorio.",
      "Clique em Extrair URL ou Buscar na API AWIN.",
      "Revise o preview gerado.",
      "Ajuste a copy, se necessario.",
      "Escolha o bloco do site: flash, best ou comparator.",
      "Marque os destinos desejados e clique em Publicar selecionados.",
    ],
    extraTitle: "Fluxos especiais por marketplace",
    extraBullets: [
      "Mercado Livre: quando a URL vier no formato /p/MLB..., use tambem o link afiliado meli.la. Se falhar, use preview manual.",
      "Amazon: tente extracao automatica e complete no manual se faltar titulo, preco ou imagem.",
      "AWIN: voce pode colar URL do produto ou deep link awin1.com. Se o feed nao preencher tudo, gere o link afiliado e finalize no manual.",
    ],
    note: [
      "Erro comum",
      "Publicar no site sem affiliate_url. O card nao aparece na vitrine publica quando o link afiliado esta vazio.",
      "warn",
    ],
  },
  {
    title: "6. Ofertas Publicadas",
    route: "/admin/ofertas",
    group: "Operacao",
    intro:
      "Esta tela mostra as ofertas que efetivamente podem ser exibidas no site. Ela e usada para revisar o que ja esta na vitrine, atualizar preco e retirar o que nao deve mais ficar publico.",
    bullets: [
      "Confirme se a oferta entrou no site.",
      "Revise bloco, preco atual, preco antigo e data de atualizacao.",
      "Use o refresh de precos publicados quando necessario.",
      "Edite ou exclua ofertas com critério.",
    ],
    steps: [
      "Acesse a lista depois de publicar qualquer oferta importante.",
      "Procure pelo produto e confira a coluna do bloco de destino.",
      "Se o preco do marketplace mudou, use o refresh.",
      "Se uma oferta nao deve mais aparecer, desative ou exclua.",
    ],
  },
  {
    title: "7. Painel de Envios",
    route: "/admin/envios",
    group: "Operacao",
    intro:
      "O Painel de Envios e o NOC da distribuicao. Ele mostra a fila real de jobs para Telegram e WhatsApp, incluindo status, horario de agendamento, falhas e ultimo movimento do robo.",
    bullets: [
      "Na Fila: jobs pendentes ou processando.",
      "Postados Hoje: envios concluidos no dia.",
      "Processados Hoje: jobs que passaram por execucao hoje.",
      "Erros Criticos: falhas que nao estao na fila ativa.",
    ],
    steps: [
      "Abra a tela sempre que mandar oferta para canais.",
      "Confirme que os jobs mais novos apareceram no topo.",
      "Observe o status de cada job.",
      "Se houver falha, revise o erro antes de limpar ou apagar o item.",
    ],
  },
  {
    title: "8. Landing Pages",
    route: "/admin/landing-pages",
    group: "Operacao",
    intro:
      "Este modulo cria paginas de conversao focadas em campanhas pagas, produtos campeoes e captacao para grupo e site. O publico final acessa as pages em /lp/[slug].",
    bullets: [
      "CRUD completo de landing page.",
      "Duplicacao rapida de pagina.",
      "Vinculo opcional com oferta existente.",
      "Tracking por CTA, analytics e exportacao CSV.",
      "UTMs padrao configuraveis por landing.",
    ],
    steps: [
      "Escolha uma oferta vinculada, se quiser reaproveitar dados.",
      "Preencha titulo, headline, subheadline, hero e CTA.",
      "Configure beneficios, detalhes tecnicos e prova social.",
      "Defina UTM source, medium, campaign e content.",
      "Salve em rascunho, revise e depois publique.",
    ],
    note: [
      "Uso recomendado",
      "Anuncios pagos nao devem apontar para a home. Devem apontar para uma landing dedicada, rastreada e com CTA claro.",
      "ok",
    ],
  },
  {
    title: "9. Mercado Livre Hub",
    route: "/admin/mercadolivre",
    group: "Marketplace Hubs",
    intro:
      "O Mercado Livre Hub serve para minerar produtos do ML, aplicar filtros de desconto e classificacao, cadastrar link afiliado e despachar a oferta para site, Telegram ou WhatsApp.",
    bullets: [
      "Filtros de busca, categoria, desconto e classificacao.",
      "Persistencia de link afiliado manual por produto.",
      "Modal de escolha de bloco para o site.",
      "Origem dos dados pode ser sincronizacao, fallback local ou catalogo salvo.",
    ],
    steps: [
      "Sincronize o catalogo quando quiser puxar ofertas novas.",
      "Aplique filtros comerciais.",
      "Cadastre o link afiliado manual quando necessario.",
      "Clique em Telegram, WhatsApp ou Aprovar no Radar (Site).",
    ],
    note: [
      "Atencao",
      "Se um link nao extrair automaticamente na Central de Oferta, use o fluxo manual. O hub continua sendo o melhor ponto de mineracao inicial.",
      "warn",
    ],
  },
  {
    title: "10. Shopee Hub",
    route: "/admin/shopee",
    group: "Marketplace Hubs",
    intro:
      "O Shopee Hub organiza produtos por potencial de comissao e destaque. O filtro mais importante aqui e o de comissao.",
    bullets: [
      "Busca por nome.",
      "Comissao minima.",
      "Classificacao por destaque comercial.",
      "Despacho para site ou canais.",
    ],
    steps: [
      "Sincronize os produtos da Shopee.",
      "Filtre por comissao minima aceitavel.",
      "Revise o titulo, valor e taxa de comissao.",
      "Cadastre o link afiliado se necessario e despache.",
    ],
  },
  {
    title: "11. Lomadee",
    route: "/admin/lomadee",
    group: "Marketplace Hubs",
    intro:
      "O modulo da Lomadee pesquisa produtos e permite gerar link afiliado encurtado antes de mandar para os destinos.",
    bullets: [
      "Pesquisa de produtos.",
      "Geracao de link afiliado encurtado.",
      "Despacho para Telegram, WhatsApp ou Site.",
    ],
    steps: [
      "Pesquise o produto na base da Lomadee.",
      "Gere ou revise o link afiliado.",
      "Escolha o destino final.",
      "Se for Site, selecione o bloco correto.",
    ],
  },
  {
    title: "12. AWIN",
    route: "/admin/awin",
    group: "Marketplace Hubs",
    intro:
      "Esta e a tela operacional antiga da AWIN. Ela funciona como central de status, gerador de deep link e acesso a feeds e programas.",
    bullets: [
      "Status de token, publisher, MasterTag e feed.",
      "Lista de programas aprovados.",
      "Busca de produtos por feed.",
      "Gerador manual de link AWIN.",
      "Ofertas ativas e lista de feeds.",
    ],
    steps: [
      "Use esta tela para conferencias operacionais da AWIN.",
      "Valide se o token e o publisher estao configurados.",
      "Use o gerador manual para criar deep links quando necessario.",
      "Nao confunda esta tela com o novo Hub AWIN.",
    ],
  },
  {
    title: "13. AWIN Analytics",
    route: "/admin/awin/analytics",
    group: "Marketplace Hubs",
    intro:
      "Este painel consolida cliques e oferta AWIN dentro do Radar Smart. Ele nao substitui o painel oficial da AWIN, mas ajuda a medir o que o proprio site e os fluxos internos estao gerando.",
    bullets: [
      "Ofertas AWIN cadastradas.",
      "Cliques totais e recentes.",
      "Origem dos cliques.",
      "Ofertas mais clicadas.",
    ],
  },
  {
    title: "14. Hub AWIN",
    route: "/admin/hub-awin",
    group: "Marketplace Hubs",
    intro:
      "Este e o novo fluxo da AWIN. Primeiro voce escolhe o anunciante aprovado, depois abre o feed daquele anunciante e trabalha em cima do grid de produtos.",
    bullets: [
      "Escolha de anunciante aprovado.",
      "Grid de produtos com busca, categoria e ordenacao.",
      "Adicao de produto como oferta.",
      "Deep links no padrao awin1.com/cread.php.",
    ],
    steps: [
      "Abra o Hub AWIN.",
      "Escolha o anunciante aprovado.",
      "Clique em Ver Produtos.",
      "Use busca, filtro de categoria e ordenacao.",
      "Clique em Adicionar a Oferta.",
    ],
  },
  {
    title: "15. Automacao AWIN",
    route: "/admin/hub-awin/automation",
    group: "Marketplace Hubs",
    intro:
      "O modulo de automacao AWIN permite configurar criterios para buscar produtos automaticamente. Ele foi desenhado com modo seguro e com passagem pela Curadoria.",
    bullets: [
      "Advertiser, categoria, ordenacao e limite.",
      "Faixa de preco minima e maxima.",
      "Dry-run e modo ativo.",
      "Historico da ultima execucao.",
    ],
    steps: [
      "Configure filtros que facam sentido comercialmente.",
      "Mantenha o modo seguro enquanto estiver testando.",
      "Use Executar teste agora.",
      "Quando o resultado fizer sentido, ative o envio para curadoria.",
    ],
  },
  {
    title: "16. Amazon Hub",
    route: "/admin/amazon",
    group: "Marketplace Hubs",
    intro:
      "O Amazon Hub trabalha com filtros de desconto, Prime e destaque para minerar oportunidades com foco comercial.",
    bullets: [
      "Busca por nome.",
      "Filtro Prime.",
      "Filtro de desconto.",
      "Classificacao por oportunidade.",
    ],
    steps: [
      "Sincronize o catalogo.",
      "Filtre por busca, Prime e desconto.",
      "Revise preco, imagem e link afiliado.",
      "Despache para Site, Telegram ou WhatsApp.",
    ],
  },
  {
    title: "17. Tendencias (IA)",
    route: "/admin/tendencias",
    group: "Inteligencia & SEO",
    intro:
      "Esta tela e um painel de inteligencia para leitura de momentum e categorias promissoras. Serve como apoio de decisao editorial e nao como local de publicacao direta.",
    bullets: [
      "Planejamento do que sera minerado no dia.",
      "Priorizacao de categorias quentes.",
      "Apoio a campanhas e conteudo.",
    ],
  },
  {
    title: "18. Produtos & SEO",
    route: "/admin/produtos",
    group: "Inteligencia & SEO",
    intro:
      "Este modulo auxilia na camada SEO dos produtos e conteudos. Ele ajuda a organizar titulo, slug, meta e leitura de saude de SEO.",
    bullets: [
      "Analise de titulos.",
      "Sugestao de meta e slug.",
      "Keywords.",
      "Apoio a geracao de SEO via IA.",
    ],
  },
  {
    title: "19. Blog & Reviews",
    route: "/admin/blog",
    group: "Inteligencia & SEO",
    intro:
      "Este modulo gera guias, reviews e paginas editoriais a partir de ofertas e produtos selecionados.",
    steps: [
      "Pesquise uma oferta base.",
      "Selecione uma oferta principal e, se quiser, secundarias.",
      "Gere o conteudo do review ou guia.",
      "Revise antes de publicar.",
      "Publique ou despublique conforme a estrategia editorial.",
    ],
  },
  {
    title: "20. Infoprodutos",
    route: "/admin/infoprodutos",
    group: "Inteligencia & SEO",
    intro:
      "O modulo de infoprodutos organiza ofertas de plataformas como Hotmart, Kiwify, Monetizze, Eduzz e afins.",
    steps: [
      "Cadastre o titulo do infoproduto.",
      "Escolha a plataforma.",
      "Adicione o link afiliado.",
      "Preencha preco, comissao e nicho.",
      "Ative ou pause conforme a estrategia.",
    ],
  },
  {
    title: "21. Canais",
    route: "/admin/canais",
    group: "Ferramentas",
    intro:
      "O modulo de Canais controla a saude operacional do WhatsApp e do Telegram usados na distribuicao de ofertas.",
    bullets: [
      "WhatsApp: conectar, reconectar e gerar novo QR.",
      "Telegram: healthcheck do bot e teste manual por chat_id.",
      "Leitura de status e ultimo check.",
    ],
    steps: [
      "Abra a tela e clique em Atualizar status.",
      "Se o WhatsApp estiver offline, tente Reconectar.",
      "Se continuar offline, gere novo QR e escaneie com o celular.",
      "Use o teste do Telegram antes de disparos importantes.",
    ],
  },
  {
    title: "22. Configuracoes",
    route: "/admin/configuracoes",
    group: "Ferramentas",
    intro:
      "Esta tela lista programas afiliados cadastrados, tracking tags e se cada marketplace esta ativo.",
    bullets: [
      "Use para conferencias operacionais.",
      "Valide se o tracking tag esperado esta presente.",
      "Confirme se o programa esta ativo ou desativado.",
    ],
  },
];

drawCover();

heading("Como usar esta apostila", 1);
noteBox(
  "Objetivo",
  "Este material explica o que cada tela do admin faz, em que ordem usar cada modulo e quais cuidados tomar para nao travar a operacao nem publicar oferta errada no site ou nos canais.",
  "info",
);
subLabel("Leitura recomendada");
bulletList([
  "Fluxo geral de operacao",
  "Central de Oferta",
  "Curadoria Geral",
  "Ofertas Publicadas",
  "Painel de Envios",
  "Marketplace Hubs",
  "Landing Pages",
]);

heading("Sumario", 1);
numberedList(tocItems);

heading("1. Visao geral do painel administrativo", 1);
textBlock(
  "O painel administrativo do Radar Smart esta organizado em quatro grupos principais: Operacao, Marketplace Hubs, Inteligencia & SEO e Ferramentas. Cada grupo atende uma fase diferente da operacao.",
);
drawTable(
  ["Grupo", "Objetivo", "Modulos principais"],
  [
    [
      "Operacao",
      "Controlar curadoria, criacao, publicacao e distribuicao de ofertas.",
      "Dashboard, Curadoria Geral, Central de Oferta, Ofertas Publicadas, Painel de Envios, Landing Pages",
    ],
    [
      "Marketplace Hubs",
      "Pesquisar produtos por marketplace, salvar links afiliados e enviar para site ou canais.",
      "Mercado Livre, Shopee, Lomadee, AWIN, AWIN Analytics, Hub AWIN, Automacao AWIN, Amazon Hub",
    ],
    [
      "Inteligencia & SEO",
      "Planejamento editorial, conteudo, SEO e visao analitica.",
      "Tendencias (IA), Produtos & SEO, Blog & Reviews, Infoprodutos",
    ],
    [
      "Ferramentas",
      "Infraestrutura operacional de canais e programas afiliados.",
      "Canais, Configuracoes",
    ],
  ],
  [110, 180, 220],
);
noteBox(
  "Ponto critico",
  "O admin altera estado real de ofertas, filas, landing pages, links afiliados e automacoes. Cada clique deve ser feito com criterio.",
  "warn",
);

heading("2. Fluxo operacional do Radar Smart", 1);
numberedList([
  "Encontrar produto via hub ou Central de Oferta.",
  "Garantir que existe link afiliado valido.",
  "Gerar preview e copy.",
  "Definir destino: Site, Telegram, WhatsApp ou combinacao.",
  "Se for site, passar por Curadoria Geral ou aprovacao editorial.",
  "Conferir a oferta em Ofertas Publicadas.",
  "Validar fila em Painel de Envios quando houver distribuicao para canais.",
  "Se a campanha for paga, criar ou vincular uma Landing Page.",
]);
noteBox(
  "Regra operacional",
  "Nenhuma oferta deve ir para o site sem link afiliado valido. Nos canais, o ideal tambem e sempre usar link rastreavel.",
  "ok",
);

sections.forEach((section, index) => {
  if (index > 0 && index % 4 === 0) {
    doc.addPage();
  }

  moduleHeader(section.title, section.route, section.group);
  textBlock(section.intro);
  if (section.bullets?.length) {
    subLabel("Pontos principais");
    bulletList(section.bullets);
  }
  if (section.steps?.length) {
    subLabel("Passo a passo");
    numberedList(section.steps);
  }
  if (section.extraTitle) {
    heading(section.extraTitle, 3);
  }
  if (section.extraBullets?.length) {
    bulletList(section.extraBullets);
  }
  if (section.note) {
    noteBox(section.note[0], section.note[1], section.note[2]);
  }
});

doc.addPage();
heading("23. Rotina diaria recomendada", 1);
numberedList([
  "Abrir Dashboard e validar saude geral.",
  "Checar Canais para garantir WhatsApp e Telegram operacionais.",
  "Minerar produtos nos hubs principais do dia.",
  "Usar a Central de Oferta para publicar os melhores itens.",
  "Validar as entradas em Ofertas Publicadas.",
  "Conferir Painel de Envios.",
  "Se houver campanha paga, abrir ou criar landing page correspondente.",
  "No fim do dia, revisar precos, cliques e gargalos.",
]);

heading("24. Erros comuns e como agir", 1);
drawTable(
  ["Problema", "Causa mais comum", "Acao recomendada"],
  [
    ["Oferta nao aparece no site", "Sem affiliate_url, sem aprovacao ou bloco incorreto", "Revisar Central de Oferta, Curadoria e Ofertas Publicadas"],
    ["Oferta nao aparece na home", "Bloco cheio ou regra de limite na vitrine", "Conferir pagina /ofertas e a ordem do bloco"],
    ["Envio nao apareceu no painel", "Dispatch nao entrou na fila ou job foi pulado", "Revisar feedback da Central e depois o Painel de Envios"],
    ["Mercado Livre nao extrai", "Link dificil, bloqueio externo ou item_id nao identificado", "Usar link afiliado meli.la e, se precisar, preview manual"],
    ["WhatsApp desconectado", "Sessao caiu", "Ir em Canais, tentar Reconectar e gerar novo QR se necessario"],
    ["Produto AWIN sem dados", "Feed nao encontrou ou link veio incompleto", "Gerar deep link AWIN e usar preview manual"],
  ],
  [130, 180, 200],
);

heading("25. Checklist antes de divulgar o site", 1);
bulletList([
  "Home responsiva no celular, tablet e desktop.",
  "Footer com logo e links corretos.",
  "Ofertas com preco atual, preco antigo e desconto.",
  "Canais ativos.",
  "Ofertas principais revisadas.",
  "Landing page de campanha publicada, se houver trafego pago.",
  "Links afiliados testados em aba anonima.",
  "Grupo e redes com CTA funcionando.",
]);
noteBox(
  "Conclusao",
  "O painel administrativo do Radar Smart ja cobre operacao, curadoria, publicacao, distribuicao, landing pages e hubs afiliados. O resultado depende de usar os modulos na ordem correta e validar sempre link afiliado, status de canal e visibilidade final no site.",
  "ok",
);

const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i += 1) {
  doc.switchToPage(i);
  const footerText = `Radar Smart - Apostila do Painel Administrativo | Pagina ${i + 1}`;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(colors.muted)
    .text(footerText, 48, doc.page.height - 32, {
      width: doc.page.width - 96,
      align: "center",
    });
}

doc.end();
console.log(`PDF gerado em: ${outputPath}`);
