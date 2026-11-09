const me = document.getElementById("me"), msg = document.getElementById("msg");
chrome.storage.local.get("settings", ({ settings = {} }) => { me.value = settings.me || ""; });
document.getElementById("f").onsubmit = async (e) => {
  e.preventDefault();
  const { settings = {} } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({ settings: { ...settings, me: me.value.trim() } });
  msg.textContent = "Enregistré ✔";
};

const st = document.getElementById("statuses");
chrome.storage.local.get("settings", ({ settings = {} }) => { st.value = (settings.statuses || ["In Test"]).join(", "); });
document.getElementById("f2").onsubmit = async (e) => {
  e.preventDefault();
  const { settings = {} } = await chrome.storage.local.get("settings");
  const statuses = st.value.split(",").map((s) => s.trim()).filter(Boolean);
  await chrome.storage.local.set({ settings: { ...settings, statuses } });
  document.getElementById("msg2").textContent = "Enregistré ✔";
};
