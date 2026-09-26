// Shopee: o link afiliado, titulo, imagem, rating e vendas continuam vindo da
// API oficial no backend (/api/garimpar/importar -> resolveShopeeOffer), a
// partir do shopId+itemId da URL. A pagina aberta no navegador entra so como
// complemento comercial para campos que a API de afiliados nao entrega:
// Pix, preco em outros metodos/cartao, parcelamento e cupom.
//
// Cupom e excecao: a API oficial de afiliados da Shopee nao tem esse campo
// (confirmado na documentacao), entao aqui sim vale ler da propria pagina —
// so pra cupom, o resto continua 100% resolvido pelo backend.
(function () {
  const common = window.__radarGarimparCommon;

  function isProductUrl(url) {
    const value = String(url || "");
    return /-i\.\d+\.\d+/.test(value) || /\/product\/\d+\/\d+/.test(value);
  }

  function cleanUrl(url) {
    return String(url || "").split("?")[0];
  }

  function parseShopeeCardPrice(scope) {
    const texts = common.findTextNear(
      scope,
      /outros\s+m[eé]todos|cart[aã]o\s+de\s+cr[eé]dito|op[cç][oõ]es?\s+de\s+parcelamento/i,
    );

    for (const text of texts) {
      const otherMethods = text.match(/(?:ou\s*)?R\$\s*([\d.,]+)\s+com\s+outros\s+m[eé]todos/i);
      if (otherMethods) return common.parsePrice(otherMethods[1]);

      const cardBeforeValue = text.match(/cart[aã]o\s+de\s+cr[eé]dito[^\d]{0,40}R\$\s*([\d.,]+)/i);
      if (cardBeforeValue) return common.parsePrice(cardBeforeValue[1]);
    }

    return null;
  }

  function scanDetail() {
    if (!isProductUrl(window.location.href)) {
      return { ok: false, error: "Esta pagina nao parece ser de um produto Shopee." };
    }

    const product = common.getJsonLdProduct();
    const { pix, installments } = common.readPaymentExtras(document.body);
    const cardPrice = parseShopeeCardPrice(document.body);
    const coupon = common.readCoupon(document.body);
    const price = pix || (product && product.price ? product.price : null);

    return {
      ok: true,
      items: [
        {
          marketplace: "shopee",
          product_url: cleanUrl(window.location.href),
          title: product ? product.title : null,
          price,
          pix_price: pix || null,
          card_price: cardPrice || null,
          installment_count: installments ? installments.count : null,
          installment_amount: installments ? installments.amount : null,
          installment_interest_free: installments ? installments.interestFree : null,
          coupon_code: coupon ? coupon.code : null,
          coupon_description: coupon ? coupon.description : null,
        },
      ],
    };
  }

  function collectListUrls() {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const urls = new Set();
    for (const anchor of anchors) {
      const href = common.abs(anchor.getAttribute("href"));
      if (isProductUrl(href)) urls.add(cleanUrl(href));
    }
    return Array.from(urls);
  }

  async function scanList() {
    await common.autoscroll({ maxScrolls: 10 });
    const urls = collectListUrls();
    if (!urls.length) return { ok: false, error: "Nenhum produto encontrado nesta lista da Shopee." };
    return { ok: true, items: urls.map((product_url) => ({ marketplace: "shopee", product_url })) };
  }

  window.__radarGarimparShopee = function (mode) {
    return mode === "list" ? scanList() : scanDetail();
  };
})();
