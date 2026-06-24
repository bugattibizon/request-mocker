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
  const total = activeRules + activeHeaders;
  if (total > 0) {
    chrome.action.setBadgeText({ text: String(total) });
    chrome.action.setBadgeBackgroundColor({ color: '#1090D4' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Runs once on install — seeds storage with empty defaults.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ rules: [], enabled: true, injectHeaders: [] }, (data) => {
    chrome.storage.local.set({ rules: data.rules, enabled: data.enabled, injectHeaders: data.injectHeaders });
    updateBadge(data);
  });
});

// Keep badge in sync with storage changes.
chrome.storage.onChanged.addListener(() => {
  chrome.storage.local.get({ rules: [], enabled: true, injectHeaders: [] }, updateBadge);
});

// ── Cookie mirroring for redirect rules ──────────────────────────────────────
// When a rule redirects requests from host A to host B (e.g. test-api → cf-9792-api),
// the session cookie is host-only to A and is never sent to B, causing 401s.
// JS in the page can't read HttpOnly cookies, but chrome.cookies can — so we mirror
// A's cookies onto host B. The interceptor sends the request with credentials, so the
// browser then attaches the mirrored cookie to the redirected request.

// Build [{ srcHost, dstOrigin, dstHost }] from enabled redirect rules with full-URL patterns.
function getRedirectPairs(cb) {
  chrome.storage.local.get({ rules: [], enabled: true }, function(d) {
    if (!d.enabled) { cb([]); return; }
    var pairs = [];
    (d.rules || []).forEach(function(r) {
      if (!r.enabled || !r.redirectUrl) return;
      try {
        var s = new URL(r.urlPattern);
        var t = new URL(r.redirectUrl);
        if (s.hostname && t.hostname && s.hostname !== t.hostname) {
          pairs.push({ srcHost: s.hostname, dstOrigin: t.origin, dstHost: t.hostname });
        }
      } catch (e) { /* substring pattern — no host to mirror from */ }
    });
    cb(pairs);
  });
}

// Copy one source cookie onto the target origin (as a host-only cookie there).
function mirrorCookie(cookie, dstOrigin) {
  var details = {
    url:      dstOrigin + (cookie.path || '/'),
    name:     cookie.name,
    value:    cookie.value,
    path:     cookie.path || '/',
    secure:   cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite, // 'no_restriction' | 'lax' | 'strict' | 'unspecified'
  };
  if (!cookie.session && cookie.expirationDate) details.expirationDate = cookie.expirationDate;
  if (cookie.storeId) details.storeId = cookie.storeId;
  // 'no_restriction' requires secure; force it so the set doesn't silently fail.
  if (details.sameSite === 'no_restriction') details.secure = true;
  chrome.cookies.set(details, function() { void chrome.runtime.lastError; });
}

// getAll({domain}) returns the host's own cookies plus any on its subdomains.
// Parent-domain cookies (e.g. .warmy.io) already reach the target, so we don't mirror those.
function syncHostCookies(srcHost, dstOrigin) {
  chrome.cookies.getAll({ domain: srcHost }, function(cookies) {
    (cookies || []).forEach(function(c) { mirrorCookie(c, dstOrigin); });
  });
}

function syncAllRedirectCookies() {
  getRedirectPairs(function(pairs) {
    pairs.forEach(function(p) { syncHostCookies(p.srcHost, p.dstOrigin); });
  });
}

// Initial sync + whenever rules change.
chrome.runtime.onInstalled.addListener(syncAllRedirectCookies);
chrome.runtime.onStartup.addListener(syncAllRedirectCookies);
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.rules || changes.enabled) syncAllRedirectCookies();
});

// Keep the mirror fresh: when a source-host cookie changes (login, token refresh),
// re-mirror it to the target. Target-host changes never match a srcHost, so no loop.
chrome.cookies.onChanged.addListener(function(info) {
  if (info.removed) return;
  var c = info.cookie;
  var cd = c.domain.replace(/^\./, '');
  getRedirectPairs(function(pairs) {
    pairs.forEach(function(p) {
      if (cd === p.srcHost) mirrorCookie(c, p.dstOrigin);
    });
  });
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

