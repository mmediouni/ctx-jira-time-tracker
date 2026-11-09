const $ = (id) => document.getElementById(id);
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

const fmt = (ms) => {
  const s = Math.floor(ms / 1000), p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
};
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const save = (o) => chrome.storage.local.set(o);

async function detect() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeTicket });
    detected = res && res.result;
  } catch { detected = null; }
}

async function load() {
  const d = await chrome.storage.local.get(["running", "history"]);
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
      `<li>${esc(n.text)} <small>${new Date(n.at).toLocaleTimeString()}</small></li>`).join("");
  }
  $("history").innerHTML = history.slice().reverse().map((e) => `
    <div class="entry"><span class="dur">${fmt(e.end - e.start)}</span>
      <b>${esc(e.key)}</b> ${esc(e.title)}
      <div class="t">${new Date(e.start).toLocaleString()}</div>
      ${e.notes.map((n) => `<div class="n">• ${esc(n.text)}</div>`).join("")}
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
  if (confirm("Supprimer tout l'historique ?")) { await save({ history: [] }); load(); }
};
$("export").onclick = async () => {
  const { history = [] } = await chrome.storage.local.get("history");
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = ["ticket,titre,debut,fin,duree,notes", ...history.map((e) =>
    [e.key, e.title, new Date(e.start).toISOString(), new Date(e.end).toISOString(),
      fmt(e.end - e.start), e.notes.map((n) => n.text).join(" | ")].map(q).join(","))];
  const url = URL.createObjectURL(new Blob(["﻿" + rows.join("\n")], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: "jira-time.csv" }).click();
};

detect().then(load);
