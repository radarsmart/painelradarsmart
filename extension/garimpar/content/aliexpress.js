// AliExpress: extrai titulo/preco/imagem/URL. Link de afiliado NAO e gerado
// aqui — o backend ja resolve sozinho (deep link deterministico da AWIN,
// mesmo mecanismo usado pelo MyAwin oficial: cread.php com awinmid/awinaffid,
// ver lib/awin/client.ts), entao a extensao so precisa mandar a URL bruta.
//
// AVISO: diferente de Amazon/ML/Shopee, este script nao foi testado contra a
// pagina real do AliExpress ainda — os seletores sao a melhor estimativa,
// prioriza JSON-LD (mais estavel) com fallback por padrao de texto "R$ X".
// Espera precisar de ajuste ao vivo, igual aconteceu com o preco do ML.
(function () {
  const common = window.__radarGarimparCommon;

  function canonicalUrl(url) {
    const match = String(url || "").match(/\/item\/(\d{8,})\.html/i);
    if (match) return `https://pt.aliexpress.com/item/${match[1]}.html`;
    return String(url || "").split("?")[0];
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

    const price = (jsonLd && jsonLd.price) || findFirstPrice(document.body);
    const oldPrice = common.readOldPriceFromText(document.body, price);
    const { pix, installments } = common.readPaymentExtras(document.body);
    const coupon = common.readCoupon(document.body);

    return { title: String(title).trim(), image, price, oldPrice, pix, installments, coupon };
  }

  function scanDetail() {
    const data = readDetail();
    if (!data.title || !data.price) {
      return { ok: false, error: "Nao foi possivel ler titulo/preco desta pagina do AliExpress." };
    }

    return {
      ok: true,
      items: [
        {
          marketplace: "aliexpress",
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

  // Alem de "/item/12345.html" (paginas normais de busca/categoria), tenta
  // reconhecer um ID de produto do AliExpress (9+ digitos, geralmente
  // comecando com "1005") em qualquer lugar do href — paginas especiais
  // (Bundle Deals, etc.) as vezes linkam diferente.
  function extractItemId(href) {
    const direct = String(href || "").match(/\/item\/(\d{8,})/i);
    if (direct) return direct[1];
    const loose = String(href || "").match(/\b(1005\d{8,})\b/);
    return loose ? loose[1] : null;
  }

  function scanListOnce() {
    const allLinks = Array.from(document.querySelectorAll("a[href]"));
    const seen = new Set();
    const items = [];
    // Diagnostico — se items ficar vazio, mostra em qual etapa parou.
    const stats = { links: allLinks.length, productLinks: 0, withTitle: 0, withPrice: 0 };

    for (const link of allLinks) {
      const href = link.getAttribute("href");
      const itemId = extractItemId(href);
      if (!itemId) continue;
      stats.productLinks += 1;

      const url = `https://pt.aliexpress.com/item/${itemId}.html`;
      if (seen.has(url)) continue;

      const card = link.closest("div") || link;
      const imageEl = card.querySelector ? card.querySelector("img") : null;

      // O link do produto no AliExpress envolve o card inteiro (titulo,
      // preco, vendidos, cupons, botoes tudo junto) — link.textContent vira
      // uma bagunca. O alt da imagem e o titulo limpo de verdade.
      const title = (
        (imageEl && imageEl.getAttribute("alt")) ||
        link.getAttribute("title") ||
        ""
      ).trim();
      if (!title) continue;
      stats.withTitle += 1;

      const { pix, installments } = common.readPaymentExtras(card);
      const price = pix || findFirstPrice(card);
      if (!price) continue;
      stats.withPrice += 1;

      const oldPrice = common.readOldPriceFromText(card, price);
      const coupon = common.readCoupon(card);

      seen.add(url);
      items.push({
        marketplace: "aliexpress",
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
          `Nenhum produto encontrado nesta lista do AliExpress. Diagnostico: ${stats.links} links na pagina, ` +
          `${stats.productLinks} pareciam produto, ${stats.withTitle} com titulo, ${stats.withPrice} com preco.`,
      };
    }
    return { ok: true, items };
  }

  window.__radarGarimparAliExpress = function (mode) {
    return mode === "list" ? scanList() : scanDetail();
  };
})();
