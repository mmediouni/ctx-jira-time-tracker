let history = [], running = null, statusChanges = [];
let settings = { target: 7.5, from: "08:00", to: "18:00" };
let day = ymd(Date.now());
const H = 3600000, MIN = 60000;

const at = (d, hm) => new Date(`${d}T${hm}`).getTime();
const addDays = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return ymd(x); };
const mondayOf = (d) => { const x = new Date(d + "T12:00:00"); return addDays(d, -((x.getDay() + 6) % 7)); };
const dur = (e) => e.end - e.start;
const work = (a) => a.filter((e) => !e.pause);          // la pause ne compte pas comme du travail
const sum = (a) => work(a).reduce((t, e) => t + dur(e), 0);

// Historique + session en cours (comptée jusqu'à maintenant)
const all = () => running ? [...history, { ...running, end: Date.now(), running: true }] : history;
const ofDay = (d) => all().filter((e) => ymd(e.start) === d).sort((a, b) => a.start - b.start);

async function load() {
  const d = await chrome.storage.local.get(["history", "running", "settings", "statusChanges"]);
  statusChanges = d.statusChanges || [];
  history = d.history || []; running = d.running || null;
  settings = { ...settings, ...(d.settings || {}) };
  // identifiant stable pour pouvoir éditer / supprimer
  if (history.some((e) => !e.id)) {
    history.forEach((e) => { if (!e.id) e.id = crypto.randomUUID(); });
    chrome.storage.local.set({ history });
  }
  if (!$("editor").open) render();
}

function render() {
  $("day").value = day;
  $("target").value = settings.target; $("from").value = settings.from; $("to").value = settings.to;
  const es = ofDay(day), total = sum(es), target = settings.target * H, miss = target - total;
  $("cTotal").textContent = fmtHM(total);
  $("cTarget").textContent = fmtHM(target);
  $("cCount").textContent = work(es).length;
  $("cMissCard").className = "card " + (miss > 0 ? "bad" : "good");
  $("cMissLabel").textContent = miss > 0 ? "Manquant" : "Dépassement";
  $("cMiss").textContent = fmtHM(Math.abs(miss));
  renderStatuses();
  renderTimeline(es);
  renderEntries(es);
  renderStats();
}

function renderTimeline(es) {
  const ws = at(day, settings.from), we = at(day, settings.to);
  const lo = Math.min(ws, ...es.map((e) => e.start)), hi = Math.max(we, ...es.map((e) => e.end));
  const pct = (t) => ((t - lo) / (hi - lo)) * 100;
  let h = "";
  if (lo < ws) h += `<div class="win" style="left:0;width:${pct(ws)}%"></div>`;
  if (hi > we) h += `<div class="win" style="left:${pct(we)}%;right:0"></div>`;
  h += es.map((e) => `<div class="blk ${e.running ? "running" : e.pause ? "pause" : e.manual ? "manual" : ""}"
    style="left:${pct(e.start)}%;width:${Math.max(0.4, pct(e.end) - pct(e.start))}%"
    title="${esc(e.key || "Hors Jira")} ${hhmm(e.start)}–${hhmm(e.end)}"></div>`).join("");
  for (let t = Math.ceil(lo / H) * H; t <= hi; t += H)
    h += `<div class="tick" style="left:${pct(t)}%">${hhmm(t)}</div>`;
  $("timeline").innerHTML = h;

  // Trous dans la plage de travail (plafonnée à maintenant si aujourd'hui)
  const cap = Math.min(we, day === ymd(Date.now()) ? Date.now() : we);
  const merged = [];
  es.map((e) => [e.start, e.end]).forEach(([s, e]) => {
    const l = merged[merged.length - 1];
    if (l && s <= l[1]) l[1] = Math.max(l[1], e); else merged.push([s, e]);
  });
  const gaps = []; let cur = ws;
  for (const [s, e] of merged) { if (s - cur >= 5 * MIN && s <= cap) gaps.push([cur, Math.min(s, cap)]); cur = Math.max(cur, e); }
  if (cap - cur >= 5 * MIN) gaps.push([cur, cap]);
  $("gaps").innerHTML = gaps.map(([s, e]) =>
    `<li class="gap" data-s="${s}" data-e="${e}" title="Cliquer pour remplir le formulaire">${hhmm(s)} → ${hhmm(e)} (${fmtHM(e - s)}) ＋</li>`).join("") || "<li style='color:#1e8e3e'>Aucun trou 👍</li>";
}

