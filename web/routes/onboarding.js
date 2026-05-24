import { api, fmt } from '/web/app.js';

export default async function (root) {
  const status = await api('/api/status');

  const hasClaude     = status.claude_code_installed || status.claude_desktop_installed;
  const hasData       = status.has_data;
  const sessionCount  = status.sessions_found + status.cowork_sessions_found;

  root.innerHTML = `
    <div class="onboarding">
      <div class="onboarding-card">
        <img src="/web/assets/logo.png" alt="360Digital" class="onboarding-logo">
        <h1 class="onboarding-title">Ultimate Token Dashboard</h1>
        <p class="onboarding-subtitle">Take back control of your tokens</p>

        <!-- STATUS PANEL -->
        <div class="onboarding-section">
          <h3>Connection status</h3>
          <div class="onboarding-sources">

            ${status.claude_code_installed ? `
              <div class="onboarding-source ${status.sessions_found > 0 ? 'ok' : 'empty'}">
                <span class="source-icon">&#x2713;</span>
                <div class="source-info">
                  <span class="source-label">Claude Code</span>
                  <span class="source-detail">${status.sessions_found > 0
                    ? `${status.sessions_found} session${status.sessions_found !== 1 ? 's' : ''} across ${status.projects_found} project${status.projects_found !== 1 ? 's' : ''}`
                    : 'Installed — use Claude Code to generate your first session data'}</span>
                </div>
                <span class="source-status">${status.sessions_found > 0 ? 'Connected' : 'Waiting for data'}</span>
              </div>
            ` : `
              <div class="onboarding-source needs-setup">
                <span class="source-icon">&#x2715;</span>
                <div class="source-info">
                  <span class="source-label">Claude Code</span>
                  <span class="source-detail">Not installed on this Mac</span>
                </div>
                <span class="source-status">Not found</span>
              </div>
            `}

            ${status.claude_desktop_installed ? `
              <div class="onboarding-source ${status.cowork_sessions_found > 0 ? 'ok' : 'empty'}">
                <span class="source-icon">&#x2713;</span>
                <div class="source-info">
                  <span class="source-label">Claude Desktop</span>
                  <span class="source-detail">${status.cowork_sessions_found > 0
                    ? `${status.cowork_sessions_found} Cowork session${status.cowork_sessions_found !== 1 ? 's' : ''} found`
                    : 'Installed — Cowork sessions will appear here automatically'}</span>
                </div>
                <span class="source-status">${status.cowork_sessions_found > 0 ? 'Connected' : 'Waiting for data'}</span>
              </div>
            ` : ''}

          </div>
        </div>

        <!-- SETUP INSTRUCTIONS (shown only when Claude Code is missing or no data) -->
        ${!hasClaude || !hasData ? `
        <div class="onboarding-section">
          <h3>${!hasClaude ? 'Get started' : 'Next steps'}</h3>
          <div class="onboarding-steps">

            ${!status.claude_code_installed ? `
            <div class="step">
              <span class="step-num">1</span>
              <div>
                <strong>Install Claude Code</strong>
                <p>Open Terminal on this Mac and run:</p>
                <code class="onboarding-code">npm install -g @anthropic-ai/claude-code</code>
                <p style="margin-top:6px">Or with Homebrew: <code class="onboarding-code-inline">brew install claude-code</code></p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">2</span>
              <div>
                <strong>Log in to your Claude account</strong>
                <p>Run <code class="onboarding-code-inline">claude login</code> in Terminal. This connects Claude Code to your Anthropic account — the same one you use for claude.ai and Claude Desktop.</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">3</span>
              <div>
                <strong>Use Claude Code</strong>
                <p>Run <code class="onboarding-code-inline">claude</code> in any project folder. Every session you have is automatically tracked. Come back here and your usage data will appear.</p>
              </div>
            </div>
            ` : `
            <div class="step">
              <span class="step-num">1</span>
              <div>
                <strong>Start using Claude Code</strong>
                <p>Open Terminal and run <code class="onboarding-code-inline">claude</code> in any project. Your session data will appear here automatically within 30 seconds.</p>
              </div>
            </div>
            `}

          </div>
        </div>
        ` : ''}

        <!-- ICLOUD SYNC -->
        ${status.icloud_available ? `
        <div class="onboarding-section">
          <h3>Sync across Macs via iCloud</h3>
          <div class="onboarding-source ${status.icloud_has_data ? 'ok' : 'empty'}" style="margin-bottom:12px">
            <span class="source-icon">&#x2601;</span>
            <div class="source-info">
              <span class="source-label">iCloud Drive</span>
              <span class="source-detail">${status.icloud_has_data
                ? 'Session data found in iCloud from another Mac'
                : status.sync_enabled
                  ? 'Sync enabled — waiting for iCloud to finish uploading'
                  : 'Share your Claude session data across all your Macs'}</span>
            </div>
          </div>
          ${!status.sync_enabled ? `
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="primary onboarding-btn" id="icloud-action">
              ${status.icloud_has_data ? 'Connect to iCloud data' : 'Enable iCloud sync'}
            </button>
          </div>
          ` : ''}
        </div>
        ` : ''}

        <!-- HOW IT WORKS -->
        <div class="onboarding-section">
          <h3>How this dashboard works</h3>
          <div class="onboarding-steps">
            <div class="step">
              <span class="step-num source-icon-sm">&#x1F50D;</span>
              <div>
                <strong>Reads your local Claude session logs</strong>
                <p>Claude Code and Claude Desktop write session transcripts to your Mac. This dashboard reads those files to calculate your token usage and costs.</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num source-icon-sm">&#x1F4CA;</span>
              <div>
                <strong>Shows cost breakdowns and analytics</strong>
                <p>Per-prompt costs, cache efficiency, model comparisons, and project-level spending — all in one place.</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num source-icon-sm">&#x1F504;</span>
              <div>
                <strong>Updates every 30 seconds</strong>
                <p>New sessions appear automatically. No manual import or refresh needed.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- PRIVACY -->
        <div class="onboarding-section privacy-section">
          <div class="privacy-icon">&#x1F512;</div>
          <div class="privacy-text">
            <strong>100% local and private</strong>
            <p>All data stays on your Mac. No accounts to create, no data uploaded, no telemetry. This app reads local files only.</p>
          </div>
        </div>

        <!-- ACTIONS -->
        <div class="onboarding-actions">
          ${hasData ? `
            <button class="primary onboarding-btn" id="onboard-go">
              Connect ${sessionCount} session${sessionCount !== 1 ? 's' : ''} &amp; open dashboard
            </button>
          ` : `
            <button class="primary onboarding-btn" id="onboard-go">
              ${hasClaude ? 'Open dashboard' : 'Continue anyway'}
            </button>
            <button class="secondary onboarding-btn" id="onboard-refresh">
              Check again
            </button>
          `}
          <button class="secondary onboarding-btn" id="onboard-custom">
            Browse for data folder
          </button>
        </div>

        <p class="onboarding-fine-print">
          By continuing you consent to this app reading your local Claude session files on this Mac.
        </p>
      </div>
    </div>
  `;

  // Connect & open dashboard
  document.getElementById('onboard-go').addEventListener('click', async () => {
    localStorage.setItem('td.onboarded', '1');
    if (hasData) {
      try { await api('/api/scan'); } catch {}
    }
    location.hash = '#/overview';
  });

  // Check again — re-detect without leaving the page
  const refreshBtn = document.getElementById('onboard-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = 'Scanning…';
      refreshBtn.disabled = true;
      try { await api('/api/scan'); } catch {}
      // Re-render the onboarding page with fresh status
      const mod = await import('/web/routes/onboarding.js');
      root.innerHTML = '';
      await mod.default(root);
    });
  }

  // iCloud sync
  const icloudBtn = document.getElementById('icloud-action');
  if (icloudBtn) {
    icloudBtn.addEventListener('click', async () => {
      icloudBtn.textContent = 'Setting up…';
      icloudBtn.disabled = true;
      // Try connect first (other Mac), fall back to enable (source Mac)
      const endpoint = status.icloud_has_data ? '/api/icloud/connect' : '/api/icloud/enable';
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
      if (res.ok) {
        icloudBtn.textContent = res.message;
        icloudBtn.style.background = 'var(--good)';
        try { await api('/api/scan'); } catch {}
        setTimeout(() => {
          localStorage.setItem('td.onboarded', '1');
          location.hash = '#/overview';
        }, 1500);
      } else {
        icloudBtn.textContent = res.error || 'Failed';
        icloudBtn.style.background = 'var(--bad)';
        icloudBtn.disabled = false;
        setTimeout(() => { icloudBtn.textContent = 'Try again'; icloudBtn.style.background = ''; }, 3000);
      }
    });
  }

  // Custom folder
  document.getElementById('onboard-custom').addEventListener('click', () => {
    const path = prompt(
      'Enter the full path to a folder containing Claude session files (.jsonl).\n\n'
      + 'Examples:\n'
      + '  ~/Library/Mobile Documents/com~apple~CloudDocs/claude-projects\n'
      + '  /Volumes/Shared/claude-data/projects\n\n'
      + 'This is useful if you sync Claude data from another Mac via iCloud or Dropbox.\n\n'
      + 'Leave blank to cancel.'
    );
    if (path && path.trim()) {
      localStorage.setItem('td.customProjectsDir', path.trim());
      localStorage.setItem('td.onboarded', '1');
      location.hash = '#/overview';
    }
  });
}
