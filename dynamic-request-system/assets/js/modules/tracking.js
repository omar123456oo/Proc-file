/**
 * tracking.js – Request Tracking: searchable list and visual stage timeline
 * with per-stage decisions, checklist answers, execution and request history.
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;
  const { Store, Auth, UI, C, WorkflowEngine: WE, Router } = DRS;
  DRS.Pages = DRS.Pages || {};
  const esc = UI.esc;
  const RS = C.REQUEST_STATUS;

  const STATUS_FILTERS = {
    '': { label: 'All statuses', fn: () => true },
    active: { label: 'Pending + In Progress', fn: (r) => C.ACTIVE_REQUEST_STATUSES.includes(r.status) },
    approved: { label: 'Approved + Completed', fn: (r) => [RS.APPROVED, RS.COMPLETED].includes(r.status) }
  };
  Object.values(RS).filter((s) => s !== RS.DRAFT).forEach((s) => { STATUS_FILTERS[s] = { label: s, fn: (r) => r.status === s }; });

  function locationText(r, stages) {
    const cur = WE.currentStage(r.id);
    if (cur) return { tone: 'warn', title: 'Currently at Stage ' + cur.order + ' of ' + r.totalStages + ': ' + UI.deptName(cur.departmentId) + ' – ' + (cur.checklistName || cur.stageName), text: 'Waiting for ' + UI.approverNames(cur) + (UI.stageApprovers(cur).length > 1 ? ' – ' + (cur.approvalRule === 'all' ? 'all must approve' : cur.approvalRule === 'none' ? 'no approval needed' : 'any one can approve') : '') + ' (' + cur.approverRole + ', Level ' + cur.approvalLevel + ') since ' + UI.fmtDate(cur.activatedAt, true) + '.' };
    if (r.status === RS.RETURNED) return { tone: 'warn', title: 'With the requester for correction', text: 'Returned at Stage ' + r.returnInfo.stageOrder + ' by ' + r.returnInfo.byName + ': “' + r.returnInfo.comment + '”' };
    if (r.status === RS.REJECTED) { const s = stages.find((x) => x.status === 'Rejected'); return { tone: 'error', title: 'Rejected at Stage ' + (s ? s.order : '?') + ' – workflow stopped', text: s ? s.comment : '' }; }
    if (r.status === RS.APPROVED) return { tone: 'success', title: 'All ' + r.totalStages + ' stages approved – awaiting execution', text: 'Pending execution by: ' + r.executionTasks.filter((t) => t.status !== 'Done').map((t) => UI.deptName(t.departmentId)).join(', ') + '.' };
    if (r.status === RS.COMPLETED) return { tone: 'success', title: 'Completed', text: 'All stages approved and all concerned departments completed execution on ' + UI.fmtDate(r.completedAt, true) + '.' };
    return { tone: 'neutral', title: r.status, text: '' };
  }

  function stageMarker(s) {
    const icon = { Approved: 'check', Rejected: 'x', Returned: 'undo', Skipped: 'skip' }[s.status];
    return '<div class="tl-marker tl-marker--' + s.status + '">' + (icon ? UI.icon(icon) : String(s.order).padStart(2, '0')) + '</div>';
  }

  DRS.Pages.trackingList = {
    render(el) {
      UI.setBreadcrumbs([{ label: 'Requests' }, { label: 'Request Tracking' }]);
      const user = Auth.currentUser();
      const query = Router.query();
      let status = STATUS_FILTERS[query.status] ? query.status : '';
      let q = '';
      el.innerHTML = `<div class="page-header"><div><h1>Request Tracking</h1><p>Find a request and see exactly which stage it is at. ${Auth.isAdmin(user) ? 'Administrators see all requests.' : 'You see requests you submitted, approve or execute.'}</p></div></div>
        <div class="card"><div class="card__header"><div class="toolbar">
          <div class="search">${UI.icon('search')}<input class="input" id="tr-q" placeholder="Request ID, subject or requester…" style="width:280px" aria-label="Search requests"></div>
          <select class="select" id="tr-status" style="width:220px" aria-label="Status filter">${UI.options(Object.entries(STATUS_FILTERS).map(([k, v]) => ({ value: k, label: v.label })), status)}</select></div></div>
          <div class="card__body card__body--flush table-wrap" id="tr-table"></div></div>`;
      const draw = () => {
        const list = Auth.visibleRequests(user).filter((r) => r.status !== RS.DRAFT).filter(STATUS_FILTERS[status].fn)
          .filter((r) => !q || (r.id + ' ' + r.subject + ' ' + UI.userName(r.requesterId)).toLowerCase().includes(q.toLowerCase()))
          .sort((a, b) => (a.id < b.id ? 1 : -1));
        const host = el.querySelector('#tr-table');
        host.innerHTML = list.length ? `<table class="table"><thead><tr><th>Request</th><th class="hide-sm">Template</th><th class="hide-sm">Requester</th><th>Location</th><th>Progress</th><th>Status</th></tr></thead><tbody>
          ${list.map((r) => { const cur = WE.currentStage(r.id); return `<tr class="clickable" data-href="#/tracking/${r.id}"><td><span class="req-id">${esc(r.id)}</span><div class="cell-sub" style="max-width:260px">${esc(r.subject)}</div></td>
            <td class="hide-sm">${esc(r.templateName)} <span class="version-pill">v${r.versionNumber}</span></td><td class="hide-sm">${UI.person(r.requesterId, false)}</td>
            <td>${cur ? '<div class="cell-title">Stage ' + cur.order + ' · ' + esc(UI.deptName(cur.departmentId)) + '</div><div class="cell-sub">' + esc(UI.approverNames(cur)) + '</div>' : r.status === RS.RETURNED ? '<span style="color:var(--purple);font-weight:600">Requester</span>' : '<span class="muted">—</span>'}</td>
            <td style="min-width:120px">${UI.stepsBar(WE.getStages(r.id))}</td><td>${UI.statusBadge(r.status)}</td></tr>`; }).join('')}</tbody></table>`
          : UI.empty('No matching requests', 'Try another search or status filter.', '', 'search');
      };
      draw();
      el.querySelector('#tr-q').addEventListener('input', (e) => { q = e.target.value; draw(); });
      el.querySelector('#tr-q').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const id = e.target.value.trim().toUpperCase(); if (Store.get('requests', id)) location.hash = '#/tracking/' + id; }
      });
      el.querySelector('#tr-status').addEventListener('change', (e) => { status = e.target.value; draw(); });
      el.querySelector('#tr-table').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-href]'); if (tr) location.hash = tr.dataset.href; });
    }
  };

  DRS.Pages.tracking = {
    render(el, params) {
      const user = Auth.currentUser();
      const r = Store.get('requests', params.id);
      UI.setBreadcrumbs([{ label: 'Requests' }, { label: 'Request Tracking', href: '#/tracking' }, { label: params.id }]);
      if (!r) { el.innerHTML = UI.empty('Request not found', 'Check the Request ID.', '<a class="btn" href="#/tracking">Back to tracking</a>', 'search'); return; }
      if (!Auth.canViewRequest(user, r)) { el.innerHTML = UI.empty('Not authorised', 'Only the requester, assigned approvers, execution teams and administrators can view ' + r.id + '.', '<a class="btn" href="#/tracking">Back</a>', 'lock'); return; }
      if (r.status === RS.DRAFT) { el.innerHTML = UI.empty(r.id + ' is a draft', 'Drafts have no workflow until they are submitted.', '<a class="btn btn-primary" href="#/requests/edit/' + r.id + '">Continue draft</a>', 'file'); return; }
      const stages = WE.getStages(r.id);
      const history = WE.getHistory(r.id);
      const cur = WE.currentStage(r.id);
      const loc = locationText(r, stages);
      const stopped = r.status === RS.REJECTED;
      const myExecTask = r.status === RS.APPROVED && Auth.hasRole(user, 'execution') && (r.executionTasks || []).find((t) => t.departmentId === user.departmentId && t.status !== 'Done');
      const evStyle = DRS.Pages._eventStyle || {};

      el.innerHTML = `
        <div class="page-header"><div><div class="row-wrap"><h1>Request Details – ${esc(r.id)}</h1>${UI.statusBadge(r.status)}</div><p>${esc(r.subject)}</p></div>
          <div class="page-header__actions">
            ${r.status === RS.RETURNED && r.requesterId === user.id ? `<a class="btn btn-warning" href="#/requests/resubmit/${r.id}">${UI.icon('edit')}Correct &amp; Resubmit</a>` : ''}
            ${cur && UI.waitingApprovers(cur).includes(user.id) ? `<a class="btn btn-primary" href="#/approvals/${r.id}">${UI.icon('inbox')}Review my stage</a>` : ''}
            <a class="btn" href="#/tracking">${UI.icon('arrow-left')}All requests</a></div></div>
        <div class="mb-16">${cur ? `<div class="alert alert--warn" style="align-items:center">${UI.icon('clock')}<div style="flex:1"><strong>${esc(loc.title)}</strong>${esc(loc.text)}</div>${DRS.App.approveButton(r.id)}</div>` : UI.alert(loc.tone, loc.title, loc.text ? [loc.text] : [])}</div>
        <div class="grid grid-main-side">
          <div class="stack">
            <div class="card"><div class="card__header"><div><h2>Checklist &amp; Approval Timeline</h2><p>${r.totalStages} stage instances created from workflow v${r.versionNumber}. Each stage has its own status, answers and history.</p></div>
              <div style="min-width:180px">${UI.stepsBar(stages)}</div></div>
              <div class="card__body"><div class="timeline">
              ${stages.map((s) => {
                const isCur = cur && cur.id === s.id;
                const past = s.cycles.filter((c) => c.cycle < s.cycle);
                let sub;
                if (s.status === 'Waiting') sub = stopped ? 'Not executed – workflow stopped at Stage ' + r.closedAtStage + '.' : r.status === RS.RETURNED ? 'Waiting – request is with the requester for correction.' : 'Will start after Stage ' + (s.order - 1) + ' approval.';
                else if (s.status === 'Pending') sub = 'Assigned to ' + UI.approverNames(s) + ' · active since ' + UI.fmtDate(s.activatedAt, true);
                else sub = (s.status === 'Approved' && s.requiresApproval === false ? 'Checklist completed' : s.status) + ' by ' + UI.userName(s.decidedBy) + ' · ' + UI.fmtDate(s.decidedAt, true);
                return `<div class="tl-item${s.status === 'Approved' || s.status === 'Skipped' ? ' done' : ''}">${stageMarker(s)}
                  <div class="tl-card${isCur ? ' current' : ''}">
                    <div class="tl-card__head"><div><div class="tl-card__title">${String(s.order).padStart(2, '0')} · ${esc(UI.deptName(s.departmentId))} – ${esc(s.checklistName || s.stageName)} ${isCur ? '<span class="you-are-here">Current</span>' : ''}</div>
                      <div class="small muted">${esc(sub)}</div></div>${UI.stageBadge(s.status)}</div>
                    <div class="tl-card__meta"><span><b>Stage</b> ${esc(s.stageName)}</span><span><b>${UI.stageApprovers(s).length > 1 ? 'Approvers' : 'Approver'}</b> ${esc(UI.approverNames(s))} (${esc(s.approverRole)})</span>${UI.ruleTag(s)}<span><b>Level</b> L${s.approvalLevel}</span>
                      <span><b>Decision date</b> ${esc(UI.fmtDate(s.decidedAt, true))}</span>${s.hierarchyKey ? '<span class="tag tag--lock">' + UI.icon('lock') + 'Mandatory hierarchy</span>' : ''}${s.mandatory ? '' : '<span class="tag">Optional</span>'}</div>
                    ${DRS.Pages._timeLine ? DRS.Pages._timeLine(s) : ''}
                    ${s.assignmentNote ? '<div class="small mt-8" style="color:#b45309">' + esc(s.assignmentNote) + '</div>' : ''}
                    ${s.comment ? '<div class="tl-comment tl-comment--' + s.status + '"><strong>Comment:</strong> ' + esc(s.comment) + '</div>' : ''}
                    ${past.length ? '<div class="small mt-8 muted">Earlier review cycles: ' + past.map((c) => 'cycle ' + c.cycle + ' ' + c.status + ' by ' + esc(UI.userName(c.by)) + ' (' + esc(UI.fmtDate(c.at)) + ')' + (c.comment ? ' – “' + esc(c.comment) + '”' : '')).join('; ') + '</div>' : ''}
                    ${s.items.length && s.status !== 'Waiting' ? `<details class="mt-8"><summary class="small" style="cursor:pointer;color:var(--primary);font-weight:600">Checklist answers (${Object.keys(s.answers || {}).length}/${s.items.length})</summary><div class="mt-8">${DRS.Pages._checklistHtml(s, false)}</div></details>` : ''}
                  </div></div>`;
              }).join('')}
              </div></div></div>

            ${(r.executionTasks || []).length ? `<div class="card"><div class="card__header"><div><h2>Execution by Concerned Departments</h2><p>Each concerned department is listed once, regardless of how many stages it executed.</p></div></div>
              <div class="card__body">${r.executionTasks.map((t) => `<div class="kv" style="align-items:center"><span style="color:var(--text)"><strong>${esc(UI.deptName(t.departmentId))}</strong>${t.status === 'Done' ? '<div class="small muted">' + esc(t.byName) + ' · ' + esc(UI.fmtDate(t.at, true)) + (t.note ? ' – ' + esc(t.note) : '') + '</div>' : ''}</span>
                ${t.status === 'Done' ? '<span class="badge badge--teal">Done</span>' : '<span class="badge badge--orange">Pending</span>'}</div>`).join('')}
                ${myExecTask ? `<div class="divider"></div><div class="field"><label for="exec-note">Completion note (${esc(UI.deptName(user.departmentId))})</label><textarea class="textarea" id="exec-note" rows="2" placeholder="e.g. Goods received, asset tags issued"></textarea></div>
                  <div class="row mt-8" style="justify-content:flex-end"><button class="btn btn-success" id="exec-done">${UI.icon('check')}Record execution completed</button></div>` : ''}
              </div></div>` : ''}

            <div class="card"><div class="card__header"><div><h2>Workflow History</h2><p>Every event with actor and timestamp.</p></div><a class="btn btn-sm btn-ghost" href="#/history?request=${r.id}">Open in audit log</a></div>
              <div class="card__body"><div class="feed">${history.slice().reverse().map((h) => { const st = evStyle[h.event] || ['tone-gray', 'info']; return `<div class="feed__item"><span class="feed__icon ${st[0]}">${UI.icon(st[1])}</span><div>
                <div class="feed__title">${esc(h.event)}</div><div class="feed__desc">${esc(h.description)}</div><div class="feed__meta">${esc(h.actorName)} · ${esc(UI.fmtDate(h.timestamp, true))}</div></div></div>`; }).join('')}</div></div></div>
          </div>

          <aside class="stack">
            <div class="card"><div class="card__header"><h2>Summary</h2></div><div class="card__body">
              <div class="kv"><span>Template</span><strong>${esc(r.templateName)}</strong></div>
              <div class="kv"><span>Workflow version</span><a href="javascript:void 0" id="view-version"><span class="version-pill">v${r.versionNumber}</span> view</a></div>
              <div class="kv"><span>Request Type</span><strong>${esc(r.requestType)}</strong></div>
              <div class="kv"><span>Requester</span><strong>${esc(UI.userName(r.requesterId))}</strong></div>
              <div class="kv"><span>Department</span><strong>${esc(UI.deptName(r.requesterDepartmentId))}</strong></div>
              <div class="kv"><span>Created</span><strong>${esc(UI.fmtDate(r.createdAt))}</strong></div>
              <div class="kv"><span>Submitted</span><strong>${esc(UI.fmtDate(r.submittedAt, true))}</strong></div>
              <div class="kv"><span>Priority</span>${UI.priorityBadge(r.priority)}</div>
              <div class="kv"><span>Current Stage</span><strong>${cur ? esc(UI.deptName(cur.departmentId)) + ' – Stage ' + cur.order : '—'}</strong></div>
              <div class="kv"><span>Resubmissions</span><strong>${r.resubmissionCount || 0}</strong></div>
              ${(() => {
                const remaining = stages.filter((s) => s.status === 'Pending' || s.status === 'Waiting');
                const total = stages.reduce((n, s) => n + (Number(s.estimatedHours) || 0), 0);
                if (!total) return '';
                let html = '<div class="kv"><span>Estimated total time</span><strong>' + esc(DRS.Time.format(total)) + '</strong></div>';
                if (cur && C.ACTIVE_REQUEST_STATUSES.includes(r.status)) {
                  const curDue = DRS.Time.stageDue(cur) || DRS.Clock.now();
                  const rest = remaining.filter((s) => s.id !== cur.id).reduce((n, s) => n + (Number(s.estimatedHours) || 0), 0);
                  const from = new Date(curDue) > new Date(DRS.Clock.now()) ? curDue : DRS.Clock.now();
                  html += '<div class="kv"><span>Expected completion</span><strong>' + esc(UI.fmtDate(DRS.Time.addWorkingHours(from, rest), true)) + '</strong></div>';
                }
                return html;
              })()}
              <div class="kv"><span>Concerned Departments</span><strong>${(r.concernedDepartmentIds || []).map(UI.deptName).map(esc).join(', ')}</strong></div>
            </div></div>
            <div class="card"><div class="card__header"><h2>Request Details</h2></div><div class="card__body"><p class="prewrap small">${esc(r.details)}</p>${DRS.Pages._attachmentsHtml(r.attachments, false)}</div></div>
          </aside>
        </div>`;

      el.querySelector('#view-version').addEventListener('click', () => DRS.Pages._showVersion(r.workflowVersionId));
      const ex = el.querySelector('#exec-done');
      if (ex) ex.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!(await UI.confirm({ title: 'Record execution completed?', message: UI.deptName(user.departmentId) + ' execution for ' + r.id + ' will be marked as done.', confirmLabel: 'Record completion' }))) return;
        UI.busy(btn, () => {
          const res = WE.completeExecution(r.id, user.departmentId, user.id, el.querySelector('#exec-note').value.trim());
          UI.toast('Execution recorded', 'success', { text: res.status === RS.COMPLETED ? r.id + ' is now Completed.' : 'Waiting for the other concerned departments.' });
          DRS.App.reload();
        });
      });
    }
  };
})(window);
