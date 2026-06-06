import { api, fmt, state } from '/web/app.js';
import { barChart, donutChart, groupedBarChart, stackedBarChart, calendarHeatmap, dailyTrendChart, lineChart, sparkline } from '/web/charts.js';

const RANGES = [
  { key: '7d',  label: '7d',  days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '1y',  label: '1y',  days: 365 },
  { key: 'all', label: 'All', days: null },
];

// Billable tokens for a daily-breakdown row (input + output + cache create).
const _dayTotal = d =>
  (d.input_tokens || 0) + (d.output_tokens || 0) + (d.cache_create_tokens || 0);

// Trailing rolling average (window days), aligned to the input array.
function _rollingAvg(values, window = 30) {
  const out = [];
  let sum = 0;
  const q = [];
  for (const v of values) {
    q.push(v); sum += v;
    if (q.length > window) sum -= q.shift();
    out.push(sum / q.length);
  }
  return out;
}

// Reuse rate = cache reused / (cache reused + cache rebuilt).
// High → warm cache (cheap). Low → cold start / cleared / expired cache had to
// be rebuilt (cache_create is billed ~1.25× input). null if no cache activity.
function _reuseRate(cacheRead, cacheCreate) {
  const denom = (cacheRead || 0) + (cacheCreate || 0);
  return denom > 0 ? (cacheRead || 0) / denom : null;
}

// Heuristic efficiency band for colouring.
function _ratioClass(r) {
  if (r == null) return 'muted';
  if (r >= 0.85) return 'good';
  if (r >= 0.60) return 'warn';
  return 'bad';
}

function _ratioCell(r) {
  if (r == null) return '<span class="muted">—</span>';
  return `<span class="ratio-tag ${_ratioClass(r)}">${(r * 100).toFixed(0)}%</span>`;
}

function readRange() {
  const q = (location.hash.split('?')[1] || '');
  const m = /(?:^|&)range=([^&]+)/.exec(q);
  const k = m && decodeURIComponent(m[1]);
  return RANGES.find(r => r.key === k) || RANGES[1];
}

