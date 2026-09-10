// Request Mocker — page mode: "dev-env launcher" theme for the Jenkins
// job/dev-env build form. Renders a compact launcher over the native parameters
// form (Shadow DOM overlay) and drives the real inputs, so the native Build
// submit posts unchanged. Toggle from the extension popup (storage: jenkinsTheme).
(() => {
  'use strict';

  const REPO = { WARMY:'warmy-backend', REMS:'rems', SMS:'sms', CHECKER:'placement-checker',
    DMS:'dms', DDM:'ddm', LS:'ls', TMS:'tms', BMS:'bms', UBS:'ubs', EMS:'ems' };
  const SHARED = ['main','main_core','release','staging'];

  const CSS = `
:host{ all:initial; }
*{box-sizing:border-box}
.wrap{
  position:relative; width:100%; overflow:hidden;
  --ground:#f2f4f7;--surface:#fff;--surface-2:#f5f7f9;--ink:#1a1d21;--ink-2:#4e5560;--ink-3:#79818d;
  --line:#dce0e5;--line-2:#c4cad2;--accent:#14618f;--accent-soft:#e6eff6;
  --ok:#16693f;--ok-soft:#e2f1e7;--warn:#8f5a00;--warn-soft:#fbf0d9;--danger:#ab2f26;--danger-soft:#fbe7e4;
  --shadow:0 1px 2px rgba(26,29,33,.05),0 6px 20px -12px rgba(26,29,33,.16);
  --pop:0 12px 32px -8px rgba(26,29,33,.26);--r:8px;
  background:var(--ground); color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-size:13px; line-height:1.45;
  -webkit-font-smoothing:antialiased;
}
.mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
button,input,select{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
.lbl{font-size:10px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);font-family:ui-monospace,monospace}

.app{height:100%;display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;max-width:1360px;margin:0 auto;padding:14px 20px 12px;gap:12px}
.topbar{display:flex;align-items:center;gap:14px}
.crumb{display:flex;align-items:baseline;gap:8px}
.crumb b{font-size:16px;font-weight:600;letter-spacing:-.01em}
.crumb span{color:var(--ink-3);font-size:12px}
.spacer{flex:1}
.ghost{background:none;border:1px solid var(--line);border-radius:6px;padding:5px 10px;color:var(--ink-2);cursor:pointer;font-size:12px}
.ghost:hover{border-color:var(--line-2);color:var(--ink)}

.envbar{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:12px 14px;display:grid;grid-template-columns:230px 1fr 1.25fr;gap:14px;align-items:start}
.field{display:flex;flex-direction:column;gap:6px;min-width:0}
.field .hint{font-size:11px;color:var(--ink-3)}
.snapshot{border-left:3px solid var(--accent);margin-left:-14px;padding-left:11px}
.seg{display:flex;background:var(--surface-2);border:1px solid var(--line);border-radius:7px;padding:2px;gap:2px}
.seg button{flex:1;background:none;border:0;border-radius:5px;padding:6px 4px;cursor:pointer;font-size:12px;font-weight:500;color:var(--ink-2);text-transform:lowercase}
.seg button[aria-pressed="true"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.12);font-weight:600}
.seg button[data-act="destroy"][aria-pressed="true"]{color:var(--danger)}
.seg button:hover{color:var(--ink)}
.snapchips{display:flex;gap:6px;flex-wrap:wrap}
.chip{background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:6px 9px;cursor:pointer;font-size:12px;color:var(--ink-2);font-family:ui-monospace,monospace}
.chip[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);font-weight:500}
.envname{position:relative}
.envname input{width:100%;background:var(--surface-2);border:1px solid var(--line);border-radius:7px;padding:7px 10px;font-family:ui-monospace,monospace;font-size:13px}
.envname input:focus{border-color:var(--accent);background:var(--surface);outline:none;box-shadow:0 0 0 3px var(--accent-soft)}
.ns{font-size:11px;color:var(--ink-3);font-family:ui-monospace,monospace}
.ns b{color:var(--ink-2);font-weight:500}

.toolbar{display:flex;align-items:center;gap:10px;padding:0 2px}
.count{color:var(--ink-3);font-size:11px;font-variant-numeric:tabular-nums}
.bulk{display:flex;align-items:center;gap:4px}
.bulk button{background:none;border:0;color:var(--ink-2);cursor:pointer;font-size:12px;padding:3px 6px;border-radius:5px}
.bulk button:hover{background:var(--surface);color:var(--accent)}
.bulk s{color:var(--line-2);text-decoration:none}
.filter{margin-left:auto;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:5px 9px;width:170px;font-size:12px}
.filter:focus{border-color:var(--accent);outline:none}

.matrix{min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-content:start;padding:1px}
.svc{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:10px 11px 11px;display:flex;flex-direction:column;gap:9px;box-shadow:var(--shadow)}
.svc.active{border-color:var(--line-2)}
.svc.idle{background:var(--surface-2);box-shadow:none;border-style:dashed}
.svc.hidden{display:none}
.svc-head{display:flex;align-items:baseline;gap:7px}
.svc-head b{font-family:ui-monospace,monospace;font-size:12.5px;font-weight:600;letter-spacing:.02em}
.svc-head em{font-style:normal;color:var(--ink-3);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.svc.idle .svc-head b{color:var(--ink-2)}
.offmain{margin-left:auto;flex:none;font-size:9.5px;font-weight:600;letter-spacing:.04em;color:var(--warn);background:var(--warn-soft);border-radius:4px;padding:2px 5px;font-family:ui-monospace,monospace;visibility:hidden}
.svc.diff .offmain{visibility:visible}
.tgs{display:flex;gap:6px}
.tg{flex:1;display:flex;align-items:center;gap:7px;cursor:pointer;border:1px solid var(--line);border-radius:6px;padding:5px 7px;background:var(--surface-2);font-size:11.5px;color:var(--ink-2);user-select:none}
.tg:hover{border-color:var(--line-2)}
.tg input{appearance:none;margin:0;width:14px;height:14px;flex:none;border:1.5px solid var(--line-2);border-radius:4px;background:var(--surface);position:relative;cursor:pointer}
.tg input:checked{background:var(--ok);border-color:var(--ok)}
.tg input:checked::after{content:"";position:absolute;left:3.5px;top:.5px;width:4px;height:8px;border:solid #fff;border-width:0 1.6px 1.6px 0;transform:rotate(42deg)}
.tg-build input:checked{background:var(--warn);border-color:var(--warn)}
.tg:has(input:checked){background:var(--ok-soft);border-color:var(--ok);color:var(--ok);font-weight:500}
.tg-build:has(input:checked){background:var(--warn-soft);border-color:var(--warn);color:var(--warn)}
.tg:has(input:disabled){cursor:default;opacity:.75}
.branch{width:100%;display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:6px 8px;text-align:left}
.branch:hover:not(:disabled){border-color:var(--accent);background:var(--surface)}
.branch:disabled{cursor:not-allowed;opacity:.45}
.branch .bn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,monospace;font-size:12px}
.branch .cv{flex:none;color:var(--ink-3);font-size:9px}
.svc.diff .branch .bn{color:var(--warn)}

.destroy{min-height:0;display:none;align-items:center;justify-content:center;background:var(--surface);border:1px solid var(--danger);border-radius:var(--r);box-shadow:var(--shadow)}
.app.act-destroy .matrix,.app.act-destroy .toolbar{display:none}
.app.act-destroy .destroy{display:flex}
.destroy-in{max-width:520px;padding:26px;text-align:center;display:flex;flex-direction:column;gap:10px}
.destroy-in h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
.destroy-in p{margin:0;color:var(--ink-2);max-width:46ch;align-self:center}

.actionbar{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:10px 12px;display:flex;align-items:center;gap:14px}
.summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.summary .pill{font-family:ui-monospace,monospace;font-size:11.5px;padding:3px 8px;border-radius:5px;background:var(--surface-2);border:1px solid var(--line);color:var(--ink-2);font-variant-numeric:tabular-nums}
.summary .pill.k{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.summary .pill.d{background:var(--ok-soft);border-color:var(--ok);color:var(--ok)}
.summary .pill.b{background:var(--warn-soft);border-color:var(--warn);color:var(--warn)}
.summary .pill.x{background:var(--danger-soft);border-color:var(--danger);color:var(--danger)}
.kbd{margin-left:auto;color:var(--ink-3);font-size:11px;display:flex;align-items:center;gap:5px;flex:none}
.kbd b{font-family:ui-monospace,monospace;border:1px solid var(--line);border-radius:4px;padding:1px 5px;font-weight:400}
.cancel{background:none;border:1px solid var(--line);border-radius:7px;padding:8px 14px;color:var(--ink-2);cursor:pointer}
.cancel:hover{border-color:var(--line-2);color:var(--ink)}
.run{border:0;border-radius:7px;padding:8px 18px;cursor:pointer;font-weight:600;font-size:13px;background:var(--ok);color:#fff;display:flex;align-items:center;gap:8px}
.run:hover{filter:brightness(1.07)}
.app.act-destroy .run{background:var(--danger)}

.pop{position:fixed;z-index:2147483100;width:296px;max-height:340px;display:none;background:var(--surface);border:1px solid var(--line-2);border-radius:9px;box-shadow:var(--pop);flex-direction:column;overflow:hidden}
.pop.open{display:flex}
.pop-top{padding:8px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:6px}
.pop-top .who{display:flex;justify-content:space-between;align-items:center}
.pop-top input{width:100%;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:6px 9px;font-family:ui-monospace,monospace;font-size:12px}
.pop-top input:focus{border-color:var(--accent);outline:none}
.pop-list{overflow:auto;padding:4px}
.grp{padding:8px 8px 4px}
.opt{width:100%;display:flex;align-items:center;gap:8px;background:none;border:0;padding:5px 8px;border-radius:5px;cursor:pointer;text-align:left;font-family:ui-monospace,monospace;font-size:12px;color:var(--ink)}
.opt:hover,.opt.cur{background:var(--accent-soft);color:var(--accent)}
.opt.sel{font-weight:600}
.opt .tick{flex:none;width:12px;color:var(--accent);opacity:0}
.opt.sel .tick{opacity:1}
.opt .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{padding:14px 10px;color:var(--ink-3);font-size:12px;text-align:center}
@media (max-width:1120px){.matrix{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:820px){.envbar{grid-template-columns:1fr}.matrix{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

  const APP = `
<div class="wrap">
 <div class="app" id="app">
  <div class="topbar">
    <div class="crumb"><b>dev-env</b><span>ephemeral environment launcher</span></div>
    <div class="spacer"></div>
    <button class="ghost" id="classicBtn" title="Show the native Jenkins form">Classic UI</button>
  </div>
  <div class="envbar">
    <div class="field snapshot">
      <span class="lbl">Snapshot_env</span>
      <div class="snapchips" id="snapChips"></div>
      <span class="hint">Databases are restored from this snapshot.</span>
    </div>
    <div class="field">
      <span class="lbl">Action</span>
      <div class="seg" id="seg">
        <button data-act="create" aria-pressed="false">create</button>
        <button data-act="update" aria-pressed="false">update</button>
        <button data-act="destroy" aria-pressed="false">destroy</button>
      </div>
      <span class="hint" id="actHint"></span>
    </div>
    <div class="field envname">
      <span class="lbl">Branch — environment name</span>
      <input id="envInput" spellcheck="false" placeholder="pr-123, feature-auth">
      <span class="ns">namespace <b id="nsOut" class="mono"></b></span>
    </div>
  </div>
  <div class="toolbar">
    <span class="lbl">Services</span>
    <span class="count" id="svcCount"></span>
    <div class="bulk" id="bulk">
      <button data-bulk="all">deploy all</button><s>·</s>
      <button data-bulk="none">none</button><s>·</s>
      <button data-bulk="offmain">only off-main</button><s>·</s>
      <button data-bulk="reset">reset branches to main</button>
    </div>
    <input class="filter mono" id="svcFilter" placeholder="filter services…" spellcheck="false">
  </div>
  <div class="matrix" id="matrix"></div>
  <div class="destroy"><div class="destroy-in">
    <h2>Tear down <span class="mono" id="destroyName"></span></h2>
    <p>Namespace, pods, ingress and the restored databases are removed. Nothing else on this
       page applies to a teardown, so the rest is out of the way.</p>
  </div></div>
  <div class="actionbar">
    <div class="summary" id="summary"></div>
    <div class="kbd"><b>⌘</b><b>↵</b> to run</div>
    <button class="run" id="runBtn">▶ Build</button>
  </div>
 </div>
 <div class="pop" id="pop">
   <div class="pop-top"><div class="who"><span class="lbl" id="popWho"></span><span class="count" id="popCount"></span></div>
     <input id="popSearch" placeholder="search branch…" spellcheck="false"></div>
   <div class="pop-list" id="popList"></div>
 </div>
</div>`;

  const CHEV = '<svg class="cv" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3.5 5 7.5 9 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  function build(form) {
    // ---- map native params ----
    const P = {};
    for (const b of form.querySelectorAll('div[name="parameter"]')) {
      const nm = (b.querySelector('input[name="name"]') || {}).value; if (!nm || P[nm]) continue;
      const sel = b.querySelector('select[name="value"]');
      const chk = b.querySelector('input[type="checkbox"][name="value"], input[type="checkbox"]');
      const txt = b.querySelector('input[type="text"][name="value"], input[type="text"]:not([name="name"])');
      P[nm] = { el: sel || chk || txt, type: sel ? 'select' : chk ? 'check' : 'text' };
    }
    const has = n => !!P[n];
    const gv  = n => has(n) ? (P[n].type === 'check' ? P[n].el.checked : P[n].el.value) : null;
    const sv  = (n, v) => { if (!has(n)) return; const e = P[n].el;
      if (P[n].type === 'check') e.checked = !!v; else e.value = v;
      e.dispatchEvent(new Event('change', { bubbles: true })); e.dispatchEvent(new Event('input', { bubbles: true })); };
    const opts = n => has(n) && P[n].type === 'select' ? [...P[n].el.options].map(o => o.value) : ['main'];

    const SVC = Object.keys(P).filter(n => n.endsWith('_DEPLOY')).map(n => n.slice(0, -7));

    // ---- shadow mount into the main panel — sidebar + top bar stay native ----
    document.getElementById('rmx-host')?.remove();
    const mount = document.querySelector('#main-panel') || document.body;
    [...mount.children].forEach(c => { if (c.id !== 'rmx-host') { c.setAttribute('data-rmx-hidden', ''); c.style.display = 'none'; } });
    const host = document.createElement('div'); host.id = 'rmx-host'; host.style.cssText = 'display:block;width:100%';
    mount.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>${APP}`;
    const $ = s => root.getElementById(s);
    const q = s => root.querySelector(s);
    // fill the panel down to the viewport bottom so the matrix scrolls inside, not the page
    const wrapEl = root.querySelector('.wrap');
    const fit = () => { wrapEl.style.height = Math.max(420, innerHeight - host.getBoundingClientRect().top - 14) + 'px'; };
    fit(); window.__rmxFit = fit; addEventListener('resize', fit);

    // snapshot chips
    const snaps = opts('SNAPSHOT_ENV');
    $('snapChips').innerHTML = snaps.map(v => `<button class="chip" data-snap="${v}">${v}</button>`).join('');

    // matrix tiles
    $('matrix').innerHTML = SVC.map(k => `
      <article class="svc" data-k="${k}">
        <div class="svc-head"><b>${k}</b><em>${REPO[k] || ''}</em><span class="offmain">off main</span></div>
        <div class="tgs">
          <label class="tg"><input type="checkbox" data-r="DEPLOY" data-k="${k}"><span>Deploy</span></label>
          <label class="tg tg-build"><input type="checkbox" data-r="BUILD" data-k="${k}"><span>Build</span></label>
        </div>
        <button class="branch" data-k="${k}"><span class="bn"></span>${CHEV}</button>
      </article>`).join('');

    // ---- render from native state ----
    function render() {
      const action = gv('ACTION') || 'update';
      const app = $('app'); app.classList.toggle('act-destroy', action === 'destroy');
      [...$('seg').children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.act === action)));
      $('actHint').textContent = { create:'Full env setup — every service is deployed.',
        update:'Rebuild or redeploy only the services you switch on.',
        destroy:'Tear down the namespace and its databases.' }[action];

      let d = 0, b = 0, off = 0;
      for (const k of SVC) {
        const el = q(`.svc[data-k="${k}"]`);
        const dep = !!gv(k + '_DEPLOY');
        const bld = !!gv(k + '_BUILD');
        const br  = has(k + '_BRANCH') ? gv(k + '_BRANCH') : 'main';
        const live = dep || bld, diff = br !== 'main';
        const cbD = el.querySelector('input[data-r="DEPLOY"]'), cbB = el.querySelector('input[data-r="BUILD"]');
        cbD.checked = dep; cbD.disabled = false;
        cbB.checked = bld;
        el.querySelector('.bn').textContent = br;
        const brBtn = el.querySelector('.branch'); brBtn.disabled = !live;
        el.classList.toggle('idle', !live); el.classList.toggle('active', live);
        el.classList.toggle('diff', diff && live);
        if (dep) d++; if (bld) b++; if (diff && live) off++;
      }

      const ns = 'ephemeral-' + ((gv('BRANCH') || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') || '…');
      $('nsOut').textContent = ns; $('destroyName').textContent = ns;

      const snap = gv('SNAPSHOT_ENV');
      [...$('snapChips').children].forEach(c => c.setAttribute('aria-pressed', String(c.dataset.snap === snap)));

      $('summary').innerHTML = action === 'destroy'
        ? `<span class="pill x">destroy</span><span class="pill">${ns}</span><span class="pill">databases dropped</span>`
        : `<span class="pill k">${action}</span><span class="pill">${ns}</span>
           <span class="pill d">${d} deploy</span>
           <span class="pill ${b?'b':''}">${b} image${b===1?'':'s'} rebuilt</span>
           <span class="pill">snapshot ${snap}</span>
           ${off?`<span class="pill b">${off} off main</span>`:''}`;
      $('runBtn').textContent = action === 'destroy' ? 'Destroy environment' : '▶ Build';
    }

    // ---- events → native ----
    $('seg').addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]'); if (!btn) return;
      const a = btn.dataset.act; sv('ACTION', a);
      if (a === 'create') SVC.forEach(k => sv(k + '_DEPLOY', true)); // create defaults to deploy-all
      render();
    });
    $('snapChips').addEventListener('click', e => { const btn = e.target.closest('button[data-snap]'); if (btn) { sv('SNAPSHOT_ENV', btn.dataset.snap); render(); } });
    $('envInput').value = gv('BRANCH') || '';
    $('envInput').addEventListener('input', e => { sv('BRANCH', e.target.value); render(); });
    $('matrix').addEventListener('change', e => { const cb = e.target.closest('input[data-r]'); if (cb) { sv(cb.dataset.k + '_' + cb.dataset.r, cb.checked); render(); } });

    $('bulk').addEventListener('click', e => { const btn = e.target.closest('button[data-bulk]'); if (!btn) return;
      const m = btn.dataset.bulk;
      for (const k of SVC) {
        if (m === 'all') sv(k + '_DEPLOY', true);
        if (m === 'none') { sv(k + '_DEPLOY', false); sv(k + '_BUILD', false); }
        if (m === 'offmain') sv(k + '_DEPLOY', gv(k + '_BRANCH') !== 'main');
        if (m === 'reset' && has(k + '_BRANCH')) sv(k + '_BRANCH', 'main');
      }
      render();
    });

    $('svcFilter').addEventListener('input', e => { const s = e.target.value.trim().toLowerCase(); let n = 0;
      for (const k of SVC) { const hit = !s || k.toLowerCase().includes(s) || (REPO[k]||'').includes(s) || String(gv(k+'_BRANCH')||'').toLowerCase().includes(s);
        q(`.svc[data-k="${k}"]`).classList.toggle('hidden', !hit); if (hit) n++; }
      $('svcCount').textContent = n === SVC.length ? n : `${n} / ${SVC.length}`;
    });

    // ---- branch popover ----
    const pop = $('pop'), popList = $('popList'), popSearch = $('popSearch');
    let popKey = null, cursor = 0, shown = [];
    function paint() {
      const all = opts(popKey + '_BRANCH'); const s = popSearch.value.trim().toLowerCase();
      const hits = all.filter(x => x.toLowerCase().includes(s));
      const shared = hits.filter(x => SHARED.includes(x)), tickets = hits.filter(x => !SHARED.includes(x));
      shown = [...shared, ...tickets]; cursor = Math.min(cursor, Math.max(shown.length - 1, 0));
      $('popCount').textContent = `${hits.length} of ${all.length}`;
      const cur = gv(popKey + '_BRANCH');
      const row = x => `<button class="opt ${x===cur?'sel':''} ${shown[cursor]===x?'cur':''}" data-v="${x}"><span class="tick">✓</span><span class="t">${x}</span></button>`;
      popList.innerHTML = shown.length
        ? (shared.length ? `<div class="grp lbl">shared</div>` + shared.map(row).join('') : '')
        + (tickets.length ? `<div class="grp lbl">ticket branches</div>` + tickets.map(row).join('') : '')
        : `<div class="empty">No branch matches “${popSearch.value}”</div>`;
      popList.querySelector('.opt.cur')?.scrollIntoView({ block: 'nearest' });
    }
    function openPop(btn) { popKey = btn.dataset.k; cursor = 0; popSearch.value = '';
      $('popWho').textContent = popKey + '_BRANCH';
      const r = btn.getBoundingClientRect(); pop.classList.add('open'); const h = pop.offsetHeight;
      pop.style.left = Math.min(r.left, innerWidth - 306) + 'px';
      pop.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
      paint(); popSearch.focus();
    }
    const closePop = () => { pop.classList.remove('open'); popKey = null; };
    const pick = v => { sv(popKey + '_BRANCH', v); closePop(); render(); };
    $('matrix').addEventListener('click', e => { const btn = e.target.closest('.branch'); if (btn && !btn.disabled) openPop(btn); });
    popSearch.addEventListener('input', () => { cursor = 0; paint(); });
    popList.addEventListener('click', e => { const o = e.target.closest('.opt'); if (o) pick(o.dataset.v); });
    pop.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { cursor = Math.min(cursor + 1, shown.length - 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cursor = Math.max(cursor - 1, 0); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (shown[cursor]) pick(shown[cursor]); e.preventDefault(); }
      else if (e.key === 'Escape') closePop();
    });
    root.addEventListener('pointerdown', e => { if (pop.classList.contains('open') && !pop.contains(e.target) && !e.target.closest('.branch')) closePop(); });

    // ---- run / cancel / classic ----
    function submit() {
      const btn = form.querySelector('button.jenkins-button--primary, button[type="submit"], input[type="submit"]');
      if (btn) btn.click(); else form.requestSubmit ? form.requestSubmit() : form.submit();
    }
    $('runBtn').addEventListener('click', submit);
    $('classicBtn').addEventListener('click', teardown);
    root.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { submit(); e.preventDefault(); } });

    // seed filter count + first paint
    $('svcCount').textContent = String(SVC.length);
    render();
  }

  function apply() {
    if (window.__rmxJenkins) return;
    const form = document.querySelector('form[name="parameters"]');
    if (!form) return;
    window.__rmxJenkins = true;
    build(form);
  }
  function teardown() {
    document.getElementById('rmx-host')?.remove();
    document.querySelectorAll('[data-rmx-hidden]').forEach(el => { el.style.display = ''; el.removeAttribute('data-rmx-hidden'); });
    if (window.__rmxFit) { removeEventListener('resize', window.__rmxFit); window.__rmxFit = null; }
    window.__rmxJenkins = false;
  }

  // Gate on the popup toggle (storage.jenkinsTheme.enabled); react live to changes.
  function gate() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get({ jenkinsTheme: { enabled: false } }, d => {
      if (d && d.jenkinsTheme && d.jenkinsTheme.enabled) apply();
    });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local' || !ch.jenkinsTheme) return;
      (ch.jenkinsTheme.newValue && ch.jenkinsTheme.newValue.enabled) ? apply() : teardown();
    });
  }
  gate();
})();
