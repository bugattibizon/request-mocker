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
var injectHeaders = [];
var responseHeaderRows = [];
var darkTheme = false;
var editorSource = 'response';

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

// ── JSON editor ──────────────────────────────────────────────────────────────
function highlightJSON(text) {
  var out = '', i = 0, len = text.length;
  function e(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  while (i < len) {
    var ch = text[i];
    if (ch === '"') {
      var j = i + 1;
      while (j < len) { if (text[j]==='\\'){j+=2;continue;} if(text[j]==='"'){j++;break;} j++; }
      var k = j; while (k < len && (text[k]===' '||text[k]==='\t')) k++;
      out += text[k]===':' ? '<span class="jk">'+e(text.slice(i,j))+'</span>'
                           : '<span class="jv">'+e(text.slice(i,j))+'</span>';
      i = j;
    } else if (ch==='-'||(ch>='0'&&ch<='9')) {
      var j=i; if(text[j]==='-')j++;
      while(j<len&&text[j]>='0'&&text[j]<='9')j++;
      if(j<len&&text[j]==='.'){j++;while(j<len&&text[j]>='0'&&text[j]<='9')j++;}
      if(j<len&&(text[j]==='e'||text[j]==='E')){j++;if(j<len&&(text[j]==='+'||text[j]==='-'))j++;while(j<len&&text[j]>='0'&&text[j]<='9')j++;}
      out+='<span class="jn">'+e(text.slice(i,j))+'</span>'; i=j;
    } else if (text.slice(i,i+4)==='true') { out+='<span class="jb">true</span>';  i+=4;
    } else if (text.slice(i,i+5)==='false'){ out+='<span class="jb">false</span>'; i+=5;
    } else if (text.slice(i,i+4)==='null') { out+='<span class="jb">null</span>';  i+=4;
    } else if ('{[}],:'.includes(ch)) { out+='<span class="jp">'+e(ch)+'</span>'; i++;
    } else { out+=e(ch); i++; }
  }
  return out;
}

function syncEditor(taId, hlId, numsId) {
  var ta = $(taId), hl = $(hlId), nums = $(numsId);
  var text = ta.value;
  hl.innerHTML = highlightJSON(text) + '\n';
  var s = '', lines = text.split('\n');
  for (var i = 1; i <= lines.length; i++) s += i + '\n';
  nums.textContent = s;
  hl.scrollTop  = ta.scrollTop;
  hl.scrollLeft = ta.scrollLeft;
  nums.scrollTop = ta.scrollTop;
}

// ── Theme ─────────────────────────────────────────────────────────────────────
var _moonSVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
var _sunSVG  = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function applyTheme() {
  document.body.classList.toggle('dark', darkTheme);
  $('btnTheme').innerHTML = darkTheme ? _sunSVG : _moonSVG;
}
function saveTheme() { chrome.storage.local.set({ darkTheme: darkTheme }); }

// ── Method dropdown ───────────────────────────────────────────────────────────
var _mcClass = { GET:'mc-get', POST:'mc-post', PUT:'mc-put', DELETE:'mc-delete', PATCH:'mc-patch', HEAD:'mc-head', '*':'mc-any' };
function setMethod(val) {
  var btn = $('fMethodBtn');
  Object.values(_mcClass).forEach(function(c) { btn.classList.remove(c); });
  btn.classList.add(_mcClass[val] || 'mc-any');
  btn.querySelector('span').textContent = val === '*' ? 'ANY' : val;
  $('fMethod').value = val;
  $('fMethodDrop').classList.remove('open');
}
$('fMethodBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  $('fMethodDrop').classList.toggle('open');
});
document.querySelectorAll('.method-opt').forEach(function(opt) {
  opt.addEventListener('click', function() { setMethod(opt.dataset.val); });
});
document.addEventListener('click', function(e) {
  if (!e.target.closest('#methodWrap')) $('fMethodDrop').classList.remove('open');
});

