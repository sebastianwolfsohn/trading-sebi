// Trading Sebi — service worker: junta los fills y los manda al journal, con reintentos.
const DEFAULTS = { endpoint: "", token: "", defaultAccount: "", debug: false };

async function getConfig() {
  return chrome.storage.local.get(DEFAULTS);
}

async function getState() {
  return chrome.storage.local.get({ queue: [], sentIds: [], stats: { sent: 0, lastSentAt: null, lastError: null, lastSeenAt: null } });
}

async function enqueue(fill) {
  const { queue, sentIds, stats } = await getState();
  if (sentIds.includes(fill.fill_id) || queue.some((q) => q.fill_id === fill.fill_id)) return;
  queue.push(fill);
  stats.lastSeenAt = new Date().toISOString();
  await chrome.storage.local.set({ queue, stats });
  await flush();
}

let flushing = false;
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const cfg = await getConfig();
    const { queue, sentIds, stats } = await getState();
    if (!queue.length) return;
    if (!cfg.endpoint || !cfg.token) {
      stats.lastError = "Falta configurar la URL o el token en las opciones.";
      await chrome.storage.local.set({ stats });
      return;
    }

    // Agrupamos por cuenta: cada request lleva los fills de una cuenta.
    const byAccount = new Map();
    for (const f of queue) {
      const acc = f.account || cfg.defaultAccount || "Apex";
      if (!byAccount.has(acc)) byAccount.set(acc, []);
      byAccount.get(acc).push(f);
    }

    const done = new Set();
    for (const [account, fills] of byAccount) {
      const res = await fetch(`${cfg.endpoint.replace(/\/$/, "")}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ account, executions: fills }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      fills.forEach((f) => done.add(f.fill_id));
      stats.sent += body.inserted || 0;
    }

    const remaining = queue.filter((f) => !done.has(f.fill_id));
    const newSent = [...sentIds, ...done].slice(-3000);
    stats.lastSentAt = new Date().toISOString();
    stats.lastError = null;
    await chrome.storage.local.set({ queue: remaining, sentIds: newSent, stats });
    chrome.action.setBadgeText({ text: "" });
  } catch (e) {
    const { stats, queue } = await getState();
    stats.lastError = String(e.message || e);
    await chrome.storage.local.set({ stats });
    chrome.action.setBadgeBackgroundColor({ color: "#e5484d" });
    chrome.action.setBadgeText({ text: String(queue.length) });
  } finally {
    flushing = false;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "fill") enqueue(msg.payload);
  if (msg.type === "status") chrome.storage.local.set({ lastConnection: { ...msg.payload, at: new Date().toISOString() } });
  if (msg.type === "flush") flush().then(() => sendResponse({ ok: true }));
  if (msg.type === "test") {
    getConfig().then(async (cfg) => {
      try {
        const res = await fetch(`${cfg.endpoint.replace(/\/$/, "")}/api/ingest`, { headers: { Authorization: `Bearer ${cfg.token}` } });
        const body = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok && body.ok, error: body.error || (!res.ok ? `HTTP ${res.status}` : null) });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    });
    return true;
  }
  return msg.type === "flush";
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("retry", { periodInMinutes: 1 });
  chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("retry", { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener((a) => a.name === "retry" && flush());
