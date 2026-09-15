// Updates the toolbar badge to show active rule count, or "off" when disabled.
function updateBadge(data) {
  const enabled = data.enabled !== false;
  if (!enabled) {
    chrome.action.setBadgeText({ text: 'off' });
    chrome.action.setBadgeBackgroundColor({ color: '#888888' });
    return;
  }
  const activeRules   = (data.rules         || []).filter(r => r.enabled).length;
  const activeHeaders = (data.injectHeaders  || []).filter(h => h.enabled).length;
  const bm            = data.branchMode || {};
  const activeBranch  = (bm.enabled && bm.from && bm.to) ? 1 : 0;
  const activeJenkins = (data.jenkinsTheme && data.jenkinsTheme.enabled) ? 1 : 0;
  const total = activeRules + activeHeaders + activeBranch + activeJenkins;
  if (total > 0) {
    chrome.action.setBadgeText({ text: String(total) });
    chrome.action.setBadgeBackgroundColor({ color: '#1090D4' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Runs once on install — seeds storage with empty defaults.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ rules: [], enabled: true, injectHeaders: [], branchMode: { enabled: false, from: "", to: "" }, jenkinsTheme: { enabled: false } }, (data) => {
    chrome.storage.local.set({ rules: data.rules, enabled: data.enabled, injectHeaders: data.injectHeaders });
    updateBadge(data);
  });
});

// Keep badge in sync with storage changes.
chrome.storage.onChanged.addListener(() => {
  chrome.storage.local.get({ rules: [], enabled: true, injectHeaders: [], branchMode: { enabled: false, from: "", to: "" }, jenkinsTheme: { enabled: false } }, updateBadge);
});

// ── Branch Mode: make the redirected request pass the target's origin gate ────
// The redirected request still carries the page's real Origin (a browser-controlled
// "forbidden header" the interceptor can't touch). Some backends reject it at the app
// level ({"errors":{"origin":["is blocked or not available"]}}) while their CORS layer
// *echoes* the request Origin into Access-Control-Allow-Origin. Network-level
// declarativeNetRequest rules for the target host bridge this, in one universal mode:
//
//  • Strip Origin + Referer on the actual request (non-OPTIONS) so an app with an
//    origin allowlist accepts it like an origin-less Postman call (the preflight is
//    left untouched).
//  • Force ACAO=<active tab origin> + Access-Control-Allow-Credentials: true on EVERY
//    response (incl. the preflight, which the server won't mark credentialed on its
//    own). Since the extension synthesizes these headers itself, the redirect always
//    runs credentialed: cookie auth gets its Set-Cookie stored / cookies sent, and
//    token auth is simply unaffected by the extra cookies. The origin is read live
//    from the active tab, never typed by the user.
const ORIGIN_RULE_ID  = 8801; // request-header strip (non-OPTIONS)
const ORIGIN_RULE_ID2 = 8802; // response CORS headers (credentialed mode)

// The extension drives a single active tab, so the origin credentialed CORS needs is
// just that tab's origin — read it live. host_permissions:<all_urls> lets us see
// tab.url without the "tabs" permission.
function activeTabOrigin(cb) {
  try {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      let origin = '';
      try { origin = tabs && tabs[0] && tabs[0].url ? new URL(tabs[0].url).origin : ''; } catch (e) {}
      if (!/^https?:/.test(origin)) origin = ''; // ignore chrome://, the popup, blank tabs
      cb(origin);
    });
  } catch (e) { cb(''); }
}

