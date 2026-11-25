/**
 * scenarios.js
 * Business-scenario tests for the workflow engine and configuration services.
 * Runs in the browser (tests/test-runner.html) and in Node (tests/run-node.js).
 * Each run re-seeds the demo data first.
 */
(function (global) {
  'use strict';
  const DRS = global.DRS;

  function makeSuite() {
    const results = [];
    let current = '';
    const suite = {
      scenario(name, fn) {
        current = name;
        try { fn(); } catch (e) { results.push({ scenario: current, check: 'Unexpected error', passed: false, detail: e.message + (e.details && e.details.length ? ' | ' + e.details.join(' | ') : '') }); }
      },
      ok(cond, check, detail) { results.push({ scenario: current, check, passed: !!cond, detail: cond ? '' : (detail || '') }); },
      eq(actual, expected, check) {
        const a = JSON.stringify(actual); const e = JSON.stringify(expected);
        results.push({ scenario: current, check, passed: a === e, detail: a === e ? '' : 'expected ' + e + ', got ' + a });
      },
      throws(fn, check, pattern) {
        try { fn(); results.push({ scenario: current, check, passed: false, detail: 'expected an error, none thrown' }); }
        catch (e) {
          const msg = e.message + ' ' + (e.details || []).join(' ');
          const ok = !pattern || pattern.test(msg);
          results.push({ scenario: current, check, passed: ok, detail: ok ? 'Blocked: ' + e.message : 'wrong error: ' + msg });
        }
      },
      results
    };
    return suite;
  }

  function run() {
    const { Store, TemplateService: TSvc, WorkflowEngine: WE, C } = DRS;
    DRS.Seed.run();
    const t = makeSuite();
    const ADMIN = 'u-sara';
    const stagesOf = (id) => WE.getStages(id);
    const statuses = (id) => stagesOf(id).map((s) => s.status);

    // Generic checklists A/B/C for the spec example
    const mk = (name, items) => TSvc.saveChecklist({ name, departmentId: 'dep-ops', items, active: true }, ADMIN).checklist;
    const clA = mk('Checklist A', [{ label: 'Requirement confirmed?', type: 'yesno', required: true }, { label: 'Remarks', type: 'text', required: false }]);
    const clB = mk('Checklist B', [{ label: 'Quantity', type: 'number', required: true }]);
    const clC = mk('Checklist C', [{ label: 'Final sign-off date', type: 'date', required: true }]);
    const stage = (name, dept, cl, level, user, role) => ({ stageName: name, departmentId: dept, checklistTemplateId: cl, approvalLevel: level, approverMode: 'user', approverUserId: user, approverRole: role, mandatory: true, status: 'Active' });
    const STAGES = [
      stage('Operations – Checklist A', 'dep-ops', clA.id, 1, 'u-layla', 'Operations Manager'),
      stage('Operations – Checklist B', 'dep-ops', clB.id, 2, 'u-karim', 'Operations Assistant Manager'),
      stage('Finance – Checklist A', 'dep-fin', clA.id, 3, 'u-rania', 'Finance Manager'),
      stage('Operations – Checklist C', 'dep-ops', clC.id, 4, 'u-khaled', 'Operations Director')
    ];
    let tpl;
    const input = (subject) => ({ templateId: tpl.id, subject, details: 'Scenario test request.', priority: 'Normal', attachments: [] });

    t.scenario('1 – Repeated Department', () => {
      t.throws(() => TSvc.save({ name: 'Scenario Template', requestType: 'Operations', ownerDepartmentId: 'dep-ops', concernedDepartmentIds: ['dep-ops', 'dep-fin', 'dep-ops'], status: 'Active', stages: STAGES }, ADMIN),
        'Duplicate Concerned Department is rejected', /more than once/);
      const res = TSvc.save({ name: 'Scenario Template', requestType: 'Operations', description: 'Scenario 1', ownerDepartmentId: 'dep-ops', concernedDepartmentIds: ['dep-ops', 'dep-fin'], status: 'Active', stages: STAGES }, ADMIN);
      tpl = res.template;
      t.ok(res.versionCreated, 'Saving an active template creates workflow version v1');
      t.eq(tpl.concernedDepartmentIds, ['dep-ops', 'dep-fin'], 'Concerned Departments = Operations, Finance (each once)');
      t.eq(tpl.stages.length, 4, '4 Checklist Stage records configured');
      t.eq(tpl.stages.filter((s) => s.departmentId === 'dep-ops').length, 3, 'Operations appears in 3 stages without validation error');
      const r = WE.submit(input('Scenario 1 – repeated department'), 'u-ahmed');
      const st = stagesOf(r.id);
      t.eq(st.length, 4, 'Submission creates 4 independent stage instances (not 2 = unique departments)');
      t.eq(new Set(st.map((s) => s.id)).size, 4, 'Every stage instance has its own id');
      t.eq(st.map((s) => s.approverId), ['u-layla', 'u-karim', 'u-rania', 'u-khaled'], 'Each stage keeps its own approver');
      t.eq(st.map((s) => s.approvalLevel), [1, 2, 3, 4], 'Each stage keeps its own approval level');
      t.eq(statuses(r.id), ['Pending', 'Waiting', 'Waiting', 'Waiting'], 'First stage Pending, others Waiting');
      ['u-layla', 'u-karim', 'u-rania', 'u-khaled'].forEach((u, i) => {
        const cur = WE.currentStage(r.id);
        t.eq(cur.order, i + 1, 'Stage ' + (i + 1) + ' is the active stage in configured order');
        const ans = {}; cur.items.forEach((it) => { ans[it.id] = it.type === 'yesno' ? 'Yes' : it.type === 'number' ? '3' : it.type === 'date' ? '2026-12-01' : 'ok'; });
        WE.approve(r.id, cur.id, u, { answers: ans });
      });
      t.eq(Store.get('requests', r.id).status, 'Approved', 'Request Approved after all 4 stages');
      t.eq(Store.get('requests', r.id).executionTasks.map((x) => x.departmentId), ['dep-ops', 'dep-fin'], 'Execution tasks created once per Concerned Department');
    });

    t.scenario('2 – Sequential Approval', () => {
      const r = WE.submit(input('Scenario 2 – sequential'), 'u-ahmed');
      const [s1, s2, s3] = stagesOf(r.id);
      t.throws(() => WE.approve(r.id, s3.id, 'u-rania', {}), 'Stage 3 approver cannot approve before their turn', /Waiting/);
      t.throws(() => WE.approve(r.id, s2.id, 'u-karim', {}), 'Stage 2 approver cannot approve while Stage 1 is active', /Waiting/);
      t.throws(() => WE.approve(r.id, s1.id, 'u-karim', { answers: {} }), 'Non-assigned user cannot approve Stage 1', /Only the assigned approver/);
      t.throws(() => WE.approve(r.id, s1.id, 'u-layla', { answers: {} }), 'Mandatory checklist items are required before approval', /mandatory/);
      WE.approve(r.id, s1.id, 'u-layla', { answers: { [s1.items[0].id]: 'Yes' } });
      t.eq(statuses(r.id), ['Approved', 'Pending', 'Waiting', 'Waiting'], 'After Stage 1: Stage 2 Pending, 3 and 4 Waiting');
      t.eq(Store.get('requests', r.id).status, 'In Progress', 'Request status In Progress');
      t.throws(() => WE.approve(r.id, s3.id, 'u-rania', {}), 'Stage 3 still cannot be approved early', /Waiting/);
      t.throws(() => WE.approve(r.id, s1.id, 'u-layla', {}), 'An approved stage cannot be approved again', /not the active stage/);
      t.ok(Store.count('decisions', (d) => d.requestId === r.id) === 1, 'Only the valid decision was recorded');
      const dec = WE.getDecisions(r.id)[0];
      t.ok(dec.actorId === 'u-layla' && dec.timestamp && dec.action === 'Approved', 'Decision stores approver identity, timestamp and action');
    });

    t.scenario('3 – Rejection', () => {
      const r = WE.submit(input('Scenario 3 – rejection'), 'u-ahmed');
      const [s1, s2, s3, s4] = stagesOf(r.id);
      WE.approve(r.id, s1.id, 'u-layla', { answers: { [s1.items[0].id]: 'Yes' } });
      t.throws(() => WE.reject(r.id, s2.id, 'u-karim', { comment: '  ' }), 'Rejection without comment is blocked', /requires a comment/);
      WE.reject(r.id, s2.id, 'u-karim', { comment: 'Quantity not justified.' });
      t.eq(Store.get('requests', r.id).status, 'Rejected', 'Request becomes Rejected');
      t.eq(statuses(r.id), ['Approved', 'Rejected', 'Waiting', 'Waiting'], 'Future stages never activated');
      t.throws(() => WE.approve(r.id, s3.id, 'u-rania', {}), 'Stage 3 cannot be processed after rejection', /Rejected/);
      t.throws(() => WE.approve(r.id, s4.id, 'u-khaled', {}), 'Stage 4 cannot be processed after rejection', /Rejected/);
      t.throws(() => WE.returnForCorrection(r.id, s2.id, 'u-karim', { comment: 'x' }), 'Rejected stage cannot be returned afterwards', /Rejected/);
      t.ok(WE.getHistory(r.id).some((h) => h.event === 'Request Rejected' && h.actorId === 'u-karim'), 'Rejection recorded in workflow history');
    });

    t.scenario('4 – Workflow Versioning', () => {
      const before = Store.get('requestTemplates', tpl.id);
      const rA = WE.submit(input('Scenario 4 – before change'), 'u-ahmed');
      const res = TSvc.save(Object.assign({}, before, { stages: before.stages.concat([stage('Procurement Review', 'dep-prc', null, 5, 'u-tarek', 'Procurement Manager')]) }), ADMIN, 'Added procurement review');
      t.ok(res.versionCreated, 'Changing the workflow creates a new version');
      t.eq(res.template.versionNumber, before.versionNumber + 1, 'Template version incremented');
      const rB = WE.submit(input('Scenario 4 – after change'), 'u-ahmed');
      t.eq(Store.get('requests', rA.id).versionNumber, before.versionNumber, 'First request keeps original version');
      t.eq(stagesOf(rA.id).length, 4, 'First request still has 4 stages');
      t.eq(Store.get('requests', rB.id).versionNumber, before.versionNumber + 1, 'Second request uses updated version');
      t.eq(stagesOf(rB.id).length, 5, 'Second request has 5 stages');
      const itemsBefore = JSON.stringify(stagesOf(rA.id)[0].items);
      TSvc.saveChecklist(Object.assign({}, Store.get('checklistTemplates', clA.id), { items: Store.get('checklistTemplates', clA.id).items.concat([{ label: 'New question', type: 'text', required: false }]) }), ADMIN);
      t.eq(JSON.stringify(stagesOf(rA.id)[0].items), itemsBefore, 'Editing a checklist does not alter submitted requests');
      t.eq(Store.get('requestTemplates', tpl.id).versionNumber, before.versionNumber + 2, 'Checklist edit republishes dependent template as a new version');
      const noChange = TSvc.save(Store.get('requestTemplates', tpl.id), ADMIN);
      t.ok(!noChange.versionCreated, 'Saving without workflow changes does not create a version');
    });

    t.scenario('5 – Checklist Independence', () => {
      // Use a request on the 4-stage version created in scenario 4 (rA style): submit fresh one on current version
      const r = WE.submit(input('Scenario 5 – checklist independence'), 'u-ahmed');
      const st = stagesOf(r.id);
      t.eq(st[0].checklistTemplateId, st[2].checklistTemplateId, 'Stage 1 and Stage 3 use the same Checklist Template');
      const q = st[0].items[0].id;
      WE.approve(r.id, st[0].id, 'u-layla', { answers: { [q]: 'Yes', [st[0].items[1].id]: 'Operations view' } });
      WE.approve(r.id, st[1].id, 'u-karim', { answers: { [st[1].items[0].id]: '7' } });
      WE.saveAnswers(r.id, st[2].id, { [q]: 'No', [st[0].items[1].id]: 'Finance view' }, 'u-rania');
      const after = stagesOf(r.id);
      t.eq(after[0].answers[q], 'Yes', 'Stage 1 answer preserved (Yes)');
      t.eq(after[2].answers[q], 'No', 'Stage 3 answer independent (No)');
      t.eq(after[0].answers[st[0].items[1].id], 'Operations view', 'Stage 1 remarks not overwritten');
      t.throws(() => WE.saveAnswers(r.id, st[3].id, { x: 1 }, 'u-khaled'), 'Waiting stage checklist cannot be edited', /Waiting/);
    });

    t.scenario('6 – Return for Correction', () => {
      Store.saveSettings({ returnBehavior: 'resume' });
      const r = WE.submit(input('Scenario 6 – return'), 'u-ahmed');
      const st = stagesOf(r.id);
      WE.approve(r.id, st[0].id, 'u-layla', { answers: { [st[0].items[0].id]: 'Yes' } });
      t.throws(() => WE.returnForCorrection(r.id, st[1].id, 'u-karim', { comment: '' }), 'Return without comment is blocked', /requires a comment/);
      WE.returnForCorrection(r.id, st[1].id, 'u-karim', { comment: 'Please add quantities per site.' });
      const ret = Store.get('requests', r.id);
      t.eq(ret.status, 'Returned for Correction', 'Request status Returned for Correction');
      t.ok(ret.returnInfo && ret.returnInfo.comment === 'Please add quantities per site.', 'Requester can see the correction comment');
      t.throws(() => WE.approve(r.id, st[1].id, 'u-karim', {}), 'Returned request cannot be approved', /Returned/);
      t.throws(() => WE.resubmit(r.id, 'u-karim', {}), 'Only the requester can resubmit', /Only the requester/);
      WE.resubmit(r.id, 'u-ahmed', { details: 'Site A: 2 units, Site B: 2 units.' });
      const after = Store.get('requests', r.id);
      t.eq(after.status, 'In Progress', 'Resubmitted request resumes (In Progress)');
      t.eq(statuses(r.id), ['Approved', 'Pending', 'Waiting', 'Waiting', 'Waiting'], 'Resume behaviour: returning stage re-activated, Stage 1 approval kept (5-stage v3 workflow)');
      t.eq(stagesOf(r.id)[1].cycle, 2, 'Returning stage starts review cycle 2');
      t.ok(WE.getDecisions(r.id).some((d) => d.action === 'Returned' && d.actorId === 'u-karim'), 'Previous Return decision kept in decision log');
      const ev = WE.getHistory(r.id).map((h) => h.event);
      t.ok(ev.includes('Request Returned') && ev.includes('Request Resubmitted'), 'History contains Returned and Resubmitted events');
      t.eq(after.versionNumber, ret.versionNumber, 'Original workflow version retained after resubmission');

      Store.saveSettings({ returnBehavior: 'restart' });
      const r2 = WE.submit(input('Scenario 6b – restart'), 'u-ahmed');
      const s2 = stagesOf(r2.id);
      WE.approve(r2.id, s2[0].id, 'u-layla', { answers: { [s2[0].items[0].id]: 'Yes' } });
      WE.returnForCorrection(r2.id, s2[1].id, 'u-karim', { comment: 'Restart please.' });
      WE.resubmit(r2.id, 'u-ahmed', {});
      t.eq(statuses(r2.id), ['Pending', 'Waiting', 'Waiting', 'Waiting', 'Waiting'], 'Restart behaviour: workflow restarts at Stage 1');
      t.eq(stagesOf(r2.id)[0].cycles.length, 1, 'Stage 1 keeps its earlier approval in its cycle history');
      Store.saveSettings({ returnBehavior: 'resume' });
    });

    t.scenario('7 – Existing PRD rules', () => {
      // Self-approval: Karim is the Stage 2 approver; his own request escalates Stage 2 to his manager
      const rk = WE.submit(input('Self-approval check'), 'u-karim');
      const sk = stagesOf(rk.id)[1];
      t.eq(sk.approverId, 'u-layla', 'Self-approval avoided: Stage 2 reassigned to requester\'s manager');
      // Subordinate: Layla's request -> Karim (her subordinate) must not approve
      const rl = WE.submit(input('Subordinate check'), 'u-layla');
      const sl = stagesOf(rl.id);
      t.ok(sl[0].approverId !== 'u-layla' && sl[1].approverId !== 'u-karim', 'Self (Stage 1) and subordinate (Stage 2) approvers escalated');
      t.eq(sl[1].approverId, 'u-khaled', 'Escalated to the requester\'s manager');
      // Mandatory hierarchy
      const nonAdmin = Store.all('requestTemplates').find((x) => x.name === 'Non-Admin Procurement Request');
      t.throws(() => TSvc.save(Object.assign({}, nonAdmin, { stages: nonAdmin.stages.filter((s) => s.hierarchyKey !== 'dept_manager') }), ADMIN), 'Mandatory hierarchy stage cannot be removed', /missing/);
      const reordered = nonAdmin.stages.slice(); const tmp = reordered[0]; reordered[0] = reordered[1]; reordered[1] = tmp;
      t.throws(() => TSvc.save(Object.assign({}, nonAdmin, { stages: reordered }), ADMIN), 'Mandatory hierarchy order cannot change', /order/);
      const rn = WE.submit({ templateId: nonAdmin.id, subject: 'Hierarchy check', details: 'x', priority: 'Normal' }, 'u-ahmed');
      t.eq(stagesOf(rn.id).filter((s) => s.hierarchyKey).map((s) => s.approverId), ['u-yousef', 'u-layla', 'u-tarek'], 'Non-Admin hierarchy: Supervisor → Manager → Procurement Manager');
      const adminT = Store.all('requestTemplates').find((x) => x.name === 'Admin Procurement Request');
      const ra = WE.submit({ templateId: adminT.id, subject: 'Admin hierarchy check', details: 'x', priority: 'Normal' }, 'u-salma');
      t.eq(stagesOf(ra.id).filter((s) => s.hierarchyKey).map((s) => s.approverId), ['u-rana', 'u-tarek', 'u-mona'], 'Admin hierarchy: Line Manager → Procurement Manager → HR Manager');
      // Template status rules
      const inactive = Store.all('requestTemplates').find((x) => x.status === 'Inactive');
      t.throws(() => WE.submit({ templateId: inactive.id, subject: 'Inactive test', details: 'x' }, 'u-ahmed'), 'Inactive template cannot receive requests', /inactive/);
      const archived = Store.all('requestTemplates').find((x) => x.status === 'Archived');
      t.throws(() => WE.submit({ templateId: archived.id, subject: 'Archived test', details: 'x' }, 'u-ahmed'), 'Archived legacy type cannot receive requests', /archived/);
      t.throws(() => TSvc.save(Object.assign({}, tpl, { name: 'Hacked' }), 'u-ahmed'), 'Only administrators can modify configuration', /Only System Administrators/);
      t.throws(() => TSvc.save(Object.assign({}, Store.get('requestTemplates', tpl.id), { concernedDepartmentIds: [] }), ADMIN), 'Active template needs a Concerned Department', /at least one Concerned/);
      t.throws(() => TSvc.remove(tpl.id, ADMIN), 'Template with requests cannot be deleted', /Historical requests/);
      // Execution completion
      const approved = Store.all('requests').find((x) => x.status === 'Approved');
      const pendingTask = approved.executionTasks.find((x) => x.status !== 'Done');
      t.throws(() => WE.completeExecution(approved.id, pendingTask.departmentId, 'u-ahmed', ''), 'Non-execution user cannot complete execution', /Execution Team/);
    });

    t.scenario('8 – Checklist points (Need Attached, Link to Action, Need Approval First)', () => {
      t.throws(() => TSvc.saveChecklist({ name: 'No dept', items: [{ label: 'x', type: 'yesno' }] }, ADMIN), 'Checklist must belong to a department', /Department is required/);
      const pts = TSvc.saveChecklist({ name: 'Points Test', departmentId: 'dep-ops', estimatedHours: 3, items: [
        { label: 'Site safe?', type: 'yesno', required: true, linkToAction: true },
        { label: 'Photo of site', type: 'text', required: false, needAttachment: true }
      ] }, ADMIN).checklist;
      const exec = TSvc.saveChecklist({ name: 'Execution Only', departmentId: 'dep-ops', requiresApproval: false, items: [{ label: 'Done?', type: 'yesno', required: true }] }, ADMIN).checklist;
      const base = TSvc.save({ name: 'Points Cycle', requestType: 'Operations', ownerDepartmentId: 'dep-ops', concernedDepartmentIds: ['dep-ops'], status: 'Active',
        stages: [stage('Ops points', 'dep-ops', pts.id, 1, 'u-layla', 'Operations Manager')] }, ADMIN).template;
      // Link the same department again through "link to approval cycle" (repeat allowed)
      let res = TSvc.linkChecklist(exec.id, base.id, { approverMode: 'user', approverUserId: 'u-karim', approverRole: 'Operations Assistant Manager' }, ADMIN);
      res = TSvc.linkChecklist(pts.id, res.template.id, { approverMode: 'user', approverUserId: 'u-khaled', approverRole: 'Operations Director' }, ADMIN);
      t.eq(res.template.stages.map((s) => s.departmentId), ['dep-ops', 'dep-ops', 'dep-ops'], 'Same department linked 3 times as separate stages');
      t.eq(res.template.versionNumber, 3, 'Each link publishes a new workflow version');
      const r = WE.submit({ templateId: base.id, subject: 'Points scenario', details: 'x' }, 'u-ahmed');
      const st = stagesOf(r.id);
      t.eq(st[0].estimatedHours, 3, 'Estimation time copied to the stage instance');
      const [q1, q2] = st[0].items.map((i) => i.id);
      t.throws(() => WE.approve(r.id, st[0].id, 'u-layla', { answers: { [q1]: 'No' } }), 'Link to Action: "No" blocks approval', /linked to the approval action/);
      t.throws(() => WE.approve(r.id, st[0].id, 'u-layla', { answers: { [q1]: 'Yes', [q2]: 'see photo' } }), 'Need Attached: answered point without file blocks approval', /needs an attached file/);
      WE.approve(r.id, st[0].id, 'u-layla', { answers: { [q1]: 'Yes', [q2]: 'see photo', [DRS.C.filesKey(q2)]: ['site.jpg'] } });
      t.eq(stagesOf(r.id)[1].status, 'Pending', 'Stage 2 activated after valid answers');
      WE.approve(r.id, st[1].id, 'u-karim', { answers: { [st[1].items[0].id]: 'Yes' } });
      t.eq(WE.getDecisions(r.id)[1].action, 'Completed', 'Need Approval First = off: stage recorded as checklist Completed');
      const r2 = WE.submit({ templateId: base.id, subject: 'Return path', details: 'x' }, 'u-ahmed');
      const s2 = stagesOf(r2.id)[0];
      WE.returnForCorrection(r2.id, s2.id, 'u-layla', { comment: 'Site not safe', answers: { [s2.items[0].id]: 'No' } });
      t.eq(Store.get('requests', r2.id).status, 'Returned for Correction', 'Answering "No" still allows Return for Correction');
    });

    t.scenario('9 – Time Settings (8-hour working day)', () => {
      const T = DRS.Time;
      t.eq(T.settings().workHoursPerDay, 8, 'Default working day = 8 hours');
      t.eq(T.format(20), '2 working days 4 h', '20 h shown as 2 working days 4 h');
      t.eq(T.toDays(12), 1.5, '12 h = 1.5 working days');
      // Thursday 15:00 local + 4h -> Thursday has 2h left (until 17:00), Fri/Sat off -> Sunday 11:00
      const start = new Date(2026, 10, 26, 15, 0, 0).toISOString();
      const due = new Date(T.addWorkingHours(start, 4));
      t.eq([due.getDay(), due.getHours()], [0, 11], 'Due date skips the weekend and non-working hours');
      Store.saveSettings({ workHoursPerDay: 6 });
      t.eq(T.format(12), '2 working days', 'Changing the setting to 6 h/day changes the conversion');
      Store.saveSettings({ workHoursPerDay: 8 });
      const tplOps = Store.all('requestTemplates').find((x) => x.name === 'Operations Equipment Request');
      const p = T.plan(tplOps.stages, (s) => T.checklistHours(Store.get('checklistTemplates', s.checklistTemplateId)));
      t.eq([p.total, p.byDept['dep-ops'], p.byDept['dep-fin']], [20, 14, 6], 'Time plan: Operations 14 h (3 stages) + Finance 6 h = 20 h');
      const vendor = Store.all('checklistTemplates').find((x) => x.name === 'Procurement Vendor Check');
      t.eq([vendor.estimateValue, vendor.estimateUnit, T.checklistHours(vendor)], [3, 'day', 24], 'Duration Type "Day": 3 days = 24 working hours');
      Store.saveSettings({ workHoursPerDay: 7 });
      t.eq(T.checklistHours(vendor), 21, 'Day-based estimates follow the hours-per-day setting');
      Store.saveSettings({ workHoursPerDay: 8 });
    });

    t.scenario('10 – Multiple approvers on one checklist (any / all / none)', () => {
      const cl = TSvc.saveChecklist({ name: 'Multi Approver Checklist', departmentId: 'dep-ops', items: [{ label: 'Checked?', type: 'yesno', required: true }] }, ADMIN).checklist;
      const multi = (rule) => Object.assign(stage('Ops review', 'dep-ops', cl.id, 1, 'u-layla', 'Operations Manager'), { approvalRule: rule, additionalApprovers: [{ approverMode: 'user', approverUserId: 'u-karim' }] });
      const mk = (name, rule, extraStages) => TSvc.save({ name, requestType: 'Operations', ownerDepartmentId: 'dep-ops', concernedDepartmentIds: ['dep-ops'], status: 'Active',
        stages: [multi(rule)].concat(extraStages || [stage('Finance', 'dep-fin', null, 2, 'u-rania', 'Finance Manager')]) }, ADMIN).template;
      t.throws(() => TSvc.save({ name: 'Dup approver', requestType: 'Operations', ownerDepartmentId: 'dep-ops', concernedDepartmentIds: ['dep-ops'], status: 'Active',
        stages: [Object.assign(multi('any'), { additionalApprovers: [{ approverMode: 'user', approverUserId: 'u-layla' }] })] }, ADMIN), 'Same approver twice on one stage is rejected', /already assigned/);
      const yes = (s) => ({ [s.items[0].id]: 'Yes' });

      // ANY: manager OR assistant
      const tAny = mk('Multi Any', 'any');
      let r = WE.submit({ templateId: tAny.id, subject: 'Any approver test', details: 'x' }, 'u-ahmed');
      let s1 = stagesOf(r.id)[0];
      t.eq(s1.approverIds, ['u-layla', 'u-karim'], 'Stage has two approvers (manager + assistant)');
      t.ok(WE.pendingFor('u-karim').some((x) => x.request.id === r.id) && WE.pendingFor('u-layla').some((x) => x.request.id === r.id), 'Both approvers see it in their workspace');
      WE.approve(r.id, s1.id, 'u-karim', { answers: yes(s1) });
      t.eq(statuses(r.id), ['Approved', 'Pending'], 'ANY: the assistant alone completes the stage');
      t.ok(!WE.pendingFor('u-layla').some((x) => x.request.id === r.id), 'ANY: the manager no longer needs to act');

      // ALL: manager AND assistant
      const tAll = mk('Multi All', 'all');
      r = WE.submit({ templateId: tAll.id, subject: 'All approvers test', details: 'x' }, 'u-ahmed');
      s1 = stagesOf(r.id)[0];
      WE.approve(r.id, s1.id, 'u-layla', { answers: yes(s1) });
      t.eq(statuses(r.id), ['Pending', 'Waiting'], 'ALL: after the first approval the stage stays Pending');
      t.throws(() => WE.approve(r.id, s1.id, 'u-layla', { answers: yes(s1) }), 'ALL: the same approver cannot approve twice', /already approved/);
      t.ok(!WE.pendingFor('u-layla').some((x) => x.request.id === r.id) && WE.pendingFor('u-karim').some((x) => x.request.id === r.id), 'ALL: only the remaining approver still sees it');
      WE.approve(r.id, s1.id, 'u-karim', { answers: yes(s1) });
      t.eq(statuses(r.id), ['Approved', 'Pending'], 'ALL: second approval completes the stage');
      t.eq(WE.getDecisions(r.id).filter((d) => d.stageOrder === 1).map((d) => d.actorId), ['u-layla', 'u-karim'], 'ALL: both approvals are recorded');
      const r2 = WE.submit({ templateId: tAll.id, subject: 'All approvers reject', details: 'x' }, 'u-ahmed');
      const s2 = stagesOf(r2.id)[0];
      WE.approve(r2.id, s2.id, 'u-layla', { answers: yes(s2) });
      WE.reject(r2.id, s2.id, 'u-karim', { comment: 'Not justified' });
      t.eq(Store.get('requests', r2.id).status, 'Rejected', 'ALL: any approver can still reject');

      // NONE: checklist only, no approval
      const tNone = mk('Multi None', 'none');
      r = WE.submit({ templateId: tNone.id, subject: 'No approval test', details: 'x' }, 'u-ahmed');
      s1 = stagesOf(r.id)[0];
      t.eq(s1.requiresApproval, false, 'NONE: stage does not require approval');
      WE.approve(r.id, s1.id, 'u-karim', { answers: yes(s1) });
      t.eq(WE.getDecisions(r.id)[0].action, 'Completed', 'NONE: recorded as checklist Completed');
      // NONE without checklist: completes automatically
      const auto = Object.assign(stage('Auto pass', 'dep-ops', null, 1, 'u-layla', 'Operations Manager'), { approvalRule: 'none' });
      const tAuto = TSvc.save({ name: 'Multi Auto', requestType: 'Operations', ownerDepartmentId: 'dep-ops', concernedDepartmentIds: ['dep-ops'], status: 'Active',
        stages: [auto, stage('Finance', 'dep-fin', null, 2, 'u-rania', 'Finance Manager')] }, ADMIN).template;
      r = WE.submit({ templateId: tAuto.id, subject: 'Auto complete test', details: 'x' }, 'u-ahmed');
      t.eq(statuses(r.id), ['Approved', 'Pending'], 'NONE without checklist: stage completes automatically, next stage starts');
      // Self-approval still applies per approver
      r = WE.submit({ templateId: tAny.id, subject: 'Karim own request', details: 'x' }, 'u-karim');
      t.ok(!stagesOf(r.id)[0].approverIds.includes('u-karim'), 'Requester is never one of the approvers (escalated)');
    });

    return t.results;
  }

  DRS.Tests = { run };
})(typeof window !== 'undefined' ? window : globalThis);
