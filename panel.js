'use strict';

var MAX = 300;
var entries = [];
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

function matches(item) {
  return !filterText || item.url.toLowerCase().indexOf(filterText) !== -1;
}

function updateCount() {
  var visible = document.getElementById('list').querySelectorAll('.entry').length;
  document.getElementById('entryCount').textContent = visible + ' / ' + entries.length;
}

function createRow(item) {
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

// Full rebuild — used on filter change, clear, and navigation
function renderAll() {
  var list  = document.getElementById('list');
  var empty = document.getElementById('empty');
  list.querySelectorAll('.entry').forEach(function(r) { r.remove(); });
  var filtered = entries.filter(matches);
  empty.style.display = filtered.length ? 'none' : '';
  if (!filtered.length) { updateCount(); return; }
  var frag = document.createDocumentFragment();
  filtered.forEach(function(item) { frag.appendChild(createRow(item)); });
  list.appendChild(frag);
  updateCount();
}

// Single prepend — used on each new entry (avoids full DOM rebuild)
function prependEntry(item) {
  if (!matches(item)) { updateCount(); return; }
  var list = document.getElementById('list');
  var rows = list.querySelectorAll('.entry');
  var row  = createRow(item);
  if (rows.length > 0) {
    list.insertBefore(row, rows[0]);
    if (rows.length >= MAX) rows[rows.length - 1].remove(); // trim oldest DOM row
  } else {
    list.appendChild(row);
    document.getElementById('empty').style.display = 'none';
  }
  updateCount();
}

// New XHR/fetch captured by devtools.js
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.lastCapture && changes.lastCapture.newValue) {
    var item = changes.lastCapture.newValue.item;
    entries.unshift(item);
    if (entries.length > MAX) entries.pop();
    prependEntry(item);
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

chrome.devtools.network.onNavigated.addListener(function() {
  if (!preserveLog) { entries = []; renderAll(); }
});

chrome.storage.local.get({ panelPreserveLog: false }, function(d) {
  preserveLog = d.panelPreserveLog;
  document.getElementById('preserveLog').checked = preserveLog;
});

renderAll();
