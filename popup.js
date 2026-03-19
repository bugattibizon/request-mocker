'use strict';

function $(id) { return document.getElementById(id); }
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var rules = [];
var enabled = true;
var editId = null;
var currentDraft = null;

// ── JSON helpers ─────────────────────────────────────────────────────────────
function formatJSON(str) {
  try { return JSON.stringify(JSON.parse(str), null, 2); } catch(e) { return null; }
}

function updateJSONStatus(value, statusEl) {
  if (!value.trim()) { statusEl.textContent = ''; return; }
  try {
    JSON.parse(value);
    statusEl.className = 'json-status json-ok';
    statusEl.textContent = '✓ Valid JSON';
  } catch(e) {
    statusEl.className = 'json-status json-err';
    statusEl.textContent = '✗ ' + e.message;
  }
}

// ── Storage ──────────────────────────────────────────────────────────────────
function load(cb) {
  chrome.storage.local.get({ rules: [], enabled: true, formDraft: null }, function(d) {
    rules        = d.rules;
    enabled      = d.enabled;
    currentDraft = d.formDraft;
    if (cb) cb();
  });
}
function save(cb) { chrome.storage.local.set({ rules: rules, enabled: enabled }, cb); }
function saveDraft() {
  currentDraft = {
    name: $('fName').value, method: $('fMethod').value,
    status: $('fStatus').value, delay: $('fDelay').value,
    url: $('fUrl').value, regex: $('fRegex').checked,
    body: $('fBody').value, headers: $('fHeaders').value,
  };
  chrome.storage.local.set({ formDraft: currentDraft });
}
function clearDraft() {
  currentDraft = null;
  chrome.storage.local.remove('formDraft');
}

// ── Views ────────────────────────────────────────────────────────────────────
function showList() {
  $('viewForm').style.display = 'none';
  $('viewList').style.display = 'flex';
  clearDraft();
  editId = null;
}

function showForm(id) {
  editId = id || null;
  var rule  = id ? rules.find(function(r) { return r.id === id; }) : null;
  var draft = (!id && currentDraft) ? currentDraft : null;

  $('formTitle').textContent       = id ? 'Edit Mock Rule' : 'New Mock Rule';
  $('draftBadge').style.display    = draft ? 'inline-block' : 'none';

  if (draft) {
    $('fName').value    = draft.name    || '';
    $('fMethod').value  = draft.method  || 'GET';
    $('fStatus').value  = draft.status  || 200;
    $('fDelay').value   = draft.delay   || 0;
    $('fUrl').value     = draft.url     || '';
    $('fRegex').checked = !!draft.regex;
    $('fBody').value    = draft.body    || '';
    $('fHeaders').value = draft.headers || '{"Content-Type": "application/json"}';
  } else if (rule) {
    $('fName').value    = rule.name            || '';
    $('fMethod').value  = rule.method          || 'GET';
    $('fStatus').value  = rule.statusCode      || 200;
    $('fDelay').value   = rule.delay           || 0;
    $('fUrl').value     = rule.urlPattern      || '';
    $('fRegex').checked = !!rule.isRegex;
    $('fBody').value    = rule.responseBody    || '';
    $('fHeaders').value = rule.responseHeaders || '{"Content-Type": "application/json"}';
  } else {
    $('fName').value    = '';
    $('fMethod').value  = 'GET';
    $('fStatus').value  = 200;
    $('fDelay').value   = 0;
    $('fUrl').value     = '';
    $('fRegex').checked = false;
    $('fBody').value    = '';
    $('fHeaders').value = '{"Content-Type": "application/json"}';
  }

  updateJSONStatus($('fBody').value, $('jsonStatus'));
  $('viewList').style.display = 'none';
  $('viewForm').style.display = 'flex';
}

