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
    chrome.storage.local.get({ rules: [], enabled: true, injectHeaders: [], branchMode: { enabled: false, from: '', to: '', cookieAuth: false } }, (data) => {
      if (chrome.runtime && chrome.runtime.lastError) return;
      window.dispatchEvent(new CustomEvent('__RM_sync', { detail: data }));
      stampOrigin(data);
    });
  } catch (e) { /* context invalidated */ }
}

// Record this page's real origin so background.js can build exact-origin credentialed
// CORS headers for Branch Mode redirects. This is the actual request initiator origin —
// far more reliable than "the active tab", which may be a different tab when a
// background token-refresh fires (that mismatch produced a CORS error on refresh).
// Top frame only; only while Branch Mode is on.
//
// IMPORTANT: never stamp the backend (From/To) host as the app origin. Auth flows may
// briefly load the API host as the top document (e.g. an OAuth redirect); stamping it
// would set ACAO to the backend's own origin and break the next credentialed request
// (the refresh preflight then fails: ACAO "https://<to-host>" != the app origin).
var _lastOrigin = null;
function bmHost(v) {
  try { return new URL(/^https?:\/\//.test(v) ? v : 'https://' + v).hostname; } catch (e) { return ''; }
}
function stampOrigin(data) {
  try {
    if (window.top !== window.self) return;
    var bm = data && data.branchMode;
    if (!bm || !bm.enabled) return;
    var h = location.hostname;
    if (h && (h === bmHost(bm.from) || h === bmHost(bm.to))) return; // backend host — not the app
    var origin = location.origin;
    if (!/^https?:/.test(origin) || origin === _lastOrigin) return;
    _lastOrigin = origin;
    if (!alive()) return;
    chrome.storage.local.set({ appOrigin: origin });
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
