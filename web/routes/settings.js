import { api, state, $ } from '/web/app.js';

export default async function (root) {
  const cur = await api('/api/plan');
  const plans = Object.entries(cur.pricing.plans);
  const whoami = await api('/api/whoami');
  root.innerHTML = `
    <div class="card">
      <h2>Settings</h2>

      <h3 style="margin-top:16px">Your profile</h3>
      <p class="muted" style="margin:0 0 12px">Shown in the greeting on the Overview page.</p>
      <div class="flex" style="gap:10px;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:180px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Display name</label>
          <input id="display-name" type="text"
            placeholder="${whoami.username}"
            value="${localStorage.getItem('td.displayName') || ''}"
            style="background:var(--panel-2);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text);font-size:13px;font-family:var(--sans)">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:220px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Claude account email</label>
          <input id="account-email" type="email"
            placeholder="you@example.com"
            value="${localStorage.getItem('td.accountEmail') || ''}"
            style="background:var(--panel-2);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text);font-size:13px;font-family:var(--sans)">
        </div>
        <button class="primary" id="save-profile" style="align-self:flex-end">Save</button>
        <span id="profile-msg" class="muted" style="align-self:flex-end"></span>
      </div>

      <hr class="divider">

      <h3>Plan</h3>
      <p class="muted" style="margin:0 0 12px">Sets how cost is displayed. API mode shows pay-per-token rates. Subscription modes show what you actually pay each month.</p>
      <div class="flex">
        <select id="plan">
          ${plans.map(([k,v]) => `<option value="${k}" ${k===cur.plan?'selected':''}>${v.label}${v.monthly?` — $${v.monthly}/mo`:''}</option>`).join('')}
        </select>
        <button class="primary" id="save">Save</button>
        <span id="msg" class="muted"></span>
      </div>

      <hr class="divider">

      <h3>Pricing table</h3>
      <p class="muted" style="margin:0 0 12px">Edit <code>pricing.json</code> in the project root to change rates. Reload the page after editing.</p>
      <table>
        <thead><tr><th>model</th><th class="num">input</th><th class="num">output</th><th class="num">cache read</th><th class="num">cache 5m</th><th class="num">cache 1h</th></tr></thead>
        <tbody>
          ${Object.entries(cur.pricing.models).map(([k,v]) => `
            <tr><td><span class="badge ${v.tier}">${k}</span></td>
              <td class="num">$${v.input.toFixed(2)}</td>
              <td class="num">$${v.output.toFixed(2)}</td>
              <td class="num">$${v.cache_read.toFixed(2)}</td>
              <td class="num">$${v.cache_create_5m.toFixed(2)}</td>
              <td class="num">$${v.cache_create_1h.toFixed(2)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="muted" style="margin-top:8px;font-size:11px">Rates per 1M tokens, USD.</p>

      <hr class="divider">

      <h3>Privacy</h3>
      <p class="muted">Press <code>Cmd/Ctrl + B</code> anywhere to blur prompt text and other sensitive content for screenshots.</p>
    </div>`;

  $('#save-profile').addEventListener('click', () => {
    const name  = $('#display-name').value.trim();
    const email = $('#account-email').value.trim();
    if (name)  localStorage.setItem('td.displayName',   name);
    else       localStorage.removeItem('td.displayName');
    if (email) localStorage.setItem('td.accountEmail',  email);
    else       localStorage.removeItem('td.accountEmail');
    const msg = $('#profile-msg');
    msg.textContent = 'Saved.';
    msg.style.color = 'var(--good)';
    setTimeout(() => { msg.textContent = ''; }, 2000);
  });

  $('#save').addEventListener('click', async () => {
    const plan = $('#plan').value;
    await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
    state.plan = plan;
    document.getElementById('plan-pill').textContent = plan;
    $('#msg').textContent = 'Saved.';
    $('#msg').style.color = 'var(--good)';
  });
}