// ── Storage ──────────────────────────────────────────────────────────────────
function load(cb) {
  chrome.storage.local.get({ rules: [], enabled: true, injectHeaders: [], darkTheme: false, pendingImport: null }, function(d) {
    rules         = d.rules;
    enabled       = d.enabled;
    injectHeaders = d.injectHeaders;
    darkTheme     = d.darkTheme;
    applyTheme();
    if (cb) cb(d.pendingImport);
  });
}
function save(cb) { chrome.storage.local.set({ rules: rules, enabled: enabled }, cb); }
function saveHeaders() { chrome.storage.local.set({ injectHeaders: injectHeaders }); updateCount(); }

function buildRule() {
  var urlPattern = $('fUrl').value.trim();
  if (!urlPattern) return null;
  var existing = editId ? rules.find(function(r) { return r.id === editId; }) : null;
  return {
    id:              editId || uid(),
    enabled:         existing ? existing.enabled : true,
    name:            $('fName').value.trim(),
    method:          $('fMethod').value,
    statusCode:      parseInt($('fStatus').value) || 200,
    delay:           parseInt($('fDelay').value)  || 0,
    urlPattern:      urlPattern,
    isRegex:         false,
    requestBody:     $('fReqBody').value,
    responseBody:    $('fBody').value,
    responseHeaders: responseHeadersToJSON(),
  };
}

function autoSave() {
  if (!editId) return; // new rules are saved on Back
  var rule = buildRule();
  if (!rule) return;
  var idx = rules.findIndex(function(r) { return r.id === editId; });
  if (idx >= 0) rules[idx] = rule;
  save(function() {});
}

// ── Response header rows ──────────────────────────────────────────────────────
function parseResponseHeaders(jsonStr) {
  try {
    var obj = JSON.parse(jsonStr || '{}');
    return Object.keys(obj).map(function(k) { return { id: uid(), name: k, value: String(obj[k]) }; });
  } catch(e) {
    return [];
  }
}

function responseHeadersToJSON() {
  var obj = {};
  responseHeaderRows.forEach(function(h) { if (h.name.trim()) obj[h.name.trim()] = h.value; });
  return Object.keys(obj).length ? JSON.stringify(obj) : '';
}

function renderResponseHeaders() {
  var list = $('rhList');
  list.innerHTML = '';
  if (!responseHeaderRows.length) {
    list.innerHTML = '<div style="padding:30px 20px;text-align:center;color:var(--text-dim);font-size:13px">No headers.<br><small>Click &ldquo;+ Add&rdquo; to add a response header.</small></div>';
    return;
  }
  var delSVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  responseHeaderRows.forEach(function(h) {
    var row = document.createElement('div');
    row.className = 'rh-row';
    row.innerHTML =
      '<div class="ih-cell"><input class="rh-name" data-id="' + h.id + '" type="text" placeholder="Header name" value="' + esc(h.name) + '"></div>' +
      '<span class="ih-sep">:</span>' +
      '<div class="ih-cell"><input class="rh-val" data-id="' + h.id + '" type="text" placeholder="Value" value="' + esc(h.value) + '"></div>' +
      '<button type="button" class="icon-btn danger rh-del" data-id="' + h.id + '" title="Delete">' + delSVG + '</button>';
    row.querySelector('.rh-name').addEventListener('input', function(e) {
      var item = responseHeaderRows.find(function(x) { return x.id === e.target.dataset.id; });
      if (item) { item.name = e.target.value; autoSave(); }
    });
    row.querySelector('.rh-val').addEventListener('input', function(e) {
      var item = responseHeaderRows.find(function(x) { return x.id === e.target.dataset.id; });
      if (item) { item.value = e.target.value; autoSave(); }
    });
    row.querySelector('.rh-del').addEventListener('click', function(e) {
      var id = e.currentTarget.dataset.id;
      responseHeaderRows = responseHeaderRows.filter(function(x) { return x.id !== id; });
      renderResponseHeaders(); autoSave();
    });
    list.appendChild(row);
  });
}

