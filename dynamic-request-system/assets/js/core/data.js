/**
 * data.js
 * Demo seed data. Templates and requests are created through TemplateService and
 * WorkflowEngine (not hand-written records) so every sample record obeys the
 * same business rules as user-created data.
 */
(function (global) {
  'use strict';
  const DRS = (global.DRS = global.DRS || {});
  const { Store, Clock, TemplateService: TSvc, WorkflowEngine: WE } = DRS;

  const DEPARTMENTS = [
    { id: 'dep-ops', name: 'Operations', code: 'OPS', managerId: 'u-layla', supervisorId: 'u-yousef', active: true },
    { id: 'dep-fin', name: 'Finance', code: 'FIN', managerId: 'u-rania', supervisorId: 'u-mostafa', active: true },
    { id: 'dep-prc', name: 'Procurement', code: 'PRC', managerId: 'u-tarek', supervisorId: 'u-dina', active: true },
    { id: 'dep-hr', name: 'HR', code: 'HR', managerId: 'u-mona', supervisorId: 'u-ziad', active: true },
    { id: 'dep-it', name: 'IT', code: 'IT', managerId: 'u-hossam', supervisorId: 'u-walid', active: true },
    { id: 'dep-adm', name: 'Administration', code: 'ADM', managerId: 'u-fadi', supervisorId: 'u-rana', active: true }
  ];

  const U = (id, name, jobTitle, departmentId, managerId, roles) => ({ id, name, email: id.slice(2) + '@demo-company.example', jobTitle, departmentId, managerId, roles, active: true });
  const USERS = [
    U('u-sara', 'Sara Ibrahim', 'System Administrator', 'dep-adm', 'u-fadi', ['admin', 'employee']),
    U('u-fadi', 'Fadi Nasr', 'Administration Manager', 'dep-adm', null, ['approver', 'employee']),
    U('u-rana', 'Rana Fathy', 'Administration Supervisor', 'dep-adm', 'u-fadi', ['approver', 'employee']),
    U('u-salma', 'Salma Youssef', 'Administrative Officer', 'dep-adm', 'u-rana', ['employee']),
    U('u-khaled', 'Khaled Mansour', 'Operations Director', 'dep-ops', null, ['approver', 'employee']),
    U('u-layla', 'Layla Hassan', 'Operations Manager', 'dep-ops', 'u-khaled', ['approver', 'employee']),
    U('u-karim', 'Karim Saleh', 'Operations Assistant Manager', 'dep-ops', 'u-layla', ['approver', 'employee']),
    U('u-yousef', 'Yousef Adel', 'Operations Supervisor', 'dep-ops', 'u-karim', ['approver', 'employee']),
    U('u-ahmed', 'Ahmed Mohamed', 'Operations Specialist', 'dep-ops', 'u-yousef', ['employee']),
    U('u-hana', 'Hana Fouad', 'Operations Execution Lead', 'dep-ops', 'u-yousef', ['employee', 'execution']),
    U('u-rania', 'Rania Khalil', 'Finance Manager', 'dep-fin', null, ['approver', 'employee']),
    U('u-mostafa', 'Mostafa Gamal', 'Finance Supervisor', 'dep-fin', 'u-rania', ['approver', 'employee']),
    U('u-nour', 'Nour Samir', 'Senior Accountant', 'dep-fin', 'u-mostafa', ['employee', 'execution']),
    U('u-tarek', 'Tarek Fawzi', 'Procurement Manager', 'dep-prc', null, ['approver', 'employee']),
    U('u-dina', 'Dina Magdy', 'Procurement Supervisor', 'dep-prc', 'u-tarek', ['approver', 'employee']),
    U('u-amr', 'Amr Lotfy', 'Procurement Officer', 'dep-prc', 'u-dina', ['employee', 'execution']),
    U('u-mona', 'Mona Adel', 'HR Manager', 'dep-hr', null, ['approver', 'employee']),
    U('u-ziad', 'Ziad Kamal', 'HR Supervisor', 'dep-hr', 'u-mona', ['approver', 'employee']),
    U('u-heba', 'Heba Said', 'HR Specialist', 'dep-hr', 'u-ziad', ['employee', 'execution']),
    U('u-hossam', 'Hossam Ali', 'IT Manager', 'dep-it', null, ['approver', 'employee']),
    U('u-walid', 'Walid Emad', 'IT Supervisor', 'dep-it', 'u-hossam', ['approver', 'employee']),
    U('u-mariam', 'Mariam Tamer', 'IT Engineer', 'dep-it', 'u-walid', ['employee', 'execution'])
  ];

  const I = (label, type, required, extra) => Object.assign({ label, type, required, needAttachment: false, linkToAction: false, helpText: '', options: [] }, extra || {});
  const CHECKLISTS = [
    { key: 'opsA', name: 'Operations Checklist A – Operational Requirement', departmentId: 'dep-ops', estimatedHours: 4, description: 'Confirms the operational need before any spend is committed.', items: [
      I('Is the operational requirement confirmed?', 'yesno', true, { linkToAction: true }),
      I('Affected site / location', 'dropdown', true, { options: ['Warehouse A', 'Warehouse B', 'Plant 1', 'Head Office'] }),
      I('Business justification', 'text', true),
      I('Requested quantity', 'number', true)
    ] },
    { key: 'opsB', name: 'Operations Checklist B – Specification Review', departmentId: 'dep-ops', estimatedHours: 8, description: 'Technical review of quantities and specifications.', items: [
      I('Quantities and specifications verified?', 'yesno', true, { needAttachment: true, linkToAction: true }),
      I('Specification compliance level', 'dropdown', true, { options: ['Fully compliant', 'Minor deviations', 'Major deviations'] }),
      I('Required delivery date', 'date', true),
      I('Supporting technical document', 'attachment', false, { helpText: 'Prototype: file names only, files are not uploaded.' })
    ] },
    { key: 'opsC', name: 'Operations Checklist C – Final Operational Sign-off', departmentId: 'dep-ops', estimatedHours: 2, description: 'Director-level sign-off after finance approval.', items: [
      I('Aligned with annual operations plan?', 'yesno', true),
      I('Risk assessment', 'dropdown', true, { options: ['Low', 'Medium', 'High'] }),
      I('Director remarks', 'text', false)
    ] },
    { key: 'finA', name: 'Finance Checklist A – Budget Verification', departmentId: 'dep-fin', estimatedHours: 6, description: 'Budget availability and cost centre validation.', items: [
      I('Budget available in the cost centre?', 'yesno', true, { linkToAction: true }),
      I('Cost centre code', 'text', true),
      I('Estimated amount (USD)', 'number', true),
      I('Budget line', 'dropdown', true, { options: ['CAPEX', 'OPEX', 'Project'] })
    ] },
    { key: 'prcVendor', name: 'Procurement Vendor Check', departmentId: 'dep-prc', estimatedHours: 3, estimateUnit: 'day', description: 'Vendor qualification and quotation review.', items: [
      I('At least three quotations received?', 'yesno', true, { needAttachment: true, linkToAction: true }),
      I('Preferred vendor', 'text', true),
      I('Quotation documents', 'attachment', false),
      I('Expected delivery date', 'date', false)
    ] },
    { key: 'itSec', name: 'IT Security Review', departmentId: 'dep-it', estimatedHours: 4, description: 'Access and security compliance review.', items: [
      I('Least-privilege principle respected?', 'yesno', true, { linkToAction: true }),
      I('Access level', 'dropdown', true, { options: ['Read only', 'Standard user', 'Power user', 'Administrator'] }),
      I('Security notes', 'text', false)
    ] },
    { key: 'admAsset', name: 'Administration Asset Registration', departmentId: 'dep-adm', estimatedHours: 2, requiresApproval: false, description: 'Ensures purchased assets are registered.', items: [
      I('Asset category', 'dropdown', true, { options: ['Furniture', 'Office equipment', 'Vehicles', 'Other'] }),
      I('Asset tag required?', 'yesno', true)
    ] },
    { key: 'hrPolicy', name: 'HR Policy Compliance', departmentId: 'dep-hr', estimatedHours: 4, description: 'Checks the request against HR policy.', items: [
      I('Compliant with HR policy?', 'yesno', true),
      I('Policy reference', 'text', false)
    ] }
  ];

  const S = (stageName, departmentId, checklist, level, approver, approverRole, extra) => Object.assign({
    stageName, departmentId, checklistTemplateId: checklist, approvalLevel: level,
    approverMode: approver.indexOf('u-') === 0 ? 'user' : 'role',
    approverUserId: approver.indexOf('u-') === 0 ? approver : null,
    approverRoleKey: approver.indexOf('u-') === 0 ? null : approver,
    approverRole, mandatory: true, status: 'Active'
  }, extra || {});

  function seed() {
    Store.clearAll();
    Store.replaceAll('departments', DEPARTMENTS);
    Store.replaceAll('users', USERS);
    DRS.Store.COLLECTIONS.filter((n) => !['departments', 'users'].includes(n)).forEach((n) => Store.replaceAll(n, []));
    Store.saveSettings({ currentUserId: 'u-sara', requestCounter: 1000, returnBehavior: 'resume', allowSkipOptional: false });

    const admin = 'u-sara';
    Clock.set('2026-10-01T08:00:00Z');
    const cl = {};
    CHECKLISTS.forEach((c) => { cl[c.key] = TSvc.saveChecklist({ name: c.name, description: c.description, departmentId: c.departmentId, estimateValue: c.estimatedHours, estimateUnit: c.estimateUnit || 'hour', requiresApproval: c.requiresApproval !== false, items: c.items, active: true }, admin).checklist.id; Clock.advance(5); });

    // 1) Repeated-department demo template. v1 = 3 stages, later v2 adds Stage 4.
    const opsV1 = TSvc.save({
      name: 'Operations Equipment Request', requestType: 'Operations', status: 'Active', hierarchyType: 'none',
      description: 'Request new or replacement operational equipment. Operations reviews the need, the specification and gives final sign-off; Finance verifies budget.',
      ownerDepartmentId: 'dep-ops', concernedDepartmentIds: ['dep-ops', 'dep-fin'],
      stages: [
        S('Operational Requirement Review', 'dep-ops', cl.opsA, 1, 'u-layla', 'Operations Manager'),
        S('Specification Review', 'dep-ops', cl.opsB, 2, 'u-karim', 'Operations Assistant Manager'),
        S('Budget Verification', 'dep-fin', cl.finA, 3, 'u-rania', 'Finance Manager')
      ]
    }, admin, 'Initial workflow version.').template;
    Clock.advance(60);

    const nonAdmin = TSvc.save({
      name: 'Non-Admin Procurement Request', requestType: 'Procurement', status: 'Active', hierarchyType: 'non_admin_procurement',
      description: 'Purchase of goods or services for a business department. Follows the mandatory Non-Admin hierarchy with an added Finance budget check.',
      ownerDepartmentId: 'dep-prc', concernedDepartmentIds: ['dep-prc', 'dep-fin'],
      stages: (function () {
        const h = TSvc.hierarchyStages('non_admin_procurement', 1);
        const fin = S('Budget Verification', 'dep-fin', cl.finA, 3, 'u-rania', 'Finance Manager');
        h[2].approvalLevel = 4; h[2].checklistTemplateId = cl.prcVendor;
        return [h[0], h[1], fin, h[2]];
      })()
    }, admin).template;
    Clock.advance(30);

    const adminProc = TSvc.save({
      name: 'Admin Procurement Request', requestType: 'Procurement', status: 'Active', hierarchyType: 'admin_procurement',
      description: 'Procurement of administrative items (furniture, office equipment, vehicles). Follows the mandatory Admin hierarchy.',
      ownerDepartmentId: 'dep-prc', concernedDepartmentIds: ['dep-prc', 'dep-adm'],
      stages: (function () {
        const h = TSvc.hierarchyStages('admin_procurement', 1);
        h[1].checklistTemplateId = cl.prcVendor;
        return h.concat([S('Asset Registration Check', 'dep-adm', cl.admAsset, 4, 'u-fadi', 'Administration Manager', { mandatory: false })]);
      })()
    }, admin).template;
    Clock.advance(30);

    const itAccess = TSvc.save({
      name: 'IT System Access Request', requestType: 'IT', status: 'Active', hierarchyType: 'none',
      description: 'Request access to a business application or elevated permissions.',
      ownerDepartmentId: 'dep-it', concernedDepartmentIds: ['dep-it'],
      stages: [
        S('Department Manager Approval', '@requester', null, 1, 'requester_dept_manager', 'Department Manager'),
        S('Security Review', 'dep-it', cl.itSec, 2, 'u-walid', 'IT Supervisor'),
        S('IT Manager Approval', 'dep-it', null, 3, 'stage_dept_manager', 'IT Manager')
      ]
    }, admin).template;
    Clock.advance(30);

    TSvc.save({
      name: 'Training Request', requestType: 'Human Resources', status: 'Inactive', hierarchyType: 'none',
      description: 'External training or certification request (template under review – inactive).',
      ownerDepartmentId: 'dep-hr', concernedDepartmentIds: ['dep-hr'],
      stages: [
        S('Line Manager Approval', '@requester', null, 1, 'requester_line_manager', 'Line Manager'),
        S('HR Policy Check', 'dep-hr', cl.hrPolicy, 2, 'u-mona', 'HR Manager')
      ]
    }, admin);
    const legacy = TSvc.save({
      name: 'Legacy Purchase Requisition', requestType: 'Procurement', status: 'Active', hierarchyType: 'none',
      description: 'Old single-step requisition kept for historical records only.',
      ownerDepartmentId: 'dep-prc', concernedDepartmentIds: ['dep-prc'],
      stages: [S('Procurement Manager Approval', 'dep-prc', null, 1, 'procurement_manager', 'Procurement Manager')]
    }, admin).template;
    TSvc.archive(legacy.id, admin);

    // ----- Sample requests (driven through the real engine) -----
    const answersFor = (stage) => {
      const out = {};
      stage.items.forEach((it) => {
        if (it.type === 'yesno') out[it.id] = 'Yes';
        else if (it.type === 'dropdown') out[it.id] = it.options[0];
        else if (it.type === 'number') out[it.id] = '4';
        else if (it.type === 'date') out[it.id] = '2026-12-15';
        else if (it.type === 'text') out[it.id] = it.label.indexOf('Cost centre') >= 0 ? 'CC-4410' : 'Reviewed and confirmed.';
        if (it.needAttachment) out[DRS.C.filesKey(it.id)] = ['evidence-' + stage.order + '.pdf'];
      });
      return out;
    };
    const approveCurrent = (reqId, comment) => {
      const st = WE.currentStage(reqId);
      Clock.advance(180);
      WE.approve(reqId, st.id, st.approverId, { comment: comment || '', answers: answersFor(st) });
    };

    // REQ-1001 – v1 (3 stages), fully approved and executed => Completed
    Clock.set('2026-10-05T09:15:00Z');
    let r = WE.submit({ templateId: opsV1.id, subject: 'Replacement pallet jacks for Warehouse B', details: 'Two manual pallet jacks in Warehouse B are beyond repair. Requesting 4 replacement units (2.5t capacity).', priority: 'Normal', attachments: [{ name: 'damage-report.pdf', size: 182000 }] }, 'u-ahmed');
    approveCurrent(r.id, 'Need confirmed on site.'); approveCurrent(r.id, 'Spec matches standard model.'); approveCurrent(r.id, 'Budget available under OPEX.');
    Clock.advance(1440); WE.completeExecution(r.id, 'dep-ops', 'u-hana', 'Units received and deployed.');
    Clock.advance(120); WE.completeExecution(r.id, 'dep-fin', 'u-nour', 'Invoice posted.');

    // Template change => v2 adds a 4th stage (Operations appears 3 times)
    Clock.set('2026-10-20T10:00:00Z');
    const t = Store.get('requestTemplates', opsV1.id);
    TSvc.save(Object.assign({}, t, { stages: t.stages.concat([S('Final Operational Sign-off', 'dep-ops', cl.opsC, 4, 'u-khaled', 'Operations Director')]) }), admin, 'Added Operations Director final sign-off (Stage 4).');

    // REQ-1002 – v2, Stage 1 approved, Stage 2 pending (Karim)
    Clock.set('2026-11-18T08:30:00Z');
    r = WE.submit({ templateId: opsV1.id, subject: 'Purchase 4 electric forklifts for Plant 1', details: 'Fleet expansion for the new production line. Electric 3t forklifts with lithium batteries, including charging stations.', priority: 'High', neededBy: '2027-01-15', attachments: [{ name: 'forklift-specs.xlsx', size: 54000 }, { name: 'site-layout.pdf', size: 1240000 }] }, 'u-ahmed');
    approveCurrent(r.id, 'Requirement confirmed. Proceed to spec review.');

    // REQ-1003 – Non-admin procurement by IT engineer, fully approved, execution pending
    Clock.set('2026-11-10T11:00:00Z');
    r = WE.submit({ templateId: nonAdmin.id, subject: '12 developer laptops for the IT team', details: 'Replacement of laptops older than 5 years. 32GB RAM, 1TB SSD.', priority: 'Normal', attachments: [] }, 'u-mariam');
    approveCurrent(r.id); approveCurrent(r.id, 'Approved.'); approveCurrent(r.id, 'Within CAPEX budget.'); approveCurrent(r.id, 'Vendor shortlisted.');

    // REQ-1004 – IT access by Finance accountant, rejected at Security Review
    Clock.set('2026-11-12T13:00:00Z');
    r = WE.submit({ templateId: itAccess.id, subject: 'Administrator access to ERP finance module', details: 'Needed to run month-end closing scripts without IT support.', priority: 'Urgent', attachments: [] }, 'u-nour');
    approveCurrent(r.id, 'Business need confirmed.');
    let st = WE.currentStage(r.id); Clock.advance(200);
    WE.reject(r.id, st.id, st.approverId, { comment: 'Administrator access exceeds the role. Please request the "Finance Power User" profile instead.', answers: answersFor(st) });

    // REQ-1005 – Admin procurement by Admin officer, returned by Procurement Manager
    Clock.set('2026-11-16T09:00:00Z');
    r = WE.submit({ templateId: adminProc.id, subject: 'Ergonomic chairs for the reception area', details: '8 ergonomic chairs to replace damaged reception seating.', priority: 'Low', attachments: [{ name: 'chair-catalogue.pdf', size: 820000 }] }, 'u-salma');
    approveCurrent(r.id, 'Needed, approved.');
    st = WE.currentStage(r.id); Clock.advance(300);
    WE.returnForCorrection(r.id, st.id, st.approverId, { comment: 'Please attach three vendor quotations and confirm the colour specification.' });

    // REQ-1006 – v2, pending at Stage 1 (Layla)
    Clock.set('2026-11-21T07:45:00Z');
    WE.submit({ templateId: opsV1.id, subject: 'Safety barriers for loading dock 3', details: 'Install 20m of steel safety barriers after the near-miss incident on 12 Nov.', priority: 'Urgent', neededBy: '2026-12-05', attachments: [] }, 'u-hana');

    // REQ-1007 – Draft
    Clock.set('2026-11-22T15:20:00Z');
    WE.saveDraft({ templateId: opsV1.id, subject: 'Spare parts for conveyor line 2', details: 'Draft – list of parts to be confirmed with maintenance.', priority: 'Normal' }, 'u-ahmed');

    // REQ-1008 – Non-admin procurement by Procurement officer, pending Stage 1 (Dina).
    // The Procurement Manager appears twice (Department Manager and Procurement Manager stages).
    Clock.set('2026-11-23T10:10:00Z');
    WE.submit({ templateId: nonAdmin.id, subject: 'Annual stationery framework agreement', details: 'Framework agreement for office stationery across all departments for 2027.', priority: 'Normal', attachments: [] }, 'u-amr');

    Clock.reset();
    Store.markSeeded();
  }

  DRS.Seed = { run: seed, DEPARTMENTS, USERS };
})(typeof window !== 'undefined' ? window : globalThis);
