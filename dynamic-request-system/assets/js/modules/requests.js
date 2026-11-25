/**
 * requests.js – Employee module: Create New Request (wizard), My Requests,
 * draft editing and resubmission after Return for Correction.
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;
  const { Store, Auth, UI, C, Validation, WorkflowEngine: WE, Router } = DRS;
  DRS.Pages = DRS.Pages || {};
  const esc = UI.esc;
  const RS = C.REQUEST_STATUS;

  /** Resolved stage plan (preview before submission). */
  function planHtml(plan) {
    return '<div class="stack" style="gap:8px">' + plan.map((p) => `
      <div class="row" style="align-items:flex-start;gap:10px">
        <span class="stage-order" style="width:26px;height:26px;font-size:12px;flex-shrink:0">${p.order}</span>
        <div style="min-width:0;flex:1"><div style="font-weight:650">${esc(UI.deptName(p.departmentId))} <span class="level-pill" style="height:20px;font-size:11px">L${p.approvalLevel}</span>${p.mandatory ? '' : ' <span class="tag">Optional</span>'}</div>
          <div class="small muted">${esc(p.checklistName || 'Approval only')} · ${esc(p.approverRole)}${p.estimatedHours !== null && p.estimatedHours !== undefined ? ' · ⏱ ' + esc(DRS.Time.format(p.estimatedHours)) : ''}</div>
          <div class="small">${p.approverId ? UI.icon('users').replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-1px"') + ' ' + esc(UI.approverNames(p)) + ' ' + UI.ruleTag(p) : '<span style="color:var(--red)">No approver resolved</span>'}</div>
          ${p.assignmentNote ? '<div class="small" style="color:#b45309">' + esc(p.assignmentNote) + '</div>' : ''}</div></div>`).join('') + '</div>' + planTotalHtml(plan);
  }
  /** Total estimated time and expected completion if submitted now. */
  function planTotalHtml(plan) {
    const total = plan.reduce((sum, p) => sum + (Number(p.estimatedHours) || 0), 0);
    if (!total) return '';
    const done = DRS.Time.addWorkingHours(DRS.Clock.now(), total);
    return '<div class="alert alert--info mt-16">' + UI.icon('clock') + '<div><strong>Estimated time: ' + esc(DRS.Time.format(total)) + '</strong>' +
      'If every stage finishes on time, the request is completed around ' + esc(UI.fmtDate(done, true)) + '.</div></div>';
  }
  DRS.Pages._planHtml = planHtml;

  function attachmentsHtml(list, removable) {
    if (!list || !list.length) return '<p class="muted small">No attachments.</p>';
    return '<div class="files">' + list.map((a, i) => `<div class="file">${UI.icon('paperclip')}<span>${esc(a.name)}</span><span class="size">${esc(UI.fmtSize(a.size))}</span>${removable ? `<button class="btn btn-ghost btn-sm btn-icon" data-remove-file="${i}" aria-label="Remove ${esc(a.name)}">${UI.icon('x')}</button>` : ''}</div>`).join('') + '</div>';
  }
  DRS.Pages._attachmentsHtml = attachmentsHtml;

  /** Request form fields (used by create, edit draft and resubmit). */
  function formHtml(d) {
    return `<div class="form-grid">
      <div class="field span-2"><label for="r-subject">Request Subject <span class="req">*</span></label><input class="input" id="r-subject" maxlength="150" value="${esc(d.subject)}" placeholder="Short summary, e.g. Purchase 4 electric forklifts"><span class="error-text hidden" data-err="subject"></span></div>
      <div class="field"><label for="r-priority">Priority</label><select class="select" id="r-priority">${UI.options(C.PRIORITIES.map((p) => ({ value: p, label: p })), d.priority || 'Normal')}</select></div>
      <div class="field"><label for="r-needed">Needed by</label><input class="input" type="date" id="r-needed" value="${esc(d.neededBy || '')}"></div>
      <div class="field span-2"><label for="r-details">Request Details <span class="req">*</span></label><textarea class="textarea" id="r-details" rows="6" maxlength="5000" placeholder="Describe what is needed, why, quantities and any specifications.">${esc(d.details)}</textarea><span class="error-text hidden" data-err="details"></span></div>
      <div class="field span-2"><span class="field-label">Attachments <span class="muted">(prototype – file names only, nothing is uploaded)</span></span>
        <label class="dropzone" for="r-files">${UI.icon('upload').replace('<svg', '<svg style="width:20px;height:20px;vertical-align:-4px"')} Click to add supporting files</label>
        <input type="file" id="r-files" multiple class="sr-only"><div id="r-file-list">${attachmentsHtml(d.attachments, true)}</div></div>
    </div>`;
  }
  function bindForm(root, d) {
    const $ = (s) => root.querySelector(s);
    $('#r-subject').addEventListener('input', (e) => { d.subject = e.target.value; });
    $('#r-details').addEventListener('input', (e) => { d.details = e.target.value; });
    $('#r-priority').addEventListener('change', (e) => { d.priority = e.target.value; });
    $('#r-needed').addEventListener('change', (e) => { d.neededBy = e.target.value; });
    $('#r-files').addEventListener('change', (e) => {
      Array.from(e.target.files).forEach((f) => { if (!d.attachments.some((a) => a.name === f.name)) d.attachments.push({ name: f.name, size: f.size, type: f.type }); });
      e.target.value = '';
      $('#r-file-list').innerHTML = attachmentsHtml(d.attachments, true);
    });
    $('#r-file-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove-file]'); if (!b) return;
      d.attachments.splice(Number(b.dataset.removeFile), 1);
      $('#r-file-list').innerHTML = attachmentsHtml(d.attachments, true);
    });
  }
  function showFieldErrors(root, d) {
    const errs = Validation.requestInput(Object.assign({ templateId: d.templateId || 'x' }, d));
    const map = { subject: errs.find((e) => /Subject/.test(e)), details: errs.find((e) => /Details/.test(e)) };
    Object.entries(map).forEach(([k, msg]) => {
      const span = root.querySelector('[data-err="' + k + '"]');
      const input = root.querySelector(k === 'subject' ? '#r-subject' : '#r-details');
      if (!span) return;
      span.textContent = msg || ''; span.classList.toggle('hidden', !msg); input.classList.toggle('is-invalid', !!msg);
    });
    return errs;
  }

  // -------------------------------------------------------- create / draft
  DRS.Pages.createRequest = {
    render(el, params) {
      const user = Auth.currentUser();
      const draftRec = params.id ? Store.get('requests', params.id) : null;
      if (params.id && (!draftRec || draftRec.status !== RS.DRAFT || draftRec.requesterId !== user.id)) {
        el.innerHTML = UI.empty('Draft not available', 'Only your own draft requests can be edited here.', '<a class="btn" href="#/my-requests">My Requests</a>'); return;
      }
      const d = draftRec ? { id: draftRec.id, templateId: draftRec.templateId, subject: draftRec.subject, details: draftRec.details, priority: draftRec.priority, neededBy: draftRec.neededBy, attachments: draftRec.attachments || [] }
        : { id: null, templateId: params.templateId || '', subject: '', details: '', priority: 'Normal', neededBy: '', attachments: [] };
      let step = d.templateId ? 2 : 1;
      const initial = JSON.stringify(d);
      Router.setGuard(() => (JSON.stringify(d) !== initial && (d.subject || d.details) ? 'Your request has not been submitted. Leave this page?' : null));
      UI.setBreadcrumbs([{ label: 'Requests' }, { label: draftRec ? 'My Requests' : 'Create New Request', href: draftRec ? '#/my-requests' : undefined }, { label: draftRec ? 'Edit draft ' + draftRec.id : 'New Request' }]);

      const draw = () => {
        const templates = Store.where('requestTemplates', (t) => t.status === 'Active' && t.currentVersionId).sort((a, b) => a.name.localeCompare(b.name));
        const unavailableList = Store.where('requestTemplates', (t) => !(t.status === 'Active' && t.currentVersionId));
        const unavailable = unavailableList.length;
        const isAdmin = Auth.isAdmin(user);
        const reasonFor = (t) => {
          if (t.status === 'Archived') return 'Archived legacy type – cannot receive new requests.';
          const missing = Validation.template(t, { forActivation: true }).errors;
          if (missing.length) return 'Incomplete: ' + missing[0];
          return 'Status is Inactive – open the template and set it to Active.';
        };
        const tpl = d.templateId ? Store.get('requestTemplates', d.templateId) : null;
        let preview = null; let previewError = null;
        if (tpl) { try { preview = WE.preview(tpl.id, user.id); } catch (e) { previewError = e.message; } }
        const steps = ['Select Template', 'Request Details', 'Review & Submit'];
        el.innerHTML = `
          <div class="page-header"><div><h1>${draftRec ? 'Edit Draft ' + esc(draftRec.id) : 'Create New Request'}</h1><p>Submitting as <strong>${esc(user.name)}</strong> · ${esc(user.jobTitle)}, ${esc(UI.deptName(user.departmentId))}</p></div></div>
          <div class="wizard">${steps.map((s, i) => `<div class="wizard__step${step === i + 1 ? ' active' : step > i + 1 ? ' done' : ''}"><span class="n">${step > i + 1 ? '✓' : i + 1}</span>${s}</div>`).join('')}</div>
          <div id="step"></div>`;
        const host = el.querySelector('#step');

        if (step === 1) {
          host.innerHTML = `<div class="card"><div class="card__header"><div><h2>Available Request Templates</h2><p>Only active templates with a published workflow can be used.${unavailable ? ' ' + unavailable + ' inactive or archived template(s) are hidden.' : ''}</p></div>
            <div class="search">${UI.icon('search')}<input class="input" id="tpl-search" placeholder="Search templates…" style="width:220px" aria-label="Search templates"></div></div>
            <div class="card__body"><div class="tpl-grid" id="tpl-grid"></div></div></div>
            ${isAdmin && unavailable ? `<div class="card mt-16"><div class="card__header"><div><h2>Not available for requests</h2><p>Visible to administrators only. Fix these templates to make them appear above.</p></div></div>
              <div class="card__body card__body--flush table-wrap"><table class="table"><tbody>${unavailableList.map((t) => `<tr><td class="cell-title">${esc(t.name)}</td><td>${UI.templateBadge(t.status)}</td><td class="small" style="color:var(--text-2)">${esc(reasonFor(t))}</td>
                <td><div class="actions">${t.status === 'Archived' ? '' : '<a class="btn btn-sm" href="#/templates/' + t.id + '">' + UI.icon('edit') + 'Fix template</a>'}</div></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
          const grid = host.querySelector('#tpl-grid');
          const drawGrid = (q) => {
            const list = templates.filter((t) => !q || (t.name + t.description + t.requestType).toLowerCase().includes(q.toLowerCase()));
            grid.innerHTML = list.length ? list.map((t) => {
              const v = Store.get('workflowVersions', t.currentVersionId);
              const n = v.stages.filter((s) => s.status !== 'Inactive').length;
              return `<button class="tpl-card${d.templateId === t.id ? ' selected' : ''}" data-id="${t.id}"><span class="tpl-card__type">${esc(t.requestType)}</span><span class="tpl-card__name">${esc(t.name)}</span>
                <span class="tpl-card__desc">${esc(t.description)}</span>
                <span class="tpl-card__foot"><span class="tag">${n} stages</span><span class="tag">Owner: ${esc(UI.deptName(t.ownerDepartmentId))}</span>${t.hierarchyType !== 'none' ? '<span class="tag tag--lock">' + esc(C.HIERARCHIES[t.hierarchyType].label) + '</span>' : ''}</span></button>`;
            }).join('') : UI.empty('No templates available', 'Ask an administrator to activate a request template.', '', 'template');
          };
          drawGrid('');
          host.querySelector('#tpl-search').addEventListener('input', (e) => drawGrid(e.target.value));
          grid.addEventListener('click', (e) => { const c = e.target.closest('[data-id]'); if (!c) return; d.templateId = c.dataset.id; step = 2; draw(); });
          return;
        }

        const side = `<div class="card"><div class="card__header"><div><span class="tpl-card__type">${esc(tpl.requestType)}</span><h2>${esc(tpl.name)}</h2></div>${draftRec ? '' : '<button class="btn btn-sm" id="change-tpl">Change</button>'}</div>
            <div class="card__body"><p class="small">${esc(tpl.description)}</p>
            <div class="kv"><span>Owner Department</span><strong>${esc(UI.deptName(tpl.ownerDepartmentId))}</strong></div>
            <div class="kv"><span>Concerned Departments</span><strong>${tpl.concernedDepartmentIds.map(UI.deptName).map(esc).join(', ')}</strong></div>
            <div class="kv"><span>Workflow version</span><strong><span class="version-pill">v${tpl.versionNumber}</span></strong></div></div></div>
          <div class="card"><div class="card__header"><div><h2>Workflow Preview</h2><p>Resolved for you. Stages run strictly in this order.</p></div></div>
            <div class="card__body">${previewError ? UI.alert('error', previewError) : preview.errors.length ? UI.alert('error', 'This request cannot be routed', preview.errors) : planHtml(preview.plan)}</div></div>`;

        if (step === 2) {
          host.innerHTML = `<div class="grid grid-main-side"><div class="card"><div class="card__header"><h2>Request Information</h2></div><div class="card__body">${formHtml(d)}</div>
            <div class="card__footer"><button class="btn btn-ghost" id="save-draft">${UI.icon('save')}Save as Draft</button><button class="btn btn-primary" id="next">Review ${UI.icon('arrow')}</button></div></div>
            <div class="stack">${side}</div></div>`;
          bindForm(host, d);
          host.querySelector('#next').addEventListener('click', () => {
            const errs = showFieldErrors(host, d);
            if (errs.length) { UI.toast('Please complete the required fields', 'error', { details: errs }); return; }
            step = 3; draw();
          });
        } else {
          const blocked = !!previewError || (preview && preview.errors.length);
          host.innerHTML = `<div class="grid grid-main-side"><div class="card"><div class="card__header"><h2>Review Request</h2>${UI.priorityBadge(d.priority)}</div>
            <div class="card__body"><dl class="dl"><div class="span-2" style="grid-column:1/-1"><dt>Subject</dt><dd>${esc(d.subject)}</dd></div>
              <div><dt>Template</dt><dd>${esc(tpl.name)}</dd></div><div><dt>Needed by</dt><dd>${esc(d.neededBy ? UI.fmtDate(d.neededBy) : 'Not specified')}</dd></div>
              <div><dt>Requester</dt><dd>${esc(user.name)}</dd></div><div><dt>Department</dt><dd>${esc(UI.deptName(user.departmentId))}</dd></div>
              <div style="grid-column:1/-1"><dt>Details</dt><dd class="prewrap" style="font-weight:400">${esc(d.details)}</dd></div>
              <div style="grid-column:1/-1"><dt>Attachments</dt><dd>${attachmentsHtml(d.attachments, false)}</dd></div></dl>
              <div class="mt-16">${UI.alert('info', 'On submission the system generates a Request ID, stores a snapshot of workflow v' + tpl.versionNumber + ', creates ' + (preview ? preview.plan.length : 0) + ' independent stage instances, sets Stage 1 to Pending and the others to Waiting.')}</div></div>
            <div class="card__footer"><button class="btn btn-ghost" id="back">${UI.icon('arrow-left')}Back</button><button class="btn" id="save-draft">${UI.icon('save')}Save as Draft</button>
              <button class="btn btn-primary" id="submit"${blocked ? ' disabled' : ''}>${UI.icon('send')}Submit Request</button></div></div>
            <div class="stack">${side}</div></div>`;
          host.querySelector('#back').addEventListener('click', () => { step = 2; draw(); });
          host.querySelector('#submit').addEventListener('click', (e) => UI.busy(e.currentTarget, () => {
            const r = WE.submit(d, user.id);
            Router.clearGuard();
            UI.toast('Request ' + r.id + ' submitted', 'success', { text: 'Stage 1 is now pending with ' + UI.approverNames(WE.currentStage(r.id)) + '. Use "Approve as…" to approve it in this demo.' });
            Router.go('/tracking/' + r.id);
          }));
        }
        const ct = host.querySelector('#change-tpl');
        if (ct) ct.addEventListener('click', () => { step = 1; draw(); });
        host.querySelector('#save-draft').addEventListener('click', (e) => UI.busy(e.currentTarget, () => {
          const r = WE.saveDraft(d, user.id);
          d.id = r.id;
          Router.clearGuard();
          UI.toast('Draft ' + r.id + ' saved', 'success', { text: 'You can continue later from My Requests.' });
          Router.go('/my-requests');
        }));
      };
      draw();
    }
  };

  // -------------------------------------------------------------- my requests
  DRS.Pages.myRequests = {
    render(el) {
      UI.setBreadcrumbs([{ label: 'Requests' }, { label: 'My Requests' }]);
      const user = Auth.currentUser();
      const groups = {
        All: () => true,
        Drafts: (r) => r.status === RS.DRAFT,
        Active: (r) => [RS.PENDING, RS.IN_PROGRESS].includes(r.status),
        Returned: (r) => r.status === RS.RETURNED,
        Closed: (r) => [RS.APPROVED, RS.COMPLETED, RS.REJECTED].includes(r.status)
      };
      let tab = 'All'; let q = '';
      const mine = () => Store.where('requests', (r) => r.requesterId === user.id).sort((a, b) => ((a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1));
      el.innerHTML = `<div class="page-header"><div><h1>My Requests</h1><p>Requests submitted by ${esc(user.name)}. Drafts can be completed, returned requests corrected and resubmitted.</p></div>
        <div class="page-header__actions"><a class="btn btn-primary" href="#/requests/new">${UI.icon('plus')}Create Request</a></div></div>
        <div id="returned-banner"></div>
        <div class="card"><div class="card__header" style="padding-bottom:0;border-bottom:0"><div class="tabs" id="tabs" style="margin-bottom:0;border-bottom:0;flex:1"></div>
          <div class="search">${UI.icon('search')}<input class="input" id="mr-q" placeholder="Search ID or subject…" style="width:220px" aria-label="Search my requests"></div></div>
          <div class="card__body card__body--flush table-wrap" id="mr-table" style="border-top:1px solid var(--border)"></div></div>`;
      const draw = () => {
        const all = mine();
        const returned = all.filter(groups.Returned);
        el.querySelector('#returned-banner').innerHTML = returned.length ? '<div class="mb-16">' + UI.alert('warn', returned.length + ' request(s) were returned to you for correction', returned.map((r) => r.id + ' – ' + r.returnInfo.byName + ': "' + r.returnInfo.comment + '"')) + '</div>' : '';
        el.querySelector('#tabs').innerHTML = Object.keys(groups).map((k) => `<button class="tab${k === tab ? ' active' : ''}" data-tab="${k}">${k}<span class="count">${all.filter(groups[k]).length}</span></button>`).join('');
        const list = all.filter(groups[tab]).filter((r) => !q || (r.id + ' ' + r.subject).toLowerCase().includes(q.toLowerCase()));
        const host = el.querySelector('#mr-table');
        if (!list.length) { host.innerHTML = UI.empty(tab === 'All' ? 'You have not created any requests' : 'No ' + tab.toLowerCase() + ' requests', '', tab === 'All' ? '<a class="btn btn-primary" href="#/requests/new">Create Request</a>' : '', 'folder'); return; }
        host.innerHTML = `<table class="table"><thead><tr><th>Request</th><th class="hide-sm">Template</th><th class="hide-sm">Submitted</th><th>Current Stage</th><th>Status</th><th></th></tr></thead><tbody>
          ${list.map((r) => {
            const cur = WE.currentStage(r.id);
            const stages = WE.getStages(r.id);
            let where = '—';
            if (cur) where = `<div class="cell-title">Stage ${cur.order}/${r.totalStages} · ${esc(UI.deptName(cur.departmentId))}</div><div class="cell-sub">With ${esc(UI.approverNames(cur))}</div><div class="mt-8">${DRS.App.approveButton(r.id, 'btn-sm')}</div>`;
            else if (r.status === RS.RETURNED) where = `<div class="cell-title" style="color:var(--purple)">With you for correction</div><div class="cell-sub">Returned at Stage ${r.returnInfo.stageOrder}</div>`;
            else if (r.status === RS.APPROVED) where = `<div class="cell-title">Execution</div><div class="cell-sub">${r.executionTasks.filter((t) => t.status === 'Done').length}/${r.executionTasks.length} departments done</div>`;
            else if (stages.length) where = UI.stepsBar(stages);
            const actions = r.status === RS.DRAFT
              ? `<a class="btn btn-sm btn-primary" href="#/requests/edit/${r.id}">Continue</a><button class="btn btn-ghost btn-sm btn-icon" data-del="${r.id}" title="Delete draft">${UI.icon('trash')}</button>`
              : r.status === RS.RETURNED ? `<a class="btn btn-sm btn-warning" href="#/requests/resubmit/${r.id}">${UI.icon('edit')}Correct &amp; Resubmit</a>`
                : `<a class="btn btn-sm" href="#/tracking/${r.id}">${UI.icon('timeline')}Track</a>`;
            return `<tr><td><a class="req-id" href="${r.status === RS.DRAFT ? '#/requests/edit/' + r.id : '#/tracking/' + r.id}">${esc(r.id)}</a><div class="cell-sub" style="max-width:280px">${esc(r.subject)}</div></td>
              <td class="hide-sm">${esc(r.templateName)}${r.versionNumber ? ' <span class="version-pill">v' + r.versionNumber + '</span>' : ''}</td>
              <td class="hide-sm nowrap">${esc(UI.fmtDate(r.submittedAt || r.createdAt))}</td>
              <td style="min-width:160px">${where}</td><td>${UI.statusBadge(r.status)}</td><td><div class="actions">${actions}</div></td></tr>`;
          }).join('')}</tbody></table>`;
      };
      draw();
      el.querySelector('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; draw(); } });
      el.querySelector('#mr-q').addEventListener('input', (e) => { q = e.target.value; draw(); });
      el.querySelector('#mr-table').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-del]'); if (!b) return;
        if (!(await UI.confirm({ title: 'Delete draft?', message: 'Delete draft ' + b.dataset.del + '? This cannot be undone.', confirmLabel: 'Delete draft', danger: true }))) return;
        try { WE.deleteDraft(b.dataset.del, user.id); UI.toast('Draft deleted'); draw(); DRS.App.refreshChrome(); } catch (err) { UI.error(err); }
      });
    }
  };

  // ---------------------------------------------------------------- resubmit
  DRS.Pages.resubmit = {
    render(el, params) {
      const user = Auth.currentUser();
      const r = Store.get('requests', params.id);
      UI.setBreadcrumbs([{ label: 'Requests' }, { label: 'My Requests', href: '#/my-requests' }, { label: 'Correct ' + params.id }]);
      if (!r) { el.innerHTML = UI.empty('Request not found', '', '<a class="btn" href="#/my-requests">My Requests</a>'); return; }
      if (r.requesterId !== user.id || r.status !== RS.RETURNED) {
        el.innerHTML = UI.empty('Nothing to correct', r.status === RS.RETURNED ? 'Only the requester (' + UI.userName(r.requesterId) + ') can correct and resubmit this request.' : r.id + ' is ' + r.status + '.', '<a class="btn" href="#/tracking/' + r.id + '">Track request</a>', 'lock');
        return;
      }
      const d = { subject: r.subject, details: r.details, priority: r.priority, neededBy: r.neededBy, attachments: Store.clone(r.attachments || []), templateId: r.templateId };
      const info = r.returnInfo;
      const behaviorText = info.behavior === 'restart'
        ? 'The workflow will restart from Stage 1. All stages return to Waiting and must be approved again. Previous approvals stay in the history.'
        : 'The workflow resumes at Stage ' + info.stageOrder + ' (' + info.stageName + '). Earlier approvals remain valid.';
      el.innerHTML = `<div class="page-header"><div><h1>Correct &amp; Resubmit ${esc(r.id)}</h1><p>${esc(r.templateName)} · workflow <span class="version-pill">v${r.versionNumber}</span> (the original version is kept)</p></div>
          <div class="page-header__actions"><a class="btn" href="#/tracking/${r.id}">${UI.icon('timeline')}View tracking</a></div></div>
        <div class="mb-16"><div class="alert alert--warn">${UI.icon('undo')}<div><strong>Returned for correction by ${esc(info.byName)} at Stage ${info.stageOrder} – ${esc(info.stageName)}</strong>
          <div class="mt-8" style="font-size:14px">“${esc(info.comment)}”</div><div class="small mt-8">${esc(UI.fmtDate(info.at, true))}</div></div></div></div>
        <div class="grid grid-main-side"><div class="card"><div class="card__header"><h2>Request Information</h2></div><div class="card__body">${formHtml(d)}</div>
          <div class="card__footer"><a class="btn btn-ghost" href="#/my-requests">Cancel</a><button class="btn btn-primary" id="resubmit">${UI.icon('send')}Resubmit Request</button></div></div>
          <div class="stack"><div class="card"><div class="card__header"><h2>Resubmission Behaviour</h2></div><div class="card__body">${UI.alert('info', behaviorText)}
            <p class="muted small mt-8">Configured in System Settings and captured when the request was returned.</p></div></div>
          <div class="card"><div class="card__header"><h2>Current Workflow</h2></div><div class="card__body">${UI.stepsBar(WE.getStages(r.id))}
            <div class="mt-16">${WE.getStages(r.id).map((s) => `<div class="kv"><span>${s.order}. ${esc(UI.deptName(s.departmentId))} – ${esc(s.stageName)}</span>${UI.stageBadge(s.status)}</div>`).join('')}</div></div></div></div></div>`;
      bindForm(el, d);
      const initial = JSON.stringify(d);
      Router.setGuard(() => (JSON.stringify(d) !== initial ? 'Your corrections have not been resubmitted. Leave this page?' : null));
      el.querySelector('#resubmit').addEventListener('click', (e) => {
        const errs = showFieldErrors(el, d);
        if (errs.length) { UI.toast('Please complete the required fields', 'error', { details: errs }); return; }
        UI.busy(e.currentTarget, () => {
          WE.resubmit(r.id, user.id, d);
          Router.clearGuard();
          const cur = WE.currentStage(r.id);
          UI.toast(r.id + ' resubmitted', 'success', { text: 'Stage ' + cur.order + ' is pending with ' + UI.approverNames(cur) + '.' });
          Router.go('/tracking/' + r.id);
        });
      });
    }
  };
})(window);
