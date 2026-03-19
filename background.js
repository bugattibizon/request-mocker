// Runs once on install — seeds storage with empty defaults
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ rules: [], enabled: true }, (data) => {
    chrome.storage.local.set({ rules: data.rules, enabled: data.enabled });
  });
});
