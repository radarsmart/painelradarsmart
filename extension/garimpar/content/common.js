// Helpers compartilhados pelos 3 content scripts de marketplace. Cada um e
// injetado antes do script especifico da pagina (ver popup.js), entao fica
// disponivel em window antes de scanDetail/scanList rodarem.
(function () {
  if (window.__radarGarimparCommon) return;

  function parsePrice(text) {
    if (!text) return null;
    const cleaned = String(text)
      .replace(/\s+/g, " ")
      .replace(/R\$\s?/gi, "")
      .replace(/US\$\s?/gi, "")
      .trim();
    const match = cleaned.match(/([\d.,]+)/);
    if (!match) return null;

    let raw = match[1];
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(raw)) {
      raw = raw.replace(/,/g, "");
    } else if (raw.includes(",") && !raw.includes(".")) {
      raw = raw.replace(",", ".");
    }

    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function abs(href) {
    if (!href) return "";
    try {
      return new URL(href, window.location.href).toString();
    } catch {
      return "";
    }
  }

  // Le o bloco schema.org/Product em JSON-LD quando existe — mais estavel
  // entre redesigns do site do que qualquer seletor de CSS.
  function getJsonLdProduct() {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      let data;
      try {
        data = JSON.parse(script.textContent || "");
      } catch {
        continue;
      }

      const roots = Array.isArray(data) ? data : [data];
      for (const root of roots) {
        const candidates = root && Array.isArray(root["@graph"]) ? root["@graph"] : [root];
        for (const node of candidates) {
          if (!node || typeof node !== "object") continue;
          const type = String(node["@type"] || "").toLowerCase();
          if (!type.includes("product")) continue;

          const image = Array.isArray(node.image) ? node.image[0] : node.image;
          const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          const price = offers && offers.price !== undefined ? Number(offers.price) : null;

          return {
            title: node.name || null,
            image: image || null,
            price: Number.isFinite(price) && price > 0 ? price : null,
          };
        }
      }
    }
    return null;
  }

  // Rola ate o fim repetidamente pra disparar o carregamento preguicoso de
  // mais itens numa pagina de busca/listagem, parando quando a altura da
  // pagina para de crescer (chegou ao fim de verdade) ou atinge o limite.
  async function autoscroll(options) {
    const maxScrolls = (options && options.maxScrolls) || 12;
    const delayMs = (options && options.delayMs) || 700;
    let lastHeight = 0;

    for (let i = 0; i < maxScrolls; i += 1) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const height = document.body.scrollHeight;
      if (height === lastHeight) break;
      lastHeight = height;
    }

    window.scrollTo(0, 0);
  }

  // Acha elementos cujo texto (proprio + descendentes) bate com
  // `keywordRegex` — usado pra achar mencao a Pix/parcelamento/cupom em
  // qualquer lugar da area de preco, ja que essas informacoes nao tem uma
  // classe CSS estavel entre os marketplaces (ao contrario de titulo/preco).
  // Usa textContent (nao no de texto isolado) porque varios sites quebram um
  // valor tipo "5x R$ 34,14 sem juros" em spans separados por digito/centavo
  // — um no de texto sozinho nunca bateria com o padrao completo. Ordena do
  // texto mais curto pro mais longo, pra pegar o elemento mais especifico
  // (nao o container gigante que so por acaso tambem contem a palavra).
  function findTextNear(root, keywordRegex, maxNodes) {
    const scope = root || document.body;
    const limit = maxNodes || 1500;
    const elements = scope.querySelectorAll ? Array.from(scope.querySelectorAll("*")).slice(0, limit) : [];
    const matches = [];

    for (const el of elements) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text && text.length < 200 && keywordRegex.test(text)) matches.push(text);
    }

    matches.sort((a, b) => a.length - b.length);
    return matches;
  }

  // "8x de R$ 61,88 sem juros", "em ate 8x R$61,88 sem juros", "8 x R$ 61,88"
  // — mas tambem a ordem invertida que algumas lojas usam (Dafiti, por
  // exemplo): "R$ 159,56 em ate 2x no cartao".
  function parseInstallmentText(text) {
    const value = String(text || "");

    let match = value.match(/(\d{1,2})\s*x\s*(?:de\s*)?R?\$?\s*([\d.,]+)/i);
    if (match) {
      const count = Number(match[1]);
      const amount = parsePrice(match[2]);
      if (count && amount) return { count, amount, interestFree: /sem juros/i.test(value) };
    }

    match = value.match(/R\$\s*([\d.,]+)\s*(?:em\s*)?(?:at[eé]\s*)?(\d{1,2})\s*x/i);
    if (match) {
      const amount = parsePrice(match[1]);
      const count = Number(match[2]);
      if (count && amount) return { count, amount, interestFree: /sem juros/i.test(value) };
    }

    // "12 parcelas de R$6,11" — algumas lojas (AliExpress inclusive)
    // escrevem "parcelas" por extenso em vez de "x".
    match = value.match(/(\d{1,2})\s*parcelas?\s*(?:de\s*)?R?\$?\s*([\d.,]+)/i);
    if (match) {
      const count = Number(match[1]);
      const amount = parsePrice(match[2]);
      if (count && amount) return { count, amount, interestFree: /sem juros/i.test(value) };
    }

    return null;
  }

  // "R$ 420,75 no pix", "pagando no pix por R$420,75".
  // Mercado Livre pode escrever algo como:
  // "R$ 95,92 36% OFF no Pix ou Saldo no Mercado Pago ou R$ 119,90 em 6x..."
  // Nesse caso o valor depois de "pix" e o preco de cartao/parcelado, nao Pix.
  function parsePixText(text) {
    const value = String(text || "");

    const reversedMatches = Array.from(value.matchAll(/R?\$?\s*([\d.,]+)(?=[^\d]{0,40}(?:no\s*)?pix\b)/gi));
    if (reversedMatches.length) {
      const last = reversedMatches[reversedMatches.length - 1];
      return parsePrice(last[1]);
    }

    const match = value.match(/\bpix\b((?!\bou\b|\bem\b|\d{1,2}\s*x).){0,30}R?\$?\s*([\d.,]+)/i);
    if (match) return parsePrice(match[2]);

    const reversedMatch = value.match(/R?\$?\s*([\d.,]+)[^\d]{0,20}(?:no\s*)?pix/i);
    return reversedMatch ? parsePrice(reversedMatch[1]) : null;
  }

  // Le Pix e parcelamento buscando por texto na regiao passada (best-effort —
  // se nao achar nada plausivel, devolve tudo null sem quebrar a captura).
  function readPaymentExtras(scopeRoot) {
    let pix = null;
    let installments = null;

    for (const text of findTextNear(scopeRoot, /pix/i)) {
      const value = parsePixText(text);
      if (value) {
        pix = value;
        break;
      }
    }

    const installmentKeyword =
      /(\d{1,2}\s*x\s*(de\s*)?R?\$?\s*[\d.,]+)|(R\$\s*[\d.,]+\s*(em\s*)?(at[eé]\s*)?\d{1,2}\s*x)|(\d{1,2}\s*parcelas?)/i;
    for (const text of findTextNear(scopeRoot, installmentKeyword)) {
      const parsed = parseInstallmentText(text);
      if (parsed) {
        installments = parsed;
        break;
      }
    }

    return { pix, installments };
  }

  // Cupons quase sempre tem uma restricao de elegibilidade (so 1a compra, so
  // pelo app, cliente novo etc.) — sem informar isso no proprio anuncio, o
  // cupom vira propaganda enganosa pra quem nao se qualifica. Busca essa
  // restricao perto do cupom pra sempre acompanhar o codigo.
  const RESTRICTION_KEYWORDS =
    /(v[aá]lido|apenas para|somente|primeira compra|novo cliente|n[aã]o cumulativo|limitado a|exclusivo)/i;

  function readCouponRestriction(scope) {
    for (const text of findTextNear(scope, RESTRICTION_KEYWORDS)) {
      return text.trim().slice(0, 200);
    }
    return null;
  }

  // Cobre os 2 formatos mais comuns de cupom em e-commerce: um selo/checkbox
  // de aplicacao automatica ("Economize 15% com cupom", sem codigo pra
  // digitar) e um painel "Insira o codigo XXXX" (com codigo alfanumerico de
  // verdade). Tenta achar o codigo literal primeiro; se nao achar, cai no
  // resumo do desconto como "codigo". Em qualquer caso, anexa a restricao de
  // elegibilidade quando achar uma.
  // "Cupom de atraso na entrega" e politica de reembolso por atraso, nao
  // desconto de produto — nunca deve ser capturado como cupom da oferta.
  const NOT_A_REAL_COUPON = /entrega|reembolso|frete/i;

  function readCoupon(scope) {
    const restriction = readCouponRestriction(scope);

    for (const text of findTextNear(scope, /c[oó]digo|resgatar/i)) {
      if (NOT_A_REAL_COUPON.test(text)) continue;
      const codeMatch = text.match(/c[oó]digo\s+([A-Z0-9]{4,20})\b/);
      if (codeMatch) return { code: codeMatch[1], description: restriction };
    }

    // "R$15,00 OFF em R$90,00", "R$15 OFF" — formato comum no AliExpress,
    // sem a palavra "cupom" no texto.
    for (const text of findTextNear(scope, /R\$\s*[\d.,]+\s*OFF/i)) {
      if (NOT_A_REAL_COUPON.test(text)) continue;
      const offMatch = text.match(/R\$\s*([\d.,]+)\s*OFF(?:\s*em\s*R\$\s*([\d.,]+))?/i);
      if (offMatch) {
        const code = offMatch[2] ? `-R$${offMatch[1]} em R$${offMatch[2]}` : `-R$${offMatch[1]}`;
        return { code, description: restriction || text.trim().slice(0, 200) };
      }
    }

    for (const text of findTextNear(scope, /cupom/i)) {
      if (NOT_A_REAL_COUPON.test(text)) continue;
      const pct = text.match(/(\d{1,3})\s*%/);
      const val = text.match(/R\$\s*([\d.,]+)/);
      if (pct) return { code: `${pct[1]}% OFF`, description: restriction || text.trim().slice(0, 200) };
      if (val) return { code: `-R$${val[1]}`, description: restriction || text.trim().slice(0, 200) };
    }

    return null;
  }

  function isVisuallyStruck(el) {
    if (el.closest && (el.closest("s") || el.closest("del"))) return true;
    try {
      const decoration = window.getComputedStyle(el).textDecorationLine || window.getComputedStyle(el).textDecoration || "";
      if (/line-through/i.test(decoration)) return true;
    } catch {
      // getComputedStyle pode falhar em nos desconectados — ignora.
    }
    return false;
  }

  // Preco antigo raramente vem com um rotulo tipo "De:" — na maioria dos
  // sites e so um valor riscado visualmente (<s>/<del> ou CSS
  // text-decoration:line-through), sem nenhuma palavra ao lado. Tenta achar
  // por isso primeiro; "De: R$X" fica de fallback pros sites que rotulam.
  function readOldPriceFromText(scope, currentPrice) {
    const root = scope || document.body;

    if (root.querySelectorAll) {
      const candidates = Array.from(root.querySelectorAll("*"));
      for (const el of candidates) {
        const text = (el.textContent || "").trim();
        if (!text || text.length > 60 || !/R\$\s*[\d.,]+/i.test(text)) continue;
        if (!isVisuallyStruck(el)) continue;

        const match = text.match(/R\$\s*([\d.,]+)/i);
        const value = match ? parsePrice(match[1]) : null;
        if (value && (!currentPrice || value > currentPrice)) return value;
      }
    }

    for (const text of findTextNear(root, /\bde:?\s*R\$\s*[\d.,]+/i)) {
      const match = text.match(/\bde:?\s*R\$\s*([\d.,]+)/i);
      const value = match ? parsePrice(match[1]) : null;
      if (value && (!currentPrice || value > currentPrice)) return value;
    }

    return null;
  }

  window.__radarGarimparCommon = {
    parsePrice,
    abs,
    getJsonLdProduct,
    autoscroll,
    findTextNear,
    parseInstallmentText,
    parsePixText,
    readPaymentExtras,
    readCoupon,
    readOldPriceFromText,
  };
})();
