// Runs in the ISOLATED world — has access to chrome APIs.
// Reads storage and pushes state into the page via a CustomEvent.
function sync() {
  chrome.storage.local.get({ rules: [], enabled: true, injectHeaders: [] }, (data) => {
    window.dispatchEvent(new CustomEvent('__RM_sync', { detail: data }));
  });
}

sync();
chrome.storage.onChanged.addListener(sync);
