const CONFIG_KEY = "radarGarimparConfig";
const DEFAULT_BASE_URL = "https://radarsmart.com.br";

const baseUrlInput = document.getElementById("baseUrl");
const tokenInput = document.getElementById("token");
const mlTagInput = document.getElementById("mlTag");
const saveConfigBtn = document.getElementById("saveConfig");
const scanDetailBtn = document.getElementById("scanDetail");
const scanListBtn = document.getElementById("scanList");
const sendItemsBtn = document.getElementById("sendItems");
const itemsEl = document.getElementById("items");
const statusEl = document.getElementById("status");

let capturedItems = [];

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.className = kind || "";
}

function setBusy(busy) {
  scanDetailBtn.disabled = busy;
  scanListBtn.disabled = busy;
  sendItemsBtn.disabled = busy;
  saveConfigBtn.disabled = busy;
}

async function loadConfig() {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  const config = stored[CONFIG_KEY] || {};
  baseUrlInput.value = config.baseUrl || DEFAULT_BASE_URL;
  tokenInput.value = config.token || "";
  mlTagInput.value = config.mlTag || "";
}

async function saveConfig() {
  const config = {
    baseUrl: normalizeBaseUrl(baseUrlInput.value || DEFAULT_BASE_URL),
    token: tokenInput.value.trim(),
    mlTag: mlTagInput.value.trim(),
  };
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
  baseUrlInput.value = config.baseUrl;
  setStatus("Configuracao salva.", "success");
}

// Outras lojas da rede AWIN alem do AliExpress — mesma lista de
// lib/awin/store-directory.ts no backend (mantenha as duas em sincronia).
const AWIN_STORE_DOMAINS = ["dafiti.com.br", "cea.com.br", "natura.com.br", "centauro.com.br", "kabum.com.br"];

function detectMarketplace(hostname) {
  if (hostname.includes("amazon.com.br")) return "amazon";
  if (hostname.includes("mercadolivre.com.br")) return "mercadolivre";
  if (hostname.includes("shopee.com.br")) return "shopee";
  if (hostname.includes("aliexpress.com")) return "aliexpress";
  if (AWIN_STORE_DOMAINS.some((domain) => hostname.includes(domain))) return "awin";
  return null;
}

function normalizeBaseUrl(value) {
  let url = String(value || "").trim();
  if (!url) return "";
  if (/^(www\.)?radarsmart\.com\.br\/?$/i.test(url)) {
    return DEFAULT_BASE_URL;
  }
  if (/^https?:\/\/(www\.)?radarsmart\.com\.br\/?$/i.test(url)) {
    return DEFAULT_BASE_URL;
  }
  return url.replace(/\/+$/, "");
}

function buildConnectionError(error, baseUrl) {
  const message = String((error && error.message) || "");
  if (message === "Failed to fetch") {
    const localHint = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl)
      ? " O painel local precisa estar aberto nessa porta; para producao, use https://radarsmart.com.br."
      : "";
    return `Nao consegui conectar ao painel em ${baseUrl}.${localHint}`;
  }
  return message || "Falha ao enviar.";
}

const MARKETPLACE_GLOBALS = {
  amazon: "__radarGarimparAmazon",
  mercadolivre: "__radarGarimparMercadoLivre",
  shopee: "__radarGarimparShopee",
  aliexpress: "__radarGarimparAliExpress",
  awin: "__radarGarimparAwinStore",
};

