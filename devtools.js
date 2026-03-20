'use strict';

var XHR_FETCH = { xhr: true, fetch: true };
var BODY_LIMIT = 50 * 1024; // 50 KB

// Statuses that never carry a response body — skip getContent() entirely
var NO_BODY_STATUS = { 101:1, 204:1, 205:1, 301:1, 302:1, 303:1, 304:1, 307:1, 308:1 };

// Only decode text-based MIME types — skip binary (files, blobs, images via XHR)
var TEXT_MIME = /json|text|xml|javascript|x-www-form-urlencoded/;

chrome.devtools.network.onRequestFinished.addListener(function(harEntry) {
  if (!XHR_FETCH[harEntry._resourceType]) return;

  var req = harEntry.request || {};
  var res = harEntry.response || {};
  var status = res.status || 0;

  // Skip responses that carry no body
  if (NO_BODY_STATUS[status]) {
    capture(req, res, '');
    return;
  }

  var mimeType = (res.content && res.content.mimeType) || '';
  var bodySize  = (res.content && res.content.size)     || res.bodySize || 0;

  // Skip binary MIME types or empty bodies — no point reading content
  if (bodySize === 0 || (mimeType && !TEXT_MIME.test(mimeType))) {
    capture(req, res, '');
    return;
  }

  harEntry.getContent(function(content, encoding) {
    var body = '';
    if (encoding === 'base64') {
      try { body = atob(content || ''); } catch(e) { body = ''; }
    } else {
      body = content || '';
    }
    if (body.length > BODY_LIMIT) {
      body = body.slice(0, BODY_LIMIT) + '\n/* … truncated (' + Math.round(body.length / 1024) + ' KB total) */';
    }
    capture(req, res, body);
  });
});

function capture(req, res, body) {
  var item = {
    url:          req.url || '',
    method:       (req.method || 'GET').toUpperCase(),
    statusCode:   res.status || 0,
    responseBody: body,
    requestBody:  (req.postData && req.postData.text) || ''
  };
  chrome.storage.local.set({ lastCapture: { item: item, ts: Date.now() } });
}

chrome.devtools.network.onNavigated.addListener(function() {
  chrome.storage.local.set({ panelNavigated: Date.now() });
});

chrome.devtools.panels.create('Request Mocker', 'icon16.png', 'panel.html');
