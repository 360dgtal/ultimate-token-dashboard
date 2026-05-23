import { api, fmt } from '/web/app.js';

function projectCell(r) {
  // Prefer the human-readable session title, then project_name, then slug
  const name = fmt.htmlSafe(r.session_title || r.project_name || r.project_slug);
  const tip  = fmt.htmlSafe(r.project_slug);
  // Show project_name as a secondary label when it differs from the title
  const label = (r.session_title && r.project_name && r.project_name !== r.session_title)
    ? `<br><span class="muted" style="font-size:11px">${fmt.htmlSafe(r.project_name)}</span>`
    : '';
  const date = r.first_seen
    ? `<span class="muted" style="font-size:11px">${r.first_seen.slice(0,10)} · </span>`
    : '';
  const sub = r.first_prompt && !r.session_title
    ? `<br><span class="muted" style="font-size:11px;font-weight:400">${fmt.htmlSafe(fmt.short(r.first_prompt, 72))}</span>`
    : '';
  return `<td title="${tip}"><strong>${name}</strong>${label}<br>${date}${sub}</td>`;
}

export default async function (root) {
  const rows = await api('/api/projects');
  root.innerHTML = `
    <div class="card">
      <h2>Projects</h2>
      <p class="muted" style="margin:-8px 0 14px">Sorted by billable token spend. Hover a row to see the raw project slug.</p>
      <table>
        <thead><tr><th>project</th><th class="num">sessions</th><th class="num">turns</th><th class="num">billable tokens</th><th class="num">cache reads</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              ${projectCell(r)}
              <td class="num">${fmt.int(r.sessions)}</td>
              <td class="num">${fmt.int(r.turns)}</td>
              <td class="num">${fmt.int(r.billable_tokens)}</td>
              <td class="num">${fmt.int(r.cache_read_tokens)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}