function renderEntries(es) {
  $("entries").innerHTML = es.map((e) => `
    <div class="entry ${e.pause ? "pause" : e.manual ? "manual" : ""}">
      ${e.running ? "" : `<button class="del" data-id="${e.id}" title="Supprimer">✕</button>
      <button class="edit" data-id="${e.id}" title="Modifier">✎</button>`}
      <span class="dur">${fmtHM(dur(e))}</span>
      <b>${esc(e.pause ? "Pause" : e.key || "Hors Jira")}</b> ${esc(e.title)}${e.running ? " (en cours)" : ""}
      <div class="t">${hhmm(e.start)} → ${e.running ? "…" : hhmm(e.end)}</div>
      ${e.notes.map((n) => `<div class="n">• [${hhmm(n.at)}] ${esc(n.text)}</div>`).join("")}
    </div>`).join("") || "<small>Aucune session ce jour.</small>";
}

function renderStats() {
  const mon = mondayOf(day), days = [...Array(7)].map((_, i) => addDays(mon, i));
  const per = days.map((d) => sum(ofDay(d)));
  const weekTotal = per.reduce((a, b) => a + b, 0);
  const month = day.slice(0, 7);
  const mEs = work(all()).filter((e) => ymd(e.start).startsWith(month));
  const activeDays = new Set(mEs.map((e) => ymd(e.start))).size;
  const wEs = work(days.flatMap(ofDay));
  const manualShare = weekTotal ? sum(wEs.filter((e) => e.manual)) / weekTotal : 0;
  const longest = Math.max(0, ...mEs.map(dur));
  const card = (l, v) => `<div class="card"><span>${l}</span><b>${v}</b></div>`;
  $("stats").innerHTML =
    card("Semaine", fmtHM(weekTotal)) +
    card("Mois", fmtHM(sum(mEs))) +
    card("Moyenne / jour actif", fmtHM(activeDays ? sum(mEs) / activeDays : 0)) +
    card("Plus longue session", fmtHM(longest)) +
    card("Hors Jira (semaine)", Math.round(manualShare * 100) + " %");

  const max = Math.max(settings.target * H, ...per, 1);
  const names = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  $("week").innerHTML = `<div class="bars">${days.map((d, i) => `
    <div class="bar ${d === day ? "sel" : ""}" data-d="${d}">
      <small>${per[i] ? fmtHM(per[i]) : ""}</small>
      <i style="height:${(per[i] / max) * 100}px"></i>${names[i]}
    </div>`).join("")}</div>
    <small>Objectif : ${settings.target} h/jour</small>`;

  const byKey = {};
  wEs.forEach((e) => { const k = (e.key || "Hors Jira") + " " + e.title; byKey[k] = (byKey[k] || 0) + dur(e); });
  const top = Object.entries(byKey).sort((a, b) => b[1] - a[1]).slice(0, 8);
  $("top").innerHTML = top.map(([k, v]) => `
    <div class="hbar">${esc(k)} <b>${fmtHM(v)}</b>
      <div style="width:${(v / top[0][1]) * 100}%"></div></div>`).join("") || "<small>Rien cette semaine.</small>";
}

// --- événements ---
$("day").onchange = (e) => { if (e.target.value) { day = e.target.value; render(); } };
$("prev").onclick = () => { day = addDays(day, -1); render(); };
$("next").onclick = () => { day = addDays(day, 1); render(); };
$("today").onclick = () => { day = ymd(Date.now()); render(); };
$("config").onclick = () => chrome.runtime.openOptionsPage();
$("export").onclick = () => downloadCsv(history);
["target", "from", "to"].forEach((id) => $(id).onchange = () => {
  settings = { ...settings, target: parseFloat($("target").value) || 0, from: $("from").value || "08:00", to: $("to").value || "18:00" };
  chrome.storage.local.set({ settings }); render();
});
document.addEventListener("click", (ev) => {
  const bar = ev.target.closest(".bar");
  if (bar) { day = bar.dataset.d; render(); return; }
  const del = ev.target.closest(".del");
  if (del && confirm("Supprimer cette session ?")) removeEntry(del.dataset.id);
  const gap = ev.target.closest(".gap");
  if (gap) {
    dateTouched = true; $("mDate").value = day;
    setPause(false);
    $("mStart").value = hhmm(+gap.dataset.s); $("mEnd").value = hhmm(+gap.dataset.e);
    $("manual").scrollIntoView({ behavior: "smooth", block: "center" });
    $("mTitle").focus();
  }
  const ed = ev.target.closest(".edit");
  if (ed) openEditor(history.find((e) => e.id === ed.dataset.id));
});
function removeEntry(id) {
  history = history.filter((e) => e.id !== id);
  chrome.storage.local.set({ history }); render();
}

