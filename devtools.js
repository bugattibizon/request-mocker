'use strict';

var XHR_FETCH = { xhr: true, fetch: true };
var BODY_LIMIT = 50 * 1024; // 50 KB — avoids slow serialisation on large responses

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

    if (body.length > BODY_LIMIT) {
      body = body.slice(0, BODY_LIMIT) + '\n/* … truncated (' + Math.round(body.length / 1024) + ' KB total) */';
    }

    var item = {
      url:          req.url || '',
      method:       (req.method || 'GET').toUpperCase(),
      statusCode:   res.status || 0,
      responseBody: body,
      requestBody:  (req.postData && req.postData.text) || ''
    };

    chrome.storage.local.set({ lastCapture: { item: item, ts: Date.now() } });
  });
});

chrome.devtools.panels.create('Request Mocker', 'icon16.png', 'panel.html');