// ── Render ───────────────────────────────────────────────────────────────────
function methodBadge(m) {
  var map = { GET:'m-GET', POST:'m-POST', PUT:'m-PUT', DELETE:'m-DELETE', PATCH:'m-PATCH', '*':'m-ANY' };
  return '<span class="badge ' + (map[m] || 'm-ANY') + '">' + (m === '*' ? 'ANY' : m) + '</span>';
}
function statusBadge(code) {
  var n = parseInt(code);
  return '<span class="status ' + (n >= 500 ? 's-err' : n >= 400 ? 's-warn' : 's-ok') + '">' + n + '</span>';
}
function render() {
  $('globalToggle').checked = enabled;
  var active = rules.filter(function(r) { return r.enabled; }).length;
  $('count').textContent = rules.length ? (active + '/' + rules.length + ' active') : '';
  var list = $('ruleList');
  list.querySelectorAll('.rule').forEach(function(el) { el.remove(); });
  $('empty').style.display = rules.length ? 'none' : '';
  rules.forEach(function(rule) {
    var el = document.createElement('div');
    el.className = 'rule' + (rule.enabled ? '' : ' disabled');
    el.innerHTML =
      '<label class="toggle" style="width:32px;height:18px">' +
        '<input type="checkbox" class="rtoggle" data-id="' + rule.id + '"' + (rule.enabled ? ' checked' : '') + '>' +
        '<span class="track"></span>' +
      '</label>' +
      '<div class="rule-body">' +
        '<div class="rule-name">' + esc(rule.name || rule.urlPattern) + '</div>' +
        '<div class="rule-meta">' +
          methodBadge(rule.method) + statusBadge(rule.statusCode) +
          (rule.delay   ? '<span class="meta-text">⏱ ' + rule.delay + 'ms</span>' : '') +
          (rule.isRegex ? '<span class="meta-text">regex</span>' : '') +
        '</div>' +
        '<div class="rule-url">' + esc(rule.urlPattern) + '</div>' +
      '</div>' +
      '<div class="rule-actions">' +
        '<button type="button" class="icon-btn ebtn" data-id="' + rule.id + '">✏️</button>' +
        '<button type="button" class="icon-btn danger dbtn" data-id="' + rule.id + '">🗑</button>' +
      '</div>';
    el.querySelector('.rtoggle').addEventListener('change', function(e) {
      var r = rules.find(function(x) { return x.id === e.target.dataset.id; });
      if (r) { r.enabled = e.target.checked; save(render); }
    });
    el.querySelector('.ebtn').addEventListener('click', function(e) {
      showForm(e.currentTarget.dataset.id);
    });
    el.querySelector('.dbtn').addEventListener('click', function(e) {
      if (confirm('Delete this rule?')) {
        var id = e.currentTarget.dataset.id;
        rules = rules.filter(function(r) { return r.id !== id; });
        save(render);
      }
    });
    list.appendChild(el);
  });
}

// ── Save ─────────────────────────────────────────────────────────────────────
function saveRule() {
  var urlPattern = $('fUrl').value.trim();
  if (!urlPattern) return;
  var existing = editId ? rules.find(function(r) { return r.id === editId; }) : null;
  var rule = {
    id:              editId || uid(),
    enabled:         existing ? existing.enabled : true,
    name:            $('fName').value.trim(),
    method:          $('fMethod').value,
    statusCode:      parseInt($('fStatus').value) || 200,
    delay:           parseInt($('fDelay').value)  || 0,
    urlPattern:      urlPattern,
    isRegex:         $('fRegex').checked,
    responseBody:    $('fBody').value,
    responseHeaders: $('fHeaders').value.trim(),
  };
  if (editId) {
    var idx = rules.findIndex(function(r) { return r.id === editId; });
    if (idx >= 0) rules[idx] = rule; else rules.push(rule);
  } else {
    rules.push(rule);
  }
  save(render);
  showList();
}

// ── Wire up ───────────────────────────────────────────────────────────────────
$('globalToggle').addEventListener('change', function(e) { enabled = e.target.checked; save(render); });
$('btnAdd').addEventListener('click',    function() { showForm(null); });
$('btnCancel').addEventListener('click', showList);
$('btnSave').addEventListener('click',   saveRule);

['fName','fMethod','fStatus','fDelay','fUrl','fHeaders'].forEach(function(id) {
  $(id).addEventListener('input',  saveDraft);
  $(id).addEventListener('change', saveDraft);
});
$('fRegex').addEventListener('change', saveDraft);

// fBody gets its own listener to also update the status indicator
$('fBody').addEventListener('input', function() {
  updateJSONStatus($('fBody').value, $('jsonStatus'));
  saveDraft();
});

// Format inline
$('btnFormat').addEventListener('click', function() {
  var formatted = formatJSON($('fBody').value);
  if (formatted !== null) $('fBody').value = formatted;
  updateJSONStatus($('fBody').value, $('jsonStatus'));
});

// Open fullscreen editor
$('btnExpand').addEventListener('click', function() {
  $('fBodyEditor').value = $('fBody').value;
  updateJSONStatus($('fBodyEditor').value, $('jsonStatusEditor'));
  $('viewForm').style.display = 'none';
  $('viewEditor').style.display = 'flex';
});

// Back from editor → sync content to form
$('btnEditorBack').addEventListener('click', function() {
  $('fBody').value = $('fBodyEditor').value;
  updateJSONStatus($('fBody').value, $('jsonStatus'));
  $('viewEditor').style.display = 'none';
  $('viewForm').style.display = 'flex';
});

// Format inside editor
$('btnEditorFormat').addEventListener('click', function() {
  var formatted = formatJSON($('fBodyEditor').value);
  if (formatted !== null) $('fBodyEditor').value = formatted;
  updateJSONStatus($('fBodyEditor').value, $('jsonStatusEditor'));
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') showList();
  if (e.key === 'Enter' && e.ctrlKey && $('viewForm').style.display !== 'none') saveRule();
});

load(function() {
  render();
  if (currentDraft && (currentDraft.url || currentDraft.body || currentDraft.name)) {
    showForm(null);
  }
});
