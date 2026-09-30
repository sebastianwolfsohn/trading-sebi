// Trading Sebi — corre dentro de la página de TradingView (mundo MAIN).
// Escucha el tráfico entre TradingView y Tradovate (WebSocket y fetch) y detecta
// cada ejecución (fill). No envía órdenes ni modifica nada: solo lee.
(() => {
  if (window.__tradingSebi) return;
  window.__tradingSebi = true;

  const TRADOVATE = /tradovate/i;
  const contracts = new Map(); // contractId -> "MNQZ6"
  const orders = new Map(); // orderId -> accountId
  const accounts = new Map(); // accountId -> "APEX-12345-01"
  const seen = new Set();
  const pending = new Map(); // fillId -> fill esperando nombre de contrato
  let token = null;
  let apiBase = null;

  const debug = () => document.documentElement.dataset.tradingSebiDebug === "1";
  const log = (...a) => debug() && console.log("%c[Trading Sebi]", "color:#6366f1", ...a);

  function post(type, payload) {
    window.postMessage({ source: "trading-sebi", type, payload }, "*");
  }

  // ---- Detección de entidades de Tradovate ----
  const isFill = (o) =>
    o && typeof o === "object" && "orderId" in o && "contractId" in o && "price" in o && "qty" in o &&
    typeof o.action === "string" && /^(buy|sell)$/i.test(o.action) && "timestamp" in o;
  const isContract = (o) => o && typeof o === "object" && typeof o.name === "string" && "contractMaturityId" in o && "id" in o;
  const isOrder = (o) => o && typeof o === "object" && "accountId" in o && "ordStatus" in o && "id" in o;
  const isAccount = (o) => o && typeof o === "object" && typeof o.name === "string" && "accountType" in o && "id" in o;

  // Primero se recorre todo el mensaje (cuentas, órdenes, contratos) y después se
  // procesan los fills, así cada fill ya tiene su cuenta y su símbolo.
  function walk(node, fills, depth = 0) {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, fills, depth + 1));
    if (typeof node !== "object") return;
    if (isContract(node)) contracts.set(node.id, node.name);
    else if (isAccount(node)) accounts.set(node.id, node.name);
    else if (isOrder(node)) orders.set(node.id, node.accountId);
    else if (isFill(node)) fills.push(node);
    for (const v of Object.values(node)) if (v && typeof v === "object") walk(v, fills, depth + 1);
  }

  function onFill(f) {
    if (f.active === false) return; // fill anulado por el broker
    const id = String(f.id);
    if (seen.has(id)) return;
    if (!contracts.has(f.contractId)) {
      pending.set(id, f);
      resolveContract(f.contractId);
      return;
    }
    emit(f);
  }

  function emit(f) {
    const id = String(f.id);
    if (seen.has(id)) return;
    seen.add(id);
    pending.delete(id);
    const accountId = orders.get(f.orderId);
    const fill = {
      fill_id: id,
      order_id: String(f.orderId),
      symbol: contracts.get(f.contractId) || `CID${f.contractId}`,
      side: String(f.action).toLowerCase(),
      qty: Number(f.qty),
      price: Number(f.price),
      executed_at: f.timestamp,
      account: accountId != null ? accounts.get(accountId) || null : accounts.size === 1 ? [...accounts.values()][0] : null,
      raw: { contractId: f.contractId, tradeDate: f.tradeDate, accountId: accountId ?? null },
    };
    log("fill detectado", fill);
    post("fill", fill);
  }

  function flushPending() {
    for (const f of pending.values()) if (contracts.has(f.contractId)) emit(f);
  }

  async function resolveContract(contractId) {
    if (!token || !apiBase) {
      // Sin token no se puede preguntar; si en 20s no aparece el nombre, se manda igual.
      setTimeout(() => {
        for (const f of pending.values()) if (f.contractId === contractId) emit(f);
      }, 20000);
      return;
    }
    try {
      const res = await origFetch(`${apiBase}/contract/item?id=${contractId}`, { headers: { Authorization: `Bearer ${token}` } });
      const c = await res.json();
      if (c && c.name) contracts.set(contractId, c.name);
    } catch (e) {
      log("no pude resolver el contrato", contractId, e);
    }
    for (const f of pending.values()) if (f.contractId === contractId) emit(f);
  }

  function handleText(text, url) {
    if (typeof text !== "string" || !text) return;
    if (debug() && /fill/i.test(text)) log("mensaje con 'fill' desde", url, text.slice(0, 500));
    // Frames de Tradovate: "o", "h", "a[...]" (estilo SockJS)
    let payload = text;
    if (payload[0] === "a") payload = payload.slice(1);
    if (payload[0] !== "[" && payload[0] !== "{") return;
    try {
      const fills = [];
      walk(JSON.parse(payload), fills);
      fills.forEach(onFill);
      flushPending();
    } catch {
      /* no era JSON */
    }
  }

  function baseFromUrl(url) {
    const m = String(url).match(/^(?:wss?|https?):\/\/([^/]*tradovate[^/]*)\/(v\d+)/i);
    return m ? `https://${m[1]}/${m[2]}` : null;
  }

  // ---- WebSocket ----
  const OrigWS = window.WebSocket;
  function PatchedWS(url, protocols) {
    const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
    try {
      const u = String(url);
      if (debug()) log("WebSocket abierto:", u);
      if (TRADOVATE.test(u)) {
        apiBase = apiBase || baseFromUrl(u);
        ws.addEventListener("message", (ev) => handleText(ev.data, u));
        const origSend = ws.send.bind(ws);
        ws.send = (data) => {
          // "authorize\n0\n\n<token>" -> guardamos el token para resolver nombres de contratos
          if (typeof data === "string" && data.startsWith("authorize")) token = data.split("\n").pop() || token;
          return origSend(data);
        };
        post("status", { connected: true, url: u });
      }
    } catch (e) {
      log("error enganchando WebSocket", e);
    }
    return ws;
  }
  PatchedWS.prototype = OrigWS.prototype;
  Object.setPrototypeOf(PatchedWS, OrigWS);
  window.WebSocket = PatchedWS;

  // ---- fetch ----
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input && input.url;
    const res = await origFetch(input, init);
    try {
      if (url && TRADOVATE.test(url)) {
        apiBase = apiBase || baseFromUrl(url);
        const auth = init && init.headers && (init.headers.Authorization || init.headers.authorization);
        if (typeof auth === "string" && auth.startsWith("Bearer ")) token = auth.slice(7);
        res.clone().text().then((t) => handleText(t, url)).catch(() => {});
      }
    } catch {
      /* nunca romper la página */
    }
    return res;
  };

  // ---- XMLHttpRequest ----
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (url && TRADOVATE.test(String(url))) {
      apiBase = apiBase || baseFromUrl(url);
      this.addEventListener("load", () => {
        try {
          handleText(typeof this.response === "string" ? this.response : this.responseText, String(url));
        } catch {}
      });
    }
    return origOpen.call(this, method, url, ...rest);
  };

  log("activo en", location.href);
})();
