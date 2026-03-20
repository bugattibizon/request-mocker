// Runs in the MAIN world — same JS context as the page.
// Overrides fetch and XMLHttpRequest to return mocked responses.
(() => {
  let state = { rules: [], enabled: true };

  // ── Pre-processed caches ───────────────────────────────────────────────────
  // Rebuilt on every __RM_sync (state changes rarely).
  // Used on every intercepted request (fires constantly).
  let _rules    = [];    // enabled rules with normalised/pre-compiled fields
  let _ih       = [];    // enabled inject-headers with non-empty names
  let _needBody = false; // true if any rule matches on requestBody

  const STRIP = new Set([
    'content-encoding', 'transfer-encoding', 'content-length',
    'connection', 'keep-alive', 'upgrade',
  ]);

  function buildCaches() {
    _rules = (state.rules || [])
      .filter(r => r.enabled)
      .map(r => {
        // Pre-parse response headers once instead of on every mock hit
        const hdrs = { 'Content-Type': 'application/json' };
        try {
          const ph = JSON.parse(r.responseHeaders || '{}');
          for (const [k, v] of Object.entries(ph)) {
            if (!STRIP.has(k.toLowerCase())) hdrs[k] = v;
          }
        } catch {}
        // Pre-compile regex patterns; pre-trim body matcher
        return {
          id:          r.id,
          method:      r.method === '*' ? '*' : r.method.toUpperCase(),
          urlPattern:  r.urlPattern,
          _re:         r.isRegex ? safeRegExp(r.urlPattern) : null,
          _body:       (r.requestBody || '').trim(),
          responseBody: r.responseBody,
          statusCode:  r.statusCode,
          delay:       r.delay,
          _headers:    hdrs,
        };
      });

    _ih       = (state.injectHeaders || []).filter(h => h.enabled && h.name);
    _needBody = _rules.some(r => r._body);
  }

  function safeRegExp(pattern) {
    try { return new RegExp(pattern); } catch { return null; }
  }

  window.addEventListener('__RM_sync', e => {
    state = e.detail;
    buildCaches();
  });

  // ── Matching ───────────────────────────────────────────────────────────────
  function match(url, method, body) {
    if (!state.enabled || !_rules.length) return null;
    return _rules.find(r => {
      if (r.method !== '*' && r.method !== method) return false;
      if (r._re ? !r._re.test(url) : !url.includes(r.urlPattern)) return false;
      if (r._body && !body.includes(r._body)) return false;
      return true;
    }) ?? null;
  }

  // ── Pagination helpers ─────────────────────────────────────────────────────
  function getPath(obj, path) {
    return path.split('.').reduce(function(o, k) { return o != null ? o[k] : undefined; }, obj);
  }
  function setPath(obj, path, val) {
    var keys = path.split('.');
    var o = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = val;
  }
  function autoItemsPath(obj) {
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && Array.isArray(obj[k])) return k;
    }
    return null;
  }
  function autoTotalPath(obj) {
    var names = ['total', 'count', 'total_count', 'totalCount', 'total_items', 'totalItems'];
    for (var i = 0; i < names.length; i++) {
      if (typeof obj[names[i]] === 'number') return names[i];
    }
    var nested = ['meta', 'pagination', 'page_info', 'paging'];
    for (var j = 0; j < nested.length; j++) {
      if (obj[nested[j]] && typeof obj[nested[j]] === 'object') {
        for (var i = 0; i < names.length; i++) {
          if (typeof obj[nested[j]][names[i]] === 'number') return nested[j] + '.' + names[i];
        }
      }
    }
    return null;
  }
  // Rewrites the total-count field so the UI sees N pages of data.
  // Items array is returned unchanged (every page gets the same items).
  function applyPagination(pg, bodyStr) {
    try {
      var data = JSON.parse(bodyStr);
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return bodyStr;
      var itemsPath = pg.itemsPath || autoItemsPath(data);
      if (!itemsPath) return bodyStr;
      var items = getPath(data, itemsPath);
      if (!Array.isArray(items)) return bodyStr;
      var perPage    = items.length || 1;
      var totalItems = (pg.totalPages || 1) * perPage;
      var totalPath  = pg.totalPath || autoTotalPath(data);
      if (totalPath) setPath(data, totalPath, totalItems);
      return JSON.stringify(data);
    } catch(e) { return bodyStr; }
  }

  // ── Mock response ──────────────────────────────────────────────────────────
  async function mockResponse(rule) {
    if (rule.delay > 0) await new Promise(r => setTimeout(r, rule.delay));
    var body = rule.pagination && rule.pagination.enabled
      ? applyPagination(rule.pagination, rule.responseBody ?? '')
      : (rule.responseBody ?? '');
    // _headers is pre-built — no JSON.parse here
    return new Response(body, {
      status:     rule.statusCode || 200,
      statusText: 'Mocked',
      headers:    rule._headers,
    });
  }

  // ── fetch ──────────────────────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = function(input, init = {}) {
    const url    = input instanceof Request ? input.url : String(input);
    const method = (input instanceof Request ? input.method : (init.method ?? 'GET')).toUpperCase();
    // Extract body only when at least one rule uses body matching
    const body   = _needBody
      ? (typeof init.body === 'string' ? init.body
         : init.body instanceof URLSearchParams ? init.body.toString() : '')
      : '';

    const rule = match(url, method, body);
    if (rule) return mockResponse(rule);

    if (_ih.length) {
      const headers = new Headers(init.headers || {});
      _ih.forEach(h => headers.set(h.name, h.value));
      init = { ...init, headers };
    }
    return _fetch.call(this, input, init);
  };

  // ── XMLHttpRequest ─────────────────────────────────────────────────────────
  const _XHR = window.XMLHttpRequest;

  function PatchedXHR() {
    const xhr = new _XHR();
    let _method = 'GET', _url = '';

    const origOpen = xhr.open.bind(xhr);
    const origSend = xhr.send.bind(xhr);

    xhr.open = function(method, url, ...rest) {
      _method = (method || 'GET').toUpperCase();
      _url    = url || '';
      return origOpen(method, url, ...rest);
    };

    xhr.send = function(body) {
      const b    = _needBody && typeof body === 'string' ? body : '';
      const rule = match(_url, _method, b);

      if (!rule) {
        _ih.forEach(h => { try { xhr.setRequestHeader(h.name, h.value); } catch {} });
        return origSend(body);
      }

      const mockBody = rule.pagination && rule.pagination.enabled
        ? applyPagination(rule.pagination, rule.responseBody ?? '')
        : (rule.responseBody ?? '');

      setTimeout(() => {
        const props = {
          readyState:   4,
          status:       rule.statusCode || 200,
          statusText:   'Mocked',
          responseText: mockBody,
          response:     mockBody,
        };
        for (const [k, v] of Object.entries(props)) {
          try { Object.defineProperty(xhr, k, { get: () => v, configurable: true }); } catch {}
        }
        xhr.dispatchEvent(new Event('readystatechange'));
        xhr.dispatchEvent(new ProgressEvent('load', { loaded: 1, total: 1 }));
        if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange.call(xhr);
        if (typeof xhr.onload === 'function') xhr.onload.call(xhr);
      }, rule.delay ?? 0);
    };

    return xhr;
  }

  PatchedXHR.prototype = _XHR.prototype;
  Object.assign(PatchedXHR, _XHR);
  window.XMLHttpRequest = PatchedXHR;
})();
