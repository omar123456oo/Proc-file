/**
 * checklist.js – Checklist Configuration.
 * A checklist belongs to one department and has an estimation time, a
 * "Need Approval First" flag and a list of points. Each point can be
 * Required/Optional, need an attached file and be linked to the approval action.
 * Checklists are linked to approval cycles (request templates) as stages; the
 * same checklist or department may be linked any number of times.
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;
  const { Store, Auth, UI, C, Validation, TemplateService: TSvc, Router } = DRS;
  DRS.Pages = DRS.Pages || {};
  const esc = UI.esc;

  const newPoint = () => ({ id: null, label: '', type: 'yesno', required: true, needAttachment: false, linkToAction: false, helpText: '', options: [] });

  /** Small badges describing a point's rules (used here and on approval screens). */
  function pointFlags(it) {
    return '<span class="point-flags">' + (it.required ? '<span class="tag">Required</span>' : '<span class="tag">Optional</span>') +
      (it.needAttachment ? '<span class="tag tag--warn">' + UI.icon('paperclip') + 'Need attached</span>' : '') +
      (it.linkToAction ? '<span class="tag tag--lock">' + UI.icon('lock') + 'Linked to action</span>' : '') + '</span>';
  }
  DRS.Pages._pointFlags = pointFlags;

  /** Points editor (shared by the full editor and the quick modal). */
  function pointsHtml(items, readOnly) {
    const dis = readOnly ? ' disabled' : '';
    if (!items.length) return UI.empty('No points yet', 'Add the points this department must check.', '', 'checklist');
    return items.map((it, i) => `
      <div class="point-row" data-idx="${i}">
        <span class="point-row__num">${i + 1}</span>
        <input class="input" data-f="label" placeholder="Point, e.g. Area inspected and safe" value="${esc(it.label)}" aria-label="Point ${i + 1}"${dis}>
        <span class="row">${readOnly ? '' : `<button type="button" class="btn btn-ghost btn-sm btn-icon" data-act="up" title="Move up"${i === 0 ? ' disabled' : ''}>${UI.icon('up')}</button>
          <button type="button" class="btn btn-ghost btn-sm btn-icon" data-act="down" title="Move down"${i === items.length - 1 ? ' disabled' : ''}>${UI.icon('down')}</button>
          <button type="button" class="btn btn-ghost btn-sm btn-icon" data-act="del" title="Delete point">${UI.icon('trash')}</button>`}</span>
        <div class="point-row__sub">
          <span class="radio-inline" role="radiogroup" aria-label="Point ${i + 1} rule">
            <label><input type="radio" name="req-${i}" data-f="required" value="1"${it.required ? ' checked' : ''}${dis}> Required</label>
            <label><input type="radio" name="req-${i}" data-f="required" value="0"${it.required ? '' : ' checked'}${dis}> Optional</label></span>
          <label class="check"><input type="checkbox" data-f="needAttachment"${it.needAttachment ? ' checked' : ''}${dis}> Need Attached</label>
          <label class="switch" title="The approver can approve only when this point is answered (Yes for Yes/No points)"><input type="checkbox" data-f="linkToAction"${it.linkToAction ? ' checked' : ''}${dis}> Link to Action</label>
          <select class="select" data-f="type" aria-label="Point ${i + 1} answer type" style="width:auto;height:32px;font-size:12.5px"${dis}>${UI.options(Object.entries(C.ITEM_TYPES).map(([k, v]) => ({ value: k, label: 'Answer: ' + v })), it.type)}</select>
          <input class="input" data-f="helpText" placeholder="Help text (optional)" value="${esc(it.helpText || '')}" style="flex:1;min-width:160px"${dis}>
          ${it.type === 'dropdown' ? `<input class="input" data-f="options" placeholder="Dropdown options, comma separated" value="${esc((it.options || []).join(', '))}"${dis}>` : ''}
        </div>
      </div>`).join('');
  }
  /** Wires a points editor; onChange(redraw) is called after every edit. */
  function bindPoints(host, items, onChange) {
    host.addEventListener('input', (e) => {
      const f = e.target.dataset.f; if (!f) return;
      const it = items[Number(e.target.closest('[data-idx]').dataset.idx)];
      if (f === 'required') it.required = e.target.value === '1';
      else if (f === 'needAttachment' || f === 'linkToAction') it[f] = e.target.checked;
      else if (f === 'options') it.options = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
      else it[f] = e.target.value;
      onChange(f === 'type');
    });
    host.addEventListener('change', (e) => { if (['required', 'needAttachment', 'linkToAction', 'type'].includes(e.target.dataset.f)) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      const i = Number(b.closest('[data-idx]').dataset.idx);
      if (b.dataset.act === 'up' || b.dataset.act === 'down') {
        const j = b.dataset.act === 'up' ? i - 1 : i + 1;
        const tmp = items[i]; items[i] = items[j]; items[j] = tmp;
      } else if (b.dataset.act === 'del') {
        if (items[i].label && !(await UI.confirm({ title: 'Delete point?', message: 'Remove "' + items[i].label + '"?', confirmLabel: 'Delete', danger: true }))) return;
        items.splice(i, 1);
      }
      onChange(true);
    });
  }

  function estimateText(d) {
    const h = DRS.Time.checklistHours(d);
    if (h === null) return '—';
    return (d.estimateUnit === 'day' ? d.estimateValue + ' day(s) = ' : '') + DRS.Time.format(h);
  }
  DRS.Pages._estimateText = estimateText;

  /** "Check List Item" header + "Time Settings" (Estimation Time + Duration Type). */
  function headerHtml(d, readOnly, idp) {
    const dis = readOnly ? ' disabled' : '';
    const hpd = DRS.Time.settings().workHoursPerDay;
    const val = d.estimateValue !== undefined && d.estimateValue !== '' ? d.estimateValue : (d.estimatedHours === undefined ? '' : d.estimatedHours);
    return `<div class="cl-head-grid" style="grid-template-columns:minmax(0,1fr) auto">
      <div class="field"><label for="${idp}-dept">Department <span class="req">*</span></label><select class="select" id="${idp}-dept"${dis}>${UI.options(Store.all('departments').filter((x) => x.active || x.id === d.departmentId).map((x) => ({ value: x.id, label: x.name })), d.departmentId, 'Select department…')}</select></div>
      <label class="switch" style="padding-bottom:9px" title="On: the stage approver must approve before the workflow continues. Off: the assigned person only completes the checklist."><input type="checkbox" id="${idp}-approval"${d.requiresApproval !== false ? ' checked' : ''}${dis}> Need Approval First</label>
    </div>
    <div class="cl-section mt-16" style="background:#fff">
      <h3 class="row" style="gap:6px">${UI.icon('clock').replace('<svg', '<svg style="width:17px;height:17px"')}Time Settings</h3>
      <div class="cl-head-grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
        <div class="field"><label for="${idp}-hours">Estimation Time</label><input class="input" id="${idp}-hours" type="number" min="0" step="0.5" placeholder="Enter time value" value="${esc(val)}"${dis}></div>
        <div class="field"><label for="${idp}-unit">Duration Type</label><select class="select" id="${idp}-unit"${dis}>
          <option value="day"${d.estimateUnit === 'day' ? ' selected' : ''}>Day (${hpd} Hours)</option>
          <option value="hour"${d.estimateUnit !== 'day' ? ' selected' : ''}>Hour</option></select></div>
      </div>
      <p class="small mt-8" id="${idp}-est-text" style="color:var(--text-2)"></p>
    </div>`;
  }
  function bindHeader(root, d, idp, onChange) {
    const txt = root.querySelector('#' + idp + '-est-text');
    const showEst = () => {
      const h = DRS.Time.checklistHours(d);
      txt.innerHTML = h === null ? 'Leave empty if there is no time target.' : UI.icon('info').replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px"') + ' This department has <strong>' + esc(DRS.Time.format(h)) + '</strong> (' + h + ' working hours) to finish this checklist. Working day = ' + DRS.Time.settings().workHoursPerDay + ' hours (System Settings → Time Settings).';
    };
    root.querySelector('#' + idp + '-dept').addEventListener('change', (e) => { d.departmentId = e.target.value; onChange && onChange(); });
    root.querySelector('#' + idp + '-hours').addEventListener('input', (e) => { d.estimateValue = e.target.value; d.estimatedHours = ''; showEst(); onChange && onChange(); });
    root.querySelector('#' + idp + '-unit').addEventListener('change', (e) => { d.estimateUnit = e.target.value; showEst(); onChange && onChange(); });
    root.querySelector('#' + idp + '-approval').addEventListener('change', (e) => { d.requiresApproval = e.target.checked; onChange && onChange(); });
    showEst();
  }

  /** Quick checklist creator used inside the Stage modal. Calls onCreated(checklist). */
  DRS.Pages._quickChecklist = function (opts, onCreated) {
    const user = Auth.currentUser();
    const d = Object.assign(TSvc.blankChecklist(), { departmentId: opts && opts.departmentId && opts.departmentId !== C.REQUESTER_DEPT ? opts.departmentId : '', items: [newPoint()] });
    UI.modal({
      title: 'New Checklist', size: 'lg',
      body: `<div class="field mb-16"><label for="qc-name">Checklist Name <span class="req">*</span></label><input class="input" id="qc-name" maxlength="120" placeholder="e.g. Operations Checklist D – Safety Review"></div>
        <div class="cl-section mb-16"><h3>Check List Item</h3>${headerHtml(d, false, 'qc')}</div>
        <div class="row between mb-8"><h3>Points</h3><button type="button" class="btn btn-sm" id="qc-add">${UI.icon('plus')}Add Point</button></div>
        <div class="stack" id="qc-items" style="gap:8px"></div><div id="qc-err" class="mt-16"></div>`,
      actions: [{ label: 'Cancel', cls: 'btn-ghost' }, { label: 'Create Checklist', cls: 'btn-primary', onClick: (close, m) => {
        d.name = m.querySelector('#qc-name').value;
        const errs = Validation.checklist(d);
        if (errs.length) { m.querySelector('#qc-err').innerHTML = UI.alert('error', 'Please fix the checklist:', errs); return false; }
        const res = TSvc.saveChecklist(d, user.id);
        UI.toast('Checklist "' + res.checklist.name + '" created', 'success', { text: 'Selected for this stage.' });
        onCreated(res.checklist);
        return true;
      } }],
      onOpen: (m) => {
        const host = m.querySelector('#qc-items');
        const draw = () => { host.innerHTML = pointsHtml(d.items, false); };
        draw();
        bindHeader(m, d, 'qc');
        bindPoints(host, d.items, (redraw) => { if (redraw) draw(); });
        m.querySelector('#qc-add').addEventListener('click', () => { d.items.push(newPoint()); draw(); host.querySelector('.point-row:last-child [data-f="label"]').focus(); });
      }
    });
  };

  /** Links a checklist to an approval cycle (request template) as a new stage. */
  function linkModal(checklist, onDone) {
    const user = Auth.currentUser();
    const templates = Store.where('requestTemplates', (t) => t.status !== 'Archived').sort((a, b) => a.name.localeCompare(b.name));
    if (!templates.length) { UI.toast('Create a request template first', 'warning'); return; }
    const approvers = Store.where('users', (u) => u.active && u.roles.includes('approver'));
    UI.modal({
      title: 'Link "' + checklist.name + '" to an approval cycle', size: 'lg',
      body: `${UI.alert('info', 'A new stage is added for ' + UI.deptName(checklist.departmentId) + '. The same checklist or department can be linked again to the same cycle; each link is an independent stage with its own approver and answers.')}
        <div class="form-grid mt-16">
          <div class="field span-2"><label for="lk-tpl">Approval cycle (request template) <span class="req">*</span></label><select class="select" id="lk-tpl">${UI.options(templates.map((t) => ({ value: t.id, label: t.name + ' (' + t.status + ', ' + t.stages.length + ' stages)' })), '', 'Select…')}</select></div>
          <div class="field span-2" id="lk-flow"></div>
          <div class="field"><label for="lk-name">Stage Name <span class="req">*</span></label><input class="input" id="lk-name" value="${esc(checklist.name)}"></div>
          <div class="field"><label for="lk-pos">Position</label><select class="select" id="lk-pos"></select></div>
          <div class="field"><label for="lk-user">Approver <span class="req">*</span></label><select class="select" id="lk-user">${UI.options(approvers.map((u) => ({ value: u.id, label: u.name + ' – ' + u.jobTitle + ' (' + UI.deptName(u.departmentId) + ')' })), '', 'Select approver…')}</select></div>
          <div class="field"><label for="lk-level">Approval Level <span class="req">*</span></label><input class="input" type="number" min="1" id="lk-level"></div>
          <div class="field span-2"><label class="check"><input type="checkbox" id="lk-renumber" checked> Renumber approval levels to follow stage order (Level 1, 2, 3…)</label></div>
        </div><div id="lk-err" class="mt-16"></div>`,
      actions: [{ label: 'Cancel', cls: 'btn-ghost' }, { label: 'Link to cycle', cls: 'btn-primary', icon: 'layers', onClick: (close, m) => {
        const $ = (s) => m.querySelector(s);
        const u = Store.get('users', $('#lk-user').value);
        try {
          const res = TSvc.linkChecklist(checklist.id, $('#lk-tpl').value, {
            stageName: $('#lk-name').value.trim(), approverMode: 'user', approverUserId: $('#lk-user').value, approverRole: u ? u.jobTitle : '',
            approvalLevel: Number($('#lk-level').value), position: Number($('#lk-pos').value), renumber: $('#lk-renumber').checked
          }, user.id);
          UI.toast('Linked to "' + res.template.name + '"', 'success', { text: res.versionCreated ? 'Workflow v' + res.version.versionNumber + ' published.' : res.incomplete.length ? 'Template saved; it is incomplete, so no version was published yet.' : 'Saved.' });
          onDone(res.template);
          return true;
        } catch (err) {
          $('#lk-err').innerHTML = UI.alert('error', err.message, err.details && err.details.length > 1 ? err.details : []);
          return false;
        }
      } }],
      onOpen: (m) => {
        const $ = (s) => m.querySelector(s);
        const sync = () => {
          const t = Store.get('requestTemplates', $('#lk-tpl').value);
          $('#lk-flow').innerHTML = t ? '<span class="field-label">Current stages</span>' + DRS.Pages._flowHtml(t.stages) : '';
          const n = t ? t.stages.length : 0;
          $('#lk-pos').innerHTML = Array.from({ length: n + 1 }, (_, i) => '<option value="' + i + '"' + (i === n ? ' selected' : '') + '>' + (i === n ? 'At the end (Stage ' + (n + 1) + ')' : 'Before Stage ' + (i + 1) + (t.stages[i].hierarchyKey ? ' (mandatory)' : '')) + '</option>').join('');
          $('#lk-level').value = t ? t.stages.reduce((mx, s) => Math.max(mx, Number(s.approvalLevel) || 0), 0) + 1 : 1;
        };
        const syncLevel = () => {
          const ren = $('#lk-renumber').checked;
          $('#lk-level').disabled = ren;
          if (ren) $('#lk-level').value = Number($('#lk-pos').value) + 1;
        };
        $('#lk-tpl').addEventListener('change', () => { sync(); syncLevel(); });
        $('#lk-pos').addEventListener('change', syncLevel);
        $('#lk-renumber').addEventListener('change', syncLevel);
        sync();
      }
    });
  }

  // --------------------------------------------------------------------- list
  DRS.Pages.checklists = {
    render(el) {
      UI.setBreadcrumbs([{ label: 'Configuration' }, { label: 'Checklist Configuration' }]);
      const user = Auth.currentUser();
      const isAdmin = Auth.isAdmin(user);
      let q = ''; let dept = '';
      el.innerHTML = `
        <div class="page-header"><div><h1>Checklist Configuration</h1><p>Each checklist belongs to a department and holds the points that department must check. Link a checklist to any approval cycle, as many times as needed.</p></div>
          <div class="page-header__actions">${isAdmin ? '<a class="btn btn-primary" href="#/checklists/new">' + UI.icon('plus') + 'New Checklist</a>' : ''}</div></div>
        ${isAdmin ? '' : '<div class="mb-16">' + UI.adminOnlyBanner() + '</div>'}
        <div class="card"><div class="card__header"><div class="toolbar"><div class="search">${UI.icon('search')}<input class="input" id="cl-q" placeholder="Search checklists…" style="width:240px" aria-label="Search checklists"></div>
          <select class="select" id="cl-dept" style="width:190px" aria-label="Department">${UI.options(Store.all('departments').map((d) => ({ value: d.id, label: d.name })), '', 'All departments')}</select></div></div>
          <div class="card__body card__body--flush table-wrap" id="cl-table"></div></div>`;
      const draw = () => {
        const list = Store.all('checklistTemplates').filter((c) => (!dept || c.departmentId === dept) && (!q || (c.name + ' ' + c.description).toLowerCase().includes(q.toLowerCase())))
          .sort((a, b) => UI.deptName(a.departmentId).localeCompare(UI.deptName(b.departmentId)) || a.name.localeCompare(b.name));
        const host = el.querySelector('#cl-table');
        if (!list.length) { host.innerHTML = UI.empty('No checklists', 'Create a checklist for a department, then link it to an approval cycle.', isAdmin ? '<a class="btn btn-primary" href="#/checklists/new">New Checklist</a>' : '', 'checklist'); return; }
        host.innerHTML = `<table class="table"><thead><tr><th>Checklist</th><th>Department</th><th>Points</th><th class="hide-sm">Est. time</th><th class="hide-sm">Approval</th><th class="hide-sm">Linked to</th><th>Status</th><th></th></tr></thead><tbody>
          ${list.map((c) => {
            const used = TSvc.checklistUsage(c.id);
            const stageCount = used.reduce((n, t) => n + t.stages.filter((s) => s.checklistTemplateId === c.id).length, 0);
            return `<tr><td style="max-width:320px"><a class="cell-title" href="#/checklists/${c.id}">${esc(c.name)}</a><div class="cell-sub">${esc(c.description)}</div></td>
              <td>${esc(c.departmentId ? UI.deptName(c.departmentId) : '— not set —')}</td>
              <td><strong>${c.items.length}</strong> <span class="cell-sub">${c.items.filter((i) => i.required).length} required${c.items.some((i) => i.needAttachment) ? ' · ' + c.items.filter((i) => i.needAttachment).length + ' need file' : ''}</span></td>
              <td class="hide-sm">${esc(estimateText(c))}</td>
              <td class="hide-sm">${c.requiresApproval !== false ? '<span class="tag">Need approval first</span>' : '<span class="tag">Completion only</span>'}</td>
              <td class="hide-sm">${used.length ? stageCount + ' stage(s) in ' + used.length + ' cycle(s)' : '<span class="muted">Not linked</span>'}</td>
              <td>${c.active ? '<span class="badge badge--green">Active</span>' : '<span class="badge badge--gray">Inactive</span>'}</td>
              <td><div class="actions">${isAdmin && c.active ? `<button class="btn btn-sm" data-act="link" data-id="${c.id}" title="Link to an approval cycle">${UI.icon('layers')}Link</button>` : ''}
                <a class="btn btn-ghost btn-sm btn-icon" href="#/checklists/${c.id}" title="${isAdmin ? 'Edit' : 'View'}">${UI.icon(isAdmin ? 'edit' : 'eye')}</a>
                ${isAdmin ? `<button class="btn btn-ghost btn-sm btn-icon" data-act="dup" data-id="${c.id}" title="Duplicate">${UI.icon('copy')}</button>
                <button class="btn btn-ghost btn-sm btn-icon" data-act="del" data-id="${c.id}" title="Delete">${UI.icon('trash')}</button>` : ''}</div></td></tr>`;
          }).join('')}</tbody></table>`;
      };
      draw();
      el.querySelector('#cl-q').addEventListener('input', (e) => { q = e.target.value; draw(); });
      el.querySelector('#cl-dept').addEventListener('change', (e) => { dept = e.target.value; draw(); });
      el.querySelector('#cl-table').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const c = Store.get('checklistTemplates', b.dataset.id);
        try {
          if (b.dataset.act === 'link') linkModal(c, draw);
          if (b.dataset.act === 'dup') { const r = TSvc.duplicateChecklist(c.id, user.id); UI.toast('Checklist duplicated', 'success', { text: r.checklist.name }); draw(); }
          if (b.dataset.act === 'del') {
            if (!(await UI.confirm({ title: 'Delete checklist?', message: 'Delete "' + c.name + '"? This cannot be undone.', note: 'Checklists linked to approval cycles cannot be deleted. Submitted requests keep their own copy.', confirmLabel: 'Delete', danger: true }))) return;
            TSvc.removeChecklist(c.id, user.id); UI.toast('Checklist deleted'); draw();
          }
        } catch (err) { UI.error(err); }
      });
    }
  };

  // ------------------------------------------------------------------- editor
  DRS.Pages.checklistEditor = {
    render(el, params) {
      const user = Auth.currentUser();
      const readOnly = !Auth.isAdmin(user);
      const existing = params.id ? Store.get('checklistTemplates', params.id) : null;
      if (params.id && !existing) { el.innerHTML = UI.empty('Checklist not found', '', '<a class="btn" href="#/checklists">Back</a>'); return; }
      const draft = Object.assign(TSvc.blankChecklist(), existing ? Store.clone(existing) : {});
      draft.items.forEach((it) => { it.needAttachment = !!it.needAttachment; it.linkToAction = !!it.linkToAction; });
      if (draft.estimateValue === '' && draft.estimatedHours !== '' && draft.estimatedHours !== undefined) draft.estimateValue = draft.estimatedHours;
      if (!draft.items.length && !readOnly) draft.items.push(newPoint());
      const initial = JSON.stringify(draft);
      if (!readOnly) Router.setGuard(() => (JSON.stringify(draft) !== initial ? 'You have unsaved checklist changes. Leave without saving?' : null));
      UI.setBreadcrumbs([{ label: 'Configuration' }, { label: 'Checklist Configuration', href: '#/checklists' }, { label: existing ? existing.name : 'New Checklist' }]);
      const used = existing ? TSvc.checklistUsage(existing.id) : [];
      const dis = readOnly ? ' disabled' : '';

      el.innerHTML = `
        <div class="page-header"><div><h1>${existing ? esc(existing.name) : 'Create Checklist'}</h1>
          <p>${existing ? 'Version <span class="version-pill">v' + existing.version + '</span> · ' + esc(UI.deptName(existing.departmentId)) + ' · ' + existing.items.length + ' points' : 'Choose the department, then add the points it must check.'}</p></div>
          <div class="page-header__actions"><a class="btn" href="#/checklists">${UI.icon('arrow-left')}Back</a>
            ${existing && !readOnly && existing.active ? '<button class="btn" id="link">' + UI.icon('layers') + 'Link to approval cycle</button>' : ''}
            ${readOnly ? '' : '<button class="btn btn-primary" id="save">' + UI.icon('save') + 'Save Checklist</button>'}</div></div>
        ${readOnly ? '<div class="mb-16">' + UI.adminOnlyBanner() + '</div>' : ''}
        <div class="grid grid-main-side">
          <div class="stack">
            <div class="card"><div class="card__body">
              <div class="form-grid mb-16">
                <div class="field"><label for="c-name">Checklist Name <span class="req">*</span></label><input class="input" id="c-name" maxlength="120" value="${esc(draft.name)}" placeholder="e.g. Operations Checklist A"${dis}></div>
                <div class="field"><label for="c-desc">Description</label><input class="input" id="c-desc" maxlength="500" value="${esc(draft.description)}"${dis}></div>
              </div>
              <div class="cl-section"><h3>Check List Item</h3>${headerHtml(draft, readOnly, 'c')}
                <p class="muted small mt-8">Need Approval First on: the stage approver approves (or returns / rejects) before the next stage starts. Off: the assigned person only completes the checklist.</p></div>
              <div class="cl-section mt-16"><div class="row between mb-8"><h3 style="margin:0">Points</h3>${readOnly ? '' : '<button class="btn btn-primary btn-sm" id="add-item">' + UI.icon('plus') + 'Add Point</button>'}</div>
                <div class="stack" id="items" style="gap:8px"></div>
                <p class="muted small mt-8"><strong>Need Attached:</strong> the approver must attach a file to this point. <strong>Link to Action:</strong> the stage cannot be approved until this point is answered ("Yes" for Yes/No points); otherwise the approver returns or rejects.</p></div>
              <label class="check mt-16"><input type="checkbox" id="c-active"${draft.active ? ' checked' : ''}${dis}> Active (available for linking to approval cycles)</label>
            </div></div>
          </div>
          <aside class="stack">
            <div class="card"><div class="card__header"><h2>Preview</h2></div><div class="card__body" id="preview"></div></div>
            <div class="card"><div class="card__header"><h2>Linked Approval Cycles</h2></div><div class="card__body">${used.length ? used.map((t) => `<div class="kv"><a href="#/templates/${t.id}">${esc(t.name)}</a><span>${t.stages.map((s, i) => s.checklistTemplateId === existing.id ? 'Stage ' + (i + 1) : null).filter(Boolean).join(', ')}</span></div>`).join('') +
              '<p class="muted small mt-8">Saving changes publishes a new workflow version of complete cycles that use this checklist. Submitted requests keep their own copy.</p>' : '<p class="muted small">Not linked to any approval cycle yet.' + (existing ? ' Use "Link to approval cycle".' : ' Save first, then link it.') + '</p>'}</div></div>
          </aside>
        </div>`;

      const itemsHost = el.querySelector('#items');
      const drawPreview = () => {
        el.querySelector('#preview').innerHTML = `<div class="kv"><span>Department</span><strong>${esc(UI.deptName(draft.departmentId))}</strong></div>
          <div class="kv"><span>Estimation time</span><strong>${esc(estimateText(draft))}</strong></div>
          <div class="kv"><span>Need approval first</span><strong>${draft.requiresApproval !== false ? 'Yes' : 'No'}</strong></div><div class="divider" style="margin:10px 0"></div>` +
          (draft.items.length ? draft.items.map((it, i) => `<div style="padding:6px 0;border-bottom:1px dashed var(--border)"><div class="small"><strong>${i + 1}.</strong> ${esc(it.label || 'Untitled point')}</div>${pointFlags(it)}</div>`).join('') : '<p class="muted small">No points.</p>');
      };
      const drawItems = () => { itemsHost.innerHTML = pointsHtml(draft.items, readOnly); drawPreview(); };
      drawItems();
      if (readOnly) return;
      bindPoints(itemsHost, draft.items, (redraw) => { if (redraw) drawItems(); else drawPreview(); });
      bindHeader(el, draft, 'c', drawPreview);
      el.querySelector('#add-item').addEventListener('click', () => {
        draft.items.push(newPoint()); drawItems();
        itemsHost.querySelector('.point-row:last-child [data-f="label"]').focus();
      });
      el.querySelector('#c-name').addEventListener('input', (e) => { draft.name = e.target.value; });
      el.querySelector('#c-desc').addEventListener('input', (e) => { draft.description = e.target.value; });
      el.querySelector('#c-active').addEventListener('change', (e) => { draft.active = e.target.checked; });
      const link = el.querySelector('#link');
      if (link) link.addEventListener('click', () => {
        if (JSON.stringify(draft) !== initial) { UI.toast('Save the checklist first', 'warning', { text: 'Then link it to an approval cycle.' }); return; }
        linkModal(existing, () => DRS.App.reload());
      });
      el.querySelector('#save').addEventListener('click', (e) => UI.busy(e.currentTarget, () => {
        const errs = Validation.checklist(draft);
        if (errs.length) { UI.toast('Please fix the checklist', 'error', { details: errs }); return; }
        const res = TSvc.saveChecklist(draft, user.id);
        Router.clearGuard();
        UI.toast('Checklist saved', 'success', { text: 'Version v' + res.checklist.version + '.' + (res.republished.length ? ' Republished: ' + res.republished.join(', ') + '.' : existing ? '' : ' Now link it to an approval cycle.') });
        if (!existing) Router.go('/checklists/' + res.checklist.id); else DRS.App.reload();
      }));
    }
  };
})(window);
