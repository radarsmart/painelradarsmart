// Loja generica da rede AWIN (Dafiti, Centauro, Natura, C&A, KaBuM...). O
// link de afiliado NAO e gerado aqui — o backend resolve sozinho (deep link
// deterministico da AWIN, mesmo mecanismo do MyAwin oficial: cread.php com
// awinmid/awinaffid, ver lib/awin/store-directory.ts pro mapa de merchant ID
// por dominio), entao a extensao so precisa mandar a URL bruta.
//
// AVISO: script generico, feito pra funcionar em varias lojas diferentes sem
// selector especifico por site — prioriza JSON-LD (schema.org/Product), que
// a maioria das lojas de moda/varejo emite pra SEO. Nao foi testado contra
// nenhuma loja real ainda; espera precisar de ajuste ao vivo por loja, igual
// aconteceu com o Mercado Livre.
(function () {
  const common = window.__radarGarimparCommon;

  function canonicalUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return String(url || "").split("?")[0];
    }
  }

  function findFirstPrice(scope) {
    for (const text of common.findTextNear(scope, /R\$\s*[\d.,]+/i)) {
      const value = common.parsePrice(text);
      if (value) return value;
    }
    return null;
  }

  function readDetail() {
    const jsonLd = common.getJsonLdProduct();

    const titleEl = document.querySelector("h1");
    const title = (jsonLd && jsonLd.title) || (titleEl ? titleEl.textContent : "") || "";

    const ogImageEl = document.querySelector('meta[property="og:image"]');
    const image = (jsonLd && jsonLd.image) || (ogImageEl ? ogImageEl.getAttribute("content") : "") || "";

    // findFirstPrice sozinho nao distingue preco riscado do atual (pode
    // pegar o valor errado, mais alto) — o preco "no Pix" ja vem de um
    // parser que sabe reconhecer especificamente esse padrao, entao e mais
    // confiavel como preco atual quando existe. So cai pro findFirstPrice
    // (sem essa garantia) se nao achar JSON-LD nem Pix na pagina.
    const { pix, installments } = common.readPaymentExtras(document.body);
    const price = (jsonLd && jsonLd.price) || pix || findFirstPrice(document.body);
    const oldPrice = common.readOldPriceFromText(document.body, price);
    const coupon = common.readCoupon(document.body);

    return { title: String(title).trim(), image, price, oldPrice, pix, installments, coupon };
  }

  function scanDetail() {
    const data = readDetail();
    if (!data.title || !data.price) {
      return { ok: false, error: "Nao foi possivel ler titulo/preco desta pagina." };
    }

    return {
      ok: true,
      items: [
        {
          marketplace: "awin",
          title: data.title,
          price: data.price,
          old_price: data.oldPrice || null,
          image_url: common.abs(data.image),
          product_url: canonicalUrl(window.location.href),
          pix_price: data.pix || null,
          installment_count: data.installments ? data.installments.count : null,
          installment_amount: data.installments ? data.installments.amount : null,
          installment_interest_free: data.installments ? data.installments.interestFree : null,
          coupon_code: data.coupon ? data.coupon.code : null,
          coupon_description: data.coupon ? data.coupon.description : null,
        },
      ],
    };
  }

  // Titulo/texto que na verdade e um link de filtro de preco da barra
  // lateral ("abaixo de R$50", "R$50 - R$150", "acima de R$1000") — esses
  // tambem sao link+preco no mesmo dominio, mas nao sao produto nenhum.
  const PRICE_FILTER_TEXT = /^(abaixo de|acima de|menos de|de)?\s*r\$\s*[\d.,]+(\s*-\s*r\$\s*[\d.,]+)?$/i;

  // Heuristica generica de listagem: link pro mesmo dominio, com imagem de
  // produto (filtro/menu nunca tem foto) e preco "R$ X" plausivel perto —
  // sem selector por classe, ja que cada loja usa as suas.
  // "www.loja.com.br" e "loja.com.br" sao o mesmo site, mas a pagina atual e
  // os links dos produtos nem sempre usam o mesmo prefixo — sem isso, links
  // legitimos eram rejeitados so por causa do "www.".
  function stripWww(hostname) {
    return hostname.replace(/^www\./i, "");
  }

  // O link do produto e a area com titulo/preco nem sempre estao no mesmo
  // container — em varias lojas (Dafiti inclusive) a imagem fica numa div e
  // o preco/titulo ficam numa div IRMA, so juntando 1 nivel acima. Por isso
  // sobe ancestral por ancestral ate achar um nivel que contenha os dois
  // juntos, em vez de parar no primeiro div/li/article mais proximo.
  function findProductCard(link, maxLevels) {
    let node = link.parentElement;
    for (let i = 0; i < (maxLevels || 6) && node; i += 1) {
      const hasImage = node.querySelector && node.querySelector("img[src]");
      const hasPrice = /R\$\s*[\d.,]+/i.test(node.textContent || "");
      if (hasImage && hasPrice) return node;
      node = node.parentElement;
    }
    return link.closest("li, article, div") || link.parentElement || link;
  }

  function scanListOnce() {
    const currentHost = stripWww(window.location.hostname);
    const links = Array.from(document.querySelectorAll("a[href]"));
    const seen = new Set();
    const items = [];
    // Contadores de diagnostico — se items ficar vazio, isso mostra em qual
    // etapa os candidatos estao sendo descartados, sem precisar adivinhar.
    const stats = { links: links.length, sameHost: 0, withImage: 0, withPrice: 0, withTitle: 0 };

    for (const link of links) {
      const href = common.abs(link.getAttribute("href"));
      if (!href) continue;

      let hostname;
      try {
        hostname = stripWww(new URL(href).hostname);
      } catch {
        continue;
      }
      if (hostname !== currentHost) continue;
      stats.sameHost += 1;

      const url = canonicalUrl(href);
      if (seen.has(url)) continue;

      const card = findProductCard(link);
      const imageEl = card.querySelector ? card.querySelector("img[src]") : null;
      if (!imageEl) continue; // sem foto de produto, nao e produto (filtro/menu/banner)
      stats.withImage += 1;

      // Mesma logica do scanDetail: preco "no Pix" (quando existe) e mais
      // confiavel que o primeiro "R$X" achado no card, que pode ser o preco
      // riscado (mais alto) em vez do atual.
      const cardPayment = common.readPaymentExtras(card);
      const price = cardPayment.pix || findFirstPrice(card);
      if (!price) continue;
      stats.withPrice += 1;

      // O link do produto costuma envolver so a imagem (sem texto nenhum
      // dentro) — o alt da imagem e o titulo mais confiavel nesse caso, ja
      // que e padrao em qualquer site (acessibilidade/SEO). So cai pro texto
      // do link se a imagem nao tiver alt.
      const title = (
        imageEl.getAttribute("alt") ||
        link.getAttribute("title") ||
        link.textContent ||
        ""
      ).trim();
      if (!title || title.length < 3 || PRICE_FILTER_TEXT.test(title)) continue;
      stats.withTitle += 1;

      const oldPrice = common.readOldPriceFromText(card, price);
      const { pix, installments } = cardPayment;
      const coupon = common.readCoupon(card);

      seen.add(url);
      items.push({
        marketplace: "awin",
        title,
        price,
        old_price: oldPrice || null,
        image_url: imageEl ? imageEl.getAttribute("src") || "" : "",
        product_url: url,
        pix_price: pix || null,
        installment_count: installments ? installments.count : null,
        installment_amount: installments ? installments.amount : null,
        installment_interest_free: installments ? installments.interestFree : null,
        coupon_code: coupon ? coupon.code : null,
        coupon_description: coupon ? coupon.description : null,
      });
    }

    return { items, stats };
  }

  async function scanList() {
    await common.autoscroll({ maxScrolls: 10 });
    const { items, stats } = scanListOnce();
    if (!items.length) {
      return {
        ok: false,
        error:
          `Nenhum produto encontrado nesta lista. Diagnostico: ${stats.links} links na pagina, ` +
          `${stats.sameHost} do mesmo site, ${stats.withImage} com imagem, ${stats.withPrice} com preco, ` +
          `${stats.withTitle} com titulo valido.`,
      };
    }
    return { ok: true, items };
  }

  window.__radarGarimparAwinStore = function (mode) {
    return mode === "list" ? scanList() : scanDetail();
  };
})();
