// Trading Sebi — puente entre la página (mundo MAIN) y el service worker de la extensión.
(() => {
  chrome.storage.local.get({ debug: false }, ({ debug }) => {
    document.documentElement.dataset.tradingSebiDebug = debug ? "1" : "0";
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.debug) document.documentElement.dataset.tradingSebiDebug = changes.debug.newValue ? "1" : "0";
  });

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== "trading-sebi") return;
    try {
      chrome.runtime.sendMessage({ type: ev.data.type, payload: ev.data.payload });
    } catch {
      // la extensión se recargó; la página necesita un refresh
    }
  });
})();
