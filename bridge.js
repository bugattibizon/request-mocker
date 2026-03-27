// Runs in the ISOLATED world — has access to chrome APIs.
// Reads storage and pushes state into the page via a CustomEvent.
function sync() {
  chrome.storage.local.get({ rules: [], enabled: true, injectHeaders: [] }, (data) => {
    window.dispatchEvent(new CustomEvent('__RM_sync', { detail: data }));
  });
}

sync();
chrome.storage.onChanged.addListener(sync);

// Forward captures from the interceptor (main world) to storage so the DevTools panel
// can display them. postMessage is used because CustomEvent.detail crosses the
// main↔isolated world boundary as a non-serializable proxy.
window.addEventListener('message', function(e) {
  if (e.source !== window || !e.data || e.data.__RM !== 'capture') return;
  chrome.storage.local.set({ lastCapture: { item: e.data.item, ts: e.data.ts } });
});
