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
// *echoes* the request Origin into Access-Control-Allow-Origin. A network-level
// declarativeNetRequest rule for the target host:
//   • removes Origin + Referer on the actual request (non-OPTIONS) so the app accepts
//     it like an origin-less Postman call — but leaves the CORS preflight (OPTIONS)
//     untouched so it still echoes ACAO and passes;
//   • forces Access-Control-Allow-Origin: * on the response so the browser can read it
//     (the request is non-credentialed, so * is accepted).
const ORIGIN_RULE_ID = 8801;

function syncOriginRule() {
  chrome.storage.local.get({ enabled: true, branchMode: { enabled: false, from: '', to: '' } }, (d) => {
    const bm = d.branchMode || {};
    const clear = () => chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ORIGIN_RULE_ID] }).catch(() => {});
    if (d.enabled === false || !bm.enabled || !bm.to) { clear(); return; }
    let host;
    try { host = new URL(/^https?:\/\//.test(bm.to) ? bm.to : 'https://' + bm.to).hostname; }
    catch (e) { clear(); return; }
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ORIGIN_RULE_ID],
      addRules: [{
        id: ORIGIN_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'origin',  operation: 'remove' },
            { header: 'referer', operation: 'remove' }
          ],
          responseHeaders: [
            { header: 'access-control-allow-origin', operation: 'set', value: '*' }
          ]
        },
        condition: {
          requestDomains: [host],
          excludedRequestMethods: ['options'], // keep the CORS preflight intact
          resourceTypes: ['xmlhttprequest']
        }
      }]
    }).catch(() => {});
  });
}

chrome.runtime.onInstalled.addListener(syncOriginRule);
chrome.runtime.onStartup.addListener(syncOriginRule);
chrome.storage.onChanged.addListener((changes) => { if (changes.branchMode || changes.enabled) syncOriginRule(); });

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

