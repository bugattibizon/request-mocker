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

function syncOriginRule() {
  chrome.storage.local.get({ enabled: true, branchMode: { enabled: false, from: '', to: '' } }, (d) => {
    const bm = d.branchMode || {};
    const clear = () => chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ORIGIN_RULE_ID, ORIGIN_RULE_ID2] }).catch(() => {});
    if (d.enabled === false || !bm.enabled || !bm.to) { clear(); return; }
    let host;
    try { host = new URL(/^https?:\/\//.test(bm.to) ? bm.to : 'https://' + bm.to).hostname; }
    catch (e) { clear(); return; }

    activeTabOrigin((appOrigin) => {
      const stripReq = {
        id: ORIGIN_RULE_ID, priority: 1,
        action: { type: 'modifyHeaders', requestHeaders: [
          { header: 'origin',  operation: 'remove' },
          { header: 'referer', operation: 'remove' }
        ]},
        condition: { requestDomains: [host], excludedRequestMethods: ['options'], resourceTypes: ['xmlhttprequest'] }
      };
      const rules = [stripReq];
      if (appOrigin) {
        // Exact-origin ACAO + credentials on every response (incl. preflight) so the
        // redirect is readable and any Set-Cookie is stored. Universal: works for both
        // cookie auth and token auth.
        rules.push({
          id: ORIGIN_RULE_ID2, priority: 1,
          action: { type: 'modifyHeaders', responseHeaders: [
            { header: 'access-control-allow-origin',      operation: 'set', value: appOrigin },
            { header: 'access-control-allow-credentials', operation: 'set', value: 'true' }
          ]},
          condition: { requestDomains: [host], resourceTypes: ['xmlhttprequest'] }
        });
      } else {
        // Origin not resolvable yet (no normal page focused) — degrade to wildcard ACAO
        // on the actual response. Re-syncs to exact-origin once the app tab is active.
        stripReq.action.responseHeaders = [
          { header: 'access-control-allow-origin', operation: 'set', value: '*' }
        ];
      }
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ORIGIN_RULE_ID, ORIGIN_RULE_ID2],
        addRules: rules
      }).catch(() => {});
    });
  });
}

chrome.runtime.onInstalled.addListener(syncOriginRule);
chrome.runtime.onStartup.addListener(syncOriginRule);
chrome.storage.onChanged.addListener((changes) => { if (changes.branchMode || changes.enabled) syncOriginRule(); });
// Keep the credentialed ACAO origin in step with the active tab (single-tab workflow).
chrome.tabs.onActivated.addListener(() => syncOriginRule());

// Signal the DevTools panel to clear when the inspected tab navigates.
// chrome.devtools.network.onNavigated is unreliable in devtools pages;
// chrome.tabs.onUpdated fires reliably from the background with no extra permissions.
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
  // A committed navigation changes the page origin — rebuild the credentialed ACAO rule.
  if (changeInfo.url) syncOriginRule();
  if (changeInfo.status !== 'loading') return;
  chrome.storage.local.get({ devtoolsTabId: -1 }, function(d) {
    if (d.devtoolsTabId === tabId) {
      chrome.storage.local.set({ panelNavigated: Date.now() });
    }
  });
});

