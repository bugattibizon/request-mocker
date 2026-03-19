// interceptor.js — runs in MAIN world, intercepts fetch + XHR
(() => {
  let state = { rules: [], enabled: true };
  window.addEventListener('__RM_sync', e => { state = e.detail; });

  function findRule(url, method) {
    if (!state.enabled) return null;
    return state.rules.find(r => {
      if (!r.enabled) return false;
      if (r.method !== '*' && r.method.toUpperCase() !== method.toUpperCase()) return false;
      try {
        return r.isRegex ? new RegExp(r.urlPattern).test(url) : url.includes(r.urlPattern);
      } catch { return false; }
    }) || null;
  }

  async function buildResponse(rule) {
    if (rule.delay) await new Promise(res => setTimeout(res, rule.delay));
    let hdrs = { 'Content-Type': 'application/json' };
    try { Object.assign(hdrs, JSON.parse(rule.responseHeaders || '{}')); } catch {}
    return new Response(rule.responseBody || '', {
      status: rule.statusCode || 200,
      statusText: 'Mocked',
      headers: hdrs
    });
  }

  // ── Fetch override ──────────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = function(input, init) {
    if (!init) init = {};
    const url = input instanceof Request ? input.url : String(input);
    const method = ((input instanceof Request ? input.method : init.method) || 'GET').toUpperCase();
    const rule = findRule(url, method);
    if (rule) {
      console.debug('[RM] MOCK fetch ' + method + ' ' + url + ' => ' + rule.statusCode);
      return buildResponse(rule);
    }
    return _fetch.apply(this, arguments);
  };

  // ── XHR override ────────────────────────────────────────────────────────
  const _XHR = window.XMLHttpRequest;

  function PatchedXHR() {
    const xhr = new _XHR();
    let _m = 'GET', _u = '';
    const oOpen = xhr.open.bind(xhr);
    const oSend = xhr.send.bind(xhr);

    xhr.open = function(method, url, async, user, pass) {
      _m = (method || 'GET').toUpperCase();
      _u = url || '';
      return oOpen(method, url, async, user, pass);
    };

    xhr.send = function(body) {
      const rule = findRule(_u, _m);
      if (rule) {
        console.debug('[RM] MOCK XHR ' + _m + ' ' + _u + ' => ' + rule.statusCode);
        setTimeout(function() {
          try {
            var vals = {
              readyState: 4,
              status: rule.statusCode || 200,
              statusText: 'Mocked',
              responseText: rule.responseBody || '',
              response: rule.responseBody || ''
            };
            Object.keys(vals).forEach(function(p) {
              Object.defineProperty(xhr, p, {
                get: (function(v) { return function() { return v; }; })(vals[p]),
                configurable: true
              });
            });
          } catch(e) { console.warn('[RM] XHR property override failed:', e); }
          xhr.dispatchEvent(new Event('readystatechange'));
          xhr.dispatchEvent(new ProgressEvent('load', { loaded: 1, total: 1 }));
          if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange.call(xhr);
          if (typeof xhr.onload === 'function') xhr.onload.call(xhr);
        }, rule.delay || 0);
        return;
      }
      return oSend(body);
    };

    return xhr; // returning object from constructor uses it as the instance
  }

  PatchedXHR.prototype = _XHR.prototype;
  Object.assign(PatchedXHR, _XHR);
  window.XMLHttpRequest = PatchedXHR;
})();