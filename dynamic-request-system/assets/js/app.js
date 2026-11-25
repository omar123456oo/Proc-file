/**
 * app.js
 * Application bootstrap: seeds demo data, renders the shell (sidebar, top bar,
 * notifications, demo user switcher) and registers routes.
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;
  const { Store, Auth, UI, Router, WorkflowEngine: WE } = DRS;
  const Pages = DRS.Pages;

  const NAV = [
    { group: 'Overview', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '#/dashboard' }] },
    { group: 'Requests', items: [
      { id: 'create', label: 'Create New Request', icon: 'file-plus', href: '#/requests/new' },
      { id: 'my-requests', label: 'My Requests', icon: 'folder', href: '#/my-requests', count: () => Store.count('requests', (r) => r.requesterId === Auth.currentUser().id && r.status === 'Returned for Correction') },
      { id: 'approvals', label: 'Approval Workspace', icon: 'inbox', href: '#/approvals', count: () => WE.pendingFor(Auth.currentUser().id).length + WE.executionTasksFor(Auth.currentUser()).length },
      { id: 'tracking', label: 'Request Tracking', icon: 'timeline', href: '#/tracking' },
      { id: 'history', label: 'Workflow History', icon: 'history', href: '#/history' }
    ] },
    { group: 'Configuration', items: [
      { id: 'templates', label: 'Request Templates', icon: 'template', href: '#/templates', admin: true },
      { id: 'checklists', label: 'Checklist Configuration', icon: 'checklist', href: '#/checklists', admin: true },
      { id: 'organization', label: 'Departments & Users', icon: 'users', href: '#/organization', admin: true },
      { id: 'settings', label: 'System Settings', icon: 'settings', href: '#/settings', admin: true }
    ] }
  ];

  let activeNav = 'dashboard';

  const App = {
    /** Renders a page module into the content area. */
    show(pageName, params, navId) {
      activeNav = navId || pageName;
      const view = document.getElementById('view');
      view.className = 'content';
      void view.offsetWidth;
      view.classList.add('page-enter');
      view.innerHTML = '';
      try {
        Pages[pageName].render(view, params || {});
      } catch (e) {
        console.error(e);
        view.innerHTML = UI.alert('error', 'This page could not be displayed: ' + e.message);
      }
      document.getElementById('app').classList.remove('nav-open');
      App.refreshChrome();
      global.scrollTo(0, 0);
    },
    /** Re-renders the current route (after data changes or user switch). */
    reload() { Router.resolve(true); },

    refreshChrome() { renderNav(); renderNotifications(); renderUserSwitcher(); },

    /**
     * Demo convenience: the button that lets the tester act as the approver of the
     * request's current stage. Empty when there is nothing to approve.
     */
    approveButton(requestId, cls) {
      const user = Auth.currentUser();
      const cur = WE.currentStage(requestId);
      if (!cur) return '';
      const waiting = UI.waitingApprovers(cur);
      if (waiting.includes(user.id)) return '<a class="btn btn-success ' + (cls || '') + '" href="#/approvals/' + UI.esc(requestId) + '">' + UI.icon('check') + 'Review &amp; Approve</a>';
      const a = Store.get('users', waiting.find((id) => id !== user.id) || waiting[0]);
      if (!a) return '';
      return '<button type="button" class="btn btn-success ' + (cls || '') + '" data-act-as-approver="' + UI.esc(requestId) + '" title="Demo: switch user to the assigned approver">' + UI.icon('check') +
        'Approve as ' + UI.esc(a ? a.name : 'approver') + ' <span class="demo-tag" style="margin-left:4px">DEMO</span></button>';
    },
    actAsApprover(requestId) {
      const cur = WE.currentStage(requestId);
      if (!cur) return;
      const me = Auth.currentUser();
      const waiting = UI.waitingApprovers(cur);
      const u = Auth.switchUser(waiting.find((id) => id !== me.id) || waiting[0]);
      UI.toast('Now acting as ' + u.name, 'info', { text: u.jobTitle + ' – approver of Stage ' + cur.order + '. Switch back any time from the user menu.' });
      Router.clearGuard();
      if (location.hash === '#/approvals/' + requestId) App.reload(); else location.hash = '#/approvals/' + requestId;
    },

    /** Where should a notification / request link take the current user? */
    requestLink(requestId) {
      const user = Auth.currentUser();
      const r = Store.get('requests', requestId);
      if (!r) return '#/my-requests';
      const cur = WE.currentStage(requestId);
      if (cur && UI.waitingApprovers(cur).includes(user.id)) return '#/approvals/' + requestId;
      if (r.status === 'Returned for Correction' && r.requesterId === user.id) return '#/requests/resubmit/' + requestId;
      if (r.status === 'Draft' && r.requesterId === user.id) return '#/requests/edit/' + requestId;
      return '#/tracking/' + requestId;
    }
  };

  function renderNav() {
    const user = Auth.currentUser();
    const isAdmin = Auth.isAdmin(user);
    document.getElementById('sidebar-nav').innerHTML = NAV.map((g) =>
      '<div class="nav-group"><div class="nav-group__label">' + UI.esc(g.group) + '</div>' +
      g.items.map((it) => {
        const count = it.count ? it.count() : 0;
        return '<a class="nav-link' + (it.id === activeNav ? ' active' : '') + '" href="' + it.href + '"' + (it.id === activeNav ? ' aria-current="page"' : '') + '>' +
          UI.icon(it.icon) + '<span>' + UI.esc(it.label) + '</span>' +
          (count ? '<span class="nav-count">' + count + '</span>' : '') +
          (it.admin && !isAdmin ? '<span class="nav-lock" title="Read-only for your role">' + UI.icon('lock') + '</span>' : '') + '</a>';
      }).join('') + '</div>'
    ).join('');
  }

  function renderNotifications() {
    const user = Auth.currentUser();
    const list = Store.where('notifications', (n) => n.userId === user.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const unread = list.filter((n) => !n.read).length;
    const host = document.getElementById('notif-dropdown');
    const wasOpen = host.querySelector('.dropdown__menu') && !host.querySelector('.dropdown__menu').classList.contains('hidden');
    host.innerHTML = '<button class="btn btn-ghost btn-icon bell" id="bell" aria-label="Notifications (' + unread + ' unread)" aria-haspopup="true">' + UI.icon('bell') +
      (unread ? '<span class="bell__count">' + (unread > 99 ? '99+' : unread) + '</span>' : '') + '</button>' +
      '<div class="dropdown__menu' + (wasOpen ? '' : ' hidden') + '"><div class="dropdown__head"><strong>Notifications</strong>' +
      (unread ? '<button class="btn btn-ghost btn-sm" id="notif-read-all">Mark all as read</button>' : '') + '</div>' +
      '<div class="dropdown__list">' + (list.length ? list.slice(0, 30).map((n) =>
        '<div class="notif' + (n.read ? '' : ' unread') + '" data-id="' + n.id + '" data-request="' + UI.esc(n.requestId) + '"><span class="notif__dot"></span><div><div>' + UI.esc(n.message) + '</div><div class="muted small">' + UI.esc(UI.relTime(n.createdAt)) + '</div></div></div>'
      ).join('') : UI.empty('No notifications', 'You are all caught up.', '', 'bell')) + '</div></div>';
    host.querySelector('#bell').addEventListener('click', (e) => { e.stopPropagation(); closeMenus(host); host.querySelector('.dropdown__menu').classList.toggle('hidden'); });
    const all = host.querySelector('#notif-read-all');
    if (all) all.addEventListener('click', (e) => {
      e.stopPropagation();
      list.filter((n) => !n.read).forEach((n) => Store.update('notifications', n.id, { read: true }));
      renderNotifications();
    });
    host.querySelectorAll('.notif').forEach((el) => el.addEventListener('click', () => {
      Store.update('notifications', el.dataset.id, { read: true });
      host.querySelector('.dropdown__menu').classList.add('hidden');
      location.hash = App.requestLink(el.dataset.request);
      renderNotifications();
    }));
  }

  function renderUserSwitcher() {
    const user = Auth.currentUser();
    const host = document.getElementById('user-dropdown');
    const depts = Store.all('departments');
    const users = Store.where('users', (u) => u.active);
    const roleText = (u) => u.roles.map((r) => DRS.C.ROLES[r]).join(', ');
    host.innerHTML = '<button class="user-switch" id="user-switch" aria-haspopup="true" title="Demo user switcher – not authentication">' + UI.avatar(user) +
      '<span class="user-switch__text"><span class="user-switch__name">' + UI.esc(user.name) + ' <span class="demo-tag">DEMO</span></span><span class="user-switch__role">' + UI.esc(user.jobTitle) + '</span></span>' + UI.icon('down') + '</button>' +
      '<div class="dropdown__menu hidden" style="width:340px"><div class="dropdown__head"><div><strong>Switch demo user</strong><div class="muted small">Prototype role switcher – not production authentication.</div></div></div>' +
      '<div class="dropdown__list">' + depts.map((d) => {
        const members = users.filter((u) => u.departmentId === d.id);
        if (!members.length) return '';
        return '<div class="user-group-label">' + UI.esc(d.name) + '</div>' + members.map((u) =>
          '<div class="user-option' + (u.id === user.id ? ' current' : '') + '" data-user="' + u.id + '">' + UI.avatar(u, true) +
          '<div style="min-width:0"><div class="person__name">' + UI.esc(u.name) + '</div><div class="person__sub">' + UI.esc(u.jobTitle) + ' · ' + UI.esc(roleText(u)) + '</div></div></div>').join('');
      }).join('') + '</div></div>';
    host.querySelector('#user-switch').addEventListener('click', (e) => { e.stopPropagation(); closeMenus(host); host.querySelector('.dropdown__menu').classList.toggle('hidden'); });
    host.querySelectorAll('.user-option').forEach((el) => el.addEventListener('click', () => {
      try {
        const u = Auth.switchUser(el.dataset.user);
        host.querySelector('.dropdown__menu').classList.add('hidden');
        UI.toast('Now acting as ' + u.name, 'info', { text: u.jobTitle + ' – ' + roleText(u) });
        Router.clearGuard();
        App.reload();
      } catch (err) { UI.error(err); }
    }));
  }

  function closeMenus(except) {
    document.querySelectorAll('.dropdown').forEach((d) => {
      if (d !== except) { const m = d.querySelector('.dropdown__menu'); if (m) m.classList.add('hidden'); }
    });
  }

  function registerRoutes() {
    const r = (pattern, page, nav) => Router.add(pattern, (params) => App.show(page, params, nav));
    r('/dashboard', 'dashboard');
    r('/requests/new', 'createRequest', 'create');
    r('/requests/new/:templateId', 'createRequest', 'create');
    r('/requests/edit/:id', 'createRequest', 'my-requests');
    r('/requests/resubmit/:id', 'resubmit', 'my-requests');
    r('/my-requests', 'myRequests', 'my-requests');
    r('/approvals', 'approvals', 'approvals');
    r('/approvals/:id', 'approvalDetail', 'approvals');
    r('/tracking', 'trackingList', 'tracking');
    r('/tracking/:id', 'tracking', 'tracking');
    r('/history', 'history', 'history');
    r('/templates', 'templates', 'templates');
    r('/templates/new', 'templateEditor', 'templates');
    r('/templates/:id', 'templateEditor', 'templates');
    r('/checklists', 'checklists', 'checklists');
    r('/checklists/new', 'checklistEditor', 'checklists');
    r('/checklists/:id', 'checklistEditor', 'checklists');
    r('/organization', 'organization', 'organization');
    r('/organization/:tab', 'organization', 'organization');
    r('/settings', 'settings', 'settings');
  }

  function boot() {
    if (!Store.isSeeded() || !Store.count('users')) {
      try { DRS.Seed.run(); } catch (e) { console.error('Seeding failed', e); }
    }
    const menu = document.getElementById('menu-toggle');
    menu.innerHTML = UI.icon('menu');
    menu.addEventListener('click', () => document.getElementById('app').classList.toggle('nav-open'));
    document.getElementById('backdrop').addEventListener('click', () => document.getElementById('app').classList.remove('nav-open'));
    document.getElementById('topbar-new').insertAdjacentHTML('afterbegin', UI.icon('plus'));
    document.addEventListener('click', (e) => {
      closeMenus(null);
      const b = e.target.closest && e.target.closest('[data-act-as-approver]');
      if (b) { e.preventDefault(); e.stopPropagation(); try { App.actAsApprover(b.dataset.actAsApprover); } catch (err) { UI.error(err); } }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(null); });
    // keep tabs in sync if another tab changes the data
    global.addEventListener('storage', (e) => { if (e.key && e.key.indexOf(Store.PREFIX) === 0) location.reload(); });
    registerRoutes();
    Router.start();
  }

  DRS.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
