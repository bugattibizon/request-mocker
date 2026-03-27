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
          id:           r.id,
          method:       r.method === '*' ? '*' : r.method.toUpperCase(),
          urlPattern:   r.urlPattern,
          _re:          r.isRegex ? safeRegExp(r.urlPattern) : null,
          _body:        (r.requestBody || '').trim(),
          responseBody: r.responseBody,
          statusCode:   r.statusCode,
          delay:        r.delay,
          _headers:     hdrs,
          pagination:   r.pagination,
        };
      });

    _ih       = state.enabled ? (state.injectHeaders || []).filter(h => h.enabled && h.name) : [];
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

  // Does this object look like a pagination metadata block?
  // Requires at least 2 recognised pagination field names.
  var _PAG_KEYS = [
    'total_pages','totalPages','total_count','totalCount',
    'current_page','currentPage','next_page','nextPage',
    'prev_page','prevPage','limit_value','limitValue',
  ];
  function looksLikePag(obj) {
    var hits = 0;
    for (var i = 0; i < _PAG_KEYS.length; i++) {
      if (obj[_PAG_KEYS[i]] !== undefined) { if (++hits >= 2) return true; }
    }
    return false;
  }

  // Return the dot-path to the first object that looks like a pagination block.
  // Returns '' if the root itself matches, null if nothing found.
  function autoFindPagPath(obj) {
    if (looksLikePag(obj)) return '';
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var v = obj[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && looksLikePag(v)) return k;
    }
    return null;
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function(o, k) { return o != null ? o[k] : undefined; }, obj);
  }

  // Update a field by its first matching name variant (only if that key already exists).
  function setPagField(pag, names, val) {
    for (var i = 0; i < names.length; i++) {
      if (Object.prototype.hasOwnProperty.call(pag, names[i])) { pag[names[i]] = val; return; }
    }
  }

  // Rewrite every pagination field in the response so the UI sees N pages of data.
  // Items array is returned unchanged (every page gets the same items — "duplicated data").
  function applyPagination(pg, url, bodyStr) {
    try {
      var data = JSON.parse(bodyStr);
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return bodyStr;

      // Current page from URL query param
      var page = 1;
      try {
        var raw = new URL(url).searchParams.get(pg.pageParam || 'page');
        var p   = parseInt(raw, 10);
        if (p > 0) page = p;
      } catch(e) {}

      var totalPages = pg.totalPages || 1;

      // Locate the pagination metadata object
      var pagPath = (pg.pagPath != null && pg.pagPath !== '')
        ? pg.pagPath
        : autoFindPagPath(data);
      if (pagPath === null) return bodyStr;  // no pagination block found

      var pag = pagPath === '' ? data : getPath(data, pagPath);
      if (!pag || typeof pag !== 'object' || Array.isArray(pag)) return bodyStr;

      // Derive per-page from existing pagination object (never changes)
      var perPage =
        pag['limit_value']  ?? pag['limitValue'] ??
        pag['per_page']     ?? pag['perPage']     ??
        pag['page_size']    ?? pag['pageSize']    ??
        pag['limit']        ?? 20;

      // Update every recognised pagination field that is present in the response
      setPagField(pag, ['current_page',  'currentPage',  'page'],          page);
      setPagField(pag, ['total_pages',   'totalPages'],                     totalPages);
      setPagField(pag, ['total_count',   'totalCount',   'total', 'count'], totalPages * perPage);
      setPagField(pag, ['prev_page',     'prevPage'],                       page > 1          ? page - 1 : null);
      setPagField(pag, ['next_page',     'nextPage'],                       page < totalPages ? page + 1 : null);
      setPagField(pag, ['first_page?'],                                     page === 1);
      setPagField(pag, ['last_page?'],                                      page === totalPages);
      setPagField(pag, ['out_of_range?'],                                   false);
      setPagField(pag, ['offset_value',  'offsetValue',  'offset'],        (page - 1) * perPage);

      return JSON.stringify(data);
    } catch(e) { return bodyStr; }
  }

  // ── Mock response ──────────────────────────────────────────────────────────
  async function mockResponse(rule, url) {
    if (rule.delay > 0) await new Promise(r => setTimeout(r, rule.delay));
    var body = rule.pagination && rule.pagination.enabled
      ? applyPagination(rule.pagination, url || '', rule.responseBody ?? '')
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
    if (rule) return mockResponse(rule, url);

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
        ? applyPagination(rule.pagination, _url, rule.responseBody ?? '')
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
