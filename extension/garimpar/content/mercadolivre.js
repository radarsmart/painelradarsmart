// Mercado Livre: extrai titulo/preco/imagem/URL e gera o link de afiliado
// automaticamente, replicando a chamada que o gerador de links oficial do ML
// faz (POST .../affiliate-program/api/v2/affiliates/createLink, usando a
// propria sessao/cookies do navegador + token de <meta name="csrf-token">).
// Endpoint, headers e formato do corpo foram confirmados inspecionando ao
// vivo a ferramenta oficial do ML (nao vieram de codigo de terceiro nenhum).
// Se a geracao falhar por qualquer motivo (sessao nao afiliada, token
// ausente, erro de rede), o item fica sem link e o popup deixa colar
// manualmente — nunca trava a captura.
(function () {
  const common = window.__radarGarimparCommon;
  const CREATE_LINK_URL = "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink";
  const CONFIG_KEY = "radarGarimparConfig";
  const DEFAULT_TAG = "radarsmart";
  const MINT_BATCH_SIZE = 20;

  function canonicalUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return String(url || "").split("?")[0];
    }
  }

  function moneyFromFraction(fractionEl) {
    if (!fractionEl) return null;
    const scope = fractionEl.closest(".andes-money-amount") || fractionEl.parentElement;
    const cents = scope ? scope.querySelector(".andes-money-amount__cents") : null;
    const raw = cents ? `${fractionEl.textContent}.${cents.textContent}` : fractionEl.textContent;
    return common.parsePrice(raw);
  }

  function isStruckPrice(fractionEl) {
    return Boolean(
      fractionEl.closest("s") || fractionEl.closest("[class*='previous'], [class*='original']"),
    );
  }

  // .andes-money-amount__fraction aparece varias vezes na mesma pagina (preco
  // riscado antigo, preco atual, parcelamento) — nao da pra confiar em pegar
  // "o primeiro" ou "o de dentro de um container qualquer com 'price' no
  // nome". Preco riscado (<s> ou classe previous/original) e sempre o antigo;
  // o primeiro que NAO estiver riscado e o atual.
  function readPricesFrom(scope) {
    const fractions = Array.from(scope.querySelectorAll(".andes-money-amount__fraction"));
    let current = null;
    let old = null;

    for (const fractionEl of fractions) {
      if (isStruckPrice(fractionEl)) {
        if (old === null) old = moneyFromFraction(fractionEl);
      } else if (current === null) {
        current = moneyFromFraction(fractionEl);
      }
    }

    return { current, old };
  }

  async function getAffiliateTag() {
    try {
      const stored = await chrome.storage.local.get(CONFIG_KEY);
      const tag = stored[CONFIG_KEY] && stored[CONFIG_KEY].mlTag;
      return (tag && String(tag).trim()) || DEFAULT_TAG;
    } catch {
      return DEFAULT_TAG;
    }
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") : null;
  }

  async function mintBatch(urls, tag, csrfToken) {
    const response = await fetch(CREATE_LINK_URL, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ urls, tag }),
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => null);
    return data && Array.isArray(data.urls) ? data.urls : [];
  }

  // A API do ML aceita varias URLs numa unica chamada — pra listas grandes,
  // manda em lotes em vez de 1 requisicao por produto.
  async function mintAffiliateLinks(urls) {
    const map = new Map();
    const csrfToken = getCsrfToken();
    if (!csrfToken || !urls.length) return map;

    const tag = await getAffiliateTag();

    for (let start = 0; start < urls.length; start += MINT_BATCH_SIZE) {
      const batch = urls.slice(start, start + MINT_BATCH_SIZE);
      try {
        const results = await mintBatch(batch, tag, csrfToken);
        results.forEach((entry, index) => {
          const originUrl = entry.origin_url || batch[index];
          if (entry.short_url) map.set(originUrl, entry.short_url);
        });
      } catch {
        // segue pros proximos lotes — itens deste lote ficam sem link e
        // caem no fallback manual do popup.
      }
    }

    return map;
  }

  function readDetail() {
    const jsonLd = common.getJsonLdProduct();

    const titleEl = document.querySelector(".ui-pdp-title, h1");
    const title = (jsonLd && jsonLd.title) || (titleEl ? titleEl.textContent.trim() : "");

    // Restringe a busca de preco a regiao principal do produto — a pagina
    // inteira tem varios outros precos (recomendados, carrinho, etc.) que
    // podiam ser pegos por engano se buscasse em document.body inteiro.
    const priceScope =
      document.querySelector(".ui-pdp-price, .ui-pdp-container__row--price") || document.body;

    // JSON-LD (schema.org Product.offers.price) e sempre o preco atual
    // vendavel, nunca o riscado — prioriza ele; o DOM so cobre o preco antigo
    // (que o JSON-LD normalmente nao traz) e serve de fallback pro atual.
    const domPrices = readPricesFrom(priceScope);
    const price = (jsonLd && jsonLd.price) || domPrices.current || null;
    const oldPrice = domPrices.old || null;

    const ogImageEl = document.querySelector('meta[property="og:image"]');
    const galleryImgEl = document.querySelector(".ui-pdp-gallery__figure img, .ui-pdp-image");
    const image =
      (jsonLd && jsonLd.image) ||
      (ogImageEl ? ogImageEl.getAttribute("content") : "") ||
      (galleryImgEl ? galleryImgEl.getAttribute("src") : "") ||
      "";

    const { pix, installments } = common.readPaymentExtras(priceScope);
    const coupon = common.readCoupon(priceScope);

    return { title: String(title).trim(), price, oldPrice, image, pix, installments, coupon };
  }

  async function scanDetail() {
    const data = readDetail();
    if (!data.title || !data.price) {
      return { ok: false, error: "Nao foi possivel ler titulo/preco desta pagina do Mercado Livre." };
    }

    const productUrl = canonicalUrl(window.location.href);
    const minted = await mintAffiliateLinks([productUrl]);

    return {
      ok: true,
      items: [
        {
          marketplace: "mercadolivre",
          title: data.title,
          price: data.price,
          old_price: data.oldPrice || null,
          image_url: common.abs(data.image),
          product_url: productUrl,
          affiliate_url: minted.get(productUrl) || "",
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
    const cards = Array.from(
      document.querySelectorAll("li.ui-search-layout__item, div.ui-search-result, .poly-card"),
    );
    const items = [];

    for (const card of cards) {
      const linkEl = card.querySelector("a.ui-search-link, a.poly-component__title, a[href*='mercadolivre']");
      const titleEl = card.querySelector(
        "h2.ui-search-item__title, .poly-component__title, .ui-search-item__title",
      );
      const imageEl = card.querySelector("img");

      const href = linkEl ? linkEl.getAttribute("href") : null;
      const title = titleEl ? titleEl.textContent.trim() : linkEl ? linkEl.textContent.trim() : "";
      const { current: price, old: oldPrice } = readPricesFrom(card);
      if (!href || !title || !price) continue;

      const { pix, installments } = common.readPaymentExtras(card);
      const coupon = common.readCoupon(card);

      items.push({
        marketplace: "mercadolivre",
        title,
        price,
        old_price: oldPrice || null,
        image_url: imageEl ? imageEl.getAttribute("data-src") || imageEl.getAttribute("src") || "" : "",
        product_url: canonicalUrl(common.abs(href)),
        affiliate_url: "",
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
    if (!items.length) return { ok: false, error: "Nenhum produto encontrado nesta lista do Mercado Livre." };

    const minted = await mintAffiliateLinks(items.map((item) => item.product_url));
    for (const item of items) {
      item.affiliate_url = minted.get(item.product_url) || "";
    }

    return { ok: true, items };
  }

  window.__radarGarimparMercadoLivre = function (mode) {
    return mode === "list" ? scanList() : scanDetail();
  };
})();