// ── Views ─────────────────────────────────────────────────────────────────────
function applyActiveTab() {
  var activeTab = document.querySelector('.hdr-tab.active');
  var isHeaders = activeTab && activeTab.dataset.lt === 'headers';
  $('ruleList').style.display     = isHeaders ? 'none' : '';
  $('ihPanel').style.display      = isHeaders ? 'flex' : 'none';
  $('btnAdd').style.display        = isHeaders ? 'none' : '';
  $('btnAddHeader').style.display  = isHeaders ? '' : 'none';
  if (isHeaders) renderHeaders();
}

function showList() {
  editId = null;
  $('viewForm').style.display   = 'none';
  $('viewEditor').style.display = 'none';
  $('viewList').style.display   = 'flex';
  applyActiveTab();
}

function showForm(id) {
  editId = id || null;
  var rule = id ? rules.find(function(r) { return r.id === id; }) : null;

  $('formTitle').textContent = id ? 'Edit Mock Rule' : 'New Mock Rule';

  if (rule) {
    $('fName').value    = rule.name          || '';
    setMethod(rule.method || 'GET');
    $('fStatus').value  = rule.statusCode    || 200;
    $('fDelay').value   = rule.delay         || 0;
    $('fUrl').value     = rule.urlPattern    || '';
    $('fBody').value    = rule.responseBody  || '';
    $('fReqBody').value = rule.requestBody   || '';
    responseHeaderRows  = parseResponseHeaders(rule.responseHeaders || '{"Content-Type":"application/json"}');
  } else {
    $('fName').value    = '';
    setMethod('GET');
    $('fStatus').value  = 200;
    $('fDelay').value   = 0;
    $('fUrl').value     = '';
    $('fBody').value    = '';
    $('fReqBody').value = '';
    responseHeaderRows  = parseResponseHeaders('{"Content-Type":"application/json"}');
  }

  updateJSONStatus($('fBody').value, $('jsonStatus'));
  syncEditor('fBody', 'bodyHL', 'bodyNums');
  syncEditor('fReqBody', 'reqBodyHL', 'reqBodyNums');
  updateJSONStatus($('fReqBody').value, $('jsonStatusReq'));
  renderResponseHeaders();

  // reset to Response tab
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelector('.tab-btn[data-tab="response"]').classList.add('active');
  $('tabResponse').classList.add('active');
  $('viewList').style.display = 'none';
  $('viewForm').style.display = 'flex';
}

// ── Count ─────────────────────────────────────────────────────────────────────
function updateCount() {
  var activeRules = rules.filter(function(r) { return r.enabled; }).length;
  var activeIH    = injectHeaders.filter(function(h) { return h.enabled; }).length;
  $('countRules').textContent   = rules.length         ? activeRules + '/' + rules.length         : '';
  $('countHeaders').textContent = injectHeaders.length  ? activeIH   + '/' + injectHeaders.length  : '';
}

// ── Render ────────────────────────────────────────────────────────────────────
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
  updateCount();
  var list = $('ruleList');
  list.querySelectorAll('.rule').forEach(function(el) { el.remove(); });
  $('empty').style.display = rules.length ? 'none' : '';
  rules.forEach(function(rule) {
    var el = document.createElement('div');
    el.className = 'rule' + (rule.enabled ? '' : ' disabled');
    el.innerHTML =
      '<label class="toggle toggle-sm">' +
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
        '<button type="button" class="icon-btn danger dbtn" data-id="' + rule.id + '" title="Delete">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
        '</button>' +
      '</div>';
    el.addEventListener('click', function(e) {
      if (!e.target.closest('.toggle') && !e.target.closest('.dbtn')) {
        showForm(rule.id);
      }
    });
    el.querySelector('.rtoggle').addEventListener('change', function(e) {
      var r = rules.find(function(x) { return x.id === e.target.dataset.id; });
      if (r) { r.enabled = e.target.checked; save(render); }
    });
    el.querySelector('.dbtn').addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('Delete this rule?')) {
        var id = e.currentTarget.dataset.id;
        rules = rules.filter(function(r) { return r.id !== id; });
        save(render);
      }
    });
    list.appendChild(el);
  });
}


