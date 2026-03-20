'use strict';

var MAX = 300;
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

// Load existing captures on panel open
chrome.storage.local.get({ capturedRequests: [] }, function(d) {
  entries = d.capturedRequests || [];
  render();
});

// Live updates as devtools.js writes new captures
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.capturedRequests) {
    entries = changes.capturedRequests.newValue || [];
    render();
  }
});

document.getElementById('filterInput').addEventListener('input', function(e) {
  filterText = e.target.value.toLowerCase().trim();
  render();
});

document.getElementById('btnClear').addEventListener('click', function() {
  chrome.storage.local.set({ capturedRequests: [] });
});
