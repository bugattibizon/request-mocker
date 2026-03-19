// background.js — initializes extension storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ rules: [], enabled: true }, d =>
    chrome.storage.local.set({ rules: d.rules, enabled: d.enabled })
  );
});