const me = document.getElementById("me"), msg = document.getElementById("msg");
chrome.storage.local.get("settings", ({ settings = {} }) => { me.value = settings.me || ""; });
document.getElementById("f").onsubmit = async (e) => {
  e.preventDefault();
  const { settings = {} } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({ settings: { ...settings, me: me.value.trim() } });
  msg.textContent = "Enregistré ✔";
};
