/**
 * history.js – Workflow History: system-wide audit log of workflow events.
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;
  const { Store, Auth, UI, C, Router } = DRS;
  DRS.Pages = DRS.Pages || {};
  const esc = UI.esc;

  DRS.Pages.history = {
    render(el) {
      UI.setBreadcrumbs([{ label: 'Requests' }, { label: 'Workflow History' }]);
      const user = Auth.currentUser();
      const visible = new Set(Auth.visibleRequests(user).map((r) => r.id));
      const all = Store.where('history', (h) => visible.has(h.requestId)).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      const f = { q: Router.query().request || '', event: '', actor: '', from: '', to: '' };
      const actors = Array.from(new Set(all.map((h) => h.actorName))).sort();
      const PAGE = 50; let page = 1;
      el.innerHTML = `<div class="page-header"><div><h1>Workflow History</h1><p>Audit trail of every workflow event: creation, submission, stage activation, checklist completion, approvals, returns, resubmissions, rejections and execution.</p></div>
        <div class="page-header__actions"><button class="btn" id="csv">${UI.icon('download')}Export CSV</button></div></div>
        <div class="card"><div class="card__header"><div class="toolbar">
          <div class="search">${UI.icon('search')}<input class="input" id="h-q" placeholder="Request ID or text…" value="${esc(f.q)}" style="width:220px" aria-label="Search history"></div>
          <select class="select" id="h-event" style="width:200px" aria-label="Event type">${UI.options(Object.values(C.EVENTS).map((e) => ({ value: e, label: e })), '', 'All events')}</select>
          <select class="select" id="h-actor" style="width:180px" aria-label="Actor">${UI.options(actors.map((a) => ({ value: a, label: a })), '', 'All actors')}</select>
          <input class="input" type="date" id="h-from" style="width:150px" aria-label="From date"><input class="input" type="date" id="h-to" style="width:150px" aria-label="To date">
        </div></div><div class="card__body card__body--flush table-wrap" id="h-table"></div></div>`;
      const filtered = () => all.filter((h) =>
        (!f.q || (h.requestId + ' ' + h.description).toLowerCase().includes(f.q.toLowerCase())) &&
        (!f.event || h.event === f.event) && (!f.actor || h.actorName === f.actor) &&
        (!f.from || h.timestamp.slice(0, 10) >= f.from) && (!f.to || h.timestamp.slice(0, 10) <= f.to));
      const draw = () => {
        const list = filtered();
        const shown = list.slice(0, page * PAGE);
        const st = DRS.Pages._eventStyle || {};
        el.querySelector('#h-table').innerHTML = list.length ? `<table class="table"><thead><tr><th>Timestamp</th><th>Request</th><th>Event</th><th class="hide-sm">Actor</th><th>Description</th></tr></thead><tbody>
          ${shown.map((h) => `<tr><td class="nowrap small">${esc(UI.fmtDate(h.timestamp, true))}</td><td><a class="req-id" href="#/tracking/${esc(h.requestId)}">${esc(h.requestId)}</a></td>
            <td class="nowrap"><span class="kpi__icon ${(st[h.event] || ['tone-gray'])[0]}" style="width:22px;height:22px;display:inline-grid;vertical-align:middle;border-radius:5px">${UI.icon((st[h.event] || [0, 'info'])[1]).replace('<svg', '<svg style="width:12px;height:12px"')}</span> ${esc(h.event)}</td>
            <td class="hide-sm nowrap">${esc(h.actorName)}</td><td style="min-width:260px">${esc(h.description)}</td></tr>`).join('')}</tbody></table>
          <div class="card__footer" style="justify-content:space-between"><span class="muted small">Showing ${shown.length} of ${list.length} events</span>${shown.length < list.length ? '<button class="btn btn-sm" id="more">Load more</button>' : ''}</div>`
          : UI.empty('No events match', 'Adjust the filters.', '', 'history');
        const more = el.querySelector('#more'); if (more) more.addEventListener('click', () => { page++; draw(); });
      };
      draw();
      const on = (id, key, evt) => el.querySelector(id).addEventListener(evt || 'change', (e) => { f[key] = e.target.value; page = 1; draw(); });
      on('#h-q', 'q', 'input'); on('#h-event', 'event'); on('#h-actor', 'actor'); on('#h-from', 'from'); on('#h-to', 'to');
      el.querySelector('#csv').addEventListener('click', () => {
        const rows = [['Timestamp', 'Request', 'Event', 'Actor', 'Description']].concat(filtered().map((h) => [h.timestamp, h.requestId, h.event, h.actorName, h.description]));
        const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'workflow-history.csv';
        document.body.appendChild(a); a.click(); a.remove();
        UI.toast('Exported ' + (rows.length - 1) + ' events', 'success');
      });
    }
  };
})(window);
