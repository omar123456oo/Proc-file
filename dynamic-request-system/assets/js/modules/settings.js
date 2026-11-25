/**
 * settings.js – System Settings: workflow behaviour, PRD rule reference,
 * data management (export / import / reset) and known limitations.
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;
  const { Store, Auth, UI, C } = DRS;
  DRS.Pages = DRS.Pages || {};
  const esc = UI.esc;

  DRS.Pages.settings = {
    render(el) {
      UI.setBreadcrumbs([{ label: 'Configuration' }, { label: 'System Settings' }]);
      const user = Auth.currentUser();
      const isAdmin = Auth.isAdmin(user);
      const s = Store.settings();
      const dis = isAdmin ? '' : ' disabled';
      const counts = Store.COLLECTIONS.map((n) => [n, Store.count(n)]);
      const ts = DRS.Time.settings();
      el.innerHTML = `<div class="page-header"><div><h1>System Settings</h1><p>Workflow behaviour, business-rule reference and demo data management.</p></div></div>
        ${isAdmin ? '' : '<div class="mb-16">' + UI.adminOnlyBanner() + '</div>'}
        <div class="grid grid-2">
          <div class="stack">
            <div class="card"><div class="card__header"><div><h2 class="row" style="gap:6px">${UI.icon('clock').replace('<svg', '<svg style="width:17px;height:17px;color:var(--primary)"')}Time Settings</h2>
                <p>Defines one working day. Checklist estimates in days and all due dates use it.</p></div></div>
              <div class="card__body">
                <div class="form-grid">
                  <div class="field"><label for="ts-hours">Working hours per day</label><input class="input" type="number" min="1" max="24" step="0.5" id="ts-hours" value="${ts.workHoursPerDay}"${dis}><span class="hint">Example: 8 → "1 day" = 8 hours.</span></div>
                  <div class="field"><label for="ts-start">Working day starts at</label><select class="select" id="ts-start"${dis}>${UI.options(Array.from({ length: 24 }, (_, h) => ({ value: h, label: String(h).padStart(2, '0') + ':00' })), ts.dayStartHour)}</select><span class="hint" id="ts-end"></span></div>
                  <div class="field span-2"><span class="field-label">Working days</span><div class="row-wrap" style="gap:14px">${DRS.Time.DAY_NAMES.map((d, i) => '<label class="check"><input type="checkbox" name="ts-day" value="' + i + '"' + (ts.workDays.includes(i) ? ' checked' : '') + dis + '> ' + d.slice(0, 3) + '</label>').join('')}</div></div>
                </div>
                <div class="alert alert--neutral mt-16" id="ts-example"></div>
              </div>
              ${isAdmin ? '<div class="card__footer"><button class="btn btn-primary" id="ts-save">' + UI.icon('save') + 'Save Time Settings</button></div>' : ''}</div>
            <div class="card"><div class="card__header"><div><h2>Return for Correction – Resubmission</h2><p>Applied to requests returned after this setting is saved.</p></div></div>
              <div class="card__body"><div class="radio-cards" style="grid-template-columns:1fr">
                <label class="radio-card"><input type="radio" name="rb" value="resume"${s.returnBehavior !== 'restart' ? ' checked' : ''}${dis}><div><strong>Resume at the returning stage (default)</strong><span>Earlier approvals stand. The approver who returned the request reviews it again in a new cycle.</span></div></label>
                <label class="radio-card"><input type="radio" name="rb" value="restart"${s.returnBehavior === 'restart' ? ' checked' : ''}${dis}><div><strong>Restart from Stage 1</strong><span>All stages go back to Waiting and every approver reviews again. Earlier decisions stay in history.</span></div></label>
              </div></div></div>
            <div class="card"><div class="card__header"><div><h2>Optional Stages</h2><p>Controls the "Skipped" stage status.</p></div></div>
              <div class="card__body"><label class="check"><input type="checkbox" id="skip"${s.allowSkipOptional ? ' checked' : ''}${dis}> Allow the assigned approver to skip an <strong>optional</strong> stage (comment required)</label>
              <p class="muted small mt-8">Mandatory stages and mandatory hierarchy stages can never be skipped. When disabled, no stage is ever skipped.</p></div>
              ${isAdmin ? '<div class="card__footer"><button class="btn btn-primary" id="save">' + UI.icon('save') + 'Save Settings</button></div>' : ''}</div>
            <div class="card"><div class="card__header"><div><h2>Demo Data</h2><p>${Store.isPersistent ? 'Stored in this browser\'s LocalStorage' : 'LocalStorage unavailable – data is kept in memory only'} · ${(Store.usageBytes() / 1024).toFixed(1)} KB</p></div></div>
              <div class="card__body"><div class="row-wrap mb-16">${counts.map(([n, c]) => '<span class="tag">' + esc(n) + ': ' + c + '</span>').join('')}</div>
                <div class="row-wrap"><button class="btn" id="export">${UI.icon('download')}Export JSON</button>
                ${isAdmin ? `<label class="btn" for="import-file">${UI.icon('upload')}Import JSON</label><input type="file" id="import-file" accept="application/json,.json" class="sr-only">` : ''}
                <button class="btn btn-danger" id="reset">${UI.icon('refresh')}Reset Demo Data</button></div>
                <p class="muted small mt-8">Reset restores the sample departments, users, templates, checklists and requests. Reset is available to every demo user so testers can always recover.</p></div></div>
          </div>
          <div class="stack">
            <div class="card"><div class="card__header"><div><h2>Mandatory Approval Hierarchies</h2><p>Existing Procurement PRD rules – enforced, not configurable.</p></div></div>
              <div class="card__body">${Object.entries(C.HIERARCHIES).filter(([k]) => k !== 'none').map(([, h]) => `<div class="mb-16"><strong>${esc(h.label)}</strong><div class="flow" style="padding-bottom:0">${h.stages.map((st, i) => (i ? '<div class="flow__arrow">' + UI.icon('arrow') + '</div>' : '') + '<div class="flow__node flow__node--locked" style="min-width:120px"><div class="flow__num">' + (i + 1) + '</div><div class="flow__dept" style="font-size:12.5px">' + esc(st.approverRole) + '</div></div>').join('')}</div></div>`).join('')}</div></div>
            <div class="card"><div class="card__header"><h2>Enforced Business Rules</h2></div><div class="card__body small">
              <ul style="margin:0;padding-left:18px;line-height:1.8">
                <li>Exactly one Owner Department per template; Concerned Departments are unique.</li>
                <li>Active templates need ≥1 Concerned Department and a complete, valid workflow.</li>
                <li>Stages may repeat a department; stage count comes from stage records.</li>
                <li>Inactive and archived (legacy) templates cannot receive requests.</li>
                <li>Every workflow change creates a new immutable version; requests keep theirs.</li>
                <li>Strictly sequential stages; only the assigned approver of the active stage can act.</li>
                <li>Reject and Return require comments; mandatory checklist items before Approve.</li>
                <li>No self-approval; a subordinate cannot approve a manager's request (auto-escalation to the requester's next eligible manager at submission).</li>
                <li>Only System Administrators can modify configuration.</li>
              </ul></div></div>
            <div class="card"><div class="card__header"><h2>Prototype Limitations</h2></div><div class="card__body small">
              <ul style="margin:0;padding-left:18px;line-height:1.8">
                <li>No real authentication; the user switcher is for demonstration only.</li>
                <li>Attachments store file names and sizes only; no file content is uploaded.</li>
                <li>Rules are enforced in browser JavaScript and can be bypassed with developer tools; the backend must re-enforce them.</li>
                <li>No delegation / out-of-office or SLA escalation timers.</li>
                <li>Data lives in one browser profile; LocalStorage is limited to about 5 MB.</li>
              </ul></div></div>
          </div>
        </div>`;

      const tsRead = () => ({ workHoursPerDay: Number(el.querySelector('#ts-hours').value), dayStartHour: Number(el.querySelector('#ts-start').value), workDays: Array.from(el.querySelectorAll('input[name="ts-day"]:checked')).map((x) => Number(x.value)) });
      const tsPreview = () => {
        const v = tsRead();
        const end = v.dayStartHour + v.workHoursPerDay;
        el.querySelector('#ts-end').textContent = end <= 24 ? 'Ends at ' + String(Math.floor(end)).padStart(2, '0') + ':' + (end % 1 ? '30' : '00') + '.' : 'Ends after midnight – reduce the hours.';
        el.querySelector('#ts-example').innerHTML = UI.icon('info') + '<div>With these settings: <strong>1 day = ' + (v.workHoursPerDay || '?') + ' hours</strong>. A checklist of 2 days = ' + (2 * v.workHoursPerDay || '?') + ' working hours. Working days: ' + (v.workDays.map((d) => DRS.Time.DAY_NAMES[d].slice(0, 3)).join(', ') || 'none') + '.</div>';
      };
      tsPreview();
      el.querySelectorAll('#ts-hours, #ts-start, input[name="ts-day"]').forEach((f) => f.addEventListener('input', tsPreview));
      el.querySelectorAll('#ts-start, input[name="ts-day"]').forEach((f) => f.addEventListener('change', tsPreview));
      const tsSave = el.querySelector('#ts-save');
      if (tsSave) tsSave.addEventListener('click', () => UI.busy(tsSave, () => {
        Auth.requireAdmin(user.id);
        const v = tsRead();
        const errs = DRS.Time.validate(v);
        if (errs.length) { UI.toast('Please fix the time settings', 'error', { details: errs }); return; }
        Store.saveSettings(v);
        UI.toast('Time settings saved', 'success', { text: '1 working day = ' + v.workHoursPerDay + ' hours.' });
      }));
      if (isAdmin) el.querySelector('#save').addEventListener('click', (e) => UI.busy(e.currentTarget, () => {
        Auth.requireAdmin(user.id);
        Store.saveSettings({ returnBehavior: el.querySelector('input[name="rb"]:checked').value, allowSkipOptional: el.querySelector('#skip').checked });
        UI.toast('Settings saved');
      }));
      el.querySelector('#export').addEventListener('click', () => { UI.downloadJSON('request-hub-data-' + new Date().toISOString().slice(0, 10) + '.json', Store.exportAll()); UI.toast('Data exported'); });
      const imp = el.querySelector('#import-file');
      if (imp) imp.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        if (!(await UI.confirm({ title: 'Import data?', message: 'All current data will be replaced by "' + file.name + '".', confirmLabel: 'Import', danger: true }))) { e.target.value = ''; return; }
        try {
          const data = Store.safeParse(await file.text(), null);
          if (!data) throw new Error('The file is not valid JSON.');
          Store.importAll(data);
          UI.toast('Data imported'); DRS.App.reload();
        } catch (err) { UI.error(err); }
        e.target.value = '';
      });
      el.querySelector('#reset').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!(await UI.confirm({ title: 'Reset demo data?', message: 'All templates, checklists, requests and history will be replaced with the original sample data.', note: 'This cannot be undone. Export first if you want to keep your changes.', confirmLabel: 'Reset data', danger: true }))) return;
        UI.busy(btn, () => { DRS.Seed.run(); UI.toast('Demo data restored', 'success', { text: 'Acting as Sara Ibrahim (System Administrator).' }); DRS.Router.go('/dashboard'); });
      });
    }
  };
})(window);