const MARKETPLACE_SCRIPT_FILE = {
  amazon: "amazon",
  mercadolivre: "mercadolivre",
  shopee: "shopee",
  aliexpress: "aliexpress",
  awin: "awin-store",
};

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderItems() {
  itemsEl.innerHTML = "";

  capturedItems.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "item";

    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = item.title || item.product_url;
    card.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "item-meta";
    const priceText = item.price ? `R$ ${Number(item.price).toFixed(2)}` : "preco a resolver";
    meta.textContent = `${item.marketplace} - ${priceText}`;
    card.appendChild(meta);

    if (item.marketplace === "mercadolivre" && !item.affiliate_url) {
      const warn = document.createElement("div");
      warn.className = "item-warn";
      warn.textContent =
        "Nao foi possivel gerar o link automaticamente (sessao nao afiliada ou token ausente). Cole o link manualmente para poder importar.";
      card.appendChild(warn);

      const linkInput = document.createElement("input");
      linkInput.type = "text";
      linkInput.placeholder = "https://meli.la/...";
      linkInput.value = "";
      linkInput.addEventListener("input", () => {
        capturedItems[index].affiliate_url = linkInput.value.trim();
      });
      card.appendChild(linkInput);
    }

    itemsEl.appendChild(card);
  });

  sendItemsBtn.style.display = capturedItems.length ? "block" : "none";
}

async function runScan(mode) {
  setBusy(true);
  setStatus("Capturando...", "");

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id || !tab.url) throw new Error("Nao foi possivel identificar a aba ativa.");

    const hostname = new URL(tab.url).hostname;
    const marketplace = detectMarketplace(hostname);
    if (!marketplace) {
      throw new Error("Esta pagina nao e Shopee, Amazon, Mercado Livre, AliExpress ou uma loja AWIN conhecida.");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/common.js", `content/${MARKETPLACE_SCRIPT_FILE[marketplace]}.js`],
    });

    const globalName = MARKETPLACE_GLOBALS[marketplace];
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (fnName, scanMode) => window[fnName](scanMode),
      args: [globalName, mode],
    });

    if (!result || !result.ok) {
      throw new Error((result && result.error) || "Nao foi possivel capturar produtos desta pagina.");
    }

    const existingUrls = new Set(capturedItems.map((item) => item.product_url));
    const newItems = result.items.filter((item) => !existingUrls.has(item.product_url));
    capturedItems = capturedItems.concat(newItems);

    renderItems();
    setStatus(`${result.items.length} produto(s) capturado(s) (${newItems.length} novo(s)).`, "success");
  } catch (error) {
    setStatus(error.message || "Falha ao capturar.", "error");
  } finally {
    setBusy(false);
  }
}

async function sendItems() {
  const config = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY] || {};
  const baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL);
  if (!baseUrl || !config.token) {
    setStatus("Configure a URL do painel e o token antes de enviar.", "error");
    return;
  }

  const blockedByMissingLink = capturedItems.filter(
    (item) => item.marketplace === "mercadolivre" && !item.affiliate_url,
  );
  const readyItems = capturedItems.filter(
    (item) => item.marketplace !== "mercadolivre" || item.affiliate_url,
  );

  if (!readyItems.length) {
    setStatus("Nenhum item pronto para enviar (cole o link do Mercado Livre primeiro).", "error");
    return;
  }

  setBusy(true);
  setStatus("Enviando...", "");

  try {
    const response = await fetch(`${baseUrl}/api/garimpar/importar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({ items: readyItems }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Falha ao enviar (HTTP ${response.status}).`);
    }

    const skippedNote = blockedByMissingLink.length
      ? ` ${blockedByMissingLink.length} item(ns) do ML ficaram pendentes (sem link).`
      : "";
    setStatus(`Importados: ${payload.imported}. Rejeitados: ${payload.rejected}.${skippedNote}`, "success");

    capturedItems = blockedByMissingLink;
    renderItems();
  } catch (error) {
    setStatus(buildConnectionError(error, baseUrl), "error");
  } finally {
    setBusy(false);
  }
}

saveConfigBtn.addEventListener("click", () => void saveConfig());
scanDetailBtn.addEventListener("click", () => void runScan("single"));
scanListBtn.addEventListener("click", () => void runScan("list"));
sendItemsBtn.addEventListener("click", () => void sendItems());

void loadConfig();