// ── Inject headers ────────────────────────────────────────────────────────────
function renderHeaders() {
  var list = $('ihPanel');
  list.innerHTML = '';
  if (!injectHeaders.length) {
    list.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-dim);font-size:13px">No headers yet.<br><small>Add headers that will be injected into every request.</small></div>';
    return;
  }
  var delSVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  injectHeaders.forEach(function(h) {
    var row = document.createElement('div');
    row.className = 'ih-row';
    row.innerHTML =
      '<label class="toggle toggle-sm">' +
        '<input type="checkbox" class="ih-toggle" data-id="' + h.id + '"' + (h.enabled ? ' checked' : '') + '>' +
        '<span class="track"></span>' +
      '</label>' +
      '<div class="ih-cell"><input class="ih-name" data-id="' + h.id + '" type="text" placeholder="Header name" value="' + esc(h.name) + '"></div>' +
      '<span class="ih-sep">:</span>' +
      '<div class="ih-cell"><input class="ih-val" data-id="' + h.id + '" type="text" placeholder="Value" value="' + esc(h.value) + '"></div>' +
      '<button type="button" class="icon-btn danger ih-del" data-id="' + h.id + '" title="Delete">' + delSVG + '</button>';
    row.querySelector('.ih-toggle').addEventListener('change', function(e) {
      var item = injectHeaders.find(function(x) { return x.id === e.target.dataset.id; });
      if (item) { item.enabled = e.target.checked; saveHeaders(); }
    });
    row.querySelector('.ih-name').addEventListener('input', function(e) {
      var item = injectHeaders.find(function(x) { return x.id === e.target.dataset.id; });
      if (item) { item.name = e.target.value; saveHeaders(); }
    });
    row.querySelector('.ih-val').addEventListener('input', function(e) {
      var item = injectHeaders.find(function(x) { return x.id === e.target.dataset.id; });
      if (item) { item.value = e.target.value; saveHeaders(); }
    });
    row.querySelector('.ih-del').addEventListener('click', function(e) {
      var id = e.currentTarget.dataset.id;
      injectHeaders = injectHeaders.filter(function(x) { return x.id !== id; });
      saveHeaders(); renderHeaders();
    });
    list.appendChild(row);
  });
}

// ── Copy helper ───────────────────────────────────────────────────────────────
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(function() {
    var orig = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(function() { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
  });
}

// ── Wire up ───────────────────────────────────────────────────────────────────
$('globalToggle').addEventListener('change', function(e) { enabled = e.target.checked; save(render); });
$('btnAdd').addEventListener('click', function() { showForm(null); });
$('btnAddHeader').addEventListener('click', function() {
  injectHeaders.push({ id: uid(), enabled: true, name: '', value: '' });
  saveHeaders(); renderHeaders();
});
$('btnAddRH').addEventListener('click', function() {
  responseHeaderRows.push({ id: uid(), name: '', value: '' });
  renderResponseHeaders(); autoSave();
});

$('btnCopyResp').addEventListener('click', function() { copyText($('fBody').value, this); });
$('btnCopyReq').addEventListener('click',  function() { copyText($('fReqBody').value, this); });
$('btnEditorCopy').addEventListener('click', function() { copyText($('fBodyEditor').value, this); });

$('btnExpandReq').addEventListener('click', function() {
  editorSource = 'request';
  $('fBodyEditor').value = $('fReqBody').value;
  $('editorTitle').textContent = 'Request Body';
  syncEditor('fBodyEditor', 'editorHL', 'editorNums');
  updateJSONStatus($('fBodyEditor').value, $('jsonStatusEditor'));
  $('viewForm').style.display = 'none';
  $('viewEditor').style.display = 'flex';
});

$('btnTheme').addEventListener('click', function() {
  darkTheme = !darkTheme;
  applyTheme(); saveTheme();
});

document.querySelectorAll('.hdr-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.hdr-tab').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    $('viewForm').style.display   = 'none';
    $('viewEditor').style.display = 'none';
    $('viewList').style.display   = 'flex';
    applyActiveTab();
  });
});

