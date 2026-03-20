'use strict';

var MAX = 300;
var entries = [];      // each entry: { item, ts }
var filterText = 'api.warmy.io';
var preserveLog = false;

var BADGE = { GET:'m-GET', POST:'m-POST', PUT:'m-PUT', DELETE:'m-DELETE', PATCH:'m-PATCH' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusClass(code) {
  if (!code) return 's-neu';
  return code < 300 ? 's-ok' : code < 400 ? 's-warn' : 's-err';
}

function matches(entry) {
  return !filterText || entry.item.url.toLowerCase().indexOf(filterText) !== -1;
}

function updateCount() {
  var visible = document.getElementById('list').querySelectorAll('.entry').length;
  document.getElementById('entryCount').textContent = visible + ' / ' + entries.length;
}

function createRow(entry) {
  var item = entry.item;
  var row = document.createElement('div');
  row.className = 'entry';
  row.innerHTML =
    '<span class="badge ' + (BADGE[item.method] || 'm-ANY') + '">' + esc(item.method) + '</span>' +
    '<span class="status ' + statusClass(item.statusCode) + '">' + (item.statusCode || '—') + '</span>' +
    '<span class="entry-url" title="' + esc(item.url) + '">' + esc(item.url) + '</span>' +
    '<button type="button" class="btn-mock">Mock</button>';
  row.querySelector('.btn-mock').addEventListener('click', function(e) {
    var btn = e.currentTarget;
    chrome.storage.local.set({ pendingImport: item }, function() {
      if (chrome.action && chrome.action.openPopup) {
        chrome.action.openPopup().catch(function() {});
      }
    });
    btn.textContent = '✓ Sent';
    btn.classList.add('done');
    setTimeout(function() { btn.textContent = 'Mock'; btn.classList.remove('done'); }, 1500);
  });
  return row;
}

// Full rebuild — filter change, clear, or navigation
function renderAll() {
  var list  = document.getElementById('list');
  var empty = document.getElementById('empty');
  list.querySelectorAll('.entry').forEach(function(r) { r.remove(); });
  var filtered = entries.filter(matches);
  empty.style.display = filtered.length ? 'none' : '';
  if (!filtered.length) { updateCount(); return; }
  var frag = document.createDocumentFragment();
  filtered.forEach(function(entry) { frag.appendChild(createRow(entry)); });
  list.appendChild(frag);
  updateCount();
}

// Single prepend — new capture
function prependEntry(entry) {
  if (!matches(entry)) { updateCount(); return; }
  var list = document.getElementById('list');
  var rows = list.querySelectorAll('.entry');
  var row  = createRow(entry);
  if (rows.length > 0) {
    list.insertBefore(row, rows[0]);
    if (rows.length >= MAX) rows[rows.length - 1].remove();
  } else {
    list.appendChild(row);
    document.getElementById('empty').style.display = 'none';
  }
  updateCount();
}

chrome.storage.onChanged.addListener(function(changes) {
  if (changes.lastCapture && changes.lastCapture.newValue) {
    var c = changes.lastCapture.newValue;
    var entry = { item: c.item, ts: c.ts };
    entries.unshift(entry);
    if (entries.length > MAX) entries.pop();
    prependEntry(entry);
  }

  // Navigation: clear only entries captured BEFORE the navigation timestamp.
  // Entries already in the panel from the new page (ts > navTs) are kept.
  // This fixes the race where new-page captures arrive before panelNavigated is processed.
  if (changes.panelNavigated && !preserveLog) {
    var navTs = changes.panelNavigated.newValue;
    entries = entries.filter(function(e) { return e.ts > navTs; });
    renderAll();
  }
});

document.getElementById('filterInput').addEventListener('input', function(e) {
  filterText = e.target.value.toLowerCase().trim();
  renderAll();
});

document.getElementById('btnClear').addEventListener('click', function() {
  entries = [];
  renderAll();
});

document.getElementById('preserveLog').addEventListener('change', function(e) {
  preserveLog = e.target.checked;
  chrome.storage.local.set({ panelPreserveLog: preserveLog });
});

// onNavigated is signalled via storage from background.js (devtools APIs unreliable in panel pages)

chrome.storage.local.get({ panelPreserveLog: false }, function(d) {
  preserveLog = d.panelPreserveLog;
  document.getElementById('preserveLog').checked = preserveLog;
});

renderAll();
