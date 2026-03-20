'use strict';

var MAX = 500;
var entries = [];
var filterText = '';

var BADGE = { GET:'m-GET', POST:'m-POST', PUT:'m-PUT', DELETE:'m-DELETE', PATCH:'m-PATCH' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusClass(code) {
  if (!code) return 's-neu';
  return code < 300 ? 's-ok' : code < 400 ? 's-warn' : 's-err';
}

function render() {
  var list = document.getElementById('list');
  var empty = document.getElementById('empty');
  var count = document.getElementById('entryCount');

  var filtered = filterText
    ? entries.filter(function(e) { return e.url.toLowerCase().indexOf(filterText) !== -1; })
    : entries;

  count.textContent = filtered.length + ' / ' + entries.length;
  empty.style.display = filtered.length ? 'none' : '';

  list.querySelectorAll('.entry').forEach(function(r) { r.remove(); });

  filtered.forEach(function(item, idx) {
    var mc = BADGE[item.method] || 'm-ANY';
    var sc = statusClass(item.statusCode);
    var row = document.createElement('div');
    row.className = 'entry';
    row.innerHTML =
      '<span class="badge ' + mc + '">' + esc(item.method) + '</span>' +
      '<span class="status ' + sc + '">' + (item.statusCode || '—') + '</span>' +
      '<span class="entry-url" title="' + esc(item.url) + '">' + esc(item.url) + '</span>' +
      '<button type="button" class="btn-mock" data-idx="' + idx + '">Mock</button>';
    row.querySelector('.btn-mock').addEventListener('click', function(e) {
      var btn = e.currentTarget;
      var entry = filtered[parseInt(btn.dataset.idx)];
      chrome.storage.local.set({ pendingImport: entry }, function() {
        btn.textContent = '✓ Sent';
        btn.classList.add('done');
        setTimeout(function() {
          btn.textContent = 'Mock';
          btn.classList.remove('done');
        }, 1500);
      });
    });
    list.appendChild(row);
  });
}

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

    entries.unshift(item);
    if (entries.length > MAX) entries.pop();
    render();
  });
});

document.getElementById('filterInput').addEventListener('input', function(e) {
  filterText = e.target.value.toLowerCase().trim();
  render();
});

document.getElementById('btnClear').addEventListener('click', function() {
  entries = [];
  render();
});

render();
