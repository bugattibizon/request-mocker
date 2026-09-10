// Runs in the ISOLATED world — has access to chrome APIs.
// Reads storage and pushes state into the page via a CustomEvent.

// After the extension is reloaded/updated, content scripts already injected in open
// tabs keep running but lose their extension context — any chrome.* call then throws
// "Extension context invalidated". alive() detects that so we no-op instead of
// surfacing an uncaught error (pages like Google Docs post messages constantly).
function alive() {
  try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}

function sync() {
  if (!alive()) return;
  try {
    chrome.storage.local.get({ rules: [], enabled: true, injectHeaders: [], branchMode: { enabled: false, from: '', to: '', origin: '' } }, (data) => {
      if (chrome.runtime && chrome.runtime.lastError) return;
      window.dispatchEvent(new CustomEvent('__RM_sync', { detail: data }));
    });
  } catch (e) { /* context invalidated */ }
}

sync();
// Re-sync only when config actually changes. Ignore transient keys like
// lastCapture (written on every captured request) to avoid a re-sync storm
// that rebuilds the interceptor caches on every request.
try {
  chrome.storage.onChanged.addListener(function(changes) {
    if (changes.rules || changes.enabled || changes.injectHeaders || changes.branchMode) sync();
  });
} catch (e) { /* context invalidated */ }

// Forward real-request captures from the interceptor (MAIN world) to storage.
// postMessage is used because CustomEvent.detail from the MAIN world arrives as a
// cross-context proxy that chrome.storage.local.set() cannot serialize.
window.addEventListener('message', function(e) {
  if (e.source !== window || !e.data || e.data.__RM !== 'capture') return;
  if (!alive()) return; // stale content script after an extension reload — ignore
  try {
    chrome.storage.local.set({ lastCapture: { item: e.data.item, ts: e.data.ts } });
  } catch (err) { /* context invalidated */ }
});
