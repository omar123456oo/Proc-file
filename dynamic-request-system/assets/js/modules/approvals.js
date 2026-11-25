/**
 * approvals.js – Approval Workspace: assigned stages, upcoming stages,
 * execution tasks, processed decisions, and the stage decision screen.
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;
  const { Store, Auth, UI, C, Validation, WorkflowEngine: WE, Router } = DRS;
  DRS.Pages = DRS.Pages || {};
  const esc = UI.esc;
  const RS = C.REQUEST_STATUS;

  // ------------------------------------------------------ checklist rendering
  function answerText(it, v) {
    if (it.type === 'attachment') return Array.isArray(v) && v.length ? v.map((f) => '📎 ' + esc(f)).join('<br>') : '';
    if (it.type === 'date' && v) return esc(UI.fmtDate(v));
    return v === undefined || v === null ? '' : esc(v);
  }
  /** Checklist items for one stage instance (editable inputs or read-only answers). */
  function checklistHtml(stage, editable) {
    if (!stage.items || !stage.items.length) return '<p class="muted small">This stage has no checklist. It is an approval-only stage.</p>';
    return stage.items.map((it) => {
      const v = (stage.answers || {})[it.id];
      const name = 'q-' + stage.id + '-' + it.id;
      let control;
      if (!editable) {
        const t = answerText(it, v);
        control = t ? '<div class="cl-answer">' + t + '</div>' : '<div class="cl-answer empty">Not answered</div>';
      } else if (it.type === 'yesno') {
        control = '<div class="yesno" role="radiogroup">' + ['Yes', 'No'].map((o) => `<label><input type="radio" name="${name}" value="${o}" data-item="${it.id}"${v === o ? ' checked' : ''}>${o}</label>`).join('') + '</div>';
      } else if (it.type === 'dropdown') {
        control = `<select class="select" data-item="${it.id}">${UI.options(it.options.map((o) => ({ value: o, label: o })), v || '', 'Select…')}</select>`;
      } else if (it.type === 'text') {
        control = `<textarea class="textarea" rows="2" style="min-height:60px" data-item="${it.id}">${esc(v || '')}</textarea>`;
      } else if (it.type === 'attachment') {
        control = `<div><label class="btn btn-sm" for="f-${name}">${UI.icon('paperclip')}Attach file</label><input type="file" id="f-${name}" class="sr-only" multiple data-item="${it.id}" data-kind="file">
          <div class="small mt-8" data-files="${it.id}">${(Array.isArray(v) ? v : []).map((f) => '📎 ' + esc(f)).join('<br>') || '<span class="muted">No files</span>'}</div></div>`;
      } else {
        control = `<input class="input" type="${it.type === 'number' ? 'number' : 'date'}" data-item="${it.id}" value="${esc(v || '')}">`;
      }
      if (it.needAttachment) {
        const fk = C.filesKey(it.id);
        const files = (stage.answers || {})[fk] || [];
        control += editable
          ? `<div class="mt-8"><label class="btn btn-sm${files.length ? '' : ' btn-warning'}" for="f-${name}-att">${UI.icon('paperclip')}Attach file${it.required ? ' (required)' : ''}</label><input type="file" id="f-${name}-att" class="sr-only" multiple data-item="${fk}" data-kind="file">
             <div class="small mt-8" data-files="${fk}">${files.map((f) => '📎 ' + esc(f)).join('<br>') || '<span class="muted">No file attached</span>'}</div></div>`
          : `<div class="small mt-8">${files.length ? files.map((f) => '📎 ' + esc(f)).join('<br>') : '<span class="muted">No file attached</span>'}</div>`;
      }
      return `<div class="cl-item"><div><div class="cl-item__label">${esc(it.label)}${it.required ? ' <span class="req">*</span>' : ''}</div>
        <div class="cl-item__help">${esc(C.ITEM_TYPES[it.type])}${it.helpText ? ' · ' + esc(it.helpText) : ''}</div>${DRS.Pages._pointFlags ? DRS.Pages._pointFlags(it) : ''}</div><div>${control}</div></div>`;
    }).join('');
  }
  /** Reads answers from an editable checklist. */
  function readAnswers(root, stage) {
    const out = Object.assign({}, stage.answers || {});
    (stage.items || []).forEach((it) => {
      if (it.type === 'yesno') {
        const c = root.querySelector('input[data-item="' + it.id + '"]:checked');
        if (c) out[it.id] = c.value;
      } else if (it.type === 'attachment') {
        // updated on file change
      } else {
        const f = root.querySelector('[data-item="' + it.id + '"]');
        if (f) out[it.id] = f.value.trim();
      }
    });
    return out;
  }
  DRS.Pages._checklistHtml = checklistHtml;

  /** "Time: 1 working day · due 25 Nov, 17:00" with overdue highlight. */
  function timeLine(s) {
    if (s.estimatedHours === null || s.estimatedHours === undefined) return '';
    const due = DRS.Time.stageDue(s);
    const over = DRS.Time.isOverdue(s);
    return '<div class="row-wrap small mt-8"><span class="tag">' + UI.icon('clock') + 'Estimated ' + esc(DRS.Time.format(s.estimatedHours)) + '</span>' +
      (due && s.status === 'Pending' ? (over ? '<span class="badge badge--red">Overdue – was due ' + esc(UI.fmtDate(due, true)) + '</span>' : '<span class="badge badge--plain badge--blue">Due ' + esc(UI.fmtDate(due, true)) + '</span>') : '') + '</div>';
  }
  DRS.Pages._timeLine = timeLine;

  function stageTitle(s) { return 'Stage ' + s.order + ' · ' + UI.deptName(s.departmentId) + ' – ' + s.stageName; }

  // -------------------------------------------------------------- workspace
  DRS.Pages.approvals = {
    render(el) {
      UI.setBreadcrumbs([{ label: 'Requests' }, { label: 'Approval Workspace' }]);
      const user = Auth.currentUser();
      const pending = WE.pendingFor(user.id).sort((a, b) => (a.stage.activatedAt < b.stage.activatedAt ? -1 : 1));
      const upcoming = WE.upcomingFor(user.id);
      const exec = WE.executionTasksFor(user);
      const processed = WE.processedBy(user.id);
      const tabs = [
        { id: 'pending', label: 'Awaiting My Action', count: pending.length },
        { id: 'upcoming', label: 'Upcoming (Not My Turn)', count: upcoming.length },
        { id: 'processed', label: 'Processed by Me', count: processed.length }
      ];
      if (Auth.hasRole(user, 'execution')) tabs.splice(2, 0, { id: 'execution', label: 'Execution Tasks', count: exec.length });
      let tab = Router.query().tab || 'pending';
      if (!tabs.some((t) => t.id === tab)) tab = 'pending';

      el.innerHTML = `<div class="page-header"><div><h1>Approval Workspace</h1><p>Stages assigned to <strong>${esc(user.name)}</strong>. You can act only on the active stage of a request, and only when it is assigned to you.</p></div></div>
        ${Auth.hasRole(user, 'approver') || pending.length || upcoming.length || exec.length ? '' : '<div class="mb-16">' + UI.alert('info', esc(user.name) + ' does not have the Approver role. Switch to an approver (for example Layla Hassan, Operations Manager) with the demo user switcher to test approvals.') + '</div>'}
        <div class="card"><div class="tabs" id="tabs" style="margin:0;padding:0 12px"></div><div class="table-wrap" id="ws"></div></div>`;
      const draw = () => {
        el.querySelector('#tabs').innerHTML = tabs.map((t) => `<button class="tab${t.id === tab ? ' active' : ''}" data-tab="${t.id}">${esc(t.label)}<span class="count">${t.count}</span></button>`).join('');
        const host = el.querySelector('#ws');
        if (tab === 'pending') {
          host.innerHTML = pending.length ? `<table class="table"><thead><tr><th>Request ID</th><th class="hide-sm">Request Type</th><th class="hide-sm">Requester</th><th>Current Department</th><th>Checklist Stage</th><th>Level</th><th class="hide-sm">Submitted</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
            ${pending.map(({ request: r, stage: s }) => `<tr class="clickable" data-href="#/approvals/${r.id}">
              <td><span class="req-id">${esc(r.id)}</span><div class="cell-sub" style="max-width:220px">${esc(r.subject)}</div></td>
              <td class="hide-sm">${esc(r.requestType)}</td><td class="hide-sm">${UI.person(r.requesterId)}</td>
              <td><strong>${esc(UI.deptName(s.departmentId))}</strong></td>
              <td><div class="cell-title">Stage ${s.order} of ${r.totalStages}</div><div class="cell-sub">${esc(s.checklistName || s.stageName)}</div></td>
              <td><span class="level-pill">L${s.approvalLevel}</span></td>
              <td class="hide-sm nowrap">${esc(UI.fmtDate(r.submittedAt))}</td>
              <td class="nowrap">${(() => { const due = DRS.Time.stageDue(s); return !due ? '<span class="muted">—</span>' : DRS.Time.isOverdue(s) ? '<span class="badge badge--red">Overdue</span><div class="cell-sub">' + esc(UI.fmtDate(due, true)) + '</div>' : esc(UI.fmtDate(due, true)); })()}</td>
              <td>${UI.statusBadge(r.status)}${r.resubmissionCount ? '<div class="cell-sub">Resubmitted ×' + r.resubmissionCount + '</div>' : ''}</td>
              <td><span class="btn btn-primary btn-sm">Review</span></td></tr>`).join('')}</tbody></table>`
            : UI.empty('No stages awaiting your action', 'Stages assigned to you appear here when the previous stage has been approved.', '', 'check-circle');
        } else if (tab === 'upcoming') {
          host.innerHTML = upcoming.length ? `<table class="table"><thead><tr><th>Request</th><th>Your Stage</th><th>Level</th><th>Currently at</th><th>Status</th><th></th></tr></thead><tbody>
            ${upcoming.map(({ request: r, stage: s }) => { const cur = WE.currentStage(r.id); return `<tr class="clickable" data-href="#/approvals/${r.id}">
              <td><span class="req-id">${esc(r.id)}</span><div class="cell-sub">${esc(r.subject)}</div></td>
              <td><div class="cell-title">Stage ${s.order} · ${esc(UI.deptName(s.departmentId))}</div><div class="cell-sub">${esc(s.stageName)}</div></td>
              <td><span class="level-pill">L${s.approvalLevel}</span></td>
              <td>${cur ? 'Stage ' + cur.order + ' – ' + esc(UI.approverNames(cur)) : r.status === RS.RETURNED ? 'With requester' : '—'}</td>
              <td>${UI.stageBadge(s.status)}</td><td><span class="btn btn-sm">${UI.icon('lock')}View</span></td></tr>`; }).join('')}</tbody></table>`
            : UI.empty('No upcoming stages', 'Future stages assigned to you stay locked (Waiting) until their turn.', '', 'clock');
        } else if (tab === 'execution') {
          host.innerHTML = exec.length ? `<table class="table"><thead><tr><th>Request</th><th>Template</th><th>Approved</th><th>Your department</th><th></th></tr></thead><tbody>
            ${exec.map((r) => `<tr class="clickable" data-href="#/tracking/${r.id}"><td><span class="req-id">${esc(r.id)}</span><div class="cell-sub">${esc(r.subject)}</div></td><td>${esc(r.templateName)}</td><td>${esc(UI.fmtDate(r.approvedAt))}</td>
              <td>${esc(UI.deptName(user.departmentId))} <span class="badge badge--orange">Pending</span></td><td><span class="btn btn-primary btn-sm">Record completion</span></td></tr>`).join('')}</tbody></table>`
            : UI.empty('No execution tasks', 'Fully approved requests that concern your department appear here.', '', 'tool');
        } else {
          host.innerHTML = processed.length ? `<table class="table"><thead><tr><th>Request</th><th>Stage</th><th>Decision</th><th class="hide-sm">Comment</th><th>Date</th></tr></thead><tbody>
            ${processed.map((d) => `<tr class="clickable" data-href="#/tracking/${d.requestId}"><td><span class="req-id">${esc(d.requestId)}</span></td><td>Stage ${d.stageOrder} · ${esc(UI.deptName(d.departmentId))}<div class="cell-sub">${esc(d.stageName)}${d.cycle > 1 ? ' · cycle ' + d.cycle : ''}</div></td>
              <td>${UI.stageBadge(d.action)}</td><td class="hide-sm" style="max-width:300px">${esc(d.comment) || '<span class="muted">—</span>'}</td><td class="nowrap">${esc(UI.fmtDate(d.timestamp, true))}</td></tr>`).join('')}</tbody></table>`
            : UI.empty('No decisions yet', 'Your approval decisions will be listed here.', '', 'history');
        }
      };
      draw();
      el.querySelector('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; draw(); } });
      el.querySelector('#ws').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-href]'); if (tr) location.hash = tr.dataset.href; });
    }
  };

  // ------------------------------------------------------------ decision page
  DRS.Pages.approvalDetail = {
    render(el, params) {
      const user = Auth.currentUser();
      const r = Store.get('requests', params.id);
      UI.setBreadcrumbs([{ label: 'Requests' }, { label: 'Approval Workspace', href: '#/approvals' }, { label: params.id }]);
      if (!r || r.status === RS.DRAFT) { el.innerHTML = UI.empty('Request not found', '', '<a class="btn" href="#/approvals">Back to workspace</a>'); return; }
      if (!Auth.canViewRequest(user, r)) { el.innerHTML = UI.empty('Not authorised', 'You are not the requester, an approver or an administrator for ' + r.id + '.', '<a class="btn" href="#/approvals">Back to workspace</a>', 'lock'); return; }
      const stages = WE.getStages(r.id);
      const current = WE.currentStage(r.id);
      // Which stage is this user's focus? Their pending stage, else their next waiting stage, else the current stage.
      const mine = stages.find((s) => UI.stageApprovers(s).includes(user.id) && s.status === 'Pending') || stages.find((s) => UI.stageApprovers(s).includes(user.id) && s.status === 'Waiting') || current || stages[stages.length - 1];
      const chk = WE.canAct(r.id, mine.id, user.id);
      const canAct = chk.ok;
      const settings = Store.settings();
      const decisions = WE.getDecisions(r.id);
      let draftAnswers = Store.clone(mine.answers || {});

      el.innerHTML = `
        <div class="page-header"><div><div class="row-wrap"><h1>${esc(r.id)}</h1>${UI.statusBadge(r.status)}${UI.priorityBadge(r.priority)}</div><p>${esc(r.subject)}</p></div>
          <div class="page-header__actions"><a class="btn" href="#/approvals">${UI.icon('arrow-left')}Workspace</a><a class="btn" href="#/tracking/${r.id}">${UI.icon('timeline')}Full tracking</a></div></div>
        <div class="grid grid-main-side">
          <div class="stack">
            <div class="card" id="stage-card">
              <div class="card__header"><div><div class="row-wrap"><h2>${esc(stageTitle(mine))}</h2>${UI.stageBadge(mine.status)}</div>
                <p>${esc(mine.checklistName || 'Approval-only stage')} · Approval Level ${mine.approvalLevel} · ${mine.requiresApproval === false ? 'Assigned to' : UI.stageApprovers(mine).length > 1 ? 'Approvers' : 'Approver'}: ${esc(UI.approverNames(mine))} ${UI.ruleTag(mine)} (${esc(mine.approverRole)})${mine.cycle > 1 ? ' · Review cycle ' + mine.cycle : ''}</p>
                ${timeLine(mine)}</div>
                <span class="badge badge--plain badge--navy">STAGE ${String(mine.order).padStart(2, '0')} / ${String(r.totalStages).padStart(2, '0')}</span></div>
              <div class="card__body">
                ${canAct ? (r.resubmissionCount && r.lastReturnInfo ? '<div class="mb-16">' + UI.alert('info', 'Resubmitted by the requester after correction (previous return: "' + r.lastReturnInfo.comment + '").') + '</div>' : '') : `<div class="locked-panel mb-16" style="align-items:center">${UI.icon('lock')}<div style="flex:1"><strong>Actions locked</strong><div class="small">${esc(chk.reason)}</div></div>${current && !UI.waitingApprovers(current).includes(user.id) ? DRS.App.approveButton(r.id, 'btn-sm') : ''}</div>`}
                ${mine.assignmentNote ? '<div class="mb-16">' + UI.alert('warn', mine.assignmentNote) + '</div>' : ''}
                <h3 class="mb-8">Checklist items</h3>
                <div id="checklist">${checklistHtml(mine, canAct)}</div>
                ${canAct ? `<div class="divider"></div>
                  <div class="field"><label for="comment">Comments <span class="muted">(required for Reject and Return)</span></label><textarea class="textarea" id="comment" rows="3" maxlength="2000" placeholder="Add a comment for the requester and the next approvers"></textarea></div>` : (mine.comment ? '<div class="tl-comment tl-comment--' + mine.status + ' mt-16"><strong>' + esc(UI.userName(mine.decidedBy)) + ':</strong> ' + esc(mine.comment) + '</div>' : '')}
              </div>
              ${canAct ? `<div class="card__footer" style="justify-content:space-between">
                <button class="btn btn-ghost" id="save-answers" ${mine.items.length ? '' : 'disabled'}>${UI.icon('save')}Save progress</button>
                <div class="row-wrap">
                  ${!mine.mandatory && settings.allowSkipOptional ? `<button class="btn" id="skip">${UI.icon('skip')}Skip (optional)</button>` : ''}
                  ${mine.requiresApproval === false ? '<span id="reject" class="hidden"></span>' : '<button class="btn btn-danger" id="reject">' + UI.icon('x-circle') + 'Reject</button>'}
                  <button class="btn btn-warning" id="return">${UI.icon('undo')}Return for Correction</button>
                  <button class="btn btn-success" id="approve">${UI.icon('check')}${mine.requiresApproval === false ? 'Complete Checklist' : 'Approve'}</button>
                </div></div>` : ''}
            </div>

            <div class="card"><div class="card__header"><h2>Request Information</h2><span class="muted small">${esc(r.templateName)} <span class="version-pill">v${r.versionNumber}</span></span></div>
              <div class="card__body"><dl class="dl dl--3">
                <div><dt>Request Type</dt><dd>${esc(r.requestType)}</dd></div>
                <div><dt>Requester</dt><dd>${UI.person(r.requesterId)}</dd></div>
                <div><dt>Department</dt><dd>${esc(UI.deptName(r.requesterDepartmentId))}</dd></div>
                <div><dt>Submitted</dt><dd>${esc(UI.fmtDate(r.submittedAt, true))}</dd></div>
                <div><dt>Needed by</dt><dd>${esc(r.neededBy ? UI.fmtDate(r.neededBy) : '—')}</dd></div>
                <div><dt>Current Stage</dt><dd>${current ? 'Stage ' + current.order + ' – ' + esc(UI.deptName(current.departmentId)) : '—'}</dd></div>
                <div style="grid-column:1/-1"><dt>Details</dt><dd class="prewrap" style="font-weight:400">${esc(r.details)}</dd></div>
                <div style="grid-column:1/-1"><dt>Attachments</dt><dd>${DRS.Pages._attachmentsHtml(r.attachments, false)}</dd></div></dl></div></div>

            <div class="card"><div class="card__header"><h2>Other Stages' Checklists</h2><p>Each stage keeps its own answers, even when stages share a checklist template.</p></div>
              <div class="card__body">${stages.filter((s) => s.id !== mine.id).map((s) => `
                <details style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px"${s.status === 'Approved' && s.items.length ? '' : ''}>
                  <summary style="cursor:pointer;display:flex;justify-content:space-between;gap:10px;align-items:center"><span><strong>${esc(stageTitle(s))}</strong> <span class="muted small">${esc(s.checklistName || 'Approval only')}</span></span>${UI.stageBadge(s.status)}</summary>
                  <div class="mt-8">${s.status === 'Waiting' ? '<p class="muted small">Not started yet.</p>' : checklistHtml(s, false)}</div></details>`).join('')}</div></div>
          </div>

          <aside class="stack">
            <div class="card"><div class="card__header"><h2>Approval Progress</h2></div><div class="card__body">
              ${stages.map((s) => `<div class="kv" style="align-items:center"><span style="color:var(--text)"><strong>${String(s.order).padStart(2, '0')}</strong> ${esc(UI.approverNames(s))}<div class="small muted">${esc(UI.deptName(s.departmentId))} · L${s.approvalLevel}</div></span>${s.id === current?.id ? '<span class="badge badge--orange">In Progress</span>' : UI.stageBadge(s.status)}</div>`).join('')}
              <p class="muted small mt-8">Only the current stage approver can take action; later stages remain locked until their turn.</p></div></div>
            <div class="card"><div class="card__header"><h2>Approval History</h2></div><div class="card__body">
              ${decisions.length ? '<div class="feed">' + decisions.map((d) => `<div class="feed__item"><span class="feed__icon tone-${UI.stageTone(d.action)}">${UI.icon({ Approved: 'check', Completed: 'check-circle', Rejected: 'x', Returned: 'undo', Skipped: 'skip' }[d.action])}</span><div>
                <div class="feed__title">${esc(d.action)} · Stage ${d.stageOrder}</div><div class="feed__desc">${esc(d.actorName)}${d.comment ? ': “' + esc(d.comment) + '”' : ''}</div><div class="feed__meta">${esc(UI.fmtDate(d.timestamp, true))}${d.cycle > 1 ? ' · cycle ' + d.cycle : ''}</div></div></div>`).join('') + '</div>' : '<p class="muted small">No decisions yet.</p>'}
            </div></div>
          </aside>
        </div>`;

      if (!canAct) return;
      const root = el.querySelector('#checklist');
      // Only real changes count: empty fields and empty file lists are ignored.
      const meaningful = (a) => JSON.stringify(Object.keys(a || {}).sort().filter((k) => !(a[k] === '' || a[k] === null || a[k] === undefined || (Array.isArray(a[k]) && !a[k].length))).map((k) => [k, a[k]]));
      Router.setGuard(() => (meaningful(readAnswers(root, Object.assign({}, mine, { answers: draftAnswers }))) !== meaningful(mine.answers) ? 'Checklist answers are not saved. Leave this page?' : null));
      root.addEventListener('change', (e) => {
        if (e.target.dataset.kind === 'file') {
          const id = e.target.dataset.item;
          const names = Array.from(e.target.files).map((f) => f.name);
          draftAnswers[id] = Array.from(new Set((draftAnswers[id] || []).concat(names)));
          root.querySelector('[data-files="' + id + '"]').innerHTML = draftAnswers[id].map((f) => '📎 ' + esc(f)).join('<br>');
          const lbl = root.querySelector('label[for="' + e.target.id + '"]'); if (lbl) lbl.classList.remove('btn-warning');
          e.target.value = '';
        }
      });
      const answers = () => readAnswers(root, Object.assign({}, mine, { answers: draftAnswers }));
      const comment = () => el.querySelector('#comment').value.trim();
      const highlightMissing = () => {
        root.querySelectorAll('.cl-item').forEach((n) => n.style.background = '');
        const a = answers();
        mine.items.forEach((it, i) => {
          if (Validation.answers([it], a, { forApprove: true }).length) { const n = root.querySelectorAll('.cl-item')[i]; if (n) n.style.background = 'var(--red-bg)'; }
        });
      };
      const done = (msg, text) => { Router.clearGuard(); UI.toast(msg, 'success', { text }); DRS.App.reload(); };

      el.querySelector('#save-answers').addEventListener('click', (e) => UI.busy(e.currentTarget, () => {
        WE.saveAnswers(r.id, mine.id, answers(), user.id);
        mine.answers = answers();
        Router.clearGuard();
        UI.toast('Checklist progress saved', 'success');
        DRS.App.reload();
      }));
      el.querySelector('#approve').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const a = answers();
        const missing = Validation.answers(mine.items, a, { forApprove: true });
        if (missing.length) { highlightMissing(); UI.toast('Some checklist points still need attention', 'error', { details: missing }); return; }
        const next = stages.find((s) => s.order === mine.order + 1);
        const completing = mine.requiresApproval === false;
        const othersWaiting = mine.approvalRule === 'all' && !completing ? UI.waitingApprovers(mine).filter((id) => id !== user.id) : [];
        const ok = await UI.confirm({ title: (completing ? 'Complete checklist of Stage ' : 'Approve Stage ') + mine.order + '?', message: othersWaiting.length ? 'Your approval will be recorded. The stage completes after ' + othersWaiting.map(UI.userName).join(' and ') + ' also approve' + (othersWaiting.length > 1 ? '' : 's') + '.' : next ? 'Stage ' + next.order + ' (' + UI.deptName(next.departmentId) + ' – ' + next.stageName + ') will be activated and assigned to ' + UI.approverNames(next) + '.' : 'This is the final stage. The request will be fully approved and sent to the concerned departments for execution.', confirmLabel: completing ? 'Complete' : 'Approve' });
        if (!ok) return;
        UI.busy(btn, () => {
          const res = WE.approve(r.id, mine.id, user.id, { comment: comment(), answers: a });
          if (othersWaiting.length) { done('Your approval is recorded', 'Waiting for ' + othersWaiting.map(UI.userName).join(', ') + '.'); return; }
          done('Stage ' + mine.order + (completing ? ' completed' : ' approved'), res.status === RS.APPROVED ? r.id + ' is fully approved.' : 'Stage ' + res.currentStageOrder + ' is now pending.');
        });
      });
      const withComment = async (kind, btn) => {
        const cfg = {
          reject: { title: 'Reject request ' + r.id, message: 'Rejection stops the workflow. Remaining stages will not be executed.', confirmLabel: 'Reject Request', danger: true, label: 'Rejection reason' },
          return: { title: 'Return ' + r.id + ' for correction', message: 'The request goes back to ' + UI.userName(r.requesterId) + '. Resubmission behaviour: ' + (settings.returnBehavior === 'restart' ? 'restart from Stage 1.' : 'resume at this stage.'), confirmLabel: 'Return for Correction', label: 'What needs to be corrected?' },
          skip: { title: 'Skip optional Stage ' + mine.order, message: 'The stage will be marked Skipped and the next stage activated.', confirmLabel: 'Skip Stage', label: 'Reason for skipping' }
        }[kind];
        const text = await UI.prompt(Object.assign({ required: true, value: comment(), requiredMessage: Validation.decisionComment(kind, '')[0] }, cfg));
        if (text === null) return;
        UI.busy(btn, () => {
          const a = answers();
          if (kind === 'reject') { WE.reject(r.id, mine.id, user.id, { comment: text, answers: a }); done(r.id + ' rejected', 'The requester has been notified.'); }
          if (kind === 'return') { WE.returnForCorrection(r.id, mine.id, user.id, { comment: text, answers: a }); done(r.id + ' returned for correction', UI.userName(r.requesterId) + ' can now correct and resubmit.'); }
          if (kind === 'skip') { WE.skip(r.id, mine.id, user.id, { comment: text, answers: a }); done('Stage ' + mine.order + ' skipped', ''); }
        });
      };
      el.querySelector('#reject').addEventListener('click', (e) => withComment('reject', e.currentTarget));
      el.querySelector('#return').addEventListener('click', (e) => withComment('return', e.currentTarget));
      const skip = el.querySelector('#skip');
      if (skip) skip.addEventListener('click', (e) => withComment('skip', e.currentTarget));
    }
  };
})(window);
