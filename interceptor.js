// Runs in the MAIN world — same JS context as the page.
// Overrides fetch and XMLHttpRequest to return mocked responses.
(() => {
  let state = { rules: [], enabled: true };

  window.addEventListener('__RM_sync', (e) => {
    state = e.detail;
  });

  // Returns the first matching enabled rule, or null.
  function match(url, method) {
    if (!state.enabled) return null;
    return state.rules.find((rule) => {
      if (!rule.enabled) return false;
      if (rule.method !== '*' && rule.method.toUpperCase() !== method.toUpperCase()) return false;
      try {
        return rule.isRegex
          ? new RegExp(rule.urlPattern).test(url)
          : url.includes(rule.urlPattern);
      } catch {
        return false;
      }
    }) ?? null;
  }

  // Resolves after the rule's delay, then returns a mocked Response.
  async function mockResponse(rule) {
    if (rule.delay > 0) {
      await new Promise((r) => setTimeout(r, rule.delay));
    }
    const headers = { 'Content-Type': 'application/json' };
    try { Object.assign(headers, JSON.parse(rule.responseHeaders || '{}')); } catch {}
    return new Response(rule.responseBody ?? '', {
      status: rule.statusCode || 200,
      statusText: 'Mocked',
      headers,
    });
  }

  // ── fetch ──────────────────────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = function (input, init = {}) {
    const url = input instanceof Request ? input.url : String(input);
    const method = (input instanceof Request ? input.method : init.method ?? 'GET').toUpperCase();
    const rule = match(url, method);
    if (rule) {
      console.debug(`[RM] mock fetch ${method} ${url} → ${rule.statusCode}`);
      return mockResponse(rule);
    }
    return _fetch.apply(this, arguments);
  };

  // ── XMLHttpRequest ─────────────────────────────────────────────────────────
  const _XHR = window.XMLHttpRequest;

  function PatchedXHR() {
    const xhr = new _XHR();
    let _method = 'GET', _url = '';

    const origOpen = xhr.open.bind(xhr);
    const origSend = xhr.send.bind(xhr);

    xhr.open = function (method, url, ...rest) {
      _method = (method || 'GET').toUpperCase();
      _url = url || '';
      return origOpen(method, url, ...rest);
    };

    xhr.send = function (body) {
      const rule = match(_url, _method);
      if (!rule) return origSend(body);

      console.debug(`[RM] mock XHR ${_method} ${_url} → ${rule.statusCode}`);
      setTimeout(() => {
        const props = {
          readyState:   4,
          status:       rule.statusCode || 200,
          statusText:   'Mocked',
          responseText: rule.responseBody ?? '',
          response:     rule.responseBody ?? '',
        };
        for (const [k, v] of Object.entries(props)) {
          try {
            Object.defineProperty(xhr, k, { get: () => v, configurable: true });
          } catch {}
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
