// Runs in the ISOLATED world — has access to chrome APIs.
// Reads storage and pushes state into the page via a CustomEvent.
function sync() {
  chrome.storage.local.get({ rules: [], enabled: true, injectHeaders: [] }, (data) => {
    window.dispatchEvent(new CustomEvent('__RM_sync', { detail: data }));
  });
}

sync();
chrome.storage.onChanged.addListener(sync);

// Forward real-request captures from the interceptor (MAIN world) to storage.
// postMessage is used because CustomEvent.detail from the MAIN world arrives as a
// cross-context proxy that chrome.storage.local.set() cannot serialize.
window.addEventListener('message', function(e) {
  if (e.source !== window || !e.data || e.data.__RM !== 'capture') return;
  chrome.storage.local.set({ lastCapture: { item: e.data.item, ts: e.data.ts } });
});
