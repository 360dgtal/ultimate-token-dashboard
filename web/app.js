// app.js — router, state, fetch helpers

export const $  = (sel, root=document) => root.querySelector(sel);
export const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

const CURRENCY_SYMBOLS = { USD: '$', GBP: '£', EUR: '€' };

function _convertUsd(n, decimals) {
  if (n == null) return '—';
  const cur  = state.currency || 'GBP';
  const rate = (state.rates && state.rates[cur]) || 1;
  const sym  = CURRENCY_SYMBOLS[cur] || cur + ' ';
  return sym + (Number(n) * rate).toFixed(decimals);
}

export const fmt = {
  int:   n => (n ?? 0).toLocaleString(),
  compact: n => COMPACT.format(n ?? 0),
  usd:   n => _convertUsd(n, 2),
  usd4:  n => _convertUsd(n, 4),
  pct:   n => n == null ? '—' : (n * 100).toFixed(0) + '%',
  short: (s, n=80) => s == null ? '' : (s.length > n ? s.slice(0, n - 1) + '…' : s),
  htmlSafe: s => (s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  modelClass: m => {
    const s = (m || '').toLowerCase();
    if (s.includes('opus'))   return 'opus';
    if (s.includes('sonnet')) return 'sonnet';
    if (s.includes('haiku'))  return 'haiku';
    return '';
  },
  modelShort: m => (m || '').replace('claude-', ''),
  ts: t => (t || '').slice(0, 16).replace('T', ' '),
};

export async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export const state = {
  plan: 'api',
  pricing: null,
  currency: localStorage.getItem('td.currency') || 'GBP',
  rates: { USD: 1.0, GBP: 0.79, EUR: 0.92 },
};

const ROUTES = {
  '/overview':    () => import('/web/routes/overview.js'),
  '/prompts':     () => import('/web/routes/prompts.js'),
  '/sessions':    () => import('/web/routes/sessions.js'),
  '/projects':    () => import('/web/routes/projects.js'),
  '/skills':      () => import('/web/routes/skills.js'),
  '/tips':        () => import('/web/routes/tips.js'),
  '/settings':    () => import('/web/routes/settings.js'),
  '/onboarding':  () => import('/web/routes/onboarding.js'),
};

function buildTopbar() {
  const wrap = document.createElement('header');
  wrap.className = 'topbar';
  wrap.innerHTML = `
    <div class="brand"><img src="/web/assets/logo.png" alt="360Digital" class="brand-logo"> Ultimate Token Dashboard</div>
    <nav>
      ${Object.keys(ROUTES).filter(p => p !== '/onboarding').map(p => `<a href="#${p}" data-route="${p}">${p.slice(1)}</a>`).join('')}
    </nav>
    <div class="spacer"></div>
    <button id="refresh-btn" class="pill refresh-btn" title="Rescan for new sessions">
      <span class="refresh-icon">↻</span> Refresh
    </button>
    <span class="pill status-pill" id="status-pill" title="Live update status">
      <span class="status-dot"></span><span id="status-label">live</span>
    </span>
    <select id="currency-select" class="pill currency-select" title="Display currency">
      <option value="GBP">£ GBP</option>
      <option value="USD">$ USD</option>
      <option value="EUR">€ EUR</option>
    </select>
    <span class="pill" id="plan-pill">api</span>
    <span class="pill muted" title="Cmd/Ctrl+B blurs sensitive text">⌘B blur</span>
  `;
  document.body.prepend(wrap);

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', forceRefresh);

  // Async update check — adds an "Update available" pill if a newer release exists
  api('/api/update-check').then(u => {
    if (!u || !u.update_available) return;
    const pill = document.createElement('a');
    pill.href = u.url || '#';
    pill.target = '_blank';
    pill.className = 'pill update-pill';
    pill.title = `Latest: v${u.latest} — click to download`;
    pill.innerHTML = `↑ v${u.latest}`;
    const spacer = document.querySelector('header.topbar .spacer');
    if (spacer) spacer.after(pill);
  }).catch(() => {});

  const sel = document.getElementById('currency-select');
  sel.value = state.currency;
  sel.addEventListener('change', () => {
    state.currency = sel.value;
    localStorage.setItem('td.currency', sel.value);
    render();
  });
}

function setActiveTab(routeKey) {
  $$('header.topbar nav a').forEach(a => a.classList.toggle('active', a.dataset.route === routeKey));
}

async function render() {
  const hash = location.hash.replace(/^#/, '') || '/overview';
  const path = hash.split('?')[0];
  let key = path;
  if (path.startsWith('/sessions/')) key = '/sessions';

  // Hide nav chrome during onboarding
  const isOnboarding = key === '/onboarding';
  const topbar = $('header.topbar');
  if (topbar) {
    $$('nav, .spacer, .currency-select, #plan-pill, .pill.muted, .refresh-btn, .status-pill', topbar).forEach(el => el.style.display = isOnboarding ? 'none' : '');
  }

  setActiveTab(key);
  const loader = ROUTES[key] || ROUTES['/overview'];
  const mod = await loader();
  $('#app').innerHTML = '';
  try {
    await mod.default($('#app'));
  } catch (e) {
    $('#app').innerHTML = `<div class="card"><h2>Error</h2><pre>${fmt.htmlSafe(String(e.stack || e))}</pre></div>`;
  }
}

async function firstRun() {
  if (localStorage.getItem('td.plan-set')) return;
  const plans = Object.entries(state.pricing.plans);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Welcome — pick your plan</h2>
      <p>This sets how costs are displayed. Change it later in Settings.</p>
      <select id="firstplan" style="width:100%">
        ${plans.map(([k,v]) => `<option value="${k}">${v.label}${v.monthly ? ` — $${v.monthly}/mo` : ''}</option>`).join('')}
      </select>
      <div class="actions">
        <div class="spacer"></div>
        <button class="primary" id="firstsave">Continue</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  await new Promise(res => $('#firstsave', overlay).addEventListener('click', async () => {
    const plan = $('#firstplan', overlay).value;
    await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
    localStorage.setItem('td.plan-set', '1');
    overlay.remove();
    res();
  }));
  state.plan = (await api('/api/plan')).plan;
}

async function boot() {
  buildTopbar();
  const [planResp, ratesResp] = await Promise.all([
    api('/api/plan'),
    api('/api/rates').catch(() => state.rates),
  ]);
  state.plan    = planResp.plan;
  state.pricing = planResp.pricing;
  state.rates   = ratesResp;
  $('#plan-pill').textContent = state.plan;

  // Onboarding gate — show setup screen on first launch
  if (!localStorage.getItem('td.onboarded')) {
    location.hash = '#/onboarding';
  }

  await firstRun();

  window.addEventListener('hashchange', render);
  await render();

  // Privacy blur (Cmd+B / Ctrl+B)
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      document.body.classList.toggle('privacy-on');
    }
  });

  // SSE diff stream with auto-reconnect + 5-min polling fallback
  _startLiveUpdates();
}

