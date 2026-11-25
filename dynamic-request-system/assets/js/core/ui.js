/**
 * ui.js
 * Presentation helpers shared by all modules: escaping, icons, badges,
 * formatting, toasts, modals, confirm/prompt dialogs and empty states.
 */
(function (global) {
  'use strict';
  const DRS = (global.DRS = global.DRS || {});
  const { Store, C } = DRS;

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    template: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    checklist: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    'file-plus': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'x-circle': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    timeline: '<path d="M12 3v18"/><circle cx="12" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="18" r="2"/><path d="M14 6h6M4 12h6M14 18h6"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>',
    paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    skip: '<path d="m5 4 10 8-10 8V4zM19 5v14"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/>',
    archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>'
  };

  const AVATAR_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#db2777', '#d97706', '#059669', '#4f46e5', '#0891b2', '#be123c', '#65a30d'];

  const UI = {
    esc(value) {
      return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    icon(name, cls) {
      return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.info) + '</svg>';
    },

    // ---- lookups ----
    user(id) { return id ? Store.get('users', id) : null; },
    userName(id) { const u = UI.user(id); return u ? u.name : '—'; },
    dept(id) { return id ? Store.get('departments', id) : null; },
    deptName(id) {
      if (id === C.REQUESTER_DEPT) return "Requester's Department";
      const d = UI.dept(id); return d ? d.name : '—';
    },
    /** Assigned approvers of a stage instance. */
    stageApprovers(s) { return s && s.approverIds && s.approverIds.length ? s.approverIds : s && s.approverId ? [s.approverId] : []; },
    /** Approvers still expected to act on a Pending stage. */
    waitingApprovers(s) { return UI.stageApprovers(s).filter((id) => !(s.approvals || []).some((a) => a.userId === id)); },
    /** "Layla Hassan or Karim Saleh", "Layla Hassan ✓ + Karim Saleh", … */
    approverNames(s) {
      const ids = UI.stageApprovers(s);
      if (ids.length < 2) return UI.userName(ids[0]);
      const done = (id) => (s.approvals || []).some((a) => a.userId === id);
      return ids.map((id) => UI.userName(id) + (s.approvalRule === 'all' && done(id) ? ' ✓' : '')).join(s.approvalRule === 'all' ? ' + ' : s.approvalRule === 'none' ? ', ' : ' or ');
    },
    /** Small tag describing the approval rule (empty for a normal single approver). */
    ruleTag(s) {
      const ids = UI.stageApprovers(s);
      if (s.approvalRule === 'none') return '<span class="tag">No approval needed</span>';
      if (ids.length < 2) return '';
      if (s.approvalRule === 'all') return '<span class="tag tag--warn">All must approve · ' + (s.approvals || []).length + '/' + ids.length + '</span>';
      return '<span class="tag">Any one approves</span>';
    },
    checklistName(id) { const c = id && Store.get('checklistTemplates', id); return c ? c.name : null; },

    // ---- formatting ----
    fmtDate(iso, withTime) {
      if (!iso) return '—';
      const d = new Date(iso); if (isNaN(d)) return '—';
      const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      return withTime ? date + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : date;
    },
    relTime(iso) {
      if (!iso) return '';
      const diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
      if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
      if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' d ago';
      return UI.fmtDate(iso);
    },
    fmtSize(bytes) {
      if (!bytes) return '0 KB';
      if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    },
    initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join(''); },
    avatar(user, small) {
      if (!user) return '<span class="avatar' + (small ? ' avatar--sm' : '') + '" style="background:#94a3b8">?</span>';
      let h = 0; for (let i = 0; i < user.id.length; i++) h = (h * 31 + user.id.charCodeAt(i)) >>> 0;
      return '<span class="avatar' + (small ? ' avatar--sm' : '') + '" style="background:' + AVATAR_COLORS[h % AVATAR_COLORS.length] + '">' + UI.esc(UI.initials(user.name)) + '</span>';
    },
    person(userId, sub) {
      const u = UI.user(userId);
      return '<span class="person">' + UI.avatar(u, true) + '<span><span class="person__name">' + UI.esc(u ? u.name : '—') + '</span>' +
        (sub !== false ? '<span class="person__sub">' + UI.esc(sub || (u ? u.jobTitle : '')) + '</span>' : '') + '</span></span>';
    },

    // ---- status badges ----
    requestTone(status) {
      return ({ Draft: 'gray', 'Pending Approval': 'orange', 'In Progress': 'blue', 'Returned for Correction': 'purple', Rejected: 'red', Approved: 'green', Completed: 'teal' })[status] || 'gray';
    },
    stageTone(status) {
      return ({ Waiting: 'gray', Pending: 'orange', Approved: 'green', Completed: 'teal', Rejected: 'red', Returned: 'purple', Skipped: 'gray' })[status] || 'gray';
    },
    statusBadge(status) { return '<span class="badge badge--' + UI.requestTone(status) + '">' + UI.esc(status) + '</span>'; },
    stageBadge(status) { return '<span class="badge badge--' + UI.stageTone(status) + '">' + UI.esc(status) + '</span>'; },
    templateBadge(status) {
      return '<span class="badge badge--' + ({ Active: 'green', Inactive: 'gray', Archived: 'navy' })[status] + '">' + UI.esc(status) + '</span>';
    },
    priorityBadge(p) {
      const tone = ({ Low: 'gray', Normal: 'blue', High: 'orange', Urgent: 'red' })[p] || 'gray';
      return '<span class="badge badge--plain badge--' + tone + '">' + UI.esc(p || 'Normal') + '</span>';
    },
    stepsBar(stages) {
      if (!stages || !stages.length) return '<span class="muted small">Not submitted</span>';
      const done = stages.filter((s) => s.status === 'Approved' || s.status === 'Skipped').length;
      return '<div class="steps" title="' + done + ' of ' + stages.length + ' stages completed">' + stages.map((s) => '<span class="s-' + s.status + '"></span>').join('') + '</div>' +
        '<div class="steps-label">' + done + ' / ' + stages.length + ' stages</div>';
    },

    // ---- feedback ----
    toast(message, type, opts) {
      type = type || 'success';
      const root = document.getElementById('toast-root');
      if (!root) return;
      const el = document.createElement('div');
      el.className = 'toast toast--' + type;
      el.setAttribute('role', type === 'error' ? 'alert' : 'status');
      const iconName = { success: 'check-circle', error: 'x-circle', warning: 'alert', info: 'info' }[type];
      const details = opts && opts.details && opts.details.length ? '<ul>' + opts.details.slice(0, 6).map((d) => '<li>' + UI.esc(d) + '</li>').join('') + '</ul>' : '';
      el.innerHTML = UI.icon(iconName) + '<div><strong>' + UI.esc(message) + '</strong>' + (opts && opts.text ? UI.esc(opts.text) : '') + details + '</div>';
      root.appendChild(el);
      const ttl = (opts && opts.timeout) || (type === 'error' ? 6500 : 3800);
      setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 220); }, ttl);
    },
    /** Shows a BusinessError (with its details) or any other error as a toast. */
    error(err) {
      console[err && err.name === 'BusinessError' ? 'info' : 'error'](err);
      const details = err && err.details && err.details.length > 1 ? err.details : null;
      UI.toast((err && err.message) || 'Something went wrong.', 'error', { details });
    },
    /** Runs an action with a short loading state on the button (feedback for async backend later). */
    busy(button, fn) {
      if (button) { button.classList.add('is-loading'); button.disabled = true; }
      return new Promise((resolve) => {
        setTimeout(() => {
          try { resolve(fn()); }
          catch (e) { UI.error(e); resolve(undefined); }
          finally { if (button && button.isConnected) { button.classList.remove('is-loading'); button.disabled = false; } }
        }, 280);
      });
    },

    // ---- modals ----
    modal(opts) {
      const root = document.getElementById('modal-root');
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = '<div class="modal ' + (opts.size ? 'modal--' + opts.size : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
        '<div class="modal__header"><h2 id="modal-title">' + UI.esc(opts.title) + '</h2><button class="btn btn-ghost btn-icon" data-close aria-label="Close">' + UI.icon('x') + '</button></div>' +
        '<div class="modal__body">' + (opts.body || '') + '</div>' +
        (opts.actions && opts.actions.length ? '<div class="modal__footer">' + opts.actions.map((a, i) => '<button class="btn ' + (a.cls || '') + '" data-action-idx="' + i + '">' + (a.icon ? UI.icon(a.icon) : '') + UI.esc(a.label) + '</button>').join('') + '</div>' : '') +
        '</div>';
      const prevFocus = document.activeElement;
      const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        if (opts.onClose) opts.onClose();
        if (prevFocus && prevFocus.focus) prevFocus.focus();
      };
      const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === overlay) close(); };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && opts.dismissible !== false) close(); });
      overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
      overlay.querySelectorAll('[data-action-idx]').forEach((b) => b.addEventListener('click', () => {
        const action = opts.actions[Number(b.dataset.actionIdx)];
        if (!action.onClick) return close();
        try {
          const keep = action.onClick(close, overlay, b);
          if (keep !== false) close();
        } catch (e) { UI.error(e); }
      }));
      root.appendChild(overlay);
      const first = overlay.querySelector('.modal__body input, .modal__body select, .modal__body textarea') || overlay.querySelector('[data-action-idx]');
      if (first) setTimeout(() => first.focus(), 30);
      if (opts.onOpen) opts.onOpen(overlay, close);
      return { el: overlay, close };
    },
    confirm(opts) {
      return new Promise((resolve) => {
        let answered = false;
        UI.modal({
          title: opts.title || 'Please confirm', size: 'sm',
          body: '<p>' + UI.esc(opts.message) + '</p>' + (opts.note ? '<p class="muted small">' + UI.esc(opts.note) + '</p>' : ''),
          actions: [
            { label: 'Cancel', cls: 'btn-ghost', onClick: () => { answered = true; resolve(false); } },
            { label: opts.confirmLabel || 'Confirm', cls: opts.danger ? 'btn-danger' : 'btn-primary', onClick: () => { answered = true; resolve(true); } }
          ],
          onClose: () => { if (!answered) resolve(false); }
        });
      });
    },
    /** Comment dialog. Resolves with text, or null when cancelled. */
    prompt(opts) {
      return new Promise((resolve) => {
        let answered = false;
        UI.modal({
          title: opts.title, size: 'sm',
          body: (opts.message ? '<p>' + UI.esc(opts.message) + '</p>' : '') +
            '<div class="field"><label for="prompt-input">' + UI.esc(opts.label || 'Comment') + (opts.required ? ' <span class="req">*</span>' : '') + '</label>' +
            '<textarea id="prompt-input" class="textarea" maxlength="2000" placeholder="' + UI.esc(opts.placeholder || '') + '">' + UI.esc(opts.value || '') + '</textarea>' +
            '<span class="error-text hidden" id="prompt-error">' + UI.esc(opts.requiredMessage || 'A comment is required.') + '</span></div>',
          actions: [
            { label: 'Cancel', cls: 'btn-ghost', onClick: () => { answered = true; resolve(null); } },
            {
              label: opts.confirmLabel || 'Confirm', cls: opts.danger ? 'btn-danger' : 'btn-primary', onClick: (close, el) => {
                const v = el.querySelector('#prompt-input').value.trim();
                if (opts.required && !v) {
                  el.querySelector('#prompt-input').classList.add('is-invalid');
                  el.querySelector('#prompt-error').classList.remove('hidden');
                  return false;
                }
                answered = true; resolve(v); return true;
              }
            }
          ],
          onClose: () => { if (!answered) resolve(null); }
        });
      });
    },

    empty(title, text, action, iconName) {
      return '<div class="empty"><div class="empty__icon">' + UI.icon(iconName || 'inbox') + '</div><h3>' + UI.esc(title) + '</h3>' +
        (text ? '<p>' + UI.esc(text) + '</p>' : '') + (action || '') + '</div>';
    },
    alert(type, title, items) {
      const iconName = { info: 'info', warn: 'alert', error: 'x-circle', success: 'check-circle', neutral: 'info' }[type];
      return '<div class="alert alert--' + type + '">' + UI.icon(iconName) + '<div>' + (title ? '<strong>' + UI.esc(title) + '</strong>' : '') +
        (items && items.length ? '<ul>' + items.map((i) => '<li>' + UI.esc(i) + '</li>').join('') + '</ul>' : '') + '</div></div>';
    },
    adminOnlyBanner() {
      return UI.alert('warn', 'Read-only view. Only System Administrators can modify system configuration. Use the demo user switcher to act as Sara Ibrahim (System Administrator).');
    },
    options(list, selected, placeholder) {
      return (placeholder !== undefined ? '<option value="">' + UI.esc(placeholder) + '</option>' : '') +
        list.map((o) => '<option value="' + UI.esc(o.value) + '"' + (String(o.value) === String(selected) ? ' selected' : '') + (o.disabled ? ' disabled' : '') + '>' + UI.esc(o.label) + '</option>').join('');
    },
    setBreadcrumbs(items) {
      const el = document.getElementById('breadcrumbs');
      if (!el) return;
      el.innerHTML = items.map((it, i) => {
        const last = i === items.length - 1;
        const mid = i > 0 && !last ? ' crumb-mid' : '';
        const html = last ? '<span class="current">' + UI.esc(it.label) + '</span>' : (it.href ? '<a class="' + mid + '" href="' + it.href + '">' + UI.esc(it.label) + '</a>' : '<span class="' + mid + '">' + UI.esc(it.label) + '</span>');
        return html + (last ? '' : '<span class="sep' + mid + '">/</span>');
      }).join('');
    },
    downloadJSON(filename, data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  };

  DRS.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
