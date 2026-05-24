import { api, fmt, state } from '/web/app.js';
import { barChart, donutChart, groupedBarChart, stackedBarChart } from '/web/charts.js';

const RANGES = [
  { key: '7d',  label: '7d',  days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: 'all', label: 'All', days: null },
];

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

  const [totals, projects, sessions, tools, daily, byModel, whoami] = await Promise.all([
    api(withSince('/api/overview', since)),
    api(withSince('/api/projects', since)),
    api(withSince('/api/sessions?limit=10', since)),
    api(withSince('/api/tools', since)),
    api(withSince('/api/daily', since)),
    api(withSince('/api/by-model', since)),
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