// ── live update plumbing ─────────────────────────────────────────────────────
let _lastScanAt = Date.now();
let _sseBackoff = 1000;
let _pollTimer = null;

function _setStatus(state, label) {
  const pill = document.getElementById('status-pill');
  const lbl  = document.getElementById('status-label');
  if (!pill) return;
  pill.classList.remove('live', 'polling', 'offline');
  pill.classList.add(state);
  if (lbl) lbl.textContent = label;
}

function _connectSSE() {
  try {
    const es = new EventSource('/api/stream');
    es.onopen = () => {
      _sseBackoff = 1000;
      _setStatus('live', 'live');
    };
    es.onmessage = ev => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt.type === 'scan') {
          _lastScanAt = Date.now();
          render();
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      _setStatus('offline', 'reconnect…');
      setTimeout(_connectSSE, _sseBackoff);
      _sseBackoff = Math.min(_sseBackoff * 2, 30000);
    };
  } catch {
    _setStatus('offline', 'offline');
    setTimeout(_connectSSE, _sseBackoff);
  }
}

function _startLiveUpdates() {
  _connectSSE();
  // 5-minute hard refresh fallback — if SSE missed anything, force a scan
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(async () => {
    const stale = Date.now() - _lastScanAt > 5 * 60 * 1000;
    if (stale) {
      _setStatus('polling', 'polling');
      try { await api('/api/scan'); _lastScanAt = Date.now(); render(); } catch {}
    }
  }, 60 * 1000); // check every minute
}

export async function forceRefresh() {
  const btn = document.getElementById('refresh-btn');
  if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
  try {
    await api('/api/scan');
    _lastScanAt = Date.now();
    await render();
  } finally {
    if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
  }
}

boot();
