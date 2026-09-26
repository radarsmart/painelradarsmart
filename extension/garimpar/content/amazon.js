// Amazon: so extrai dado bruto (titulo/preco/imagem/URL). O link de afiliado
// e reescrita pura de URL com a tag — o backend ja faz isso sozinho em
// /api/garimpar/importar (sanitizeMarketplaceUrl), entao a extensao nao
// precisa saber a tag nem gerar o link.
(function () {
  const common = window.__radarGarimparCommon;

  function extractAsin(url) {
    const match = String(url || "").match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    return match ? match[1].toUpperCase() : null;
  }

  function canonicalUrl(url) {
    const asin = extractAsin(url);
    if (asin) return `https://www.amazon.com.br/dp/${asin}`;
    return String(url || "").split("?")[0];
  }

  function readDetail() {
    const jsonLd = common.getJsonLdProduct();

    const titleEl = document.querySelector("#productTitle");
    const title = (jsonLd && jsonLd.title) || (titleEl ? titleEl.textContent : "") || "";

    const imageEl = document.querySelector("#landingImage");
    const ogImageEl = document.querySelector('meta[property="og:image"]');
    const image =
      (jsonLd && jsonLd.image) ||
      (imageEl ? imageEl.getAttribute("data-old-hires") || imageEl.src : "") ||
      (ogImageEl ? ogImageEl.getAttribute("content") : "") ||
      "";

    const priceEl = document.querySelector(
      "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen, #corePrice_feature_div .a-price .a-offscreen, #apex_desktop .a-price .a-offscreen, .a-price .a-offscreen",
    );
    const price = common.parsePrice(priceEl ? priceEl.textContent : "") || (jsonLd && jsonLd.price) || null;

    const buybox =
      document.querySelector("#corePriceDisplay_desktop_feature_div, #centerCol, #apex_desktop") ||
      document.body;

    const oldPriceEl = document.querySelector(
      "#corePriceDisplay_desktop_feature_div .a-price.a-text-price .a-offscreen, .a-text-price .a-offscreen",
    );
    const oldPrice =
      common.parsePrice(oldPriceEl ? oldPriceEl.textContent : "") || common.readOldPriceFromText(buybox, price);

    const { pix, installments } = common.readPaymentExtras(buybox);
    const coupon = common.readCoupon(buybox);

    return { title: String(title).trim(), image, price, oldPrice, pix, installments, coupon };
  }

  function scanDetail() {
    const data = readDetail();
    if (!data.title || !data.price) {
      return { ok: false, error: "Nao foi possivel ler titulo/preco desta pagina da Amazon." };
    }

    return {
      ok: true,
      items: [
        {
          marketplace: "amazon",
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

  function scanListOnce() {
    const cards = Array.from(document.querySelectorAll('div[data-component-type="s-search-result"]'));
    const items = [];

    for (const card of cards) {
      const linkEl = card.querySelector("h2 a, a.a-link-normal.s-line-clamp-2, a.a-link-normal.s-line-clamp-1");
      const titleEl = card.querySelector("h2 span, h2");
      const priceEl = card.querySelector(".a-price .a-offscreen");
      const oldPriceEl = card.querySelector(".a-text-price .a-offscreen, .a-price.a-text-price .a-offscreen");
      const imageEl = card.querySelector("img.s-image");

      const href = linkEl ? linkEl.getAttribute("href") : null;
      const title = titleEl ? titleEl.textContent.trim() : "";
      const price = common.parsePrice(priceEl ? priceEl.textContent : "");
      if (!href || !title || !price) continue;

      const { pix, installments } = common.readPaymentExtras(card);
      const coupon = common.readCoupon(card);
      const oldPrice =
        common.parsePrice(oldPriceEl ? oldPriceEl.textContent : "") || common.readOldPriceFromText(card, price);

      items.push({
        marketplace: "amazon",
        title,
        price,
        old_price: oldPrice || null,
        image_url: imageEl ? imageEl.src : "",
        product_url: canonicalUrl(common.abs(href)),
        pix_price: pix || null,
        installment_count: installments ? installments.count : null,
        installment_amount: installments ? installments.amount : null,
        installment_interest_free: installments ? installments.interestFree : null,
        coupon_code: coupon ? coupon.code : null,
        coupon_description: coupon ? coupon.description : null,
      });
    }

    return items;
  }

  async function scanList() {
    await common.autoscroll({ maxScrolls: 10 });
    const items = scanListOnce();
    if (!items.length) return { ok: false, error: "Nenhum produto encontrado nesta lista da Amazon." };
    return { ok: true, items };
  }

  window.__radarGarimparAmazon = function (mode) {
    return mode === "list" ? scanList() : scanDetail();
  };
})();