function bmHost(v) {
  try { return new URL(/^https?:\/\//.test(v) ? v : 'https://' + v).hostname; } catch (e) { return ''; }
}

// Resolve the app origin for credentialed CORS: prefer the origin the page itself
// stamped (bridge.js) — that is the true request initiator, so it stays correct even
// when a background refresh fires while another tab is focused. Fall back to the active
// tab only before the app page has stamped anything. Reject any origin that is actually
// a backend (From/To) host — the app origin is never the API host, and using it would
// set ACAO to the backend's own origin and break the credentialed preflight.
function resolveAppOrigin(stamped, backendHosts, cb) {
  const ok = (o) => o && /^https?:/.test(o) && backendHosts.indexOf(new URL(o).hostname) === -1;
  if (ok(stamped)) { cb(stamped); return; }
  activeTabOrigin((o) => cb(ok(o) ? o : ''));
}

function syncOriginRule() {
  chrome.storage.local.get({ enabled: true, branchMode: { enabled: false, from: '', to: '', cookieAuth: false }, appOrigin: '' }, (d) => {
    const bm = d.branchMode || {};
    const clear = () => chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ORIGIN_RULE_ID, ORIGIN_RULE_ID2] }).catch(() => {});
    if (d.enabled === false || !bm.enabled || !bm.to) { clear(); return; }
    let host;
    try { host = new URL(/^https?:\/\//.test(bm.to) ? bm.to : 'https://' + bm.to).hostname; }
    catch (e) { clear(); return; }

    // Strip Origin/Referer on the actual (non-OPTIONS) request so a backend with an
    // origin allowlist accepts the rerouted request. This is a REQUEST-header edit,
    // which DNR applies reliably (unlike response edits on the preflight).
    const stripReq = {
      id: ORIGIN_RULE_ID, priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [
        { header: 'origin',  operation: 'remove' },
        { header: 'referer', operation: 'remove' }
      ]},
      condition: { requestDomains: [host], excludedRequestMethods: ['options'], resourceTypes: ['xmlhttprequest'] }
    };

    if (!bm.cookieAuth) {
      // Default (non-credentialed): the request is not credentialed, so the backend's
      // own Access-Control-Allow-Origin (typically `*`) satisfies the browser's CORS
      // check on its own. We do NOT try to rewrite the response — DNR response edits do
      // not reliably apply to the CORS preflight anyway. Just strip the request Origin.
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ORIGIN_RULE_ID, ORIGIN_RULE_ID2],
        addRules: [stripReq]
      }).catch(() => {});
      return;
    }

    // Cookie auth (opt-in): the request is credentialed, so `*` is illegal — the response
    // must carry an exact-origin ACAO + Access-Control-Allow-Credentials. That relies on
    // DNR rewriting the response (incl. preflight), which is less reliable; only used when
    // the user explicitly needs cookies.
    const backendHosts = [host, bmHost(bm.from)].filter(Boolean);
    resolveAppOrigin(d.appOrigin, backendHosts, (appOrigin) => {
      // Can't resolve a valid app origin right now — keep whatever rule is installed
      // rather than clobbering a working setup with a broken one.
      if (!appOrigin) return;
      const corsRule = {
        id: ORIGIN_RULE_ID2, priority: 1,
        action: { type: 'modifyHeaders', responseHeaders: [
          { header: 'access-control-allow-origin',      operation: 'set', value: appOrigin },
          { header: 'access-control-allow-credentials', operation: 'set', value: 'true' },
          { header: 'access-control-max-age',           operation: 'set', value: '0' }
        ]},
        condition: { requestDomains: [host], resourceTypes: ['xmlhttprequest'] }
      };
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ORIGIN_RULE_ID, ORIGIN_RULE_ID2],
        addRules: [stripReq, corsRule]
      }).catch(() => {});
    });
  });
}

chrome.runtime.onInstalled.addListener(syncOriginRule);
chrome.runtime.onStartup.addListener(syncOriginRule);
// Rebuild the rule on config changes and when the page re-stamps its origin (bridge.js).
// We intentionally do NOT rebuild on tab activation: the app origin comes from the page
// itself, so switching tabs must not repoint ACAO at whatever tab is now focused.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.branchMode || changes.enabled || changes.appOrigin) syncOriginRule();
});

// Signal the DevTools panel to clear when the inspected tab navigates.
// chrome.devtools.network.onNavigated is unreliable in devtools pages;
// chrome.tabs.onUpdated fires reliably from the background with no extra permissions.
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
  if (changeInfo.status !== 'loading') return;
  chrome.storage.local.get({ devtoolsTabId: -1 }, function(d) {
    if (d.devtoolsTabId === tabId) {
      chrome.storage.local.set({ panelNavigated: Date.now() });
    }
  });
});