function writeRange(key) {
  const base = (location.hash.replace(/^#/, '').split('?')[0]) || '/overview';
  location.hash = '#' + base + '?range=' + encodeURIComponent(key);
}

function sinceIso(range) {
  if (!range.days) return null;
  return new Date(Date.now() - range.days * 86400 * 1000).toISOString();
}

function withSince(url, since) {
  if (!since) return url;
  return url + (url.includes('?') ? '&' : '?') + 'since=' + encodeURIComponent(since);
}

export default async function (root) {
  const range = readRange();
  const since = sinceIso(range);

  // Activity-summary table uses a fixed 30-day window (Today / 7d / 30d),
  // independent of the page range.
  const since30 = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

  const [totals, projects, sessions, tools, daily, byModel, cacheEff, burnMoments, projDaily, whoami] = await Promise.all([
    api(withSince('/api/overview', since)),
    api(withSince('/api/projects', since)),
    api(withSince('/api/sessions?limit=10', since)),
    api(withSince('/api/tools', since)),
    api(withSince('/api/daily', since)),
    api(withSince('/api/by-model', since)),
    api(withSince('/api/cache-efficiency', since)),
    api(withSince('/api/burn-moments', since)),
    api('/api/project-daily?since=' + encodeURIComponent(since30)),
    api('/api/whoami'),
  ]);

  const displayName = localStorage.getItem('td.displayName') || _toTitleCase(whoami.username);
  const accountId   = localStorage.getItem('td.accountEmail') || '';

  const hasData = (totals.sessions || 0) > 0;

  // ── Empty state: no sessions found ──────────────────────────────────────
  if (!hasData) {
    const status = await api('/api/status');
    const hasLocalData = status.sessions_found > 0 || status.cowork_sessions_found > 0;
    const icloudAvail  = status.icloud_available;
    const icloudData   = status.icloud_has_data;
    const syncEnabled  = status.sync_enabled;

    root.innerHTML = `
      <div class="onboarding" style="min-height:auto;padding:60px 20px">
        <div class="onboarding-card">
          <img src="/web/assets/logo.png" alt="360Digital" class="onboarding-logo">
          <h1 class="onboarding-title">Hi ${fmt.htmlSafe(displayName)}</h1>
          <p class="onboarding-subtitle">No session data found yet</p>

          ${icloudAvail && !syncEnabled ? `
          <div class="onboarding-section" style="text-align:left">
            <h3>Sync your data via iCloud</h3>
            <div class="onboarding-source ${icloudData ? 'ok' : 'empty'}" style="margin-bottom:12px">
              <span class="source-icon">&#x2601;</span>
              <div class="source-info">
                <span class="source-label">iCloud Drive</span>
                <span class="source-detail">${icloudData
                  ? `Found ${status.icloud_sessions} synced session${status.icloud_sessions !== 1 ? 's' : ''} from another Mac`
                  : 'Use this Mac\'s sessions on all your other Macs'}</span>
              </div>
            </div>
            <p style="font-size:12px;color:var(--muted);margin:0 0 14px;line-height:1.5">
              ${icloudData
                ? 'Sessions from your other Mac were found in iCloud. Click below to connect and view them here.'
                : 'If you use Claude Code on another Mac, enable iCloud sync there first. Then click "Connect" on this Mac to see the same data.'}
            </p>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              ${icloudData ? `
                <button class="primary onboarding-btn" id="icloud-connect">Connect to iCloud data</button>
              ` : `
                <button class="primary onboarding-btn" id="icloud-enable">Share this Mac's data via iCloud</button>
              `}
            </div>
          </div>
          ` : ''}

          ${syncEnabled ? `
          <div class="onboarding-section" style="text-align:left">
            <div class="onboarding-source ok">
              <span class="source-icon">&#x2601;</span>
              <div class="source-info">
                <span class="source-label">iCloud Sync</span>
                <span class="source-detail">Connected — waiting for data to sync from iCloud</span>
              </div>
              <span class="source-status">Syncing</span>
            </div>
          </div>
          ` : ''}

          <div class="onboarding-section" style="text-align:left">
            <h3>What this dashboard tracks</h3>
            <div class="onboarding-steps">
              <div class="step">
                <span class="step-num" style="background:var(--good);color:#fff;border:none">&#x2713;</span>
                <div>
                  <strong>Claude Code sessions</strong>
                  <p>Every time you use <code class="onboarding-code-inline">claude</code> in Terminal or via Claude Desktop's agent/code mode.</p>
                </div>
              </div>
              <div class="step">
                <span class="step-num" style="background:var(--good);color:#fff;border:none">&#x2713;</span>
                <div>
                  <strong>Claude Desktop Cowork sessions</strong>
                  <p>Background agent tasks from Claude Desktop are tracked automatically.</p>
                </div>
              </div>
              <div class="step">
                <span class="step-num" style="background:var(--bad);color:#fff;border:none">&#x2715;</span>
                <div>
                  <strong>Regular Claude chats</strong>
                  <p>Standard conversations in Claude Desktop or claude.ai are not stored locally. No API currently exists for this data.</p>
                </div>
              </div>
            </div>
          </div>

          <div class="onboarding-actions">
            <button class="secondary onboarding-btn" id="empty-scan">
              Scan for sessions now
            </button>
          </div>
        </div>
      </div>
    `;

    // Scan button
    document.getElementById('empty-scan').addEventListener('click', async () => {
      const btn = document.getElementById('empty-scan');
      btn.textContent = 'Scanning…';
      btn.disabled = true;
      try { await api('/api/scan'); } catch {}
      root.innerHTML = '';
      const mod = await import('/web/routes/overview.js');
      await mod.default(root);
    });

    // iCloud enable (share this Mac's data)
    const enableBtn = document.getElementById('icloud-enable');
    if (enableBtn) {
      enableBtn.addEventListener('click', async () => {
        enableBtn.textContent = 'Setting up…';
        enableBtn.disabled = true;
        const res = await fetch('/api/icloud/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
        if (res.ok) {
          enableBtn.textContent = 'Sync enabled!';
          enableBtn.style.background = 'var(--good)';
          try { await api('/api/scan'); } catch {}
          setTimeout(() => { root.innerHTML = ''; import('/web/routes/overview.js').then(m => m.default(root)); }, 1500);
        } else {
          enableBtn.textContent = res.error || 'Failed';
          enableBtn.style.background = 'var(--bad)';
        }
      });
    }

    // iCloud connect (pull from another Mac)
    const connectBtn = document.getElementById('icloud-connect');
    if (connectBtn) {
      connectBtn.addEventListener('click', async () => {
        connectBtn.textContent = 'Connecting…';
        connectBtn.disabled = true;
        const res = await fetch('/api/icloud/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
        if (res.ok) {
          connectBtn.textContent = 'Connected!';
          connectBtn.style.background = 'var(--good)';
          try { await api('/api/scan'); } catch {}
          setTimeout(() => { root.innerHTML = ''; import('/web/routes/overview.js').then(m => m.default(root)); }, 1500);
        } else {
          connectBtn.textContent = res.error || 'Failed';
          connectBtn.style.background = 'var(--bad)';
        }
      });
    }

    return;
  }

  const cacheCreate =
    (totals.cache_create_5m_tokens || 0) +
    (totals.cache_create_1h_tokens || 0);

  // ── Daily burn series (heatmap + trend + Today/Peak KPIs) ───────────────
  const dayTotals  = daily.map(_dayTotal);
  const rollingAvg = _rollingAvg(dayTotals, 30);
  const calData    = daily.map((d, i) => [d.day, dayTotals[i]]);
  const totalInView = dayTotals.reduce((a, b) => a + b, 0);
  let peakVal = 0, peakDay = null;
  daily.forEach((d, i) => { if (dayTotals[i] > peakVal) { peakVal = dayTotals[i]; peakDay = d.day; } });
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayIdx = daily.findIndex(d => d.day === todayStr);
  const todayVal = todayIdx >= 0 ? dayTotals[todayIdx] : 0;

  // ── Cache efficiency: reuse vs rebuild (parallel to burn) ───────────────
  const effDaily = daily.map(d => {
    const r = _reuseRate(d.cache_read_tokens, d.cache_create_tokens);
    return r == null ? null : +(r * 100).toFixed(1);
  });
  const totalCacheRead   = daily.reduce((a, d) => a + (d.cache_read_tokens || 0), 0);
  const totalCacheCreate = daily.reduce((a, d) => a + (d.cache_create_tokens || 0), 0);
  const overallReuse     = _reuseRate(totalCacheRead, totalCacheCreate);
  // By-project reuse (from already-fetched projects), most rebuild first.
  const projEff = projects
    .map(p => ({
      name: p.project_name || p.project_slug,
      cache_read: p.cache_read_tokens || 0,
      cache_create: p.cache_create_tokens || 0,
      ratio: _reuseRate(p.cache_read_tokens, p.cache_create_tokens),
    }))
    .sort((a, b) => b.cache_create - a.cache_create)
    .slice(0, 8);
  const promptEff = (cacheEff.by_prompt || []).filter(p => (p.cache_read_tokens || 0) + (p.cache_create_tokens || 0) > 0);
  const skillEff  = cacheEff.by_skill || [];

  // ── Per-project activity summary (fixed 30-day window + sparklines) ──────
  const last30 = [...Array(30)].map((_, i) =>
    new Date(Date.now() - (29 - i) * 86400 * 1000).toISOString().slice(0, 10));
  const last30Idx = Object.fromEntries(last30.map((d, i) => [d, i]));
  const nameBySlug = Object.fromEntries(projects.map(p => [p.project_slug, p.project_name || p.project_slug]));
  const byProj = {};
  for (const r of projDaily) {
    const i = last30Idx[r.day];
    if (i == null) continue;
    (byProj[r.project_slug] ||= new Array(30).fill(0))[i] += r.tokens || 0;
  }
  const activity = Object.entries(byProj).map(([slug, spark]) => {
    const d30  = spark.reduce((a, b) => a + b, 0);
    const d7   = spark.slice(-7).reduce((a, b) => a + b, 0);
    const today = spark[29] || 0;
    let peak = 0;
    spark.forEach(v => { if (v > peak) peak = v; });
    const active = spark.filter(v => v > 0).length;
    return { slug, name: nameBySlug[slug] || slug, spark, d30, d7, today, peak, active };
  }).sort((a, b) => b.d30 - a.d30).slice(0, 10);

  // ── Scale equivalents (Fermi translations from exact totals) ────────────
  const totalTokens =
    (totals.input_tokens || 0) + (totals.output_tokens || 0) +
    (totals.cache_read_tokens || 0) +
    (totals.cache_create_5m_tokens || 0) + (totals.cache_create_1h_tokens || 0);
  const _num = n => n == null ? '—'
    : n >= 1000 ? fmt.compact(n)
    : n >= 10   ? Math.round(n).toLocaleString()
    : n.toFixed(1);
  const words       = totalTokens * 0.75;
  const queryEquiv  = totalTokens / 1000;
  const equivalents = [
    { measure: 'Text', estimate: `${_num(words)} words`,
      equiv: `${_num(words / 90000)} paperback novels`,
      basis: '≈0.75 words/token · 90k words/novel' },
    { measure: 'Reading time', estimate: `${_num(words / 200 / 60)} hours`,
      equiv: `${_num(words / 200 / 60 / 24)} days nonstop`,
      basis: '200 words/min' },
    { measure: 'Code volume', estimate: `${_num(totalTokens / 15)} lines`,
      equiv: `${_num(totalTokens / 15 / 10000)} engineer-years`,
      basis: '15 tokens/LOC · 10k net LOC/eng-yr' },
    { measure: 'Energy', estimate: `${_num(queryEquiv * 0.34 / 1000)} kWh`,
      equiv: `${_num(queryEquiv * 0.34 / 1000 / 0.012)} phone charges`,
      basis: '0.34 Wh per 1k-token query-equiv · 12 Wh/charge' },
  ];

  const kpi = (label, compactVal, fullVal, cls = '') => `
    <div class="card kpi ${cls}">
      <div class="label">${label}</div>
      <div class="value" title="${fullVal}">${compactVal}</div>
    </div>`;

  const rangeTabs = `
    <div class="range-tabs" role="tablist">
      ${RANGES.map(r => `<button data-range="${r.key}" class="${r.key === range.key ? 'active' : ''}">${r.label}</button>`).join('')}
    </div>`;

  root.innerHTML = `
    <div class="greeting-banner">
      <div class="greeting-text">
        <span class="greeting-hi">Hi ${fmt.htmlSafe(displayName)}</span>
        <span class="greeting-tagline">Take back control of your tokens.</span>
      </div>
      <p class="greeting-sub">
        Increase your value per token spend across all versions of your connected Claude account${accountId ? ` (${fmt.htmlSafe(accountId)})` : ''}.
      </p>
      <p class="greeting-notice">Updated daily · more models &amp; features coming soon</p>
    </div>

    <div class="flex" style="margin-bottom:14px">
      <h2 style="margin:0;font-size:16px;letter-spacing:-0.01em">Overview</h2>
      <span class="muted" style="font-size:12px">${range.days ? `last ${range.days} days` : 'all time'}</span>
      <div class="spacer"></div>
      ${rangeTabs}
    </div>

    <div class="row cols-7">
      ${kpi('Sessions',     fmt.int(totals.sessions),       fmt.int(totals.sessions))}
      ${kpi('Turns',        fmt.int(totals.turns),          fmt.int(totals.turns))}
      ${kpi('Input',        fmt.compact(totals.input_tokens),       fmt.int(totals.input_tokens) + ' tokens')}
      ${kpi('Output',       fmt.compact(totals.output_tokens),      fmt.int(totals.output_tokens) + ' tokens')}
      ${kpi('Cache read',   fmt.compact(totals.cache_read_tokens),  fmt.int(totals.cache_read_tokens) + ' tokens')}
      ${kpi('Cache create', fmt.compact(cacheCreate),               fmt.int(cacheCreate) + ' tokens')}
      <div class="card kpi cost">
        <div class="label">Est. cost</div>
        <div class="value" title="${fmt.usd(totals.cost_usd)}">${fmt.usd(totals.cost_usd)}</div>
        ${planSubtitle()}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Daily token burn</h3>
      <p class="muted heatmap-sub">
        <b>${fmt.compact(totalInView)}</b> billable tokens in view
        · Peak day <b>${fmt.compact(peakVal)}</b>${peakDay ? ` on ${peakDay}` : ''}
        · Today <b>${fmt.compact(todayVal)}</b>
      </p>
      <div id="ch-heatmap" style="height:180px"></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="flex" style="align-items:baseline;margin-bottom:6px">
        <h3 style="margin:0">Daily total &amp; rolling 30-day average</h3>
        <span class="spacer"></span>
        <button id="trend-log" class="log-toggle" title="Switch between linear and logarithmic y-axis">log scale</button>
      </div>
      <p class="muted" style="margin:-2px 0 8px;font-size:12px">Total billable tokens per day (input + output + cache create), with a trailing 30-day average to smooth the spikes.</p>
      <div id="ch-trend" style="height:240px"></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Burn moments</h3>
      <p class="muted" style="margin:-4px 0 10px;font-size:12px">Your biggest spend days and what drove them — the project that dominated each day, its share of that day's tokens, and the tools in heaviest use.</p>
      <table>
        <thead><tr><th>date</th><th class="num">burn</th><th class="num">turns</th><th>driver</th></tr></thead>
        <tbody>
          ${burnMoments.map(m => `
            <tr>
              <td class="mono">${m.day}</td>
              <td class="num">${fmt.compact(m.tokens)}</td>
              <td class="num">${fmt.int(m.turns)}</td>
              <td>
                <b>${fmt.htmlSafe(fmt.short(m.project_name, 28))}</b>
                <span class="muted">${m.project_share != null ? ` · ${(m.project_share * 100).toFixed(0)}% of day` : ''}${m.top_tools && m.top_tools.length ? ` · ${fmt.htmlSafe(m.top_tools.join(', '))}` : ''}</span>
              </td>
            </tr>`).join('') || '<tr><td colspan="4" class="muted">no activity in this range</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Cache efficiency over time</h3>
      <p class="muted heatmap-sub">
        Reuse rate = reused cache ÷ (reused + rebuilt). High = warm cache (cheap); dips = cold starts, <code>/clear</code>, or the 5-min cache expiry forced a rebuild.
        · Overall <b>${overallReuse == null ? '—' : (overallReuse * 100).toFixed(0) + '%'}</b>
        · ${fmt.compact(totalCacheRead)} reused vs ${fmt.compact(totalCacheCreate)} rebuilt
      </p>
      <div id="ch-cache-eff" style="height:200px"></div>
    </div>

    <div class="row cols-2" style="margin-top:16px">
      <div class="card">
        <h3>Cache reuse by project</h3>
        <p class="muted" style="margin:-4px 0 10px;font-size:12px">Projects that rebuilt the most cache. A low reuse % means context kept going cold (new sessions, clears, or gaps &gt; 5 min) instead of being reused.</p>
        <table>
          <thead><tr><th>project</th><th class="num">reused</th><th class="num">rebuilt</th><th class="num">reuse</th></tr></thead>
          <tbody>
            ${projEff.map(p => `
              <tr>
                <td>${fmt.htmlSafe(fmt.short(p.name, 28))}</td>
                <td class="num">${fmt.compact(p.cache_read)}</td>
                <td class="num">${fmt.compact(p.cache_create)}</td>
                <td class="num">${_ratioCell(p.ratio)}</td>
              </tr>`).join('') || '<tr><td colspan="4" class="muted">no data in this range</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>Cache on skill turns <span class="muted" style="font-weight:400;font-size:11px">— correlational</span></h3>
        <p class="muted" style="margin:-4px 0 10px;font-size:12px">Cache state on the turn each skill was invoked. A skill's own content loads on the <i>next</i> turn, so read this as a hint, not attribution.</p>
        <table>
          <thead><tr><th>skill</th><th class="num">calls</th><th class="num">rebuilt</th><th class="num">reuse</th></tr></thead>
          <tbody>
            ${skillEff.slice(0, 8).map(s => `
              <tr>
                <td>${fmt.htmlSafe(fmt.short(s.skill, 26))}</td>
                <td class="num">${fmt.int(s.invocations)}</td>
                <td class="num">${fmt.compact(s.cache_create_tokens)}</td>
                <td class="num">${_ratioCell(_reuseRate(s.cache_read_tokens, s.cache_create_tokens))}</td>
              </tr>`).join('') || '<tr><td colspan="4" class="muted">no skill invocations in this range</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Biggest cache rebuilds by prompt</h3>
      <p class="muted" style="margin:-4px 0 10px;font-size:12px">The prompts that forced the most context to be re-cached — usually the first prompt of a session, the turn after a <code>/clear</code>, or one after a &gt; 5-min gap (cache expiry). Smaller/fewer rebuilds = you worked against a warm cache.</p>
      <table>
        <thead><tr><th>when</th><th>prompt</th><th>project</th><th class="num">rebuilt</th><th class="num">reused</th><th class="num">reuse</th></tr></thead>
        <tbody>
          ${promptEff.map(p => `
            <tr>
              <td class="mono">${fmt.ts(p.timestamp)}</td>
              <td><a href="#/sessions/${encodeURIComponent(p.session_id)}">${fmt.htmlSafe(fmt.short(p.prompt_text, 56))}</a></td>
              <td>${fmt.htmlSafe(fmt.short(p.project_slug, 18))}</td>
              <td class="num">${fmt.compact(p.cache_create_tokens)}</td>
              <td class="num">${fmt.compact(p.cache_read_tokens)}</td>
              <td class="num">${_ratioCell(_reuseRate(p.cache_read_tokens, p.cache_create_tokens))}</td>
            </tr>`).join('') || '<tr><td colspan="6" class="muted">no prompts in this range</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Project activity <span class="muted" style="font-weight:400;font-size:11px">— last 30 days</span></h3>
      <p class="muted" style="margin:-4px 0 10px;font-size:12px">Billable tokens per project at a glance: today, last 7 and 30 days, busiest single day, active days, and the 30-day shape.</p>
      <table>
        <thead><tr><th>project</th><th class="num">today</th><th class="num">7d</th><th class="num">30d</th><th class="num">peak day</th><th class="num">active</th><th>30d shape</th></tr></thead>
        <tbody>
          ${activity.map((a, i) => `
            <tr>
              <td>${fmt.htmlSafe(fmt.short(a.name, 26))}</td>
              <td class="num">${a.today ? fmt.compact(a.today) : '<span class="muted">—</span>'}</td>
              <td class="num">${fmt.compact(a.d7)}</td>
              <td class="num">${fmt.compact(a.d30)}</td>
              <td class="num">${fmt.compact(a.peak)}</td>
              <td class="num">${a.active}</td>
              <td><div class="spark" id="spark-${i}"></div></td>
            </tr>`).join('') || '<tr><td colspan="7" class="muted">no activity in the last 30 days</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Scale equivalents</h3>
      <p class="muted" style="margin:-4px 0 10px;font-size:12px">Playful Fermi translations of the <b>${fmt.compact(totalTokens)}</b> tokens processed ${range.days ? `in the last ${range.days} days` : 'all-time'}. Illustrative scale only — not billing or environmental accounting.</p>
      <table>
        <thead><tr><th>measure</th><th>estimate</th><th>equivalent</th><th>basis</th></tr></thead>
        <tbody>
          ${equivalents.map(e => `
            <tr>
              <td>${e.measure}</td>
              <td class="mono">${e.estimate}</td>
              <td><b>${e.equiv}</b></td>
              <td class="muted" style="font-size:11px">${e.basis}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <details class="card glossary" style="margin-top:16px">
      <summary><h3 style="display:inline-block;margin:0">What do these numbers mean?</h3><span class="muted" style="font-size:12px">— click to expand</span></summary>
      <dl>
        <dt>Session</dt><dd>One run of Claude Code (from <code>claude</code> to exit). Each session is a single <code>.jsonl</code> file.</dd>
        <dt>Turn</dt><dd>One message you sent to Claude. Each turn triggers a response (possibly with tool calls in between).</dd>
        <dt>Input tokens</dt><dd>The new text you (and tool results) sent to Claude this turn. Billed at the full input rate.</dd>
        <dt>Output tokens</dt><dd>The text Claude wrote back. Billed at the highest rate — usually the biggest cost driver per turn.</dd>
        <dt>Cache read</dt><dd>Tokens Claude re-used from a cache (your CLAUDE.md, previously-read files, the conversation so far). ~10× cheaper than fresh input. High cache-read counts = good cost hygiene.</dd>
        <dt>Cache create</dt><dd>Writing something into the cache for the first time. One-time cost; pays off on the next turn.</dd>
        <dt>Billable tokens</dt><dd>Input + Output + Cache create. Cache reads are billed separately (and much cheaper).</dd>
      </dl>
    </details>

    <div class="row cols-2" style="margin-top:16px">
      <div class="card">
        <h3>Your daily work</h3>
        <p class="muted" style="margin:-4px 0 10px;font-size:12px">Tokens you paid for: what you sent (<b>input</b>), what Claude wrote (<b>output</b>), and what got stored for re-use (<b>cache create</b>).</p>
        <div id="ch-daily-billable" style="height:260px"></div>
      </div>
      <div class="card">
        <h3>Daily cache reads</h3>
        <p class="muted" style="margin:-4px 0 10px;font-size:12px"><b>Cache reads</b> are cheap re-uses of things Claude already saw (like your CLAUDE.md). They cost ~10× less than regular input tokens — high numbers here are a good thing.</p>
        <div id="ch-daily-cache" style="height:260px"></div>
      </div>
    </div>

    <div class="row cols-2" style="margin-top:16px">
      <div class="card"><h3>Tokens by project</h3><div id="ch-projects" style="height:320px"></div></div>
      <div class="card">
        <h3>Token usage by model</h3>
        <p class="muted" style="margin:-4px 0 4px;font-size:12px">Share of billable tokens per Claude model.</p>
        <div id="ch-model" style="height:300px"></div>
      </div>
    </div>

    <div class="row cols-2" style="margin-top:16px">
      <div class="card"><h3>Top tools (by call count)</h3><div id="ch-tools" style="height:320px"></div></div>
      <div class="card">
        <h3 style="display:flex;align-items:center"><span>Recent sessions</span><span class="spacer"></span><a href="#/sessions" style="font-weight:400;font-size:12px">all →</a></h3>
        <table>
          <thead><tr><th>started</th><th>project</th><th class="num">tokens</th></tr></thead>
          <tbody>
            ${sessions.map(s => `
              <tr>
                <td class="mono">${fmt.ts(s.started)}</td>
                <td><a href="#/sessions/${encodeURIComponent(s.session_id)}">${fmt.htmlSafe(s.project_name || s.project_slug)}</a></td>
                <td class="num">${fmt.compact(s.tokens)}</td>
              </tr>`).join('') || '<tr><td colspan="3" class="muted">no sessions in this range</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // range buttons
  root.querySelectorAll('.range-tabs button').forEach(btn => {
    btn.addEventListener('click', () => writeRange(btn.dataset.range));
  });

  // Daily token burn — calendar heatmap
  calendarHeatmap(document.getElementById('ch-heatmap'), { data: calData });

  // Daily total + rolling average, with a linear/log toggle
  const trend = dailyTrendChart(document.getElementById('ch-trend'), {
    categories: daily.map(d => d.day),
    totals: dayTotals,
    movingAvg: rollingAvg,
    avgLabel: '30-day avg',
  });
  const logBtn = document.getElementById('trend-log');
  if (logBtn) logBtn.addEventListener('click', () => {
    const on = trend.toggleLog();
    logBtn.classList.toggle('active', on);
    logBtn.textContent = on ? 'linear scale' : 'log scale';
  });

  // Cache efficiency over time — daily reuse rate (%), parallel to the burn
  lineChart(document.getElementById('ch-cache-eff'), {
    x: daily.map(d => d.day),
    series: [{ name: 'reuse rate', data: effDaily, color: '#3FB68B', connectNulls: true }],
    yMin: 0, yMax: 100,
    valueFormatter: v => (v == null ? '—' : Math.round(v) + '%'),
  });

  // Per-project activity sparklines
  activity.forEach((a, i) => {
    const el = document.getElementById('spark-' + i);
    if (el) sparkline(el, a.spark, '#4A9EFF');
  });

  // Your daily work — billable tokens (input + output + cache create)
  stackedBarChart(document.getElementById('ch-daily-billable'), {
    categories: daily.map(d => d.day),
    series: [
      { name: 'input',        values: daily.map(d => d.input_tokens),        color: '#4A9EFF' },
      { name: 'output',       values: daily.map(d => d.output_tokens),       color: '#7C5CFF' },
      { name: 'cache create', values: daily.map(d => d.cache_create_tokens), color: '#E8A23B' },
    ],
  });

  // Daily cache reads (separate — scale is 100× larger)
  stackedBarChart(document.getElementById('ch-daily-cache'), {
    categories: daily.map(d => d.day),
    series: [
      { name: 'cache read', values: daily.map(d => d.cache_read_tokens), color: '#3FB68B' },
    ],
  });

  // by-model doughnut
  donutChart(document.getElementById('ch-model'),
    byModel.map(m => ({
      name: fmt.modelShort(m.model) || 'unknown',
      value: (m.input_tokens || 0) + (m.output_tokens || 0)
           + (m.cache_create_5m_tokens || 0) + (m.cache_create_1h_tokens || 0),
    })).filter(d => d.value > 0),
  );

  // tokens by project — input vs output
  const topProjects = projects.slice(0, 8);
  groupedBarChart(document.getElementById('ch-projects'), {
    categories: topProjects.map(p => {
      const name = p.project_name || p.project_slug;
      return name.length > 20 ? name.slice(0, 19) + '…' : name;
    }),
    series: [
      { name: 'input',  values: topProjects.map(p => p.input_tokens  || 0), color: '#4A9EFF' },
      { name: 'output', values: topProjects.map(p => p.output_tokens || 0), color: '#7C5CFF' },
    ],
  });

  // top tools
  const topTools = tools.slice(0, 8);
  barChart(document.getElementById('ch-tools'), {
    categories: topTools.map(t => t.tool_name),
    values: topTools.map(t => t.calls),
    color: '#7C5CFF',
  });
}

function planSubtitle() {
  if (!state.pricing || state.plan === 'api') return '';
  const p = state.pricing.plans[state.plan];
  if (!p || !p.monthly) return '';
  return `<div class="sub">pay $${p.monthly}/mo on ${fmt.htmlSafe(p.label)}</div>`;
}

function _toTitleCase(s) {
  if (!s) return 'there';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
