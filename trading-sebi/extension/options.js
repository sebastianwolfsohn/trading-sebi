const $ = (id) => document.getElementById(id);
const fields = ["endpoint", "token", "defaultAccount"];

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString("es-AR") : "nunca";
}

async function render() {
  const s = await chrome.storage.local.get({ endpoint: "", token: "", defaultAccount: "", debug: false, queue: [], stats: {}, lastConnection: null });
  fields.forEach((f) => ($(f).value = s[f] || ""));
  $("debug").checked = !!s.debug;
  const st = s.stats || {};
  $("status").innerHTML = `
    <div>${s.lastConnection ? `<span class="ok">●</span> Conexión con Tradovate vista: ${fmt(s.lastConnection.at)}` : `<span class="err">●</span> Todavía no vi una conexión de TradingView con Tradovate. Abrí TradingView y conectá el broker.`}</div>
    <div>Último fill detectado: ${fmt(st.lastSeenAt)}</div>
    <div>Último envío al journal: ${fmt(st.lastSentAt)} · ejecuciones nuevas enviadas: ${st.sent || 0}</div>
    <div>Pendientes de enviar: ${s.queue.length}</div>
    ${st.lastError ? `<div class="err">Error: ${st.lastError}</div>` : ""}`;
}

$("save").onclick = async () => {
  const data = Object.fromEntries(fields.map((f) => [f, $(f).value.trim()]));
  data.debug = $("debug").checked;
  await chrome.storage.local.set(data);
  $("msg").textContent = "Guardado. Si TradingView ya estaba abierto, recargalo.";
  render();
};

$("test").onclick = async () => {
  $("msg").textContent = "Probando…";
  const res = await chrome.runtime.sendMessage({ type: "test" });
  $("msg").innerHTML = res && res.ok ? '<span class="ok">Conexión OK con tu journal.</span>' : `<span class="err">Falló: ${(res && res.error) || "sin respuesta"}</span>`;
};

$("flush").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "flush" });
  render();
};

chrome.storage.onChanged.addListener(render);
render();
