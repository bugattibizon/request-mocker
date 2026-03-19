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
  chrome.storage.local.get({ rules: [], enabled: true }, function(d) {
    rules = d.rules;
    enabled = d.enabled;
    if (cb) cb();
  });
}
function save(cb) {
  chrome.storage.local.set({ rules: rules, enabled: enabled }, cb);
}

// ── Views ──────────────────────────────────────────────────────────────────
function showList() {
  $('viewList').classList.remove('hidden');
  $('viewForm').classList.add('hidden');
  editId = null;
}

function showForm(id) {
  editId = id || null;
  var rule = id ? rules.find(function(r) { return r.id === id; }) : null;

  $('formTitle').textContent = id ? 'Edit Mock Rule' : 'New Mock Rule';
  $('fName').value    = rule ? (rule.name || '') : '';
  $('fMethod').value  = rule ? rule.method : 'GET';
  $('fStatus').value  = rule ? rule.statusCode : 200;
  $('fDelay').value   = rule ? (rule.delay || 0) : 0;
  $('fUrl').value     = rule ? rule.urlPattern : '';
  $('fRegex').checked = rule ? !!rule.isRegex : false;
  $('fBody').value    = rule ? (rule.responseBody || '') : '';
  $('fHeaders').value = rule
    ? (rule.responseHeaders || '{"Content-Type": "application/json"}')
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
      '<label class="toggle" style="width:30px;height:17px">' +
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

  save(render);
  showList();
}

// ── Events ─────────────────────────────────────────────────────────────────
$('globalToggle').addEventListener('change', function(e) {
  enabled = e.target.checked;
  save(render);
});
$('btnAdd').addEventListener('click', function() { showForm(); });
$('btnCancel').addEventListener('click', showList);
$('btnSave').addEventListener('click', saveRule);

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') showList();
  if (e.key === 'Enter' && e.ctrlKey && !$('viewForm').classList.contains('hidden')) saveRule();
});

load(render);
