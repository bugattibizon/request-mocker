'use strict';

var panelWin = null;
var buffer = [];

function processEntry(harEntry) {
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

    if (panelWin && typeof panelWin.rmAddEntry === 'function') {
      panelWin.rmAddEntry(item);
    } else {
      buffer.unshift(item);
      if (buffer.length > 500) buffer.pop();
    }
  });
}

chrome.devtools.network.onRequestFinished.addListener(processEntry);

chrome.devtools.panels.create('Request Mocker', 'icon16.png', 'panel.html', function(panel) {
  panel.onShown.addListener(function(win) {
    panelWin = win;
    if (buffer.length && typeof win.rmFlush === 'function') {
      win.rmFlush(buffer);
      buffer = [];
    }
  });
});
