// bridge.js — runs in ISOLATED world, pushes storage state into page context
function pushToPage() {
  chrome.storage.local.get({ rules: [], enabled: true }, data => {
    window.dispatchEvent(new CustomEvent('__RM_sync', { detail: data }));
  });
}
pushToPage();
chrome.storage.onChanged.addListener(pushToPage);