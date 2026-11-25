/**
 * templates.js – Request Template list and Template Builder
 * (template information, concerned departments, mandatory hierarchy,
 * dynamic checklist stage builder, validation, versions).
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;
  const { Store, Auth, UI, C, Validation, TemplateService: TSvc, Router } = DRS;
  DRS.Pages = DRS.Pages || {};
  const esc = UI.esc;

  // ------------------------------------------------------------------ shared
  function oneApproverText(a) {
    if (a.approverMode === 'user') return UI.userName(a.approverUserId);
    const role = C.APPROVER_ROLES[a.approverRoleKey];
    return role ? role.label + ' (dynamic)' : '—';
  }
  function stageApproverText(s) {
    const all = [s].concat(s.approvalRule === undefined && !s.additionalApprovers ? [] : s.additionalApprovers || []).map(oneApproverText);
    if (all.length === 1) return all[0] + (s.approvalRule === 'none' ? ' · no approval needed' : '');
    return all.join(s.approvalRule === 'all' ? ' + ' : s.approvalRule === 'none' ? ', ' : ' or ') + ' · ' + ({ any: 'any one', all: 'all must approve', none: 'no approval needed' })[s.approvalRule || 'any'];
  }
  function deptSummary(stages) {
    const counts = {};
    stages.filter((s) => s.status !== 'Inactive').forEach((s) => { const n = UI.deptName(s.departmentId); counts[n] = (counts[n] || 0) + 1; });
    return Object.entries(counts).map(([n, c]) => n + (c > 1 ? ' ×' + c : '')).join(', ');
  }
  /** Estimation of a configured stage = its checklist's estimation (versions carry a snapshot). */
  function stageHours(s, version) {
    if (!s.checklistTemplateId) return null;
    const cl = (version && version.checklists && version.checklists[s.checklistTemplateId]) || Store.get('checklistTemplates', s.checklistTemplateId);
    return DRS.Time.checklistHours(cl);
  }
  DRS.Pages._stageHours = stageHours;
  /** Time Plan: total and per-department working time of the active stages. */
  function timePlanHtml(stages) {
    const active = stages.filter((s) => s.status !== 'Inactive');
    const plan = DRS.Time.plan(active, (s) => stageHours(s));
    const hpd = DRS.Time.settings().workHoursPerDay;
    if (!active.length) return '<p class="muted small">Add stages to see the time plan.</p>';
    const rows = Object.entries(plan.byDept).sort((a, b) => b[1] - a[1]);
    const colors = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0d9488', '#db2777'];
    return `<div style="font-size:26px;font-weight:750;line-height:1.1">${esc(DRS.Time.format(plan.total))}</div>
      <div class="muted small mb-16">${plan.total} working hours in total · 1 working day = ${hpd} h</div>
      ${plan.total ? '<div class="bar mb-16" style="display:flex;height:10px">' + rows.map(([d, h], i) => '<span title="' + esc(UI.deptName(d)) + ': ' + h + ' h" style="width:' + (h / plan.total * 100) + '%;background:' + colors[i % colors.length] + ';border-radius:0"></span>').join('') + '</div>' : ''}
      ${rows.map(([d, h], i) => {
        const n = active.filter((s) => s.departmentId === d && stageHours(s) !== null).length;
        return `<div class="kv" style="align-items:center"><span style="color:var(--text)"><span class="legend__swatch" style="display:inline-block;background:${colors[i % colors.length]};margin-right:6px"></span><strong>${esc(UI.deptName(d))}</strong>
          <span class="small muted">${n} stage${n > 1 ? 's' : ''}</span></span><span class="small"><strong>${esc(DRS.Time.format(h))}</strong> <span class="muted">(${h} h · ${Math.round(h / (plan.total || 1) * 100)}%)</span></span></div>`;
      }).join('')}
      ${plan.missing ? '<p class="small mt-8" style="color:#b45309">' + plan.missing + ' stage(s) have no estimation time (approval-only stages or checklists without time).</p>' : ''}`;
  }
  DRS.Pages._timePlanHtml = timePlanHtml;

  function flowHtml(stages) {
    if (!stages.length) return '<div class="muted small">No stages yet.</div>';
    return '<div class="flow">' + stages.map((s, i) =>
      (i ? '<div class="flow__arrow">' + UI.icon('arrow') + '</div>' : '') +
      '<div class="flow__node' + (s.hierarchyKey ? ' flow__node--locked' : '') + (s.status === 'Inactive' ? ' flow__node--inactive' : '') + '">' +
      '<div class="flow__num">STAGE ' + (i + 1) + ' · L' + esc(s.approvalLevel) + '</div>' +
      '<div class="flow__dept">' + esc(UI.deptName(s.departmentId)) + '</div>' +
      '<div class="flow__meta">' + esc(UI.checklistName(s.checklistTemplateId) || 'Approval only') + '</div>' +
      '<div class="flow__meta">' + esc(s.approverRole || stageApproverText(s)) + '</div>' +
      (stageHours(s) !== null ? '<div class="flow__meta" style="color:var(--primary-600);font-weight:600">⏱ ' + esc(DRS.Time.format(stageHours(s))) + '</div>' : '') + '</div>'
    ).join('') + '</div>';
  }
  DRS.Pages._flowHtml = flowHtml;
  DRS.Pages._stageApproverText = stageApproverText;

  function showVersion(versionId) {
    const v = Store.get('workflowVersions', versionId);
    if (!v) return;
    UI.modal({
      title: v.templateName + ' – Workflow v' + v.versionNumber, size: 'lg',
      body: `<dl class="dl dl--3 mb-16"><div><dt>Published</dt><dd>${esc(UI.fmtDate(v.createdAt, true))}</dd></div><div><dt>By</dt><dd>${esc(v.createdByName)}</dd></div>
        <div><dt>Hierarchy</dt><dd>${esc(C.HIERARCHIES[v.hierarchyType].label)}</dd></div>
        <div><dt>Owner Department</dt><dd>${esc(UI.deptName(v.ownerDepartmentId))}</dd></div>
        <div class="span-2"><dt>Concerned Departments</dt><dd>${v.concernedDepartmentIds.map((d) => esc(UI.deptName(d))).join(', ')}</dd></div></dl>
        ${UI.alert('neutral', 'Change note: ' + v.changeNote)}
        <div class="mt-16">${flowHtml(v.stages)}</div>
        <div class="table-wrap mt-8"><table class="table"><thead><tr><th>#</th><th>Stage</th><th>Department</th><th>Checklist (version)</th><th>Approver</th><th>Level</th><th>Rule</th></tr></thead><tbody>
        ${v.stages.map((s, i) => `<tr${s.status === 'Inactive' ? ' style="opacity:.5"' : ''}><td>${i + 1}</td><td>${esc(s.stageName)}${s.hierarchyKey ? ' <span class="tag tag--lock">Mandatory</span>' : ''}</td><td>${esc(UI.deptName(s.departmentId))}</td>
          <td>${s.checklistTemplateId && v.checklists[s.checklistTemplateId] ? esc(v.checklists[s.checklistTemplateId].name) + ' <span class="version-pill">v' + v.checklists[s.checklistTemplateId].version + '</span>' : '<span class="muted">Approval only</span>'}</td>
          <td>${esc(stageApproverText(s))}<div class="cell-sub">${esc(s.approverRole)}</div></td><td>L${esc(s.approvalLevel)}</td><td>${s.status === 'Inactive' ? 'Inactive' : s.mandatory ? 'Mandatory' : 'Optional'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted small mt-8">Workflow versions are immutable. Requests submitted on this version keep exactly this configuration.</p>`,
      actions: [{ label: 'Close', cls: 'btn-primary' }]
    });
  }
  DRS.Pages._showVersion = showVersion;

  // ------------------------------------------------------------------ list
  DRS.Pages.templates = {
    render(el) {
      UI.setBreadcrumbs([{ label: 'Configuration' }, { label: 'Request Templates' }]);
      const user = Auth.currentUser();
      const isAdmin = Auth.isAdmin(user);
      const state = { q: '', status: 'All', type: '' };

      el.innerHTML = `
        <div class="page-header"><div><h1>Request Templates</h1><p>Configure request types, owner and concerned departments, and the ordered checklist &amp; approval stages each request follows.</p></div>
          <div class="page-header__actions">${isAdmin ? '<a class="btn btn-primary" href="#/templates/new">' + UI.icon('plus') + 'New Template</a>' : ''}</div></div>
        ${isAdmin ? '' : '<div class="mb-16">' + UI.adminOnlyBanner() + '</div>'}
        <div class="card">
          <div class="card__header"><div class="toolbar">
            <div class="search">${UI.icon('search')}<input class="input" id="tpl-q" placeholder="Search templates…" style="width:240px" aria-label="Search templates"></div>
            <div class="segmented" id="tpl-status">${['All', 'Active', 'Inactive', 'Archived'].map((s) => `<button data-v="${s}" class="${s === 'All' ? 'active' : ''}">${s}</button>`).join('')}</div>
            <select class="select" id="tpl-type" style="width:180px" aria-label="Request type">${UI.options(C.REQUEST_TYPES.map((t) => ({ value: t, label: t })), '', 'All request types')}</select>
          </div></div>
          <div class="card__body card__body--flush table-wrap" id="tpl-table"></div>
        </div>`;

      const draw = () => {
        const q = state.q.toLowerCase();
        const list = Store.all('requestTemplates')
          .filter((t) => state.status === 'All' || t.status === state.status)
          .filter((t) => !state.type || t.requestType === state.type)
          .filter((t) => !q || (t.name + ' ' + t.description + ' ' + t.requestType).toLowerCase().includes(q))
          .sort((a, b) => ({ Active: 0, Inactive: 1, Archived: 2 })[a.status] - ({ Active: 0, Inactive: 1, Archived: 2 })[b.status] || a.name.localeCompare(b.name));
        const host = el.querySelector('#tpl-table');
        if (!list.length) { host.innerHTML = UI.empty('No templates found', 'Adjust the filters or create a new template.', isAdmin ? '<a class="btn btn-primary" href="#/templates/new">New Template</a>' : '', 'template'); return; }
        host.innerHTML = `<table class="table"><thead><tr><th>Template</th><th class="hide-sm">Owner</th><th class="hide-sm">Concerned Departments</th><th>Stages</th><th class="hide-sm">Version</th><th class="hide-sm">Requests</th><th>Status</th><th></th></tr></thead><tbody>
          ${list.map((t) => {
            const active = t.stages.filter((s) => s.status !== 'Inactive');
            const usage = TSvc.usage(t.id);
            return `<tr>
              <td style="max-width:320px"><a class="cell-title" href="#/templates/${t.id}">${esc(t.name)}</a><div class="cell-sub">${esc(t.requestType)}${t.hierarchyType !== 'none' ? ' · <span class="tag tag--lock">' + UI.icon('lock') + esc(C.HIERARCHIES[t.hierarchyType].label) + '</span>' : ''}</div></td>
              <td class="hide-sm">${esc(UI.deptName(t.ownerDepartmentId))}</td>
              <td class="hide-sm"><div class="chips">${t.concernedDepartmentIds.map((d) => '<span class="tag">' + esc(UI.deptName(d)) + '</span>').join('')}</div></td>
              <td><strong>${active.length}</strong> <span class="cell-sub">${esc(deptSummary(t.stages))}</span></td>
              <td class="hide-sm">${t.versionNumber ? '<span class="version-pill">v' + t.versionNumber + '</span>' : '<span class="muted">—</span>'}${t.hasUnpublishedChanges ? ' <span class="tag tag--warn" title="Saved changes are incomplete and not yet published">Draft changes</span>' : ''}</td>
              <td class="hide-sm">${usage}</td>
              <td>${UI.templateBadge(t.status)}</td>
              <td><div class="actions">
                <a class="btn btn-ghost btn-sm btn-icon" href="#/templates/${t.id}" title="${isAdmin && t.status !== 'Archived' ? 'Edit' : 'View'}">${UI.icon(isAdmin && t.status !== 'Archived' ? 'edit' : 'eye')}</a>
                ${isAdmin ? `<button class="btn btn-ghost btn-sm btn-icon" data-act="duplicate" data-id="${t.id}" title="Duplicate">${UI.icon('copy')}</button>
                ${t.status !== 'Archived' ? `<button class="btn btn-ghost btn-sm btn-icon" data-act="toggle" data-id="${t.id}" title="${t.status === 'Active' ? 'Deactivate' : 'Activate'}">${UI.icon('power')}</button>
                <button class="btn btn-ghost btn-sm btn-icon" data-act="archive" data-id="${t.id}" title="Archive as legacy">${UI.icon('archive')}</button>` : ''}
                <button class="btn btn-ghost btn-sm btn-icon" data-act="delete" data-id="${t.id}" title="Delete">${UI.icon('trash')}</button>` : ''}
              </div></td></tr>`;
          }).join('')}</tbody></table>`;
      };
      draw();

      el.querySelector('#tpl-q').addEventListener('input', (e) => { state.q = e.target.value; draw(); });
      el.querySelector('#tpl-type').addEventListener('change', (e) => { state.type = e.target.value; draw(); });
      el.querySelector('#tpl-status').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        state.status = b.dataset.v;
        el.querySelectorAll('#tpl-status button').forEach((x) => x.classList.toggle('active', x === b));
        draw();
      });
      el.querySelector('#tpl-table').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const t = Store.get('requestTemplates', b.dataset.id);
        try {
          if (b.dataset.act === 'duplicate') {
            const res = TSvc.duplicate(t.id, user.id);
            UI.toast('Template duplicated', 'success', { text: '"' + res.template.name + '" created as Inactive.' });
            draw();
          } else if (b.dataset.act === 'toggle') {
            const next = t.status === 'Active' ? 'Inactive' : 'Active';
            if (next === 'Inactive' && !(await UI.confirm({ title: 'Deactivate template?', message: '"' + t.name + '" will no longer be available for new requests. Requests already submitted continue unchanged.', confirmLabel: 'Deactivate' }))) return;
            const res = TSvc.setStatus(t.id, next, user.id);
            UI.toast('Template ' + (next === 'Active' ? 'activated' : 'deactivated'), 'success', res.versionCreated ? { text: 'Workflow v' + res.version.versionNumber + ' published.' } : {});
            draw(); DRS.App.refreshChrome();
          } else if (b.dataset.act === 'archive') {
            if (!(await UI.confirm({ title: 'Archive as legacy request type?', message: '"' + t.name + '" will be archived. Archived legacy types cannot receive new requests and cannot be re-activated. Historical requests stay unchanged.', confirmLabel: 'Archive', danger: true }))) return;
            TSvc.archive(t.id, user.id); UI.toast('Template archived'); draw();
          } else if (b.dataset.act === 'delete') {
            if (!(await UI.confirm({ title: 'Delete template?', message: 'Delete "' + t.name + '" and all its workflow versions? This cannot be undone.', note: 'Templates that already have requests cannot be deleted.', confirmLabel: 'Delete', danger: true }))) return;
            TSvc.remove(t.id, user.id); UI.toast('Template deleted'); draw();
          }
        } catch (err) { UI.error(err); }
      });
    }
  };

  // ------------------------------------------------------------------ editor
  DRS.Pages.templateEditor = {
    render(el, params) {
      const user = Auth.currentUser();
      const existing = params.id ? Store.get('requestTemplates', params.id) : null;
      if (params.id && !existing) { el.innerHTML = UI.empty('Template not found', 'It may have been deleted.', '<a class="btn" href="#/templates">Back to templates</a>'); return; }
      const readOnly = !Auth.isAdmin(user) || (existing && existing.status === 'Archived');
      const draft = existing ? Store.clone(existing) : TSvc.blankTemplate();
      const initial = JSON.stringify(draft);
      let expanded = null;

      UI.setBreadcrumbs([{ label: 'Configuration' }, { label: 'Request Templates', href: '#/templates' }, { label: existing ? existing.name : 'New Template' }]);
      if (!readOnly) Router.setGuard(() => (JSON.stringify(draft) !== initial ? 'You have unsaved template changes. Leave without saving?' : null));

      const depts = Store.all('departments');
      const activeDepts = depts.filter((d) => d.active);
      const dis = readOnly ? ' disabled' : '';

      el.innerHTML = `
        <div class="page-header"><div><h1>${existing ? esc(existing.name) : 'Create Request Template'}</h1>
          <p>${existing ? 'Template ' + UI.templateBadge(existing.status) + (existing.versionNumber ? ' · current workflow <span class="version-pill">v' + existing.versionNumber + '</span>' : '') + ' · ' + TSvc.usage(existing.id) + ' request(s) submitted' : 'Define the template, its unique concerned departments and its ordered checklist &amp; approval stages.'}</p></div>
          <div class="page-header__actions"><a class="btn" href="#/templates">${UI.icon('arrow-left')}Back</a>
          ${existing && existing.status === 'Active' && existing.currentVersionId ? '<a class="btn" href="#/requests/new/' + existing.id + '">' + UI.icon('file-plus') + 'New request from this template</a>' : ''}
          ${readOnly ? '' : '<button class="btn btn-primary" id="save-top">' + UI.icon('save') + 'Save Template</button>'}</div></div>
        ${readOnly ? '<div class="mb-16">' + (existing && existing.status === 'Archived' ? UI.alert('neutral', 'This is an archived legacy request type. It is read-only and cannot receive new requests.') : UI.adminOnlyBanner()) + '</div>' : ''}
        <div class="grid grid-main-side">
          <div class="stack">
            <section class="card">
              <div class="card__header"><h2 class="section-title"><span class="section-num">1</span>Template Information</h2></div>
              <div class="card__body"><div class="form-grid">
                <div class="field"><label for="f-name">Template Name <span class="req">*</span></label><input class="input" id="f-name" maxlength="120" value="${esc(draft.name)}"${dis}></div>
                <div class="field"><label for="f-type">Request Type <span class="req">*</span></label><input class="input" id="f-type" list="types" value="${esc(draft.requestType)}" placeholder="e.g. Procurement"${dis}>
                  <datalist id="types">${C.REQUEST_TYPES.map((t) => '<option value="' + esc(t) + '">').join('')}</datalist></div>
                <div class="field"><label for="f-owner">Owner Department <span class="req">*</span></label>
                  <select class="select" id="f-owner"${dis}>${UI.options(activeDepts.map((d) => ({ value: d.id, label: d.name })), draft.ownerDepartmentId, 'Select one department…')}</select>
                  <span class="hint">Exactly one department owns the template.</span></div>
                <div class="field"><span class="field-label">Template Status</span>
                  <div class="segmented" id="f-status">${['Active', 'Inactive'].map((s) => `<button type="button" data-v="${s}" class="${draft.status === s ? 'active' : ''}"${dis}>${s}</button>`).join('')}</div>
                  <span class="hint">Active templates must pass full validation.</span></div>
                <div class="field span-2"><label for="f-desc">Description</label><textarea class="textarea" id="f-desc" rows="3" maxlength="1000" placeholder="Explain when employees should use this template."${dis}>${esc(draft.description)}</textarea></div>
              </div></div>
            </section>

            <section class="card">
              <div class="card__header"><div><h2 class="section-title"><span class="section-num">2</span>Concerned Departments</h2>
                <p>Unique list of departments involved in executing this request. Managed independently from the stages below.</p></div>
                ${readOnly ? '' : '<button class="btn btn-sm" id="sync-concerned" title="Adds departments that execute a checklist in an active stage">' + UI.icon('refresh') + 'Add checklist departments</button>'}</div>
              <div class="card__body">
                <div class="multiselect" id="ms"></div>
                <p class="hint muted small mt-8">Each department can be selected only once. Departments that only approve are not added automatically.</p>
              </div>
            </section>

            <section class="card">
              <div class="card__header"><div><h2 class="section-title"><span class="section-num">3</span>Mandatory Approval Hierarchy</h2>
                <p>Existing Procurement PRD hierarchies. Their stages are locked and cannot be removed or reordered.</p></div></div>
              <div class="card__body"><div class="radio-cards radio-cards--3" id="hier">
                ${Object.entries(C.HIERARCHIES).map(([k, h]) => `<label class="radio-card"><input type="radio" name="hier" value="${k}"${draft.hierarchyType === k ? ' checked' : ''}${dis}><div><strong>${esc(h.label)}</strong><span>${esc(h.description || 'Fully configurable stages only.')}</span></div></label>`).join('')}
              </div></div>
            </section>

            <section class="card">
              <div class="card__header"><div><h2 class="section-title"><span class="section-num">4</span>Checklist &amp; Approval Stages</h2>
                <p id="stage-summary"></p></div>
                <div class="row">${readOnly ? '' : '<button class="btn btn-sm btn-ghost" id="renumber" title="Set each approval level equal to its stage order">Renumber levels</button><button class="btn btn-primary btn-sm" id="add-stage">' + UI.icon('plus') + 'Add Stage</button>'}</div></div>
              <div class="card__body">
                <div id="flow"></div>
                <div class="divider"></div>
                <div class="stage-list" id="stages"></div>
                <p class="muted small mt-8">The same department may appear in several stages. Each stage is an independent record with its own checklist answers, approver, level and history. ${readOnly ? '' : 'Drag rows by the handle or use the arrows to reorder.'}</p>
              </div>
            </section>
          </div>

          <aside class="stack">
            <div class="card"><div class="card__header"><h2>Configuration Check</h2></div><div class="card__body" id="validation"></div>
              ${readOnly ? '' : '<div class="card__footer"><a class="btn btn-ghost" href="#/templates">Cancel</a><button class="btn btn-primary" id="save">' + UI.icon('save') + 'Save Template</button></div>'}</div>
            <div class="card"><div class="card__header"><div><h2 class="row" style="gap:6px">${UI.icon('clock').replace('<svg', '<svg style="width:17px;height:17px;color:var(--primary)"')}Time Plan</h2><p>Estimation time per department, from the linked checklists.</p></div></div><div class="card__body" id="timeplan"></div></div>
            <div class="card"><div class="card__header"><h2>Workflow Versions</h2></div><div class="card__body" id="versions"></div></div>
          </aside>
        </div>`;

      // ---- concerned departments multi-select ----
      // The input element is created once and never re-rendered, so focus and
      // typing are never interrupted; only the chips and the menu are redrawn.
      const ms = el.querySelector('#ms');
      let msQuery = ''; let msOpen = false; let msFocus = 0;
      ms.innerHTML = '<div class="multiselect__box"><span class="chips" id="ms-chips"></span>' +
        (readOnly ? '' : '<input id="ms-input" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="ms-menu" aria-label="Add concerned department">') +
        '</div><div class="multiselect__menu hidden" id="ms-menu" role="listbox"></div>';
      const msInput = ms.querySelector('#ms-input');
      const msChips = ms.querySelector('#ms-chips');
      const msMenu = ms.querySelector('#ms-menu');
      const msOptions = () => depts.filter((d) => d.name.toLowerCase().includes(msQuery.toLowerCase()));
      function drawChips() {
        const selected = draft.concernedDepartmentIds;
        msChips.innerHTML = selected.map((id) => `<span class="chip">${esc(UI.deptName(id))}${readOnly ? '' : `<button type="button" data-remove="${id}" aria-label="Remove ${esc(UI.deptName(id))}">${UI.icon('x')}</button>`}</span>`).join('') +
          (readOnly && !selected.length ? '<span class="muted">None</span>' : '');
        if (msInput) msInput.placeholder = selected.length ? 'Add department…' : 'Search and select departments…';
      }
      function drawMenu() {
        if (!msInput) return;
        msMenu.classList.toggle('hidden', !msOpen);
        msInput.setAttribute('aria-expanded', String(msOpen));
        if (!msOpen) return;
        const opts = msOptions();
        msFocus = Math.max(0, Math.min(msFocus, opts.length - 1));
        msMenu.innerHTML = opts.length ? opts.map((d, i) => {
          const taken = draft.concernedDepartmentIds.includes(d.id);
          const off = taken || !d.active;
          return `<div class="multiselect__option${off ? ' disabled' : ''}${i === msFocus ? ' focused' : ''}" data-add="${off ? '' : d.id}" role="option" aria-disabled="${off}">${esc(d.name)} <span class="muted small">${taken ? 'Already selected' : !d.active ? 'Inactive' : esc(d.code)}</span></div>`;
        }).join('') : '<div class="multiselect__empty">No departments match.</div>';
      }
      const drawMs = () => { drawChips(); drawMenu(); };
      function addConcerned(id) {
        if (!id) return;
        if (draft.concernedDepartmentIds.includes(id)) { UI.toast(UI.deptName(id) + ' is already a Concerned Department', 'warning'); return; }
        draft.concernedDepartmentIds.push(id);
        msQuery = ''; msInput.value = ''; msFocus = 0;
        drawMs(); refresh();
      }
      if (msInput) {
        const open = () => { if (!msOpen) { msOpen = true; drawMenu(); } };
        msInput.addEventListener('focus', open);
        msInput.addEventListener('click', open);
        msInput.addEventListener('input', () => { msQuery = msInput.value; msOpen = true; msFocus = 0; drawMenu(); });
        msInput.addEventListener('keydown', (e) => {
          const opts = msOptions();
          if (e.key === 'ArrowDown') { e.preventDefault(); msOpen = true; msFocus = Math.min(msFocus + 1, opts.length - 1); drawMenu(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); msFocus = Math.max(msFocus - 1, 0); drawMenu(); }
          else if (e.key === 'Enter') { e.preventDefault(); const d = opts[msFocus]; if (d && d.active) addConcerned(d.id); }
          else if (e.key === 'Escape') { msOpen = false; drawMenu(); }
          else if (e.key === 'Backspace' && !msInput.value && draft.concernedDepartmentIds.length) { draft.concernedDepartmentIds.pop(); drawMs(); refresh(); }
        });
        msInput.addEventListener('blur', () => { msOpen = false; drawMenu(); });
        // mousedown + preventDefault keeps focus in the input while choosing
        msMenu.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const opt = e.target.closest('[data-add]');
          if (opt && opt.dataset.add) addConcerned(opt.dataset.add);
        });
        ms.querySelector('.multiselect__box').addEventListener('mousedown', (e) => {
          const rm = e.target.closest('[data-remove]');
          if (rm) {
            e.preventDefault();
            draft.concernedDepartmentIds = draft.concernedDepartmentIds.filter((x) => x !== rm.dataset.remove);
            drawMs(); refresh();
            return;
          }
          if (e.target !== msInput) { e.preventDefault(); msInput.focus(); open(); }
        });
      }
      drawMs();

      // ---- stage list ----
      function hierarchyOrderOk(stages) {
        const h = C.HIERARCHIES[draft.hierarchyType];
        if (!h || !h.stages.length) return true;
        return stages.filter((s) => s.hierarchyKey).map((s) => s.hierarchyKey).join('>') === h.stages.map((x) => x.hierarchyKey).join('>');
      }
      function move(from, to) {
        if (to < 0 || to >= draft.stages.length || from === to) return;
        const next = draft.stages.slice();
        const [it] = next.splice(from, 1); next.splice(to, 0, it);
        if (!hierarchyOrderOk(next)) { UI.toast('Mandatory approval stages must keep their order', 'error', { text: C.HIERARCHIES[draft.hierarchyType].description }); return; }
        draft.stages = next; drawStages(); refresh();
      }
      function drawStages() {
        const host = el.querySelector('#stages');
        el.querySelector('#flow').innerHTML = flowHtml(draft.stages);
        const active = draft.stages.filter((s) => s.status !== 'Inactive');
        const unique = new Set(active.map((s) => s.departmentId));
        el.querySelector('#stage-summary').textContent = active.length + ' active stage(s) · ' + unique.size + ' unique department(s)' + (active.length ? ' · ' + deptSummary(draft.stages) : '');
        if (!draft.stages.length) {
          host.innerHTML = UI.empty('No stages configured', 'Add at least one checklist or approval stage. The same department can be added to several stages.', readOnly ? '' : '<button class="btn btn-primary" data-act="add">' + UI.icon('plus') + 'Add first stage</button>', 'layers');
          return;
        }
        host.innerHTML = `<div class="stage-row stage-row--head"><span></span><span>Order</span><span>Stage / Department</span><span class="col-checklist">Checklist</span><span>Approver / Role</span><span>Level</span><span></span></div>` +
          draft.stages.map((s, i) => `
          <div class="stage-row${s.hierarchyKey ? ' stage-row--locked' : ''}${s.status === 'Inactive' ? ' stage-row--inactive' : ''}" data-idx="${i}" ${readOnly ? '' : 'draggable="true"'}>
            <span class="stage-row__handle${readOnly ? ' disabled' : ''}" title="Drag to reorder">${UI.icon('grip')}</span>
            <span class="stage-order">${i + 1}</span>
            <div class="stage-row__cell col-name" title="${esc(s.stageName)}"><div class="t">${esc(s.stageName || 'Untitled stage')}</div>
              <div class="s">${esc(UI.deptName(s.departmentId))}${s.hierarchyKey ? ' · <span class="tag tag--lock">' + UI.icon('lock') + 'Mandatory hierarchy</span>' : ''}${!s.mandatory ? ' · <span class="tag">Optional</span>' : ''}${s.status === 'Inactive' ? ' · <span class="tag">Inactive</span>' : ''}</div></div>
            <div class="stage-row__cell col-checklist" title="${esc(UI.checklistName(s.checklistTemplateId) || 'Approval only')}"><div class="t" style="font-weight:500"><span class="stage-row__lbl">Checklist:</span>${esc(UI.checklistName(s.checklistTemplateId) || 'Approval only')}</div>${stageHours(s) !== null ? '<div class="s">⏱ ' + esc(DRS.Time.format(stageHours(s))) + '</div>' : ''}</div>
            <div class="stage-row__cell" title="${esc(stageApproverText(s))} – ${esc(s.approverRole)}"><div class="t" style="font-weight:500"><span class="stage-row__lbl">Approver:</span>${esc(stageApproverText(s))}</div><div class="s">${esc(s.approverRole || '—')}</div></div>
            <div class="col-level"><span class="level-pill">L${esc(s.approvalLevel)}</span></div>
            <div class="stage-row__actions">${readOnly ? `<button class="btn btn-ghost btn-sm btn-icon" data-act="edit" title="View">${UI.icon('eye')}</button>` : `
              <button class="btn btn-ghost btn-sm btn-icon" data-act="up" title="Move up"${i === 0 ? ' disabled' : ''}>${UI.icon('up')}</button>
              <button class="btn btn-ghost btn-sm btn-icon" data-act="down" title="Move down"${i === draft.stages.length - 1 ? ' disabled' : ''}>${UI.icon('down')}</button>
              <button class="btn btn-ghost btn-sm btn-icon" data-act="edit" title="Edit">${UI.icon('edit')}</button>
              <button class="btn btn-ghost btn-sm btn-icon" data-act="dup" title="${s.hierarchyKey ? 'Mandatory stages cannot be duplicated' : 'Duplicate'}"${s.hierarchyKey ? ' disabled' : ''}>${UI.icon('copy')}</button>
              <button class="btn btn-ghost btn-sm btn-icon" data-act="del" title="${s.hierarchyKey ? 'Mandatory stages cannot be deleted' : 'Delete'}"${s.hierarchyKey ? ' disabled' : ''}>${UI.icon('trash')}</button>`}
            </div>
          </div>`).join('');
      }

      const stagesHost = el.querySelector('#stages');
      stagesHost.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
        if (b.dataset.act === 'add') return openStageModal(null);
        const idx = Number(b.closest('[data-idx]').dataset.idx);
        const s = draft.stages[idx];
        if (b.dataset.act === 'up') move(idx, idx - 1);
        else if (b.dataset.act === 'down') move(idx, idx + 1);
        else if (b.dataset.act === 'edit') openStageModal(idx);
        else if (b.dataset.act === 'dup') {
          const copy = Object.assign({}, Store.clone(s), { id: null, stageName: s.stageName + ' (copy)', hierarchyKey: null, locked: false });
          draft.stages.splice(idx + 1, 0, copy); drawStages(); refresh();
          UI.toast('Stage duplicated', 'success', { text: 'Edit the copy to change its checklist or approver.' });
        } else if (b.dataset.act === 'del') {
          if (!(await UI.confirm({ title: 'Delete stage?', message: 'Remove Stage ' + (idx + 1) + ' "' + s.stageName + '" from this template?', note: 'Requests already submitted keep their own copy of the workflow.', confirmLabel: 'Delete stage', danger: true }))) return;
          draft.stages.splice(idx, 1); drawStages(); refresh();
        }
      });
      // drag & drop reorder
      let dragFrom = null;
      stagesHost.addEventListener('dragstart', (e) => {
        const row = e.target.closest('[data-idx]'); if (!row) return;
        dragFrom = Number(row.dataset.idx); row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom));
      });
      stagesHost.addEventListener('dragend', () => { dragFrom = null; stagesHost.querySelectorAll('.stage-row').forEach((r) => r.classList.remove('dragging', 'drag-over')); });
      stagesHost.addEventListener('dragover', (e) => {
        const row = e.target.closest('[data-idx]'); if (!row || dragFrom === null) return;
        e.preventDefault();
        stagesHost.querySelectorAll('.drag-over').forEach((r) => r !== row && r.classList.remove('drag-over'));
        row.classList.add('drag-over');
      });
      stagesHost.addEventListener('drop', (e) => {
        const row = e.target.closest('[data-idx]'); if (!row || dragFrom === null) return;
        e.preventDefault(); move(dragFrom, Number(row.dataset.idx));
      });

      // ---- stage modal ----
      function openStageModal(idx) {
        const isNew = idx === null;
        const s = isNew ? {
          id: null, stageName: '', departmentId: '', checklistTemplateId: null,
          approvalLevel: draft.stages.reduce((m, x) => Math.max(m, Number(x.approvalLevel) || 0), 0) + 1,
          approverMode: 'user', approverUserId: '', approverRoleKey: '', approverRole: '', additionalApprovers: [], approvalRule: 'any', mandatory: true, status: 'Active', hierarchyKey: null
        } : Store.clone(draft.stages[idx]);
        const locked = !!s.hierarchyKey;
        const ro = readOnly ? ' disabled' : '';
        const lockDis = locked || readOnly ? ' disabled' : '';
        const checklists = Store.all('checklistTemplates').filter((c) => c.active || c.id === s.checklistTemplateId);
        const approvers = Store.where('users', (u) => u.active && u.roles.includes('approver'));
        const extra = Store.clone(s.additionalApprovers || []);

        const userOptions = (deptId, showAll) => {
          const list = approvers.filter((u) => showAll || !deptId || deptId === C.REQUESTER_DEPT || u.departmentId === deptId);
          return UI.options(list.map((u) => ({ value: u.id, label: u.name + ' – ' + u.jobTitle + (showAll || !deptId ? ' (' + UI.deptName(u.departmentId) + ')' : '') })), s.approverUserId, 'Select approver…');
        };
        const sameDeptCount = (deptId) => draft.stages.filter((x, i) => i !== idx && x.departmentId === deptId).length;

        UI.modal({
          title: readOnly ? 'Stage details' : isNew ? 'Add Checklist Stage' : 'Edit Stage ' + (idx + 1), size: 'lg',
          body: `${locked ? UI.alert('info', 'Mandatory hierarchy stage. Department, approver role, status and the mandatory flag are fixed by the existing Procurement PRD. You may attach a checklist and adjust the name and level.') + '<div class="mt-16"></div>' : ''}
            <div class="form-grid">
              <div class="field"><label for="s-name">Stage Name <span class="req">*</span></label><input class="input" id="s-name" maxlength="120" value="${esc(s.stageName)}" placeholder="e.g. Specification Review"${ro}></div>
              <div class="field"><label for="s-dept">Department <span class="req">*</span></label>
                <select class="select" id="s-dept"${lockDis}>${UI.options([{ value: C.REQUESTER_DEPT, label: "Requester's Department (resolved at submission)" }].concat(Store.all('departments').filter((d) => d.active || d.id === s.departmentId).map((d) => ({ value: d.id, label: d.name }))), s.departmentId, 'Select department…')}</select>
                <span class="hint" id="s-dept-hint"></span></div>
              <div class="field"><label for="s-checklist">Checklist Template</label>
                <div class="row"><select class="select" id="s-checklist"${ro}>${UI.options(checklists.map((c) => ({ value: c.id, label: c.name + ' (' + c.items.length + ' items)' })), s.checklistTemplateId || '', 'None – approval only')}</select>
                ${readOnly ? '' : '<button type="button" class="btn btn-sm" id="s-new-checklist" title="Create a new checklist template">' + UI.icon('plus') + 'New</button>'}</div>
                <span class="hint" id="s-cl-hint">Shows the checklists of the selected department. The same checklist can be used in several stages; answers are stored per stage.</span></div>
              <div class="field"><label for="s-level">Approval Level <span class="req">*</span></label><input class="input" id="s-level" type="number" min="1" step="1" value="${esc(s.approvalLevel)}"${ro}></div>
              <div class="field span-2"><span class="field-label">Approver Assignment <span class="req">*</span></span>
                <div class="radio-cards">
                  <label class="radio-card"><input type="radio" name="s-mode" value="user"${s.approverMode === 'user' ? ' checked' : ''}${lockDis}><div><strong>Specific user</strong><span>A named approver for every request.</span></div></label>
                  <label class="radio-card"><input type="radio" name="s-mode" value="role"${s.approverMode === 'role' ? ' checked' : ''}${lockDis}><div><strong>Dynamic role</strong><span>Resolved from the org structure at submission (e.g. requester's line manager).</span></div></label>
                </div></div>
              <div class="field" id="s-user-field"><label for="s-user">Assigned Approver <span class="req">*</span></label>
                <select class="select" id="s-user"${lockDis}></select>
                <label class="check small mt-8"><input type="checkbox" id="s-allusers"${lockDis}> Show approvers from all departments</label></div>
              <div class="field" id="s-role-field"><label for="s-rolekey">Approver Role (dynamic) <span class="req">*</span></label>
                <select class="select" id="s-rolekey"${lockDis}>${UI.options(Object.entries(C.APPROVER_ROLES).map(([k, r]) => ({ value: k, label: r.label })), s.approverRoleKey, 'Select role…')}</select></div>
              <div class="field"><label for="s-role">Approver Role title <span class="req">*</span></label><input class="input" id="s-role" maxlength="80" value="${esc(s.approverRole)}" placeholder="e.g. Operations Manager"${ro}>
                <span class="hint">Shown on tracking timelines.</span></div>
              <div class="field span-2" style="border-top:1px dashed var(--border);padding-top:14px">
                <div class="row between"><span class="field-label">Additional approvers <span class="muted" style="font-weight:400">(optional)</span></span>
                  ${locked || readOnly ? '' : '<button type="button" class="btn btn-sm" id="s-add-approver">' + UI.icon('plus') + 'Add approver</button>'}</div>
                <div class="stack" id="s-extra" style="gap:6px"></div>
                <span class="hint">${locked ? 'Mandatory hierarchy stages keep a single approver.' : 'Example: the manager and the assistant manager on the same checklist.'}</span></div>
              <div class="field span-2"><span class="field-label">Approval Rule</span>
                <div class="radio-cards radio-cards--3" id="s-rule">
                  ${[['any', 'Any one approves', 'The first approval from any of the approvers completes the stage.'],
                     ['all', 'All must approve', 'The stage completes only when every approver has approved.'],
                     ['none', 'No approval needed', 'The approvers only complete the checklist. No approval is required.']].map(([v, t, d]) =>
                    `<label class="radio-card"><input type="radio" name="s-rule" value="${v}"${(s.approvalRule || 'any') === v ? ' checked' : ''}${lockDis}><div><strong>${t}</strong><span>${d}</span></div></label>`).join('')}
                </div><span class="hint" id="s-rule-hint"></span></div>
              <div class="field"><span class="field-label">Stage Rule</span>
                <div class="segmented" id="s-mandatory"><button type="button" data-v="1" class="${s.mandatory ? 'active' : ''}"${lockDis}>Mandatory</button><button type="button" data-v="0" class="${s.mandatory ? '' : 'active'}"${lockDis}>Optional</button></div>
                <span class="hint">Optional stages can be skipped only if enabled in System Settings.</span></div>
              <div class="field"><span class="field-label">Stage Status</span>
                <div class="segmented" id="s-status"><button type="button" data-v="Active" class="${s.status !== 'Inactive' ? 'active' : ''}"${lockDis}>Active</button><button type="button" data-v="Inactive" class="${s.status === 'Inactive' ? 'active' : ''}"${lockDis}>Inactive</button></div>
                <span class="hint">Inactive stages are excluded from new workflow versions.</span></div>
            </div>
            <div id="s-errors" class="mt-16"></div>`,
          actions: readOnly ? [{ label: 'Close', cls: 'btn-primary' }] : [
            { label: 'Cancel', cls: 'btn-ghost' },
            { label: isNew ? 'Add Stage' : 'Update Stage', cls: 'btn-primary', onClick: (close, m) => {
              collect(m);
              const errs = Validation.stage(s, isNew ? draft.stages.length : idx, { forActivation: false });
              if (errs.length) { m.querySelector('#s-errors').innerHTML = UI.alert('error', 'Please fix the stage:', errs.map((x) => x.replace(/^Stage \d+( \([^)]*\))?: /, ''))); return false; }
              const others = s.departmentId === C.REQUESTER_DEPT ? 0 : sameDeptCount(s.departmentId);
              if (isNew) draft.stages.push(Object.assign(s, { id: null }));
              else draft.stages[idx] = s;
              drawStages(); refresh();
              UI.toast(isNew ? 'Stage added' : 'Stage updated', 'success', others ? { text: UI.deptName(s.departmentId) + ' now appears in ' + (others + 1) + ' stages – each runs independently.' } : {});
              return true;
            } }
          ],
          onOpen: (m) => {
            const $ = (sel) => m.querySelector(sel);
            const syncMode = () => {
              const mode = (m.querySelector('input[name="s-mode"]:checked') || {}).value || 'user';
              $('#s-user-field').classList.toggle('hidden', mode !== 'user');
              $('#s-role-field').classList.toggle('hidden', mode !== 'role');
            };
            const syncUsers = () => { $('#s-user').innerHTML = userOptions($('#s-dept').value, $('#s-allusers').checked); if (s.approverUserId) $('#s-user').value = s.approverUserId; };
            const syncHint = () => {
              const d = $('#s-dept').value; const n = d && d !== C.REQUESTER_DEPT ? sameDeptCount(d) : 0;
              $('#s-dept-hint').innerHTML = n ? UI.icon('info', '') .replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-2px"') + ' ' + esc(UI.deptName(d)) + ' is already used in ' + n + ' other stage(s). That is allowed.' : 'Departments can repeat across stages.';
            };
            if (s.approverUserId) { const u = Store.get('users', s.approverUserId); if (u && u.departmentId !== s.departmentId) $('#s-allusers').checked = true; }
            syncMode(); syncUsers(); syncHint();
            const nc = $('#s-new-checklist');
            if (nc) nc.addEventListener('click', () => DRS.Pages._quickChecklist({ departmentId: $('#s-dept').value }, (cl) => {
              const sel = $('#s-checklist');
              checklists.push(cl);
              if (cl.departmentId && !locked && $('#s-dept').value !== cl.departmentId) { $('#s-dept').value = cl.departmentId; syncUsers(); syncHint(); }
              syncChecklists();
              sel.value = cl.id;
              if (!$('#s-name').value.trim()) $('#s-name').value = cl.name;
            }));
            m.querySelectorAll('input[name="s-mode"]').forEach((r) => r.addEventListener('change', syncMode));
            const allChecklists = checklists;
            const syncChecklists = () => {
              const d = $('#s-dept').value;
              const sel = $('#s-checklist'); const cur = sel.value;
              const list = allChecklists.filter((c) => !d || d === C.REQUESTER_DEPT || c.departmentId === d || c.id === cur);
              sel.innerHTML = UI.options(list.map((c) => ({ value: c.id, label: c.name + ' (' + c.items.length + ' points' + (DRS.Time.checklistHours(c) !== null ? ', ' + DRS.Time.format(DRS.Time.checklistHours(c)) : '') + ')' })), cur, list.length ? 'None – approval only' : 'No checklist for this department – approval only');
            };
            syncChecklists();
            $('#s-dept').addEventListener('change', () => { syncUsers(); syncHint(); syncChecklists(); });
            $('#s-checklist').addEventListener('change', () => {
              const cl = Store.get('checklistTemplates', $('#s-checklist').value);
              if (cl && cl.departmentId && !locked && $('#s-dept').value !== cl.departmentId) { $('#s-dept').value = cl.departmentId; syncUsers(); syncHint(); }
              if (cl && !$('#s-name').value.trim()) $('#s-name').value = cl.name;
            });
            $('#s-allusers').addEventListener('change', syncUsers);
            $('#s-user').addEventListener('change', () => { s.approverUserId = $('#s-user').value; const u = Store.get('users', s.approverUserId); if (u && !$('#s-role').value.trim()) $('#s-role').value = u.jobTitle; });
            $('#s-rolekey').addEventListener('change', () => { const r = C.APPROVER_ROLES[$('#s-rolekey').value]; if (r && !$('#s-role').value.trim()) $('#s-role').value = r.label; });
            // ---- additional approvers ----
            const extraUserOpts = (sel) => UI.options(approvers.map((u) => ({ value: u.id, label: u.name + ' – ' + u.jobTitle + ' (' + UI.deptName(u.departmentId) + ')' })), sel || '', 'Select approver…');
            const drawExtra = () => {
              const host = $('#s-extra');
              host.innerHTML = extra.length ? extra.map((a, i) => `<div class="row" data-x="${i}" style="gap:8px">
                  <span class="stage-order" style="width:24px;height:24px;font-size:11px;background:var(--primary)">${i + 2}</span>
                  <select class="select" data-xf="mode" style="width:150px"${lockDis}><option value="user"${a.approverMode !== 'role' ? ' selected' : ''}>Specific user</option><option value="role"${a.approverMode === 'role' ? ' selected' : ''}>Dynamic role</option></select>
                  ${a.approverMode === 'role'
                    ? `<select class="select" data-xf="role"${lockDis}>${UI.options(Object.entries(C.APPROVER_ROLES).map(([k, r]) => ({ value: k, label: r.label })), a.approverRoleKey || '', 'Select role…')}</select>`
                    : `<select class="select" data-xf="user"${lockDis}>${extraUserOpts(a.approverUserId)}</select>`}
                  ${readOnly ? '' : `<button type="button" class="btn btn-ghost btn-sm btn-icon" data-xf="del" title="Remove approver">${UI.icon('trash')}</button>`}</div>`).join('')
                : '<span class="muted small">' + (locked ? '—' : 'Only the approver above. Add more to let several people approve this checklist.') + '</span>';
              syncRuleHint();
            };
            const syncRuleHint = () => {
              const rule = (m.querySelector('input[name="s-rule"]:checked') || {}).value || 'any';
              const n = 1 + extra.length;
              $('#s-rule-hint').textContent = rule === 'none' ? (Store.get('checklistTemplates', $('#s-checklist').value) ? 'The assigned people will see "Complete Checklist" instead of Approve.' : 'No checklist and no approval: this stage completes automatically when it is reached.')
                : n === 1 ? 'With one approver, "Any one" and "All" work the same.'
                  : rule === 'all' ? 'All ' + n + ' approvers must approve before the next stage starts. Any of them can return or reject.'
                    : 'Any one of the ' + n + ' approvers can approve. The others no longer need to act.';
            };
            const addBtn = $('#s-add-approver');
            if (addBtn) addBtn.addEventListener('click', () => { extra.push({ approverMode: 'user', approverUserId: '', approverRoleKey: '' }); drawExtra(); });
            $('#s-extra').addEventListener('change', (e) => {
              const row = e.target.closest('[data-x]'); if (!row) return;
              const a = extra[Number(row.dataset.x)];
              if (e.target.dataset.xf === 'mode') { a.approverMode = e.target.value; drawExtra(); }
              if (e.target.dataset.xf === 'user') a.approverUserId = e.target.value;
              if (e.target.dataset.xf === 'role') a.approverRoleKey = e.target.value;
            });
            $('#s-extra').addEventListener('click', (e) => {
              const b = e.target.closest('[data-xf="del"]'); if (!b) return;
              extra.splice(Number(b.closest('[data-x]').dataset.x), 1); drawExtra();
            });
            m.querySelectorAll('input[name="s-rule"]').forEach((r) => r.addEventListener('change', syncRuleHint));
            $('#s-checklist').addEventListener('change', syncRuleHint);
            drawExtra();
            ['#s-mandatory', '#s-status'].forEach((sel) => $(sel).addEventListener('click', (e) => {
              const b = e.target.closest('button'); if (!b || b.disabled) return;
              $(sel).querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
            }));
          }
        });

        function collect(m) {
          const $ = (sel) => m.querySelector(sel);
          if (!locked) {
            s.additionalApprovers = extra.map((a) => Object.assign({}, a));
            s.approvalRule = (m.querySelector('input[name="s-rule"]:checked') || {}).value || 'any';
          }
          s.stageName = $('#s-name').value.trim();
          s.checklistTemplateId = $('#s-checklist').value || null;
          s.approvalLevel = $('#s-level').value === '' ? '' : Number($('#s-level').value);
          s.approverRole = $('#s-role').value.trim();
          if (!locked) {
            s.departmentId = $('#s-dept').value;
            s.approverMode = (m.querySelector('input[name="s-mode"]:checked') || {}).value || 'user';
            s.approverUserId = s.approverMode === 'user' ? $('#s-user').value : null;
            s.approverRoleKey = s.approverMode === 'role' ? $('#s-rolekey').value : null;
            s.mandatory = $('#s-mandatory .active').dataset.v === '1';
            s.status = $('#s-status .active').dataset.v;
          }
        }
      }

      // ---- validation & versions panels ----
      function refresh() {
        const forActivation = draft.status === 'Active';
        const full = Validation.template(draft, { forActivation: true });
        const basic = Validation.template(draft, { forActivation: false });
        const host = el.querySelector('#validation');
        let html = '';
        if (!full.errors.length) html += UI.alert('success', 'Configuration is complete', ['Ready to be Active. Saving publishes a new workflow version only if the workflow changed.']);
        else if (forActivation) html += UI.alert('error', 'Cannot save as Active yet', full.errors);
        else if (basic.errors.length) html += UI.alert('error', 'Fix before saving', basic.errors);
        else html += UI.alert('warn', 'Incomplete – can be saved as Inactive', full.errors);
        if (full.warnings.length) html += '<div class="mt-8">' + UI.alert('warn', 'Warnings', full.warnings) + '</div>';
        const active = draft.stages.filter((s) => s.status !== 'Inactive');
        html += `<div class="mt-16"><div class="kv"><span>Owner Department</span><strong>${esc(UI.deptName(draft.ownerDepartmentId))}</strong></div>
          <div class="kv"><span>Concerned Departments</span><strong>${draft.concernedDepartmentIds.length}</strong></div>
          <div class="kv"><span>Checklist / Approval Stages</span><strong>${active.length}</strong></div>
          <div class="kv"><span>Unique stage departments</span><strong>${new Set(active.map((s) => s.departmentId)).size}</strong></div>
          <div class="kv"><span>Stages with checklists</span><strong>${active.filter((s) => s.checklistTemplateId).length}</strong></div></div>`;
        host.innerHTML = html;
        const tp = el.querySelector('#timeplan'); if (tp) tp.innerHTML = timePlanHtml(draft.stages);
      }
      function drawVersions() {
        const host = el.querySelector('#versions');
        if (!existing) { host.innerHTML = '<p class="muted small">Version 1 is published when the template is first saved with a complete configuration.</p>'; return; }
        const versions = TSvc.versions(existing.id);
        host.innerHTML = (existing.hasUnpublishedChanges ? UI.alert('warn', 'Saved changes are incomplete and not published. New requests use v' + (existing.versionNumber || '–') + '.') + '<div class="mt-8"></div>' : '') +
          (versions.length ? '<div class="feed">' + versions.map((v) => `<div class="feed__item"><span class="feed__icon ${v.id === existing.currentVersionId ? 'tone-green' : 'tone-gray'}">${UI.icon('layers')}</span>
            <div><div class="feed__title"><span class="version-pill">v${v.versionNumber}</span> ${v.id === existing.currentVersionId ? '<span class="badge badge--green">Current</span>' : ''} <span class="muted small">${Store.count('requests', (r) => r.workflowVersionId === v.id)} request(s)</span></div>
            <div class="feed__desc">${esc(v.changeNote)}</div><div class="feed__meta">${esc(v.createdByName)} · ${esc(UI.fmtDate(v.createdAt, true))} · ${v.stages.filter((s) => s.status !== 'Inactive').length} stages
            · <a href="javascript:void 0" data-version="${v.id}">View</a></div></div></div>`).join('') + '</div>' : '<p class="muted small">No published version yet.</p>');
        host.querySelectorAll('[data-version]').forEach((a) => a.addEventListener('click', () => showVersion(a.dataset.version)));
      }

      // ---- field bindings ----
      const bind = (sel, key, evt) => { const f = el.querySelector(sel); if (f) f.addEventListener(evt || 'input', () => { draft[key] = f.value; refresh(); }); };
      bind('#f-name', 'name'); bind('#f-type', 'requestType'); bind('#f-desc', 'description'); bind('#f-owner', 'ownerDepartmentId', 'change');
      el.querySelector('#f-status').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        draft.status = b.dataset.v;
        el.querySelectorAll('#f-status button').forEach((x) => x.classList.toggle('active', x === b));
        refresh();
      });
      el.querySelectorAll('input[name="hier"]').forEach((r) => r.addEventListener('change', async () => {
        const next = r.value;
        const lockedCount = draft.stages.filter((s) => s.hierarchyKey).length;
        if (lockedCount && !(await UI.confirm({ title: 'Change approval hierarchy?', message: 'The ' + lockedCount + ' mandatory stage(s) of "' + C.HIERARCHIES[draft.hierarchyType].label + '" will be removed' + (next !== 'none' ? ' and replaced by the "' + C.HIERARCHIES[next].label + '" stages' : '') + '.', confirmLabel: 'Change hierarchy' }))) {
          el.querySelector('input[name="hier"][value="' + draft.hierarchyType + '"]').checked = true; return;
        }
        const rest = draft.stages.filter((s) => !s.hierarchyKey);
        const added = TSvc.hierarchyStages(next, 1);
        rest.forEach((s, i) => { if (Number(s.approvalLevel) <= added.length) s.approvalLevel = added.length + i + 1; });
        draft.hierarchyType = next;
        draft.stages = added.concat(rest);
        drawStages(); refresh();
        if (added.length) UI.toast(added.length + ' mandatory stages inserted', 'info', { text: C.HIERARCHIES[next].description });
      }));
      const sync = el.querySelector('#sync-concerned');
      if (sync) sync.addEventListener('click', () => {
        const executing = Array.from(new Set(draft.stages.filter((s) => s.status !== 'Inactive' && s.checklistTemplateId && s.departmentId && s.departmentId !== C.REQUESTER_DEPT).map((s) => s.departmentId)));
        const added = executing.filter((id) => !draft.concernedDepartmentIds.includes(id));
        draft.concernedDepartmentIds = draft.concernedDepartmentIds.concat(added);
        drawMs(); refresh();
        UI.toast(added.length ? 'Added: ' + added.map(UI.deptName).join(', ') : 'All checklist departments are already listed', added.length ? 'success' : 'info', { text: 'Each department is listed once, even if it executes several stages.' });
      });
      const ren = el.querySelector('#renumber');
      if (ren) ren.addEventListener('click', () => { draft.stages.forEach((s, i) => { s.approvalLevel = i + 1; }); drawStages(); refresh(); UI.toast('Approval levels renumbered 1–' + draft.stages.length, 'info'); });
      const add = el.querySelector('#add-stage');
      if (add) add.addEventListener('click', () => openStageModal(null));

      const doSave = (btn) => UI.busy(btn, () => {
        const wasNew = !existing;
        const res = TSvc.save(draft, user.id);
        Router.clearGuard();
        if (res.template.status === 'Active') UI.toast('Template saved and available for requests', 'success', { text: (res.versionCreated ? 'Workflow v' + res.version.versionNumber + ' published. ' : 'No workflow changes – current version kept. ') + 'Employees can now select it in Create New Request.' });
        else if (res.incomplete.length) UI.toast('Saved as Inactive draft', 'warning', { text: 'Not available for requests until the configuration is complete and the template is Active.' });
        else UI.toast('Template saved as Inactive', 'info', { text: 'Set the status to Active to make it available in Create New Request.' });
        if (wasNew) Router.go('/templates/' + res.template.id); else DRS.App.reload();
      });
      const save = async (btn) => {
        if (draft.status === 'Active') {
          const missing = Validation.template(draft, { forActivation: true }).errors;
          const basic = Validation.template(draft, { forActivation: false }).errors;
          if (missing.length && !basic.length) {
            const asDraft = await UI.confirm({ title: 'Template is not complete yet', message: 'An Active template must be complete before employees can use it. Missing: ' + missing.join(' '), note: 'You can save it now as an Inactive draft and activate it later.', confirmLabel: 'Save as Inactive draft' });
            if (!asDraft) return;
            draft.status = 'Inactive';
            el.querySelectorAll('#f-status button').forEach((x) => x.classList.toggle('active', x.dataset.v === 'Inactive'));
          }
        }
        doSave(btn);
      };
      ['#save', '#save-top'].forEach((sel) => { const b = el.querySelector(sel); if (b) b.addEventListener('click', () => save(b)); });

      drawStages(); refresh(); drawVersions();
    }
  };
})(window);
