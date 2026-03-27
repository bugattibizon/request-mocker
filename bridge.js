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
// can display them. The interceptor dispatches __RM_capture with the real response body,
// which is more reliable than the DevTools getContent() API for compressed responses.
window.addEventListener('__RM_capture', function(e) {
  chrome.storage.local.set({ lastCapture: e.detail });
});
