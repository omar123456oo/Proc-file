/**
 * organization.js – Departments & Users (prototype management) and role reference.
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;
  const { Store, Auth, UI, C, TemplateService: TSvc } = DRS;
  DRS.Pages = DRS.Pages || {};
  const esc = UI.esc;

  DRS.Pages.organization = {
    render(el, params) {
      const tab = ['departments', 'users', 'roles'].includes(params.tab) ? params.tab : 'departments';
      UI.setBreadcrumbs([{ label: 'Configuration' }, { label: 'Departments & Users', href: '#/organization' }, { label: tab[0].toUpperCase() + tab.slice(1) }]);
      const user = Auth.currentUser();
      const isAdmin = Auth.isAdmin(user);
      el.innerHTML = `<div class="page-header"><div><h1>Departments &amp; Users</h1><p>Organisation structure used to resolve approvers (line managers, department managers and supervisors) and execution teams.</p></div>
        <div class="page-header__actions" id="org-actions"></div></div>
        ${isAdmin ? '' : '<div class="mb-16">' + UI.adminOnlyBanner() + '</div>'}
        <div class="tabs">${[['departments', 'Departments', Store.count('departments')], ['users', 'Users', Store.count('users')], ['roles', 'Roles', Object.keys(C.ROLES).length]].map(([k, l, n]) => `<a class="tab${k === tab ? ' active' : ''}" href="#/organization/${k}" style="text-decoration:none">${l}<span class="count">${n}</span></a>`).join('')}</div>
        <div id="org"></div>`;
      const host = el.querySelector('#org');
      const actions = el.querySelector('#org-actions');

      if (tab === 'departments') {
        if (isAdmin) { actions.innerHTML = '<button class="btn btn-primary" id="add">' + UI.icon('plus') + 'Add Department</button>'; actions.querySelector('#add').addEventListener('click', () => deptModal(null)); }
        const draw = () => {
          const depts = Store.all('departments');
          host.innerHTML = `<div class="card table-wrap"><table class="table"><thead><tr><th>Department</th><th>Code</th><th>Manager</th><th class="hide-sm">Supervisor</th><th class="hide-sm">Users</th><th class="hide-sm">Templates</th><th>Status</th><th></th></tr></thead><tbody>
            ${depts.map((d) => `<tr><td class="cell-title">${esc(d.name)}</td><td><span class="tag">${esc(d.code)}</span></td><td>${d.managerId ? UI.person(d.managerId) : '<span class="muted">Not set</span>'}</td>
              <td class="hide-sm">${d.supervisorId ? UI.person(d.supervisorId) : '<span class="muted">Not set</span>'}</td>
              <td class="hide-sm">${Store.count('users', (u) => u.departmentId === d.id)}</td>
              <td class="hide-sm">${Store.count('requestTemplates', (t) => t.ownerDepartmentId === d.id || t.concernedDepartmentIds.includes(d.id) || t.stages.some((s) => s.departmentId === d.id))}</td>
              <td>${d.active ? '<span class="badge badge--green">Active</span>' : '<span class="badge badge--gray">Inactive</span>'}</td>
              <td><div class="actions">${isAdmin ? `<button class="btn btn-ghost btn-sm btn-icon" data-edit="${d.id}" title="Edit">${UI.icon('edit')}</button><button class="btn btn-ghost btn-sm btn-icon" data-del="${d.id}" title="Delete">${UI.icon('trash')}</button>` : ''}</div></td></tr>`).join('')}
            </tbody></table></div>`;
        };
        draw();
        host.addEventListener('click', async (e) => {
          const ed = e.target.closest('[data-edit]'); if (ed) return deptModal(Store.get('departments', ed.dataset.edit));
          const del = e.target.closest('[data-del]'); if (!del) return;
          const d = Store.get('departments', del.dataset.del);
          if (!(await UI.confirm({ title: 'Delete department?', message: 'Delete "' + d.name + '"?', note: 'Departments referenced by users, templates or requests cannot be deleted; deactivate them instead.', confirmLabel: 'Delete', danger: true }))) return;
          try { TSvc.removeDepartment(d.id, user.id); UI.toast('Department deleted'); draw(); } catch (err) { UI.error(err); }
        });
        function deptModal(d) {
          const users = Store.where('users', (u) => u.active);
          const opts = (sel) => UI.options(users.map((u) => ({ value: u.id, label: u.name + ' – ' + u.jobTitle })), sel || '', 'Not set');
          UI.modal({
            title: d ? 'Edit Department' : 'Add Department',
            body: `<div class="form-grid"><div class="field"><label for="d-name">Name <span class="req">*</span></label><input class="input" id="d-name" value="${esc(d ? d.name : '')}"></div>
              <div class="field"><label for="d-code">Code <span class="req">*</span></label><input class="input" id="d-code" maxlength="6" value="${esc(d ? d.code : '')}"></div>
              <div class="field"><label for="d-man">Department Manager</label><select class="select" id="d-man">${opts(d && d.managerId)}</select></div>
              <div class="field"><label for="d-sup">Department Supervisor</label><select class="select" id="d-sup">${opts(d && d.supervisorId)}</select></div>
              <div class="field span-2"><label class="check"><input type="checkbox" id="d-active"${!d || d.active ? ' checked' : ''}> Active</label></div></div>
              <p class="muted small mt-8">Manager and supervisor are used to resolve dynamic approver roles. Codes PRC, HR and FIN identify the Procurement, HR and Finance managers.</p>`,
            actions: [{ label: 'Cancel', cls: 'btn-ghost' }, { label: 'Save', cls: 'btn-primary', onClick: (close, m) => {
              TSvc.saveDepartment({ id: d ? d.id : null, name: m.querySelector('#d-name').value, code: m.querySelector('#d-code').value, managerId: m.querySelector('#d-man').value, supervisorId: m.querySelector('#d-sup').value, active: m.querySelector('#d-active').checked }, user.id);
              UI.toast('Department saved'); draw(); return true;
            } }]
          });
        }
      } else if (tab === 'users') {
        if (isAdmin) { actions.innerHTML = '<button class="btn btn-primary" id="add">' + UI.icon('plus') + 'Add User</button>'; actions.querySelector('#add').addEventListener('click', () => userModal(null)); }
        let q = ''; let dept = '';
        host.innerHTML = `<div class="card"><div class="card__header"><div class="toolbar"><div class="search">${UI.icon('search')}<input class="input" id="u-q" placeholder="Search users…" style="width:220px" aria-label="Search users"></div>
          <select class="select" id="u-dept" style="width:180px" aria-label="Department filter">${UI.options(Store.all('departments').map((d) => ({ value: d.id, label: d.name })), '', 'All departments')}</select></div></div>
          <div class="card__body card__body--flush table-wrap" id="u-table"></div></div>`;
        const draw = () => {
          const list = Store.all('users').filter((u) => (!dept || u.departmentId === dept) && (!q || (u.name + u.email + u.jobTitle).toLowerCase().includes(q.toLowerCase())));
          host.querySelector('#u-table').innerHTML = list.length ? `<table class="table"><thead><tr><th>User</th><th>Department</th><th class="hide-sm">Reports to</th><th>Roles</th><th>Status</th><th></th></tr></thead><tbody>
            ${list.map((u) => `<tr><td>${UI.person(u.id)}<div class="cell-sub" style="margin-left:32px">${esc(u.email)}</div></td><td>${esc(UI.deptName(u.departmentId))}</td>
              <td class="hide-sm">${u.managerId ? esc(UI.userName(u.managerId)) : '<span class="muted">—</span>'}</td>
              <td><div class="chips">${u.roles.map((r) => '<span class="badge badge--plain badge--' + ({ admin: 'navy', approver: 'blue', execution: 'teal', employee: 'gray' })[r] + '">' + esc(C.ROLES[r]) + '</span>').join('')}</div></td>
              <td>${u.active ? '<span class="badge badge--green">Active</span>' : '<span class="badge badge--gray">Inactive</span>'}</td>
              <td><div class="actions">${u.active && u.id !== user.id ? `<button class="btn btn-ghost btn-sm" data-act-as="${u.id}" title="Switch demo user">Act as</button>` : ''}${isAdmin ? `<button class="btn btn-ghost btn-sm btn-icon" data-edit="${u.id}" title="Edit">${UI.icon('edit')}</button><button class="btn btn-ghost btn-sm btn-icon" data-del="${u.id}" title="Delete">${UI.icon('trash')}</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
            : UI.empty('No users found', '', '', 'users');
        };
        draw();
        host.querySelector('#u-q').addEventListener('input', (e) => { q = e.target.value; draw(); });
        host.querySelector('#u-dept').addEventListener('change', (e) => { dept = e.target.value; draw(); });
        host.querySelector('#u-table').addEventListener('click', async (e) => {
          const as = e.target.closest('[data-act-as]');
          if (as) { try { const u = Auth.switchUser(as.dataset.actAs); UI.toast('Now acting as ' + u.name, 'info'); DRS.App.reload(); } catch (err) { UI.error(err); } return; }
          const ed = e.target.closest('[data-edit]'); if (ed) return userModal(Store.get('users', ed.dataset.edit));
          const del = e.target.closest('[data-del]'); if (!del) return;
          const u = Store.get('users', del.dataset.del);
          if (!(await UI.confirm({ title: 'Delete user?', message: 'Delete ' + u.name + '?', note: 'Users referenced by requests, approvals or the org structure cannot be deleted; deactivate them instead.', confirmLabel: 'Delete', danger: true }))) return;
          try { TSvc.removeUser(u.id, user.id); UI.toast('User deleted'); draw(); } catch (err) { UI.error(err); }
        });
        function userModal(u) {
          const others = Store.where('users', (x) => !u || x.id !== u.id);
          UI.modal({
            title: u ? 'Edit User' : 'Add User',
            body: `<div class="form-grid"><div class="field"><label for="u-name">Full name <span class="req">*</span></label><input class="input" id="u-name" value="${esc(u ? u.name : '')}"></div>
              <div class="field"><label for="u-email">Email <span class="req">*</span></label><input class="input" id="u-email" type="email" value="${esc(u ? u.email : '')}"></div>
              <div class="field"><label for="u-title">Job title</label><input class="input" id="u-title" value="${esc(u ? u.jobTitle : '')}"></div>
              <div class="field"><label for="u-dep">Department <span class="req">*</span></label><select class="select" id="u-dep">${UI.options(Store.all('departments').map((d) => ({ value: d.id, label: d.name })), u ? u.departmentId : '', 'Select…')}</select></div>
              <div class="field span-2"><label for="u-man">Line manager (reports to)</label><select class="select" id="u-man">${UI.options(others.map((x) => ({ value: x.id, label: x.name + ' – ' + x.jobTitle })), u ? u.managerId : '', 'None')}</select></div>
              <div class="field span-2"><span class="field-label">Roles <span class="req">*</span></span><div class="row-wrap" style="gap:16px">${Object.entries(C.ROLES).map(([k, v]) => `<label class="check"><input type="checkbox" name="u-role" value="${k}"${u && u.roles.includes(k) ? ' checked' : !u && k === 'employee' ? ' checked' : ''}> ${esc(v)}</label>`).join('')}</div></div>
              <div class="field"><label class="check"><input type="checkbox" id="u-active"${!u || u.active ? ' checked' : ''}> Active</label></div></div>`,
            actions: [{ label: 'Cancel', cls: 'btn-ghost' }, { label: 'Save', cls: 'btn-primary', onClick: (close, m) => {
              TSvc.saveUser({ id: u ? u.id : null, name: m.querySelector('#u-name').value, email: m.querySelector('#u-email').value, jobTitle: m.querySelector('#u-title').value, departmentId: m.querySelector('#u-dep').value, managerId: m.querySelector('#u-man').value, roles: Array.from(m.querySelectorAll('input[name="u-role"]:checked')).map((x) => x.value), active: m.querySelector('#u-active').checked }, user.id);
              UI.toast('User saved'); draw(); DRS.App.refreshChrome(); return true;
            } }]
          });
        }
      } else {
        const desc = {
          admin: 'Configures templates, checklists, departments, users and settings. Sees all requests. Cannot approve stages unless also assigned as approver.',
          employee: 'Creates, saves drafts, submits, tracks, corrects and resubmits their own requests.',
          approver: 'Can be assigned to workflow stages. Acts only on the active stage assigned to them; never on their own request or a manager\'s request.',
          execution: 'Records execution completion for their department once a request is fully approved.'
        };
        host.innerHTML = `<div class="grid grid-2">${Object.entries(C.ROLES).map(([k, v]) => {
          const members = Store.where('users', (u) => u.roles.includes(k));
          return `<div class="card"><div class="card__header"><h2>${esc(v)}</h2><span class="badge badge--plain badge--gray">${members.length} users</span></div><div class="card__body"><p class="small">${esc(desc[k])}</p>
            <div class="chips mt-8">${members.map((u) => '<span class="tag">' + esc(u.name) + '</span>').join('')}</div></div></div>`;
        }).join('')}</div>
        <div class="mt-16">${UI.alert('warn', 'Role switching is a demonstration mechanism', ['Use the user menu in the top bar to act as any sample user.', 'There is no password or session: production must use real authentication (SSO/JWT) and enforce permissions on the backend.'])}</div>`;
      }
    }
  };
})(window);
