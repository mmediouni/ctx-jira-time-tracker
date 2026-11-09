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
  const d = await chrome.storage.local.get(["running", "history", "historyBackup"]);
  $("restore").hidden = !(d.historyBackup && d.historyBackup.length);
  running = d.running || null;
  render(d.history || []);
}

function render(history) {
  const t = running || detected;
  $("curLabel").textContent = running ? "En cours" : "Ticket détecté";
  $("key").textContent = t ? t.key : "—";
  $("title").textContent = t ? t.title : "Aucun ticket Jira détecté sur cet onglet";
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
      <b>${esc(e.key)}</b> ${esc(e.title)}
      <div class="t">${new Date(e.start).toLocaleDateString()} ${hhmm(e.start)} → ${hhmm(e.end)}</div>
      ${e.notes.map((n) => `<div class="n">• [${hhmm(n.at)}] ${esc(n.text)}</div>`).join("")}
    </div>`).join("") || "<small>Aucune session.</small>";
}

$("start").onclick = async () => {
  if (!detected) return;
  running = { ...detected, start: Date.now(), notes: [] };
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
  if (!history.length) return alert("L'historique est déjà vide.");
  const ok = prompt(
    `Tu vas supprimer ${history.length} session(s).\n` +
    "Une sauvegarde (.json) sera téléchargée et gardée dans l'extension.\n\n" +
    "Tape VIDER pour confirmer :");
  if (ok !== "VIDER") return;
  downloadJson(history);                       // 1) sauvegarde sur le disque
  await save({ historyBackup: history });      // 2) copie de secours dans l'extension
  await save({ history: [] }); load();
};
$("restore").onclick = async () => {
  const { historyBackup = [], history = [] } = await chrome.storage.local.get(["historyBackup", "history"]);
  if (!confirm(`Restaurer ${historyBackup.length} session(s) sauvegardée(s) ?`)) return;
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
$("dash").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });

detect().then(load);
