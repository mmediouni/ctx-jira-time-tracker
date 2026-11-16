let running = null, detected = null, tick = null;

// Exécuté dans la page Jira : lit le H1 et le dernier élément du fil d'Ariane.
function scrapeTicket() {
  const q = (s) => document.querySelector(s);
  const h1 = q('[data-testid="issue.views.issue-base.foundation.summary.heading"]') || q("h1");
  const crumb = q('[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"]');
  let key = crumb && crumb.textContent.trim();
  if (!key) {
    const m = (location.pathname + location.search).match(/([A-Z][A-Z0-9]+-\d+)/);
    key = m && m[1];
  }
  if (!key) return null;
  return { key, title: h1 ? h1.textContent.trim() : "", url: location.origin + "/browse/" + key };
}

const save = (o) => chrome.storage.local.set(o);

async function detect() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeTicket });
    detected = res && res.result;
  } catch { detected = null; }
}

async function load() {
  const d = await chrome.storage.local.get(["running", "history", "historyBackup", "settings"]);
  setLang((d.settings || {}).lang);
  $("restore").hidden = !(d.historyBackup && d.historyBackup.length);
  running = d.running || null;
  render(d.history || []);
}

function render(history) {
  const cur = running || detected;
  $("curLabel").textContent = running ? t("p_running") + (running.autotest ? " 🧪" : "") : t("p_detected");
  $("nojira").hidden = $("autoRow").hidden = !!running;
  $("key").textContent = cur ? (cur.key || t("nonJira")) : "—";
  $("title").textContent = cur ? cur.title : t("p_noTicket");
  $("start").hidden = !!running;
  $("start").disabled = !detected;
  $("stop").hidden = !running;
  $("timer").hidden = !running;
  $("notesBox").hidden = !running;
  clearInterval(tick);
  if (running) {
    const upd = () => ($("timer").textContent = fmt(Date.now() - running.start));
    upd(); tick = setInterval(upd, 1000);
    $("notes").innerHTML = running.notes.map((n) =>
      `<li>${esc(n.text)} <small>${hhmm(n.at)}</small></li>`).join("");
  }
  $("history").innerHTML = history.slice().reverse().map((e) => `
    <div class="entry"><span class="dur">${fmt(e.end - e.start)}</span>
      <b>${esc(entryLabel(e))}</b> ${esc(entryTitle(e))}
      <div class="t">${new Date(e.start).toLocaleDateString()} ${hhmm(e.start)} → ${hhmm(e.end)}</div>
      ${e.notes.map((n) => `<div class="n">• [${hhmm(n.at)}] ${esc(n.text)}</div>`).join("")}
    </div>`).join("") || `<small>${t("p_noSessions")}</small>`;
}

$("start").onclick = async () => {
  if (!detected) return;
  running = { ...detected, start: Date.now(), notes: [], ...($("autoTest").checked ? { autotest: true } : {}) };
  await save({ running }); load();
};
$("startFree").onclick = async () => {
  const title = $("freeTitle").value.trim();
  if (!title) { $("freeTitle").focus(); return; }
  running = { key: "", title, url: "", start: Date.now(), notes: [], ...($("autoTest").checked ? { autotest: true } : {}) };
  $("freeTitle").value = "";
  await save({ running }); load();
};
$("stop").onclick = async () => {
  const text = $("noteInput").value.trim();
  if (text) running.notes.push({ text, at: Date.now() });
  const { history = [] } = await chrome.storage.local.get("history");
  history.push({ ...running, end: Date.now() });
  await chrome.storage.local.remove("running");
  await save({ history });
  $("noteInput").value = ""; load();
};
$("addNote").onclick = async () => {
  const text = $("noteInput").value.trim();
  if (!text || !running) return;
  running.notes.push({ text, at: Date.now() });
  $("noteInput").value = "";
  await save({ running }); load();
};
$("clear").onclick = async () => {
  const { history = [] } = await chrome.storage.local.get("history");
  if (!history.length) return alert(t("p_emptyAlready"));
  const ok = prompt(t("p_clearPrompt", { n: history.length, word: t("clearWord") }));
  if (ok !== t("clearWord")) return;
  downloadJson(history);                       // 1) sauvegarde sur le disque
  await save({ historyBackup: history });      // 2) copie de secours dans l'extension
  await save({ history: [] }); load();
};
$("restore").onclick = async () => {
  const { historyBackup = [], history = [] } = await chrome.storage.local.get(["historyBackup", "history"]);
  if (!confirm(t("p_restoreConfirm", { n: historyBackup.length }))) return;
  const ids = new Set(history.map((e) => e.start + "|" + e.end));
  const merged = [...history, ...historyBackup.filter((e) => !ids.has(e.start + "|" + e.end))]
    .sort((a, b) => a.start - b.start);
  await save({ history: merged });
  await chrome.storage.local.remove("historyBackup"); load();
};
$("export").onclick = async () => {
  const { history = [] } = await chrome.storage.local.get("history");
  downloadCsv(history);
};
$("cfg").onclick = () => chrome.runtime.openOptionsPage();
$("dash").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });

detect().then(load);

// ---- Changements de statut (onglet History de Jira) ----
// Exécuté dans la page. force=true : ouvre l'onglet History s'il n'est pas actif.
async function scrapeHistory(force) {
  const tab = document.querySelector('[data-testid="issue-activity-feed.ui.buttons.History"]');
  if (!tab) return null;
  if (tab.getAttribute("aria-selected") !== "true") {
    if (!force) return null;
    tab.click();
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [...document.querySelectorAll('[data-testid="issue-history.ui.history-items.transition-history-item.history-item"]')]
    .map((li) => {
      const lozenges = [...li.querySelectorAll('[data-testid="common-components-status-lozenge.status-lozenge--text"]')]
        .map((x) => x.textContent.trim());
      const by = li.querySelector('[data-testid$="--name-trigger-container"]');
      const t = li.querySelector("time[datetime]");
      return { by: by ? by.textContent.trim() : "", at: t ? Date.parse(t.getAttribute("datetime")) : 0,
        from: lozenges[0] || "", to: lozenges[1] || "" };
    }).filter((s) => s.at && s.to);
}

async function syncStatuses(force) {
  const msg = $("syncMsg");
  if (!detected) { if (force) msg.textContent = t("p_needTicket"); return; }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeHistory, args: [force] });
    if (!res.result) { if (force) msg.textContent = t("p_noHistTab"); return; }
    const { statusChanges = [] } = await chrome.storage.local.get("statusChanges");
    const seen = new Set(statusChanges.map((s) => `${s.key}|${s.at}|${s.to}`));
    const fresh = res.result.filter((s) => !seen.has(`${detected.key}|${s.at}|${s.to}`))
      .map((s) => ({ ...s, key: detected.key, title: detected.title }));
    await chrome.storage.local.set({ statusChanges: [...statusChanges, ...fresh].sort((a, b) => a.at - b.at) });
    if (force) msg.textContent = t("p_syncDone", { n: fresh.length, m: res.result.length });
  } catch { if (force) msg.textContent = t("p_readFail"); }
}
$("sync").onclick = () => syncStatuses(true);
// synchro silencieuse au démarrage / arrêt si l'onglet History est déjà affiché
const _start = $("start").onclick, _stop = $("stop").onclick;
$("start").onclick = async () => { await _start(); syncStatuses(false); };
$("stop").onclick = async () => { const k = running && running.key; await _stop(); if (detected && detected.key === k) syncStatuses(false); };