// --- ajout manuel (hors Jira ou anciens tickets, n'importe quelle date) ---
let dateTouched = false;
$("mDate").oninput = () => (dateTouched = true);
const syncDate = () => { if (!dateTouched) $("mDate").value = day; };
const _render = render;
render = function () {
  _render(); syncDate();
  $("keys").innerHTML = [...new Set(history.map((e) => e.key).filter(Boolean))]
    .map((k) => `<option value="${esc(k)}">`).join("");
};
// --- pause déjeuner : 1 h par défaut, début et fin au choix ---
let pauseMode = false;
function setPause(on) {
  pauseMode = on;
  $("pauseBtn").classList.toggle("on", on);
  $("manual").classList.toggle("pausing", on);
  if (on) {
    $("mTitle").value = "Pause déjeuner"; $("mKey").value = "";
    if (!$("mStart").value) $("mStart").value = "12:00";
    setPauseEnd();
    $("mStart").focus();
  } else if ($("mTitle").value === "Pause déjeuner") $("mTitle").value = "";
}
function setPauseEnd() {
  const [h, m] = $("mStart").value.split(":").map(Number);
  const t = h * 60 + m + 60;
  $("mEnd").value = `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
}
$("pauseBtn").onclick = () => setPause(!pauseMode);
$("mStart").oninput = () => { if (pauseMode && $("mStart").value) setPauseEnd(); };  // fin = début + 1 h, ajustable ensuite

$("mKey").onchange = () => {   // retrouve le titre d'un ticket déjà connu
  const k = $("mKey").value.trim().toUpperCase();
  const known = history.slice().reverse().find((e) => e.key === k);
  if (known && !$("mTitle").value) $("mTitle").value = known.title;
  $("mKey").value = k;
};
$("manual").onsubmit = (ev) => {
  ev.preventDefault();
  const d = $("mDate").value || day;
  const start = at(d, $("mStart").value), end = at(d, $("mEnd").value);
  if (!(end > start)) { $("mErr").textContent = "La fin doit être après le début."; return; }
  $("mErr").textContent = "";
  const note = $("mNote").value.trim();
  history.push({
    id: crypto.randomUUID(),
    key: pauseMode ? "" : $("mKey").value.trim(), title: $("mTitle").value.trim(), manual: true, pause: pauseMode, start, end,
    notes: note ? [{ text: note, at: start }] : [],
  });
  history.sort((a, b) => a.start - b.start);
  chrome.storage.local.set({ history });
  day = d; dateTouched = false;
  $("manual").reset(); setPause(false); render();
};

// --- édition d'une session existante ---
let editing = null;
function noteRow(n, d) {
  const r = document.createElement("div");
  r.className = "nrow";
  r.innerHTML = `<input type="time" value="${hhmm(n.at)}"><input class="nt" value="${esc(n.text)}"><button type="button">✕</button>`;
  r.querySelector("button").onclick = () => r.remove();
  return r;
}
function openEditor(e) {
  editing = e;
  $("eKey").value = e.key || ""; $("eTitle").value = e.title || "";
  $("eDate").value = ymd(e.start); $("eStart").value = hhmm(e.start); $("eEnd").value = hhmm(e.end);
  $("eNotes").innerHTML = ""; e.notes.forEach((n) => $("eNotes").append(noteRow(n)));
  $("eErr").textContent = "";
  $("editor").showModal();
}
$("eAddNote").onclick = () => $("eNotes").append(noteRow({ at: Date.now(), text: "" }));
$("eCancel").onclick = () => $("editor").close();
$("eDelete").onclick = () => { if (confirm("Supprimer cette session ?")) { $("editor").close(); removeEntry(editing.id); } };
$("eForm").onsubmit = (ev) => {
  ev.preventDefault();
  const d = $("eDate").value;
  const start = at(d, $("eStart").value);
  let end = at(d, $("eEnd").value);
  if (end <= start) end += 24 * H;            // session passée après minuit
  if (end - start > 16 * H) { $("eErr").textContent = "Durée incohérente (fin avant début ?)."; return; }
  editing.key = $("eKey").value.trim().toUpperCase();
  editing.title = $("eTitle").value.trim();
  editing.start = start; editing.end = end;
  editing.notes = [...$("eNotes").children].map((r) => {
    const [t, x] = r.querySelectorAll("input");
    return { text: x.value.trim(), at: at(d, t.value) };
  }).filter((n) => n.text);
  history.sort((a, b) => a.start - b.start);
  chrome.storage.local.set({ history });
  day = d; $("editor").close(); render();
};

chrome.storage.onChanged.addListener(load);
setInterval(() => running && render(), 30000);
load();

function renderStatuses() {
  const me = (settings.me || "").toLowerCase();
  const list = statusChanges.filter((s) => ymd(s.at) === day && (!me || s.by.toLowerCase() === me));
  $("statuses").innerHTML = list.map((s) => `
    <div class="entry"><span class="dur">${hhmm(s.at)}</span>
      <b>${esc(s.key)}</b> ${esc(s.title || "")}
      <div class="t">${esc(s.from || "?")} → <b>${esc(s.to)}</b>${me ? "" : " · " + esc(s.by)}</div>
    </div>`).join("") ||
    `<small>Aucun changement de statut ce jour${me ? "" : ". Renseigne ton nom dans ⚙ Configuration pour filtrer"}. Dans le popup, clique « Synchroniser les statuts » sur un ticket.</small>`;
}
