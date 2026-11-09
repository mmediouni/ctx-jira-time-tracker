let history = [], running = null;
let settings = { target: 7.5, from: "08:00", to: "18:00" };
let day = ymd(Date.now());
const H = 3600000, MIN = 60000;

const at = (d, hm) => new Date(`${d}T${hm}`).getTime();
const addDays = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return ymd(x); };
const mondayOf = (d) => { const x = new Date(d + "T12:00:00"); return addDays(d, -((x.getDay() + 6) % 7)); };
const dur = (e) => e.end - e.start;
const sum = (a) => a.reduce((t, e) => t + dur(e), 0);

// Historique + session en cours (comptée jusqu'à maintenant)
const all = () => running ? [...history, { ...running, end: Date.now(), running: true }] : history;
const ofDay = (d) => all().filter((e) => ymd(e.start) === d).sort((a, b) => a.start - b.start);

async function load() {
  const d = await chrome.storage.local.get(["history", "running", "settings"]);
  history = d.history || []; running = d.running || null;
  settings = { ...settings, ...(d.settings || {}) };
  render();
}

function render() {
  $("day").value = day;
  $("target").value = settings.target; $("from").value = settings.from; $("to").value = settings.to;
  const es = ofDay(day), total = sum(es), target = settings.target * H, miss = target - total;
  $("cTotal").textContent = fmtHM(total);
  $("cTarget").textContent = fmtHM(target);
  $("cCount").textContent = es.length;
  $("cMissCard").className = "card " + (miss > 0 ? "bad" : "good");
  $("cMissLabel").textContent = miss > 0 ? "Manquant" : "Dépassement";
  $("cMiss").textContent = fmtHM(Math.abs(miss));
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
  h += es.map((e) => `<div class="blk ${e.running ? "running" : e.manual ? "manual" : ""}"
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
    `<li>${hhmm(s)} → ${hhmm(e)} (${fmtHM(e - s)})</li>`).join("") || "<li style='color:#1e8e3e'>Aucun trou 👍</li>";
}

function renderEntries(es) {
  $("entries").innerHTML = es.map((e) => `
    <div class="entry ${e.manual ? "manual" : ""}">
      ${e.running ? "" : `<button class="del" data-s="${e.start}" data-e="${e.end}" title="Supprimer">✕</button>`}
      <span class="dur">${fmtHM(dur(e))}</span>
      <b>${esc(e.key || "Hors Jira")}</b> ${esc(e.title)}${e.running ? " (en cours)" : ""}
      <div class="t">${hhmm(e.start)} → ${e.running ? "…" : hhmm(e.end)}</div>
      ${e.notes.map((n) => `<div class="n">• [${hhmm(n.at)}] ${esc(n.text)}</div>`).join("")}
    </div>`).join("") || "<small>Aucune session ce jour.</small>";
}

function renderStats() {
  const mon = mondayOf(day), days = [...Array(7)].map((_, i) => addDays(mon, i));
  const per = days.map((d) => sum(ofDay(d)));
  const weekTotal = per.reduce((a, b) => a + b, 0);
  const month = day.slice(0, 7);
  const mEs = all().filter((e) => ymd(e.start).startsWith(month));
  const activeDays = new Set(mEs.map((e) => ymd(e.start))).size;
  const wEs = days.flatMap(ofDay);
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
$("export").onclick = () => downloadCsv(history);
["target", "from", "to"].forEach((id) => $(id).onchange = () => {
  settings = { target: parseFloat($("target").value) || 0, from: $("from").value || "08:00", to: $("to").value || "18:00" };
  chrome.storage.local.set({ settings }); render();
});
document.addEventListener("click", (ev) => {
  const bar = ev.target.closest(".bar");
  if (bar) { day = bar.dataset.d; render(); return; }
  const del = ev.target.closest(".del");
  if (del && confirm("Supprimer cette session ?")) {
    const i = history.findIndex((e) => e.start == del.dataset.s && e.end == del.dataset.e);
    if (i >= 0) { history.splice(i, 1); chrome.storage.local.set({ history }); render(); }
  }
});
$("manual").onsubmit = (ev) => {
  ev.preventDefault();
  const start = at(day, $("mStart").value), end = at(day, $("mEnd").value);
  if (!(end > start)) { $("mErr").textContent = "La fin doit être après le début."; return; }
  $("mErr").textContent = "";
  const note = $("mNote").value.trim();
  history.push({
    key: $("mKey").value.trim(), title: $("mTitle").value.trim(), manual: true, start, end,
    notes: note ? [{ text: note, at: start }] : [],
  });
  history.sort((a, b) => a.start - b.start);
  chrome.storage.local.set({ history });
  $("manual").reset(); render();
};

chrome.storage.onChanged.addListener(load);
setInterval(() => running && render(), 30000);
load();
