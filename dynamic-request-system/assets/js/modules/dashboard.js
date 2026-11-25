/**
 * dashboard.js – summary KPIs, recent requests, pending approvals,
 * status distribution chart, recent workflow activity and quick actions.
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;
  const { Store, Auth, UI, C, WorkflowEngine: WE } = DRS;
  DRS.Pages = DRS.Pages || {};
  const RS = C.REQUEST_STATUS;

  const STATUS_COLORS = {
    'Pending Approval': '#d97706', 'In Progress': '#2563eb', 'Returned for Correction': '#7c3aed',
    Rejected: '#dc2626', Approved: '#16a34a', Completed: '#0d9488', Draft: '#94a3b8'
  };
  const EVENT_STYLE = {
    'Request Created': ['tone-gray', 'file-plus'], 'Draft Saved': ['tone-gray', 'save'], 'Request Submitted': ['tone-blue', 'send'],
    'Stage Activated': ['tone-orange', 'clock'], 'Checklist Updated': ['tone-gray', 'checklist'], 'Checklist Completed': ['tone-teal', 'checklist'],
    'Stage Completed': ['tone-green', 'check'], 'Stage Skipped': ['tone-gray', 'skip'], 'Request Approved': ['tone-green', 'check-circle'],
    'Request Rejected': ['tone-red', 'x-circle'], 'Request Returned': ['tone-purple', 'undo'], 'Request Resubmitted': ['tone-blue', 'refresh'],
    'Approver Reassigned': ['tone-orange', 'users'], 'Execution Completed': ['tone-teal', 'tool'], 'Request Completed': ['tone-teal', 'flag']
  };

  function donut(counts) {
    const entries = Object.entries(counts).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    const r = 60; const circ = 2 * Math.PI * r;
    let offset = 0;
    const arcs = entries.map(([k, v]) => {
      const len = (v / total) * circ;
      const seg = '<circle cx="84" cy="84" r="' + r + '" fill="none" stroke="' + STATUS_COLORS[k] + '" stroke-width="22" stroke-dasharray="' + Math.max(len - 2, 0.1) + ' ' + (circ - Math.max(len - 2, 0.1)) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 84 84)"><title>' + UI.esc(k) + ': ' + v + '</title></circle>';
      offset += len;
      return seg;
    }).join('');
    return '<svg class="donut" viewBox="0 0 168 168" role="img" aria-label="Request status distribution">' +
      '<circle cx="84" cy="84" r="' + r + '" fill="none" stroke="#eef1f5" stroke-width="22"/>' + arcs +
      '<text x="84" y="80" text-anchor="middle" font-size="28" font-weight="750" fill="#0f172a">' + total + '</text>' +
      '<text x="84" y="100" text-anchor="middle" font-size="11" fill="#64748b">requests</text></svg>';
  }

  DRS.Pages.dashboard = {
    render(el) {
      UI.setBreadcrumbs([{ label: 'Request Management', href: '#/dashboard' }, { label: 'Dashboard' }]);
      const user = Auth.currentUser();
      const isAdmin = Auth.isAdmin(user);
      const requests = Auth.visibleRequests(user).filter((r) => r.status !== RS.DRAFT || r.requesterId === user.id);
      const submitted = requests.filter((r) => r.status !== RS.DRAFT);
      const count = (...st) => submitted.filter((r) => st.includes(r.status)).length;
      const pending = WE.pendingFor(user.id);
      const execTasks = WE.executionTasksFor(user);
      const hour = new Date().getHours();
      const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

      const kpis = [
        { label: 'Total Requests', value: submitted.length, tone: 'tone-blue', icon: 'layers', href: '#/tracking', hint: isAdmin ? 'All submitted requests' : 'Requests you are involved in' },
        { label: 'Pending Requests', value: count(RS.PENDING, RS.IN_PROGRESS), tone: 'tone-orange', icon: 'clock', href: '#/tracking?status=active', hint: 'Pending Approval + In Progress' },
        { label: 'Approved Requests', value: count(RS.APPROVED, RS.COMPLETED), tone: 'tone-green', icon: 'check-circle', href: '#/tracking?status=approved', hint: count(RS.COMPLETED) + ' completed' },
        { label: 'Rejected Requests', value: count(RS.REJECTED), tone: 'tone-red', icon: 'x-circle', href: '#/tracking?status=' + encodeURIComponent(RS.REJECTED), hint: 'Workflow stopped' },
        { label: 'Returned Requests', value: count(RS.RETURNED), tone: 'tone-purple', icon: 'undo', href: '#/tracking?status=' + encodeURIComponent(RS.RETURNED), hint: 'Awaiting correction' },
        { label: 'Assigned to Me', value: pending.length, tone: 'tone-teal', icon: 'inbox', href: '#/approvals', hint: execTasks.length ? execTasks.length + ' execution task(s)' : 'Awaiting your decision' }
      ];

      const dist = {};
      [RS.PENDING, RS.IN_PROGRESS, RS.RETURNED, RS.REJECTED, RS.APPROVED, RS.COMPLETED].forEach((s) => { dist[s] = count(s); });
      const recent = submitted.slice().sort((a, b) => ((a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1)).slice(0, 7);
      const visibleIds = new Set(submitted.map((r) => r.id));
      const activity = Store.where('history', (h) => visibleIds.has(h.requestId)).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 8);

      el.innerHTML = `
        <div class="page-header">
          <div><h1>${greet}, ${UI.esc(user.name.split(' ')[0])}</h1>
            <p>${UI.esc(user.jobTitle)} · ${UI.esc(UI.deptName(user.departmentId))}. ${isAdmin ? 'Administrator view: all requests in the system.' : 'Showing requests you submitted, approve, or execute.'}</p></div>
          <div class="page-header__actions">
            ${isAdmin ? '<a class="btn" href="#/templates/new">' + UI.icon('template') + 'New Template</a>' : ''}
            <a class="btn btn-primary" href="#/requests/new">${UI.icon('plus')}Create Request</a>
          </div>
        </div>
        <div class="kpis">${kpis.map((k) => `
          <a class="card kpi" href="${k.href}">
            <div class="kpi__top"><span class="kpi__label">${UI.esc(k.label)}</span><span class="kpi__icon ${k.tone}">${UI.icon(k.icon)}</span></div>
            <div class="kpi__value">${k.value}</div><div class="kpi__hint">${UI.esc(k.hint)}</div>
          </a>`).join('')}</div>

        <div class="grid grid-main-side">
          <div class="stack">
            <div class="card">
              <div class="card__header"><div><h2>Recent Requests</h2><p>Latest activity across ${isAdmin ? 'all' : 'your'} requests</p></div><a class="btn btn-sm" href="#/tracking">View all</a></div>
              <div class="card__body card__body--flush table-wrap">${recent.length ? `
                <table class="table"><thead><tr><th>Request</th><th class="hide-sm">Type</th><th class="hide-sm">Requester</th><th>Progress</th><th>Status</th></tr></thead><tbody>
                ${recent.map((r) => `<tr class="clickable" data-href="${DRS.App.requestLink(r.id)}">
                  <td><div class="req-id">${UI.esc(r.id)}</div><div class="cell-sub">${UI.esc(r.subject)}</div></td>
                  <td class="hide-sm">${UI.esc(r.requestType)}</td>
                  <td class="hide-sm">${UI.person(r.requesterId, false)}</td>
                  <td style="min-width:120px">${UI.stepsBar(WE.getStages(r.id))}</td>
                  <td>${UI.statusBadge(r.status)}</td></tr>`).join('')}
                </tbody></table>` : UI.empty('No requests yet', 'Submitted requests will appear here.', '<a class="btn btn-primary" href="#/requests/new">Create Request</a>')}
              </div>
            </div>
            <div class="card">
              <div class="card__header"><div><h2>Pending Approvals</h2><p>Stages currently waiting for your decision</p></div><a class="btn btn-sm" href="#/approvals">Open workspace</a></div>
              <div class="card__body card__body--flush table-wrap">${pending.length ? `
                <table class="table"><thead><tr><th>Request</th><th>Current Stage</th><th class="hide-sm">Level</th><th class="hide-sm">Waiting since</th><th></th></tr></thead><tbody>
                ${pending.map(({ request: r, stage: s }) => `<tr class="clickable" data-href="#/approvals/${UI.esc(r.id)}">
                  <td><div class="req-id">${UI.esc(r.id)}</div><div class="cell-sub">${UI.esc(r.subject)}</div></td>
                  <td><div class="cell-title">Stage ${s.order} of ${r.totalStages} · ${UI.esc(UI.deptName(s.departmentId))}</div><div class="cell-sub">${UI.esc(s.stageName)}</div></td>
                  <td class="hide-sm"><span class="level-pill">L${s.approvalLevel}</span></td>
                  <td class="hide-sm">${UI.esc(UI.relTime(s.activatedAt))}</td>
                  <td><span class="btn btn-primary btn-sm">Review</span></td></tr>`).join('')}
                </tbody></table>` : UI.empty('Nothing waiting for you', 'When a stage assigned to you becomes active it will appear here.', '', 'check-circle')}
              </div>
            </div>
          </div>
          <div class="stack">
            <div class="card">
              <div class="card__header"><h2>Request Status Distribution</h2></div>
              <div class="card__body">${submitted.length ? `<div class="donut-wrap">${donut(dist)}
                <div class="legend">${Object.entries(dist).map(([k, v]) => `<a class="legend__row" href="#/tracking?status=${encodeURIComponent(k)}" style="color:inherit"><span class="legend__swatch" style="background:${STATUS_COLORS[k]}"></span>${UI.esc(k)}<span class="legend__val">${v}</span></a>`).join('')}</div></div>` : UI.empty('No data', '')}
              </div>
            </div>
            <div class="card">
              <div class="card__header"><h2>Quick Actions</h2></div>
              <div class="card__body"><div class="quick">
                <a href="#/requests/new"><span class="kpi__icon tone-blue">${UI.icon('file-plus')}</span>New Request</a>
                <a href="#/approvals"><span class="kpi__icon tone-orange">${UI.icon('inbox')}</span>My Approvals</a>
                <a href="#/my-requests"><span class="kpi__icon tone-purple">${UI.icon('folder')}</span>My Requests</a>
                <a href="#/tracking"><span class="kpi__icon tone-teal">${UI.icon('timeline')}</span>Track Request</a>
                ${isAdmin ? `<a href="#/templates/new"><span class="kpi__icon tone-green">${UI.icon('template')}</span>New Template</a>
                <a href="#/checklists/new"><span class="kpi__icon tone-gray">${UI.icon('checklist')}</span>New Checklist</a>` : ''}
              </div></div>
            </div>
            <div class="card">
              <div class="card__header"><h2>Recent Workflow Activity</h2><a class="btn btn-sm btn-ghost" href="#/history">All</a></div>
              <div class="card__body" style="padding-top:6px;padding-bottom:6px">${activity.length ? `<div class="feed">${activity.map((h) => {
                const st = EVENT_STYLE[h.event] || ['tone-gray', 'info'];
                return `<div class="feed__item"><span class="feed__icon ${st[0]}">${UI.icon(st[1])}</span><div style="min-width:0">
                  <div class="feed__title">${UI.esc(h.event)} · <a href="${DRS.App.requestLink(h.requestId)}">${UI.esc(h.requestId)}</a></div>
                  <div class="feed__desc">${UI.esc(h.description)}</div>
                  <div class="feed__meta">${UI.esc(h.actorName)} · ${UI.esc(UI.relTime(h.timestamp))}</div></div></div>`;
              }).join('')}</div>` : UI.empty('No activity yet', '')}</div>
            </div>
          </div>
        </div>`;

      el.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    }
  };
  DRS.Pages._eventStyle = EVENT_STYLE;
})(window);
