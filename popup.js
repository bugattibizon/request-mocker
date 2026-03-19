'use strict';

var rules = [];
var enabled = true;
var editId = null;
var currentDraft = null;   // loaded once at startup, kept in sync

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
    currentDraft = d.formDraft;
    if (cb) cb();
  });
}

function save(cb) {
  chrome.storage.local.set({ rules: rules, enabled: enabled }, cb);
}

// ── Draft ──────────────────────────────────────────────────────────────────
function saveDraft() {
  currentDraft = {
    name:    $('fName').value,
    method:  $('fMethod').value,
    status:  $('fStatus').value,
    delay:   $('fDelay').value,
    url:     $('fUrl').value,
    regex:   $('fRegex').checked,
    body:    $('fBody').value,
    headers: $('fHeaders').value,
  };
  chrome.storage.local.set({ formDraft: currentDraft });
}

function clearDraft() {
  currentDraft = null;
  chrome.storage.local.remove('formDraft');
}

// ── Views ──────────────────────────────────────────────────────────────────
function showList() {
  $('viewForm').classList.add('hidden');
  $('viewList').classList.remove('hidden');
  clearDraft();
  editId = null;
}

function showForm(id) {
  editId = id || null;
  var rule = id ? rules.find(function(r) { return r.id === id; }) : null;

  // For a new rule, use saved draft if available
  var draft = (!id && currentDraft) ? currentDraft : null;
  var hasDraft = !!draft;

  $('formTitle').textContent = id ? 'Edit Mock Rule' : 'New Mock Rule';
  $('draftBadge').classList.toggle('hidden', !hasDraft);

  if (hasDraft) {
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
      showForm(e.currentTarget.dataset.id);
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

// ── Save rule ──────────────────────────────────────────────────────────────
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

  save(render);
  showList();        // also calls clearDraft()
}

// ── Events ─────────────────────────────────────────────────────────────────
$('globalToggle').addEventListener('change', function(e) {
  enabled = e.target.checked;
  save(render);
});

$('btnAdd').addEventListener('click', function() { showForm(null); });
$('btnCancel').addEventListener('click', showList);
$('btnSave').addEventListener('click', saveRule);

// Save draft on every keystroke / change
['fName','fMethod','fStatus','fDelay','fUrl','fBody','fHeaders'].forEach(function(id) {
  $(id).addEventListener('input', saveDraft);
  $(id).addEventListener('change', saveDraft);
});
$('fRegex').addEventListener('change', saveDraft);

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') showList();
  if (e.key === 'Enter' && e.ctrlKey && !$('viewForm').classList.contains('hidden')) saveRule();
});

// ── Init ───────────────────────────────────────────────────────────────────
load(function() {
  render();
  // Auto-restore the form if a draft was in progress
  if (currentDraft && (currentDraft.url || currentDraft.body || currentDraft.name)) {
    showForm(null);
  }
});
