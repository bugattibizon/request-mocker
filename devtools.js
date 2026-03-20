'use strict';

var XHR_FETCH = { xhr: true, fetch: true };

chrome.devtools.network.onRequestFinished.addListener(function(harEntry) {
  if (!XHR_FETCH[harEntry._resourceType]) return;

  harEntry.getContent(function(content, encoding) {
    var req = harEntry.request || {};
    var res = harEntry.response || {};
    var hdrs = {};
    (res.headers || []).forEach(function(h) { hdrs[h.name] = h.value; });

    var body = '';
    if (encoding === 'base64') {
      try { body = atob(content || ''); } catch(e) { body = ''; }
    } else {
      body = content || '';
    }

    var item = {
      url:             req.url || '',
      method:          (req.method || 'GET').toUpperCase(),
      statusCode:      res.status || 0,
      responseBody:    body,
      responseHeaders: JSON.stringify(hdrs),
      requestBody:     (req.postData && req.postData.text) || ''
    };

    // Write only the latest item — panel appends to its own local array
    chrome.storage.local.set({ lastCapture: { item: item, ts: Date.now() } });
  });
});

chrome.devtools.panels.create('Request Mocker', 'icon16.png', 'panel.html');