$('btnBack').addEventListener('click', function() {
  if (!editId) {
    // New rule: save if URL is filled, otherwise discard
    var rule = buildRule();
    if (rule) {
      rules.push(rule);
      save(render);
    }
  } else {
    render();
  }
  showList();
});

// ── Import from DevTools panel ────────────────────────────────────────────────
function applyImport(entry) {
  chrome.storage.local.remove('pendingImport');
  showForm(null);
  $('fUrl').value = entry.url || '';
  setMethod(entry.method || 'GET');
  $('fStatus').value  = entry.statusCode || 200;
  var rawBody = entry.responseBody || '';
  $('fBody').value    = formatJSON(rawBody) || rawBody;
  $('fReqBody').value = entry.requestBody  || '';
  syncEditor('fBody',    'bodyHL',    'bodyNums');
  syncEditor('fReqBody', 'reqBodyHL', 'reqBodyNums');
  updateJSONStatus($('fBody').value,    $('jsonStatus'));
  updateJSONStatus($('fReqBody').value, $('jsonStatusReq'));
}

chrome.storage.onChanged.addListener(function(changes) {
  if (changes.pendingImport && changes.pendingImport.newValue) {
    applyImport(changes.pendingImport.newValue);
  }
});

['fName','fMethod','fStatus','fDelay','fUrl'].forEach(function(id) {
  $(id).addEventListener('input',  autoSave);
  $(id).addEventListener('change', autoSave);
});

// Inline body editor
$('fBody').addEventListener('input', function() {
  syncEditor('fBody', 'bodyHL', 'bodyNums');
  updateJSONStatus($('fBody').value, $('jsonStatus'));
  autoSave();
});
$('fBody').addEventListener('scroll', function() {
  syncEditor('fBody', 'bodyHL', 'bodyNums');
});

// Request body editor
$('fReqBody').addEventListener('input', function() {
  syncEditor('fReqBody', 'reqBodyHL', 'reqBodyNums');
  updateJSONStatus($('fReqBody').value, $('jsonStatusReq'));
  autoSave();
});
$('fReqBody').addEventListener('scroll', function() {
  syncEditor('fReqBody', 'reqBodyHL', 'reqBodyNums');
});
$('btnFormatReq').addEventListener('click', function() {
  var f = formatJSON($('fReqBody').value);
  if (f !== null) $('fReqBody').value = f;
  syncEditor('fReqBody', 'reqBodyHL', 'reqBodyNums');
  updateJSONStatus($('fReqBody').value, $('jsonStatusReq'));
});

// Format inline
$('btnFormat').addEventListener('click', function() {
  var f = formatJSON($('fBody').value);
  if (f !== null) $('fBody').value = f;
  syncEditor('fBody', 'bodyHL', 'bodyNums');
  updateJSONStatus($('fBody').value, $('jsonStatus'));
});

// Open fullscreen editor
$('btnExpand').addEventListener('click', function() {
  editorSource = 'response';
  $('fBodyEditor').value = $('fBody').value;
  $('editorTitle').textContent = 'Response Body';
  syncEditor('fBodyEditor', 'editorHL', 'editorNums');
  updateJSONStatus($('fBodyEditor').value, $('jsonStatusEditor'));
  $('viewForm').style.display = 'none';
  $('viewEditor').style.display = 'flex';
});

