// Utilitaires partagés (popup + dashboard)
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
};
const fmtHM = (ms) => {
  const m = Math.round(Math.max(0, ms) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h${pad(m % 60)}` : `${m} min`;
};
const hhmm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ymd = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function downloadCsv(history) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const head = "ticket,titre,date,debut,debut_heure,fin,fin_heure,duree,notes";
  const rows = history.map((e) => [
    e.key || (e.pause ? "PAUSE" : "HORS-JIRA"), e.title, ymd(e.start),
    new Date(e.start).toISOString(), hhmm(e.start),
    new Date(e.end).toISOString(), hhmm(e.end),
    fmt(e.end - e.start),
    e.notes.map((n) => `[${ymd(n.at)} ${hhmm(n.at)}] ${n.text}`).join(" | "),
  ].map(q).join(","));
  const url = URL.createObjectURL(new Blob(["﻿" + [head, ...rows].join("\n")], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: "jira-time.csv" }).click();
}

function downloadJson(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: `jira-time-backup-${ymd(Date.now())}.json` }).click();
}
