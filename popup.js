'use strict';

var rules = [];
var enabled = true;
var editId = null;

function $(id) { return document.getElementById(id); }
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Storage ────────────────────────────────────────────────────────────────
function load(cb) {
  chrome.storage.local.get({ rules: [], enabled: true, formDraft: null }, function(d) {
    rules = d.rules;
    enabled = d.enabled;
    if (cb) cb(d.formDraft);
  });
}
function save(cb) {
  chrome.storage.local.set({ rules: rules, enabled: enabled }, cb);
}

// ── Draft persistence ──────────────────────────────────────────────────────
function saveDraft() {
  var draft = {
    editId:   editId,
    name:     $('fName').value,
    method:   $('fMethod').value,
    status:   $('fStatus').value,
    delay:    $('fDelay').value,
    url:      $('fUrl').value,
    regex:    $('fRegex').checked,
    body:     $('fBody').value,
    headers:  $('fHeaders').value,
  };
  chrome.storage.local.set({ formDraft: draft });
}

function clearDraft() {
  chrome.storage.local.remove('formDraft');
}

function attachDraftListeners() {
  var ids = ['fName', 'fMethod', 'fStatus', 'fDelay', 'fUrl', 'fBody', 'fHeaders'];
  ids.forEach(function(id) { $(id).addEventListener('input', saveDraft); });
  $('fRegex').addEventListener('change', saveDraft);
  $('fMethod').addEventListener('change', saveDraft);
}

// ── Views ──────────────────────────────────────────────────────────────────
function showList() {
  $('viewList').classList.remove('hidden');
  $('viewForm').classList.add('hidden');
  clearDraft();
  editId = null;
}

function showForm(id, draft) {
  editId = id || null;
  var rule = id ? rules.find(function(r) { return r.id === id; }) : null;
  var hasDraft = !id && draft && (draft.url || draft.body || draft.name);

  $('formTitle').textContent = id ? 'Edit Mock Rule' : 'New Mock Rule';

  var badge = $('draftBadge');
  if (hasDraft) {
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  // Populate from draft, rule, or defaults
  var src = hasDraft ? draft : rule;
  $('fName').value    = src ? (hasDraft ? src.name    : (src.name || ''))          : '';
  $('fMethod').value  = src ? (hasDraft ? src.method  : src.method)                : 'GET';
  $('fStatus').value  = src ? (hasDraft ? src.status  : src.statusCode)            : 200;
  $('fDelay').value   = src ? (hasDraft ? src.delay   : (src.delay || 0))          : 0;
  $('fUrl').value     = src ? (hasDraft ? src.url     : src.urlPattern)            : '';
  $('fRegex').checked = src ? (hasDraft ? src.regex   : !!src.isRegex)             : false;
  $('fBody').value    = src ? (hasDraft ? src.body    : (src.responseBody || ''))  : '';
  $('fHeaders').value = src
    ? (hasDraft ? src.headers : (src.responseHeaders || '{"Content-Type": "application/json"}'))
    : '{"Content-Type": "application/json"}';

  $('viewList').classList.add('hidden');
  $('viewForm').classList.remove('hidden');
  $('fUrl').focus();
}

// ── Rendering ──────────────────────────────────────────────────────────────
function methodBadge(m) {
  var map = { GET:'m-GET', POST:'m-POST', PUT:'m-PUT', DELETE:'m-DELETE', PATCH:'m-PATCH', '*':'m-ANY' };
  return '<span class="badge ' + (map[m] || 'm-ANY') + '">' + (m === '*' ? 'ANY' : m) + '</span>';
}
function statusBadge(code) {
  var n = parseInt(code);
  var cls = n >= 500 ? 's-err' : n >= 400 ? 's-warn' : 's-ok';
  return '<span class="status ' + cls + '">' + n + '</span>';
}

function render() {
  $('globalToggle').checked = enabled;
  var active = rules.filter(function(r) { return r.enabled; }).length;
  $('count').textContent = rules.length ? (active + '/' + rules.length + ' active') : '';

  var list = $('ruleList');
  list.querySelectorAll('.rule').forEach(function(el) { el.remove(); });

  if (!rules.length) {
    $('empty').style.display = '';
    return;
  }
  $('empty').style.display = 'none';

  rules.forEach(function(rule) {
    var el = document.createElement('div');
    el.className = 'rule' + (rule.enabled ? '' : ' disabled');
    el.innerHTML =
      '<label class="toggle" style="width:32px;height:18px">' +
        '<input type="checkbox" class="rule-toggle" data-id="' + rule.id + '"' + (rule.enabled ? ' checked' : '') + '>' +
        '<span class="track"></span>' +
      '</label>' +
      '<div class="rule-body">' +
        '<div class="rule-name">' + esc(rule.name || rule.urlPattern) + '</div>' +
        '<div class="rule-meta">' +
          methodBadge(rule.method) +
          statusBadge(rule.statusCode) +
          (rule.delay ? '<span class="meta-text">⏱ ' + rule.delay + 'ms</span>' : '') +
          (rule.isRegex ? '<span class="meta-text">regex</span>' : '') +
        '</div>' +
        '<div class="rule-url">' + esc(rule.urlPattern) + '</div>' +
      '</div>' +
      '<div class="rule-actions">' +
        '<button class="icon-btn edit-btn" data-id="' + rule.id + '" title="Edit">✏️</button>' +
        '<button class="icon-btn danger del-btn" data-id="' + rule.id + '" title="Delete">🗑</button>' +
      '</div>';

    el.querySelector('.rule-toggle').addEventListener('change', function(e) {
      var r = rules.find(function(x) { return x.id === e.target.dataset.id; });
      if (r) { r.enabled = e.target.checked; save(render); }
    });
    el.querySelector('.edit-btn').addEventListener('click', function(e) {
      showForm(e.currentTarget.dataset.id, null);
    });
    el.querySelector('.del-btn').addEventListener('click', function(e) {
      if (confirm('Delete this rule?')) {
        var id = e.currentTarget.dataset.id;
        rules = rules.filter(function(r) { return r.id !== id; });
        save(render);
      }
    });

    list.appendChild(el);
  });
}

// ── Save ───────────────────────────────────────────────────────────────────
function saveRule() {
  var urlPattern = $('fUrl').value.trim();
  if (!urlPattern) { $('fUrl').focus(); return; }

  var existing = editId ? rules.find(function(r) { return r.id === editId; }) : null;
  var rule = {
    id:              editId || uid(),
    enabled:         existing ? existing.enabled : true,
    name:            $('fName').value.trim(),
    method:          $('fMethod').value,
    statusCode:      parseInt($('fStatus').value) || 200,
    delay:           parseInt($('fDelay').value) || 0,
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

  clearDraft();
  save(render);
  showList();
}

// ── Events ─────────────────────────────────────────────────────────────────
$('globalToggle').addEventListener('change', function(e) {
  enabled = e.target.checked;
  save(render);
});
$('btnAdd').addEventListener('click', function() {
  chrome.storage.local.get({ formDraft: null }, function(d) {
    showForm(null, d.formDraft);
  });
});
$('btnCancel').addEventListener('click', showList);
$('btnSave').addEventListener('click', saveRule);

attachDraftListeners();

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') showList();
  if (e.key === 'Enter' && e.ctrlKey && !$('viewForm').classList.contains('hidden')) saveRule();
});

load(function(draft) {
  render();
  // If there's a draft saved (e.g. popup was closed mid-edit), re-open the form
  if (draft && (draft.url || draft.body || draft.name)) {
    showForm(null, draft);
  }
});
