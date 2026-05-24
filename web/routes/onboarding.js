import { api, fmt } from '/web/app.js';

export default async function (root) {
  const status = await api('/api/status');

  const sources = [];
  if (status.claude_code_installed)
    sources.push({ icon: 'terminal', label: 'Claude Code', detail: `${status.sessions_found} session${status.sessions_found !== 1 ? 's' : ''} across ${status.projects_found} project${status.projects_found !== 1 ? 's' : ''}`, ok: status.sessions_found > 0 });
  if (status.claude_desktop_installed)
    sources.push({ icon: 'desktop', label: 'Claude Desktop', detail: `${status.cowork_sessions_found} Cowork session${status.cowork_sessions_found !== 1 ? 's' : ''} found`, ok: status.cowork_sessions_found > 0 });

  const hasAnyData = status.has_data;

  root.innerHTML = `
    <div class="onboarding">
      <div class="onboarding-card">
        <img src="/web/assets/logo.png" alt="360Digital" class="onboarding-logo">
        <h1 class="onboarding-title">Ultimate Token Dashboard</h1>
        <p class="onboarding-subtitle">Take back control of your tokens</p>

        <div class="onboarding-section">
          <h3>Detected on this Mac</h3>
          <div class="onboarding-sources">
            ${sources.length ? sources.map(s => `
              <div class="onboarding-source ${s.ok ? 'ok' : 'empty'}">
                <span class="source-icon">${s.icon === 'terminal' ? '&#xF489;' : '&#x1F5A5;'}</span>
                <div class="source-info">
                  <span class="source-label">${s.label}</span>
                  <span class="source-detail">${s.detail}</span>
                </div>
                <span class="source-status">${s.ok ? 'Ready' : 'No data yet'}</span>
              </div>
            `).join('') : `
              <div class="onboarding-source empty">
                <span class="source-icon">&#x26A0;</span>
                <div class="source-info">
                  <span class="source-label">No Claude installation found</span>
                  <span class="source-detail">Install Claude Code or Claude Desktop to get started</span>
                </div>
              </div>
            `}
          </div>
        </div>

        <div class="onboarding-section">
          <h3>How it works</h3>
          <div class="onboarding-steps">
            <div class="step">
              <span class="step-num">1</span>
              <div>
                <strong>Local scanning</strong>
                <p>Reads session transcripts that Claude writes to your Mac. Your data stays on your machine.</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">2</span>
              <div>
                <strong>Token analytics</strong>
                <p>Calculates cost per prompt, cache efficiency, model usage, and project breakdowns.</p>
              </div>
            </div>
            <div class="step">
              <span class="step-num">3</span>
              <div>
                <strong>Updated automatically</strong>
                <p>Scans for new sessions every 30 seconds. No manual refresh needed.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="onboarding-section privacy-section">
          <div class="privacy-icon">&#x1F512;</div>
          <div class="privacy-text">
            <strong>Privacy first</strong>
            <p>All data is processed locally. No telemetry, no remote calls, no third-party services. Your prompts and usage data never leave your Mac.</p>
          </div>
        </div>

        <div class="onboarding-actions">
          ${hasAnyData ? `
            <button class="primary onboarding-btn" id="onboard-go">
              Connect &amp; continue
            </button>
          ` : `
            <button class="primary onboarding-btn" id="onboard-go">
              Continue with setup
            </button>
          `}
          <button class="secondary onboarding-btn" id="onboard-custom">
            Use a custom folder
          </button>
        </div>

        <p class="onboarding-fine-print">
          By continuing you agree to let this app read your local Claude session files.
        </p>
      </div>
    </div>
  `;

  document.getElementById('onboard-go').addEventListener('click', async () => {
    localStorage.setItem('td.onboarded', '1');
    if (hasAnyData) {
      // Trigger an initial scan
      try { await api('/api/scan'); } catch {}
    }
    location.hash = '#/overview';
  });

  document.getElementById('onboard-custom').addEventListener('click', () => {
    const path = prompt(
      'Enter the full path to your Claude projects folder.\n\n'
      + 'Examples:\n'
      + '  ~/Library/Mobile Documents/com~apple~CloudDocs/claude-projects\n'
      + '  /Volumes/Shared/claude-data/projects\n\n'
      + 'Leave blank to cancel.'
    );
    if (path && path.trim()) {
      localStorage.setItem('td.customProjectsDir', path.trim());
      localStorage.setItem('td.onboarded', '1');
      location.hash = '#/overview';
    }
  });
}
