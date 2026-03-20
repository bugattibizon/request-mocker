'use strict';

var captured = [];

chrome.devtools.network.onRequestFinished.addListener(function(harEntry) {
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

    captured.unshift(item);
    if (captured.length > 300) captured.pop();
    chrome.storage.local.set({ capturedRequests: captured });
  });
});

// Sync clear: if panel clears storage, reset our in-memory array too
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.capturedRequests && changes.capturedRequests.newValue &&
      changes.capturedRequests.newValue.length === 0) {
    captured = [];
  }
});

chrome.devtools.panels.create('Request Mocker', 'icon16.png', 'panel.html');