// Expand-view editor
$('fBodyEditor').addEventListener('input', function() {
  syncEditor('fBodyEditor', 'editorHL', 'editorNums');
  updateJSONStatus($('fBodyEditor').value, $('jsonStatusEditor'));
});
$('fBodyEditor').addEventListener('scroll', function() {
  syncEditor('fBodyEditor', 'editorHL', 'editorNums');
});

// Back from editor → sync content to correct field
$('btnEditorBack').addEventListener('click', function() {
  if (editorSource === 'request') {
    $('fReqBody').value = $('fBodyEditor').value;
    syncEditor('fReqBody', 'reqBodyHL', 'reqBodyNums');
    updateJSONStatus($('fReqBody').value, $('jsonStatusReq'));
  } else {
    $('fBody').value = $('fBodyEditor').value;
    syncEditor('fBody', 'bodyHL', 'bodyNums');
    updateJSONStatus($('fBody').value, $('jsonStatus'));
  }
  autoSave();
  $('viewEditor').style.display = 'none';
  $('viewForm').style.display = 'flex';
});

// Format inside editor
$('btnEditorFormat').addEventListener('click', function() {
  var f = formatJSON($('fBodyEditor').value);
  if (f !== null) $('fBodyEditor').value = f;
  syncEditor('fBodyEditor', 'editorHL', 'editorNums');
  updateJSONStatus($('fBodyEditor').value, $('jsonStatusEditor'));
});

// ── Ctrl+F search in expand view ──────────────────────────────────────────────
var searchMatches = [], searchIdx = 0;

function openSearch() {
  $('editorSearch').classList.add('open');
  $('searchInput').focus();
  $('searchInput').select();
}
function closeSearch() {
  $('editorSearch').classList.remove('open');
  $('searchCount').textContent = '';
  searchMatches = [];
  $('fBodyEditor').focus();
}
function runSearch() {
  var q = $('searchInput').value;
  searchMatches = [];
  if (!q) { $('searchCount').textContent = ''; return; }
  var text = $('fBodyEditor').value, lo = q.toLowerCase(), i = 0;
  while (i <= text.length - q.length) {
    var idx = text.toLowerCase().indexOf(lo, i);
    if (idx === -1) break;
    searchMatches.push(idx);
    i = idx + 1;
  }
  searchIdx = 0;
  jumpMatch(0);
}
function jumpMatch(delta) {
  if (!searchMatches.length) { $('searchCount').textContent = '0 results'; return; }
  searchIdx = ((searchIdx + delta) % searchMatches.length + searchMatches.length) % searchMatches.length;
  var start = searchMatches[searchIdx], end = start + $('searchInput').value.length;
  $('fBodyEditor').focus();
  $('fBodyEditor').setSelectionRange(start, end);
  syncEditor('fBodyEditor', 'editorHL', 'editorNums');
  $('searchCount').textContent = (searchIdx + 1) + ' / ' + searchMatches.length;
}

$('btnEditorSearch').addEventListener('click', openSearch);
$('searchClose').addEventListener('click', closeSearch);
$('searchPrev').addEventListener('click', function() { jumpMatch(-1); });
$('searchNext').addEventListener('click', function() { jumpMatch(1); });
$('searchInput').addEventListener('input', runSearch);
$('searchInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.shiftKey ? jumpMatch(-1) : jumpMatch(1); e.preventDefault(); }
  if (e.key === 'Escape') closeSearch();
});

// Tab switching (form view)
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    btn.classList.add('active');
    $('tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)).classList.add('active');
  });
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && $('editorSearch').classList.contains('open')) { closeSearch(); return; }
  if (e.key === 'Escape') showList();
  if (e.key === 'Enter' && e.ctrlKey && $('viewForm').style.display !== 'none') $('btnBack').click();
  if (e.key === 'f' && e.ctrlKey && $('viewEditor').style.display !== 'none') { e.preventDefault(); openSearch(); }
});

load(function(pendingImport) {
  render();
  applyActiveTab();
  if (pendingImport) {
    applyImport(pendingImport);
  }
});
