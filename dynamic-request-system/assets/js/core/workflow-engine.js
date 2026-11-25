/**
 * workflow-engine.js
 * Sequential workflow execution. No DOM access: every function takes an actor id,
 * validates business rules, and writes atomically through Store.transaction().
 * The same functions map directly to future REST endpoints, for example
 *   POST /requests/:id/stages/:stageId/approve  ->  WorkflowEngine.approve(...)
 *
 * A stage can have several approvers and an approval rule:
 *   any  – the first approval by any assigned approver completes the stage
 *   all  – every assigned approver must approve
 *   none – no approval needed: an assigned person only completes the checklist
 *          (a "none" stage without a checklist completes automatically)
 */
(function (global) {
  'use strict';
  const DRS = (global.DRS = global.DRS || {});
  const { Store, Clock, C, Validation, Auth, BusinessError } = DRS;
  const RS = C.REQUEST_STATUS;
  const SS = C.STAGE_STATUS;
  const EV = C.EVENTS;
  const RULE_LABELS = { any: 'Any one approves', all: 'All must approve', none: 'No approval needed' };

  // ------------------------------------------------------------------ helpers
  function userName(id) { const u = id && Store.get('users', id); return u ? u.name : 'System'; }
  function deptByCode(code) { return Store.all('departments').find((d) => d.code === code) || null; }

  function getRequestOrFail(requestId) {
    const r = Store.get('requests', requestId);
    if (!r) throw new BusinessError('Request ' + requestId + ' was not found.');
    return r;
  }
  function getStages(requestId) {
    return Store.where('stageInstances', (s) => s.requestId === requestId).sort((a, b) => a.order - b.order);
  }
  function getActorOrFail(actorId) {
    const u = Store.get('users', actorId);
    if (!u || !u.active) throw new BusinessError('Unknown or inactive user.');
    return u;
  }
  /** All assigned approvers of a stage instance (older records only have approverId). */
  function approversOf(stage) {
    return stage.approverIds && stage.approverIds.length ? stage.approverIds : [stage.approverId].filter(Boolean);
  }

  function log(requestId, event, actorId, description, extra) {
    return Store.insert('history', Object.assign({
      id: Store.uid('evt'),
      requestId,
      event,
      actorId: actorId || null,
      actorName: actorId ? userName(actorId) : 'System',
      timestamp: Clock.now(),
      description
    }, extra || {}));
  }
  function notify(userId, requestId, message) {
    if (!userId) return;
    Store.insert('notifications', { id: Store.uid('ntf'), userId, requestId, message, createdAt: Clock.now(), read: false });
  }
  function recordDecision(request, stage, action, actorId, comment) {
    return Store.insert('decisions', {
      id: Store.uid('dec'),
      requestId: request.id,
      stageInstanceId: stage.id,
      stageOrder: stage.order,
      stageName: stage.stageName,
      departmentId: stage.departmentId,
      approvalLevel: stage.approvalLevel,
      action,
      actorId: actorId || null,
      actorName: actorId ? userName(actorId) : 'System',
      comment: comment || '',
      cycle: stage.cycle,
      answersSnapshot: stage.answers || {},
      timestamp: Clock.now()
    });
  }

  // ------------------------------------------------------- approver resolution
  function resolveRoleApprover(roleKey, stageDeptId, requester) {
    const role = C.APPROVER_ROLES[roleKey];
    if (!role) return { userId: null, reason: 'Unknown approver role "' + roleKey + '".' };
    if (role.scope === 'requester') {
      if (role.field === 'line') return { userId: requester.managerId || null, reason: requester.name + ' has no line manager.' };
      const dept = Store.get('departments', requester.departmentId);
      return { userId: dept ? dept[role.field] || null : null, reason: 'Requester department has no ' + (role.field === 'managerId' ? 'manager' : 'supervisor') + '.' };
    }
    if (role.scope === 'stage') {
      const dept = Store.get('departments', stageDeptId);
      return { userId: dept ? dept[role.field] || null : null, reason: 'Stage department has no ' + (role.field === 'managerId' ? 'manager' : 'supervisor') + '.' };
    }
    const dept = deptByCode(role.deptCode);
    return { userId: dept ? dept[role.field] || null : null, reason: 'No ' + role.label + ' is configured.' };
  }

  /**
   * Conflict rules from the PRD:
   *  - No self-approval.
   *  - A subordinate cannot approve their manager's request.
   * A conflicting approver is escalated to the requester's nearest eligible manager.
   */
  function conflictReason(approverId, requester) {
    if (approverId === requester.id) return 'self-approval';
    if (Auth.isSubordinate(approverId, requester.id)) return 'approver reports to the requester';
    return null;
  }
  function escalate(requester) {
    return Auth.managementChain(requester.id).find((id) => {
      const u = Store.get('users', id);
      return u && u.active && !conflictReason(id, requester);
    }) || null;
  }

  /**
   * Builds the ordered, resolved stage plan for a workflow version and requester.
   * Used for the submission preview and for creating stage instances.
   * Stage count = number of active configured stage records (never unique departments).
   */
  function planStages(version, requester) {
    const errors = [];
    const plan = [];
    const configured = (version.stages || []).filter((s) => s.status !== 'Inactive');
    configured.forEach((cfg, idx) => {
      const order = idx + 1;
      const label = 'Stage ' + order + ' (' + cfg.stageName + ')';
      const departmentId = cfg.departmentId === C.REQUESTER_DEPT ? requester.departmentId : cfg.departmentId;
      // Resolve every assigned approver (primary + additional), apply the conflict rules, de-duplicate.
      const notes = []; const approverIds = [];
      [cfg].concat(cfg.additionalApprovers || []).forEach((a, ai) => {
        let id = null;
        if (a.approverMode === 'user') id = a.approverUserId || null;
        else {
          const res = resolveRoleApprover(a.approverRoleKey, departmentId, requester);
          id = res.userId;
          if (!id) { errors.push(label + ': ' + res.reason); return; }
        }
        const u = id ? Store.get('users', id) : null;
        if (!u || !u.active) { errors.push(label + ': approver ' + (ai + 1) + ' is missing or inactive.'); return; }
        const conflict = conflictReason(id, requester);
        if (conflict) {
          const replacement = escalate(requester);
          if (!replacement) { errors.push(label + ': ' + conflict + ' and no eligible manager is available for escalation.'); return; }
          notes.push('Reassigned from ' + userName(id) + ' to ' + userName(replacement) + ' (' + conflict + ').');
          id = replacement;
        }
        if (!approverIds.includes(id)) approverIds.push(id);
      });
      const approvalRule = ['any', 'all', 'none'].includes(cfg.approvalRule) ? cfg.approvalRule : 'any';
      const checklist = cfg.checklistTemplateId ? (version.checklists || {})[cfg.checklistTemplateId] : null;
      plan.push({
        order,
        configStageId: cfg.id,
        stageName: cfg.stageName,
        departmentId,
        checklistTemplateId: cfg.checklistTemplateId || null,
        checklistName: checklist ? checklist.name : null,
        checklistVersion: checklist ? checklist.version : null,
        estimatedHours: checklist && DRS.Time ? DRS.Time.checklistHours(checklist) : null,
        requiresApproval: (checklist ? checklist.requiresApproval !== false : true) && approvalRule !== 'none',
        approvalRule,
        items: checklist ? Store.clone(checklist.items) : [],
        approvalLevel: Number(cfg.approvalLevel),
        approverId: approverIds[0] || null,
        approverIds,
        approverRole: cfg.approverRole,
        approverMode: cfg.approverMode,
        approverRoleKey: cfg.approverRoleKey || null,
        assignmentNote: notes.join(' '),
        mandatory: cfg.mandatory !== false,
        hierarchyKey: cfg.hierarchyKey || null
      });
    });
    if (!plan.length) errors.push('The workflow has no active stages.');
    return { plan, errors };
  }

  function getUsableTemplate(templateId) {
    const t = Store.get('requestTemplates', templateId);
    if (!t) throw new BusinessError('Request template not found.');
    if (t.status === C.TEMPLATE_STATUS.ARCHIVED) throw new BusinessError('"' + t.name + '" is an archived legacy request type and cannot receive new requests.');
    if (t.status !== C.TEMPLATE_STATUS.ACTIVE) throw new BusinessError('"' + t.name + '" is inactive and cannot be used for new requests.');
    const version = t.currentVersionId && Store.get('workflowVersions', t.currentVersionId);
    if (!version) throw new BusinessError('"' + t.name + '" has no published workflow version.');
    return { template: t, version };
  }

  function sanitizeInput(input) {
    return {
      subject: String(input.subject || '').trim(),
      details: String(input.details || '').trim(),
      priority: input.priority || 'Normal',
      neededBy: input.neededBy || '',
      attachments: (input.attachments || []).map((a) => ({ name: String(a.name), size: Number(a.size) || 0, type: a.type || '' }))
    };
  }

  /**
   * Makes a stage Pending and notifies every assigned approver.
   * A "no approval needed" stage without a checklist completes automatically.
   * Returns the updated request when the stage auto-completed, otherwise null.
   */
  function activateStage(request, stage, now, reactivated) {
    Store.update('stageInstances', stage.id, { status: SS.PENDING, activatedAt: now, approvals: [] });
    const ids = approversOf(stage);
    log(request.id, EV.STAGE_ACTIVATED, null, 'Stage ' + stage.order + ' "' + stage.stageName + '" ' + (reactivated ? 're-activated' : 'activated') + '. Assigned to ' + ids.map(userName).join(', ') +
      (ids.length > 1 || stage.approvalRule === 'none' ? ' (' + RULE_LABELS[stage.approvalRule || 'any'] + ')' : '') + '.', { stageInstanceId: stage.id, stageOrder: stage.order });
    if (stage.approvalRule === 'none' && !(stage.items || []).length) {
      return closeStageAndAdvance(Store.get('requests', request.id), Store.get('stageInstances', stage.id), null, SS.APPROVED, 'No approval needed – completed automatically.', {});
    }
    ids.forEach((id) => notify(id, request.id, request.id + ' "' + request.subject + '" is waiting for you (Stage ' + stage.order + ').'));
    return null;
  }

  /** Closes the active stage (Approved/Skipped) and activates exactly the next stage. */
  function closeStageAndAdvance(request, stage, actorId, status, comment, answers) {
    const now = Clock.now();
    const closed = Store.update('stageInstances', stage.id, {
      status, answers, decidedAt: now, decidedBy: actorId, comment,
      cycles: (stage.cycles || []).concat([{ cycle: stage.cycle, status, by: actorId, at: now, comment }])
    });
    const completion = status === SS.APPROVED && closed.requiresApproval === false;
    recordDecision(request, closed, status === SS.SKIPPED ? 'Skipped' : completion ? 'Completed' : 'Approved', actorId, comment);
    if (closed.items && closed.items.length && status === SS.APPROVED) {
      log(request.id, EV.CHECKLIST_COMPLETED, actorId, 'Stage ' + closed.order + ' checklist "' + closed.checklistName + '" completed.', { stageInstanceId: closed.id, stageOrder: closed.order });
    }
    const who = actorId ? ' by ' + userName(actorId) : '';
    const what = status === SS.SKIPPED ? 'skipped' : completion ? (closed.items && closed.items.length ? 'checklist completed (no approval required)' : 'completed automatically (no approval needed)') : 'approved';
    const allNote = closed.approvalRule === 'all' && approversOf(closed).length > 1 && status === SS.APPROVED && !completion ? ' – all ' + approversOf(closed).length + ' approvers approved' : '';
    log(request.id, status === SS.SKIPPED ? EV.STAGE_SKIPPED : EV.STAGE_COMPLETED, actorId,
      'Stage ' + closed.order + ' "' + closed.stageName + '" ' + what + who + ' (Level ' + closed.approvalLevel + ')' + allNote + '.' + (comment ? ' Comment: ' + comment : ''),
      { stageInstanceId: closed.id, stageOrder: closed.order });

    // Strictly the next stage by order: a stage can never be skipped accidentally.
    const next = getStages(request.id).find((s) => s.order === closed.order + 1);
    if (next) {
      if (next.status !== SS.WAITING) throw new BusinessError('Workflow integrity error: Stage ' + next.order + ' is ' + next.status + ', expected Waiting.');
      const r = Store.update('requests', request.id, { status: RS.IN_PROGRESS, currentStageOrder: next.order, updatedAt: now });
      return activateStage(r, next, now, false) || Store.get('requests', request.id);
    }
    const tasks = (request.concernedDepartmentIds || []).map((id) => ({ departmentId: id, status: 'Pending', by: null, byName: null, at: null, note: '' }));
    const r = Store.update('requests', request.id, { status: RS.APPROVED, approvedAt: now, currentStageOrder: null, updatedAt: now, executionTasks: tasks });
    log(request.id, EV.APPROVED, null, 'All ' + request.totalStages + ' stages approved. Execution assigned to: ' + tasks.map((t) => (Store.get('departments', t.departmentId) || {}).name).join(', ') + '.');
    notify(r.requesterId, r.id, r.id + ' has been fully approved.');
    Store.where('users', (u) => u.active && u.roles.includes('execution') && tasks.some((t) => t.departmentId === u.departmentId))
      .forEach((u) => notify(u.id, r.id, r.id + ' is approved and ready for execution by your department.'));
    return r;
  }

  // ------------------------------------------------------------------- engine
  const WorkflowEngine = {
    planStages,
    approversOf,
    RULE_LABELS,

    /** Preview the resolved workflow for a template and requester (no writes). */
    preview(templateId, requesterId) {
      const { template, version } = getUsableTemplate(templateId);
      const requester = getActorOrFail(requesterId);
      return Object.assign({ template, version }, planStages(version, requester));
    },

    saveDraft(input, actorId) {
      return Store.transaction(() => {
        const actor = getActorOrFail(actorId);
        const t = Store.get('requestTemplates', input.templateId);
        if (!t) throw new BusinessError('Select a request template.');
        if (Validation.isBlank(input.subject)) throw new BusinessError('A subject is required to save a draft.');
        const data = sanitizeInput(input);
        const now = Clock.now();
        if (input.id) {
          const existing = getRequestOrFail(input.id);
          if (existing.requesterId !== actor.id) throw new BusinessError('Only the requester can edit this draft.');
          if (existing.status !== RS.DRAFT) throw new BusinessError('Only drafts can be edited this way.');
          const r = Store.update('requests', existing.id, Object.assign(data, { templateId: t.id, templateName: t.name, requestType: t.requestType, updatedAt: now }));
          log(r.id, EV.DRAFT_SAVED, actor.id, 'Draft updated.');
          return r;
        }
        const r = Store.insert('requests', Object.assign(data, {
          id: Store.nextRequestNumber(),
          templateId: t.id,
          templateName: t.name,
          requestType: t.requestType,
          requesterId: actor.id,
          requesterDepartmentId: actor.departmentId,
          status: RS.DRAFT,
          workflowVersionId: null,
          versionNumber: null,
          currentStageOrder: null,
          totalStages: 0,
          resubmissionCount: 0,
          executionTasks: [],
          createdAt: now,
          updatedAt: now,
          submittedAt: null
        }));
        log(r.id, EV.CREATED, actor.id, 'Request created as draft from template "' + t.name + '".');
        return r;
      });
    },

    deleteDraft(requestId, actorId) {
      return Store.transaction(() => {
        const r = getRequestOrFail(requestId);
        if (r.requesterId !== actorId) throw new BusinessError('Only the requester can delete this draft.');
        if (r.status !== RS.DRAFT) throw new BusinessError('Only draft requests can be deleted.');
        Store.remove('requests', r.id);
        Store.where('history', (h) => h.requestId === r.id).forEach((h) => Store.remove('history', h.id));
        return true;
      });
    },

    /**
     * Submits a new request (or an existing draft via input.id).
     * Snapshots the current workflow version into independent stage instances.
     */
    submit(input, actorId) {
      return Store.transaction(() => {
        const actor = getActorOrFail(actorId);
        Validation.assert(Validation.requestInput(input), 'Please correct the request information.');
        const { template, version } = getUsableTemplate(input.templateId);
        const { plan, errors } = planStages(version, actor);
        Validation.assert(errors, 'This request cannot be routed: ' + errors[0]);

        const now = Clock.now();
        const data = sanitizeInput(input);
        let request;
        const base = Object.assign(data, {
          templateId: template.id,
          templateName: template.name,
          requestType: template.requestType,
          ownerDepartmentId: version.ownerDepartmentId,
          concernedDepartmentIds: Store.clone(version.concernedDepartmentIds),
          workflowVersionId: version.id,
          versionNumber: version.versionNumber,
          status: RS.PENDING,
          currentStageOrder: 1,
          totalStages: plan.length,
          submittedAt: now,
          updatedAt: now
        });
        if (input.id) {
          const draft = getRequestOrFail(input.id);
          if (draft.requesterId !== actor.id) throw new BusinessError('Only the requester can submit this draft.');
          if (draft.status !== RS.DRAFT) throw new BusinessError('Request ' + draft.id + ' has already been submitted.');
          request = Store.update('requests', draft.id, base);
        } else {
          request = Store.insert('requests', Object.assign(base, {
            id: Store.nextRequestNumber(),
            requesterId: actor.id,
            requesterDepartmentId: actor.departmentId,
            resubmissionCount: 0,
            executionTasks: [],
            createdAt: now
          }));
          log(request.id, EV.CREATED, actor.id, 'Request created from template "' + template.name + '".');
        }

        plan.forEach((p) => {
          Store.insert('stageInstances', Object.assign({}, p, {
            id: request.id + '-S' + p.order,
            requestId: request.id,
            status: SS.WAITING,
            answers: {},
            approvals: [],
            cycle: 1,
            cycles: [],
            activatedAt: null,
            decidedAt: null,
            decidedBy: null,
            comment: ''
          }));
          if (p.assignmentNote) log(request.id, EV.APPROVER_REASSIGNED, null, 'Stage ' + p.order + ': ' + p.assignmentNote, { stageOrder: p.order });
        });

        log(request.id, EV.SUBMITTED, actor.id, 'Submitted using workflow version v' + version.versionNumber + ' with ' + plan.length + ' stage(s).');
        const after = activateStage(request, Store.get('stageInstances', request.id + '-S1'), now, false);
        return after || Store.get('requests', request.id);
      });
    },

    // --------------------------------------------------------- permissions
    /** Single source of truth for "may this user act on this stage now?" */
    canAct(requestId, stageId, userId) {
      const r = Store.get('requests', requestId);
      if (!r) return { ok: false, reason: 'Request not found.' };
      const stage = Store.get('stageInstances', stageId);
      if (!stage || stage.requestId !== r.id) return { ok: false, reason: 'Stage not found for this request.' };
      if (!C.ACTIVE_REQUEST_STATUSES.includes(r.status)) return { ok: false, reason: 'Request is ' + r.status + '. No approval actions are possible.' };
      if (stage.status !== SS.PENDING || stage.order !== r.currentStageOrder) {
        const reason = stage.status === SS.WAITING
          ? 'Stage ' + stage.order + ' is Waiting. It activates only after Stage ' + (stage.order - 1) + ' is approved.'
          : 'Stage ' + stage.order + ' is ' + stage.status + ' and is not the active stage.';
        return { ok: false, reason };
      }
      const ids = approversOf(stage);
      if (!ids.includes(userId)) {
        return { ok: false, reason: 'Only the assigned ' + (ids.length > 1 ? 'approvers (' + ids.map(userName).join(', ') + ')' : 'approver (' + userName(ids[0]) + ')') + ' can act on Stage ' + stage.order + '.' };
      }
      if ((stage.approvals || []).some((a) => a.userId === userId)) {
        return { ok: false, reason: 'You already approved Stage ' + stage.order + '. Waiting for: ' + ids.filter((id) => !(stage.approvals || []).some((a) => a.userId === id)).map(userName).join(', ') + '.' };
      }
      if (userId === r.requesterId) return { ok: false, reason: 'Self-approval is not allowed.' };
      if (Auth.isSubordinate(userId, r.requesterId)) return { ok: false, reason: 'A subordinate cannot approve their manager\'s request.' };
      return { ok: true, request: r, stage };
    },

    // ------------------------------------------------------------ actions
    saveAnswers(requestId, stageId, answers, actorId) {
      return Store.transaction(() => {
        const chk = WorkflowEngine.canAct(requestId, stageId, actorId);
        if (!chk.ok) throw new BusinessError(chk.reason);
        const merged = Object.assign({}, chk.stage.answers, answers || {});
        const s = Store.update('stageInstances', stageId, { answers: merged, answersUpdatedAt: Clock.now() });
        log(requestId, EV.CHECKLIST_UPDATED, actorId, 'Stage ' + s.order + ' checklist answers saved (' + s.items.filter((it) => !Validation.isBlank(merged[it.id])).length + '/' + s.items.length + ' answered).', { stageInstanceId: s.id, stageOrder: s.order });
        return s;
      });
    },

    approve(requestId, stageId, actorId, opts) {
      return Store.transaction(() => {
        const chk = WorkflowEngine.canAct(requestId, stageId, actorId);
        if (!chk.ok) throw new BusinessError(chk.reason);
        const comment = (opts && opts.comment) || '';
        Validation.assert(Validation.decisionComment('approve', comment));
        const answers = Object.assign({}, chk.stage.answers, (opts && opts.answers) || {});
        Validation.assert(Validation.answers(chk.stage.items, answers, { forApprove: true }), 'Complete the checklist points before ' + (chk.stage.requiresApproval === false ? 'completing the stage.' : 'approving.'));
        const ids = approversOf(chk.stage);
        if (chk.stage.approvalRule === 'all' && chk.stage.requiresApproval !== false && ids.length > 1) {
          const now = Clock.now();
          const approvals = (chk.stage.approvals || []).concat([{ userId: actorId, at: now, comment }]);
          const waiting = ids.filter((id) => !approvals.some((a) => a.userId === id));
          if (waiting.length) {
            const st = Store.update('stageInstances', chk.stage.id, { approvals, answers, answersUpdatedAt: now });
            recordDecision(chk.request, st, 'Approved', actorId, comment);
            log(requestId, EV.STAGE_PARTIAL, actorId, 'Stage ' + st.order + ' approved by ' + userName(actorId) + ' (' + approvals.length + ' of ' + ids.length + '). Waiting for ' + waiting.map(userName).join(', ') + '.' + (comment ? ' Comment: ' + comment : ''), { stageInstanceId: st.id, stageOrder: st.order });
            waiting.forEach((id) => notify(id, requestId, requestId + ': ' + userName(actorId) + ' approved Stage ' + st.order + '. Your approval is still needed.'));
            return Store.get('requests', requestId);
          }
          const st = Store.update('stageInstances', chk.stage.id, { approvals });
          return closeStageAndAdvance(chk.request, st, actorId, SS.APPROVED, comment, answers);
        }
        return closeStageAndAdvance(chk.request, chk.stage, actorId, SS.APPROVED, comment, answers);
      });
    },

    skip(requestId, stageId, actorId, opts) {
      return Store.transaction(() => {
        if (!Store.settings().allowSkipOptional) throw new BusinessError('Skipping optional stages is disabled in System Settings.');
        const chk = WorkflowEngine.canAct(requestId, stageId, actorId);
        if (!chk.ok) throw new BusinessError(chk.reason);
        if (chk.stage.mandatory) throw new BusinessError('Mandatory stages cannot be skipped.');
        const comment = (opts && opts.comment) || '';
        Validation.assert(Validation.decisionComment('skip', comment));
        return closeStageAndAdvance(chk.request, chk.stage, actorId, SS.SKIPPED, comment, Object.assign({}, chk.stage.answers, (opts && opts.answers) || {}));
      });
    },

    /** Any assigned approver can reject; rejection stops the workflow. */
    reject(requestId, stageId, actorId, opts) {
      return Store.transaction(() => {
        const chk = WorkflowEngine.canAct(requestId, stageId, actorId);
        if (!chk.ok) throw new BusinessError(chk.reason);
        const comment = (opts && opts.comment) || '';
        Validation.assert(Validation.decisionComment('reject', comment));
        const now = Clock.now();
        const answers = Object.assign({}, chk.stage.answers, (opts && opts.answers) || {});
        const stage = Store.update('stageInstances', stageId, {
          status: SS.REJECTED, answers, decidedAt: now, decidedBy: actorId, comment,
          cycles: (chk.stage.cycles || []).concat([{ cycle: chk.stage.cycle, status: SS.REJECTED, by: actorId, at: now, comment }])
        });
        recordDecision(chk.request, stage, 'Rejected', actorId, comment);
        const r = Store.update('requests', requestId, { status: RS.REJECTED, rejectedAt: now, updatedAt: now, currentStageOrder: null, closedAtStage: stage.order });
        log(requestId, EV.REJECTED, actorId, 'Rejected at Stage ' + stage.order + ' "' + stage.stageName + '": ' + comment + ' Workflow stopped; remaining stages will not be executed.', { stageInstanceId: stage.id, stageOrder: stage.order });
        notify(r.requesterId, r.id, r.id + ' was rejected at Stage ' + stage.order + ' by ' + userName(actorId) + '.');
        return r;
      });
    },

    returnForCorrection(requestId, stageId, actorId, opts) {
      return Store.transaction(() => {
        const chk = WorkflowEngine.canAct(requestId, stageId, actorId);
        if (!chk.ok) throw new BusinessError(chk.reason);
        const comment = (opts && opts.comment) || '';
        Validation.assert(Validation.decisionComment('return', comment));
        const now = Clock.now();
        const behavior = Store.settings().returnBehavior === 'restart' ? 'restart' : 'resume';
        const answers = Object.assign({}, chk.stage.answers, (opts && opts.answers) || {});
        const stage = Store.update('stageInstances', stageId, {
          status: SS.RETURNED, answers, decidedAt: now, decidedBy: actorId, comment,
          cycles: (chk.stage.cycles || []).concat([{ cycle: chk.stage.cycle, status: SS.RETURNED, by: actorId, at: now, comment }])
        });
        recordDecision(chk.request, stage, 'Returned', actorId, comment);
        const r = Store.update('requests', requestId, {
          status: RS.RETURNED, updatedAt: now,
          returnInfo: { stageInstanceId: stage.id, stageOrder: stage.order, stageName: stage.stageName, by: actorId, byName: userName(actorId), at: now, comment, behavior }
        });
        log(requestId, EV.RETURNED, actorId, 'Returned for correction at Stage ' + stage.order + ' "' + stage.stageName + '": ' + comment, { stageInstanceId: stage.id, stageOrder: stage.order });
        notify(r.requesterId, r.id, r.id + ' was returned for correction by ' + userName(actorId) + ': ' + comment);
        return r;
      });
    },

    /**
     * Resubmission after Return for Correction. The request keeps its ORIGINAL
     * workflow version. Behaviour (captured when the request was returned):
     *  - resume:  the returning stage is re-activated; earlier approvals stand.
     *  - restart: every stage goes back to Waiting and Stage 1 is re-activated.
     * All previous decisions remain in the decision log and stage cycle history.
     */
    resubmit(requestId, actorId, changes) {
      return Store.transaction(() => {
        const r = getRequestOrFail(requestId);
        if (r.requesterId !== actorId) throw new BusinessError('Only the requester can resubmit this request.');
        if (r.status !== RS.RETURNED) throw new BusinessError('Only requests returned for correction can be resubmitted.');
        const data = sanitizeInput(Object.assign({}, r, changes || {}));
        Validation.assert(Validation.requestInput(Object.assign({ templateId: r.templateId }, data)), 'Please correct the request information.');
        const changed = ['subject', 'details', 'priority', 'neededBy'].filter((k) => String(r[k] || '') !== String(data[k] || ''));
        if (JSON.stringify(r.attachments || []) !== JSON.stringify(data.attachments)) changed.push('attachments');

        const now = Clock.now();
        const behavior = (r.returnInfo && r.returnInfo.behavior) || 'resume';
        const stages = getStages(r.id);
        let activate;
        if (behavior === 'restart') {
          stages.forEach((s) => {
            Store.update('stageInstances', s.id, { status: SS.WAITING, cycle: s.cycle + 1, decidedAt: null, decidedBy: null, comment: '', approvals: [], activatedAt: null });
          });
          activate = stages[0];
        } else {
          activate = stages.find((s) => s.id === r.returnInfo.stageInstanceId);
          Store.update('stageInstances', activate.id, { status: SS.WAITING, cycle: activate.cycle + 1, decidedAt: null, decidedBy: null, comment: '', approvals: [] });
        }
        const anyApproved = behavior === 'resume' && stages.some((s) => s.order < activate.order && (s.status === SS.APPROVED || s.status === SS.SKIPPED));
        const updated = Store.update('requests', r.id, Object.assign(data, {
          status: anyApproved ? RS.IN_PROGRESS : RS.PENDING,
          currentStageOrder: activate.order,
          resubmissionCount: (r.resubmissionCount || 0) + 1,
          lastReturnInfo: r.returnInfo,
          returnInfo: null,
          updatedAt: now
        }));
        log(r.id, EV.RESUBMITTED, actorId, 'Resubmitted after correction (' + (behavior === 'restart' ? 'workflow restarted from Stage 1' : 'resumed at Stage ' + activate.order) + '). ' +
          (changed.length ? 'Changed: ' + changed.join(', ') + '.' : 'No field changes.') + ' Original workflow version v' + r.versionNumber + ' retained.');
        const after = activateStage(updated, Store.get('stageInstances', activate.id), now, true);
        return after || Store.get('requests', r.id);
      });
    },

    /** Department Execution Team marks its concerned-department work as done. */
    completeExecution(requestId, departmentId, actorId, note) {
      return Store.transaction(() => {
        const actor = getActorOrFail(actorId);
        const r = getRequestOrFail(requestId);
        if (r.status !== RS.APPROVED) throw new BusinessError('Execution can be recorded only for fully approved requests.');
        if (!Auth.hasRole(actor, 'execution')) throw new BusinessError('Only Department Execution Team members can record execution.');
        if (actor.departmentId !== departmentId) throw new BusinessError('You can record execution only for your own department.');
        const tasks = Store.clone(r.executionTasks || []);
        const task = tasks.find((t) => t.departmentId === departmentId);
        if (!task) throw new BusinessError('This department has no execution task on ' + r.id + '.');
        if (task.status === 'Done') throw new BusinessError('Execution for this department is already recorded.');
        const now = Clock.now();
        Object.assign(task, { status: 'Done', by: actorId, byName: actor.name, at: now, note: note || '' });
        const dept = Store.get('departments', departmentId);
        log(r.id, EV.EXECUTION_COMPLETED, actorId, (dept ? dept.name : departmentId) + ' completed its execution tasks.' + (note ? ' Note: ' + note : ''));
        const allDone = tasks.every((t) => t.status === 'Done');
        const updated = Store.update('requests', r.id, { executionTasks: tasks, updatedAt: now, status: allDone ? RS.COMPLETED : r.status, completedAt: allDone ? now : null });
        if (allDone) {
          log(r.id, EV.COMPLETED, null, 'All concerned departments completed execution. Request closed.');
          notify(r.requesterId, r.id, r.id + ' is completed.');
        }
        return updated;
      });
    },

    // ------------------------------------------------------------- queries
    getStages,
    getHistory(requestId) {
      return Store.where('history', (h) => h.requestId === requestId).sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    },
    getDecisions(requestId) {
      return Store.where('decisions', (d) => d.requestId === requestId).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    },
    currentStage(requestId) {
      const r = Store.get('requests', requestId);
      if (!r || !r.currentStageOrder) return null;
      return getStages(requestId).find((s) => s.order === r.currentStageOrder) || null;
    },
    /** Stages where this user still has to act (not yet approved by them). */
    pendingFor(userId) {
      return Store.where('stageInstances', (s) => approversOf(s).includes(userId) && s.status === SS.PENDING && !(s.approvals || []).some((a) => a.userId === userId))
        .map((s) => ({ stage: s, request: Store.get('requests', s.requestId) }))
        .filter((x) => x.request && C.ACTIVE_REQUEST_STATUSES.includes(x.request.status) && x.request.currentStageOrder === x.stage.order);
    },
    upcomingFor(userId) {
      return Store.where('stageInstances', (s) => approversOf(s).includes(userId) && s.status === SS.WAITING)
        .map((s) => ({ stage: s, request: Store.get('requests', s.requestId) }))
        .filter((x) => x.request && (C.ACTIVE_REQUEST_STATUSES.includes(x.request.status) || x.request.status === RS.RETURNED));
    },
    processedBy(userId) {
      return Store.where('decisions', (d) => d.actorId === userId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    },
    executionTasksFor(user) {
      if (!Auth.hasRole(user, 'execution')) return [];
      return Store.where('requests', (r) => r.status === RS.APPROVED && (r.executionTasks || []).some((t) => t.departmentId === user.departmentId && t.status !== 'Done'));
    }
  };

  DRS.WorkflowEngine = WorkflowEngine;
})(typeof window !== 'undefined' ? window : globalThis);
