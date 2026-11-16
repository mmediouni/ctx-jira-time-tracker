const $s = (id) => document.getElementById(id);
const getSettings = async () => (await chrome.storage.local.get("settings")).settings || {};
const patchSettings = async (p) => chrome.storage.local.set({ settings: { ...(await getSettings()), ...p } });

// --- language (display only: no stored data depends on it) ---
$s("lang").innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$s("lang").onchange = async () => { await patchSettings({ lang: $s("lang").value }); setLang($s("lang").value); renderMeetings(); };

// --- user ---
$s("f").onsubmit = async (e) => {
  e.preventDefault();
  await patchSettings({ me: $s("me").value.trim() });
  $s("msg").textContent = t("o_saved");
};

// --- statuses ---
$s("f2").onsubmit = async (e) => {
  e.preventDefault();
  await patchSettings({ statuses: $s("statuses").value.split(",").map((s) => s.trim()).filter(Boolean) });
  $s("msg2").textContent = t("o_saved");
};

// --- meetings ---
async function meetings() { return (await getSettings()).meetings || []; }
async function saveMeetings(list) { await patchSettings({ meetings: list }); renderMeetings(); }
async function renderMeetings() {
  const list = await meetings(), box = $s("meetings");
  box.innerHTML = "";
  list.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "nrow";
    row.innerHTML = '<input type="color"><span style="flex:1"></span><button type="button">✕</button>';
    row.querySelector("input").value = m.color;
    row.querySelector("span").textContent = m.name;
    row.querySelector("input").onchange = (e) => saveMeetings(list.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)));
    row.querySelector("button").onclick = () => saveMeetings(list.filter((_, j) => j !== i));
    box.append(row);
  });
  if (!list.length) box.innerHTML = `<small>${t("o_noMeeting")}</small>`;
}
$s("f3").onsubmit = async (e) => {
  e.preventDefault();
  const name = $s("mName").value.trim();
  const list = await meetings();
  if (list.some((m) => m.name.toLowerCase() === name.toLowerCase())) return alert(t("o_dupMeeting"));
  $s("mName").value = "";
  saveMeetings([...list, { name, color: $s("mColor").value }]);
};

(async () => {
  const s = await getSettings();
  setLang(s.lang);
  $s("lang").value = LANG;
  $s("me").value = s.me || "";
  $s("statuses").value = (s.statuses || ["In Test"]).join(", ");
  renderMeetings();
})();
