// Affiche sur l'icône qu'un chrono tourne.
function refreshBadge() {
  chrome.storage.local.get("running", ({ running }) => {
    chrome.action.setBadgeText({ text: running ? "●" : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  });
}
chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.storage.onChanged.addListener((c) => { if (c.running) refreshBadge(); });
