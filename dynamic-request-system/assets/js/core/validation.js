/**
 * validation.js
 * Pure validation rules. Returns arrays of human-readable messages so the same
 * rules can be reused by the UI and, later, by the Node.js API layer.
 */
(function (global) {
  'use strict';
  const DRS = (global.DRS = global.DRS || {});
  const { Store, C } = DRS;

  class BusinessError extends Error {
    constructor(message, details) {
      super(message);
      this.name = 'BusinessError';
      this.details = details || [];
    }
  }

  const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
  const isPositiveInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0 && String(v).trim() !== '';

  function stageLabel(stage, index) {
    return 'Stage ' + (index + 1) + (stage && stage.stageName ? ' (' + stage.stageName + ')' : '');
  }

  const Validation = {
    BusinessError,
    isBlank,

    /**
     * Validates a request template.
     * forActivation=true applies the full rule set required for an Active template
     * (and therefore for creating a workflow version).
     */
    template(t, opts) {
      const forActivation = !!(opts && opts.forActivation);
      const errors = [];
      const warnings = [];
      const departments = Store.all('departments');
      const deptById = Object.fromEntries(departments.map((d) => [d.id, d]));

      if (isBlank(t.name)) errors.push('Template Name is required.');
      else {
        const clash = Store.all('requestTemplates').find((x) => x.id !== t.id && x.name.trim().toLowerCase() === t.name.trim().toLowerCase());
        if (clash) errors.push('A template named "' + t.name.trim() + '" already exists.');
      }
      if (isBlank(t.requestType)) errors.push('Request Type is required.');

      // Exactly one Owner Department
      if (isBlank(t.ownerDepartmentId) || Array.isArray(t.ownerDepartmentId)) errors.push('Exactly one Owner Department is required.');
      else if (!deptById[t.ownerDepartmentId]) errors.push('Owner Department does not exist.');
      else if (!deptById[t.ownerDepartmentId].active) errors.push('Owner Department "' + deptById[t.ownerDepartmentId].name + '" is inactive.');

      // Concerned Departments: unique list, managed independently of stages
      const concerned = t.concernedDepartmentIds || [];
      const seen = new Set();
      concerned.forEach((id) => {
        if (seen.has(id)) errors.push('Concerned Department "' + ((deptById[id] || {}).name || id) + '" is listed more than once. Each department may appear only once.');
        seen.add(id);
        if (!deptById[id]) errors.push('Concerned Department "' + id + '" does not exist.');
      });
      if (forActivation && concerned.length === 0) errors.push('Active templates must have at least one Concerned Department.');

      // Hierarchy type
      if (!C.HIERARCHIES[t.hierarchyType || 'none']) errors.push('Unknown approval hierarchy type.');

      // Stages
      const stages = t.stages || [];
      const activeStages = stages.filter((s) => s.status !== 'Inactive');
      if (forActivation && activeStages.length === 0) errors.push('Active templates must have at least one active Checklist / Approval Stage.');
      stages.forEach((s, i) => Validation.stage(s, i, { forActivation, deptById }).forEach((m) => errors.push(m)));

      // Mandatory hierarchy must be complete, active and in its fixed relative order
      const hierarchy = C.HIERARCHIES[t.hierarchyType || 'none'];
      if (hierarchy && hierarchy.stages.length) {
        const keysInOrder = stages.filter((s) => s.hierarchyKey).map((s) => s.hierarchyKey);
        const required = hierarchy.stages.map((h) => h.hierarchyKey);
        const missing = required.filter((k) => !keysInOrder.includes(k));
        if (missing.length) errors.push('Mandatory ' + hierarchy.label + ' approval stages are missing: ' + missing.join(', ') + '.');
        else if (keysInOrder.filter((k) => required.includes(k)).join('>') !== required.join('>')) {
          errors.push('Mandatory approval stages must keep the order: ' + hierarchy.description + '.');
        }
        stages.filter((s) => s.hierarchyKey).forEach((s) => {
          const def = hierarchy.stages.find((h) => h.hierarchyKey === s.hierarchyKey);
          if (!def) errors.push('Stage "' + s.stageName + '" belongs to a different approval hierarchy.');
          else {
            if (s.status === 'Inactive') errors.push('Mandatory stage "' + s.stageName + '" cannot be inactive.');
            if (!s.mandatory) errors.push('Mandatory stage "' + s.stageName + '" cannot be optional.');
            if (s.approverMode !== 'role' || s.approverRoleKey !== def.roleKey) errors.push('Mandatory stage "' + s.stageName + '" must keep its approver role (' + C.APPROVER_ROLES[def.roleKey].label + ').');
          }
        });
      } else if (stages.some((s) => s.hierarchyKey)) {
        errors.push('Template contains locked hierarchy stages but no hierarchy type is selected.');
      }

      // Warnings (do not block saving)
      let lastLevel = 0;
      activeStages.forEach((s) => {
        const lvl = Number(s.approvalLevel);
        if (lvl < lastLevel) warnings.push('Approval levels are not ascending at "' + s.stageName + '" (Level ' + lvl + ' after Level ' + lastLevel + ').');
        lastLevel = Math.max(lastLevel, lvl || 0);
      });
      const executing = new Set(activeStages.filter((s) => s.checklistTemplateId && s.departmentId !== C.REQUESTER_DEPT).map((s) => s.departmentId));
      executing.forEach((id) => {
        if (!concerned.includes(id) && deptById[id]) warnings.push(deptById[id].name + ' executes a checklist but is not a Concerned Department.');
      });

      return { errors: dedupe(errors), warnings: dedupe(warnings) };
    },

    stage(s, i, ctx) {
      const errors = [];
      const label = stageLabel(s, i);
      const deptById = (ctx && ctx.deptById) || Object.fromEntries(Store.all('departments').map((d) => [d.id, d]));
      const forActivation = !!(ctx && ctx.forActivation);
      if (isBlank(s.stageName)) errors.push(label + ': Stage Name is required.');
      if (isBlank(s.departmentId)) errors.push(label + ': Department is required.');
      else if (s.departmentId === C.REQUESTER_DEPT) {
        const role = C.APPROVER_ROLES[s.approverRoleKey];
        if (s.approverMode !== 'role' || !role || role.scope !== 'requester') errors.push(label + ": \"Requester's Department\" can only be used with a requester-relative approver role.");
      } else if (!deptById[s.departmentId]) errors.push(label + ': Department does not exist.');
      else if (forActivation && !deptById[s.departmentId].active) errors.push(label + ': Department "' + deptById[s.departmentId].name + '" is inactive.');
      if (!isPositiveInt(s.approvalLevel)) errors.push(label + ': Approval Level must be a positive whole number.');
      if (s.approverMode === 'user') {
        const u = isBlank(s.approverUserId) ? null : Store.get('users', s.approverUserId);
        if (!u) errors.push(label + ': Assigned Approver is required.');
        else if (!u.active) errors.push(label + ': Assigned Approver "' + u.name + '" is inactive.');
        else if (!u.roles.includes('approver')) errors.push(label + ': "' + u.name + '" does not have the Approver role.');
      } else if (s.approverMode === 'role') {
        const role = C.APPROVER_ROLES[s.approverRoleKey];
        if (!role) errors.push(label + ': Approver Role is required.');
        else if (role.scope === 'stage' && (s.departmentId === C.REQUESTER_DEPT || !deptById[s.departmentId])) errors.push(label + ': "' + role.label + '" needs a specific stage department.');
        else if (role.scope === 'stage' && deptById[s.departmentId] && !deptById[s.departmentId][role.field]) errors.push(label + ': ' + deptById[s.departmentId].name + ' has no ' + (role.field === 'managerId' ? 'manager' : 'supervisor') + ' configured.');
        else if (role.scope === 'dept') {
          const dept = Object.values(deptById).find((d) => d.code === role.deptCode);
          if (!dept || !dept[role.field]) errors.push(label + ': No ' + role.label + ' is configured in Departments & Users.');
        }
      } else errors.push(label + ': Choose how the approver is assigned.');
      if (isBlank(s.approverRole)) errors.push(label + ': Approver Role title is required.');
      // Additional approvers + approval rule
      const rule = s.approvalRule || 'any';
      if (!['any', 'all', 'none'].includes(rule)) errors.push(label + ': choose a valid approval rule.');
      const extra = s.additionalApprovers || [];
      const seenUsers = new Set(s.approverMode === 'user' && s.approverUserId ? [s.approverUserId] : []);
      const seenRoles = new Set(s.approverMode === 'role' && s.approverRoleKey ? [s.approverRoleKey] : []);
      extra.forEach((a, j) => {
        const n = label + ': additional approver ' + (j + 1);
        if (a.approverMode === 'role') {
          const role = C.APPROVER_ROLES[a.approverRoleKey];
          if (!role) errors.push(n + ' – choose a role.');
          else if (seenRoles.has(a.approverRoleKey)) errors.push(n + ' – role is already assigned to this stage.');
          else if (role.scope === 'stage' && (s.departmentId === C.REQUESTER_DEPT || !deptById[s.departmentId])) errors.push(n + ' – "' + role.label + '" needs a specific stage department.');
          seenRoles.add(a.approverRoleKey);
        } else {
          const u = isBlank(a.approverUserId) ? null : Store.get('users', a.approverUserId);
          if (!u) errors.push(n + ' – choose a user.');
          else if (!u.active) errors.push(n + ' – "' + u.name + '" is inactive.');
          else if (!u.roles.includes('approver')) errors.push(n + ' – "' + u.name + '" does not have the Approver role.');
          else if (seenUsers.has(u.id)) errors.push(n + ' – "' + u.name + '" is already assigned to this stage.');
          if (u) seenUsers.add(u.id);
        }
      });
      if (s.hierarchyKey && (extra.length || rule !== 'any')) errors.push(label + ': mandatory hierarchy stages keep a single approver with the "Any one approves" rule.');
      if (s.checklistTemplateId) {
        const cl = Store.get('checklistTemplates', s.checklistTemplateId);
        if (!cl) errors.push(label + ': Checklist Template no longer exists.');
        else if (forActivation && !cl.active) errors.push(label + ': Checklist "' + cl.name + '" is inactive.');
        else if (forActivation && (!cl.items || !cl.items.length)) errors.push(label + ': Checklist "' + cl.name + '" has no items.');
      }
      return errors;
    },

    checklist(c) {
      const errors = [];
      if (isBlank(c.name)) errors.push('Checklist name is required.');
      else {
        const clash = Store.all('checklistTemplates').find((x) => x.id !== c.id && x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
        if (clash) errors.push('A checklist named "' + c.name.trim() + '" already exists.');
      }
      if (isBlank(c.departmentId)) errors.push('Department is required: every checklist belongs to one department.');
      else if (!Store.get('departments', c.departmentId)) errors.push('Department does not exist.');
      const est = c.estimateValue !== undefined ? c.estimateValue : c.estimatedHours;
      if (!isBlank(est) && (isNaN(Number(est)) || Number(est) < 0)) errors.push('Estimation Time must be zero or a positive number.');
      if (!c.items || !c.items.length) errors.push('Add at least one point.');
      (c.items || []).forEach((it, i) => {
        const n = 'Point ' + (i + 1);
        if (isBlank(it.label)) errors.push(n + ': text is required.');
        if (!C.ITEM_TYPES[it.type]) errors.push(n + ': choose a valid item type.');
        if (it.type === 'dropdown') {
          const opts = (it.options || []).map((o) => String(o).trim()).filter(Boolean);
          if (opts.length < 2) errors.push(n + ': dropdown items need at least two options.');
          if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) errors.push(n + ': dropdown options must be unique.');
        }
      });
      return errors;
    },

    requestInput(input) {
      const errors = [];
      if (isBlank(input.templateId)) errors.push('Select a request template.');
      if (isBlank(input.subject)) errors.push('Request Subject is required.');
      else if (String(input.subject).trim().length < 5) errors.push('Request Subject must be at least 5 characters.');
      else if (String(input.subject).length > 150) errors.push('Request Subject must be 150 characters or fewer.');
      if (isBlank(input.details)) errors.push('Request Details are required.');
      if (input.priority && !C.PRIORITIES.includes(input.priority)) errors.push('Invalid priority.');
      if (input.neededBy && isNaN(new Date(input.neededBy).getTime())) errors.push('Needed-by date is invalid.');
      return errors;
    },

    /**
     * Checks checklist answers before a stage is approved / completed.
     *  - Required points must be answered.
     *  - "Need Attached" points need at least one attached file when answered (always when required).
     *  - "Link to Action" points gate the approval action: Yes/No points must be "Yes",
     *    other point types must be answered.
     */
    answers(items, answers, opts) {
      const errors = [];
      const forApprove = !opts || opts.forApprove !== false;
      (items || []).forEach((it) => {
        const v = (answers || {})[it.id];
        const empty = it.type === 'attachment' ? !(Array.isArray(v) && v.length) : isBlank(v);
        const files = (answers || {})[C.filesKey(it.id)];
        if (it.required && empty) errors.push('"' + it.label + '" is mandatory.');
        if (it.needAttachment && (it.required || !empty) && !(Array.isArray(files) && files.length)) errors.push('"' + it.label + '" needs an attached file.');
        if (forApprove && it.linkToAction && (it.type === 'yesno' ? v !== 'Yes' : empty)) {
          errors.push('"' + it.label + '" is linked to the approval action and must be ' + (it.type === 'yesno' ? '"Yes"' : 'answered') + ' before the stage can be approved. Otherwise return or reject the request.');
        }
        if (!empty && it.type === 'number' && isNaN(Number(v))) errors.push('"' + it.label + '" must be a number.');
        if (!empty && it.type === 'date' && isNaN(new Date(v).getTime())) errors.push('"' + it.label + '" must be a valid date.');
        if (!empty && it.type === 'yesno' && !['Yes', 'No'].includes(v)) errors.push('"' + it.label + '" must be Yes or No.');
        if (!empty && it.type === 'dropdown' && !(it.options || []).includes(v)) errors.push('"' + it.label + '" has an invalid option.');
      });
      return errors;
    },

    decisionComment(action, comment) {
      if (['reject', 'return', 'skip'].includes(action) && isBlank(comment)) {
        const name = { reject: 'Rejection', return: 'Return for Correction', skip: 'Skipping a stage' }[action];
        return [name + ' requires a comment.'];
      }
      if (comment && String(comment).length > 2000) return ['Comment must be 2000 characters or fewer.'];
      return [];
    },

    department(d) {
      const errors = [];
      const all = Store.all('departments');
      if (isBlank(d.name)) errors.push('Department name is required.');
      if (isBlank(d.code)) errors.push('Department code is required.');
      if (!isBlank(d.name) && all.some((x) => x.id !== d.id && x.name.toLowerCase() === d.name.trim().toLowerCase())) errors.push('Department name already exists.');
      if (!isBlank(d.code) && all.some((x) => x.id !== d.id && x.code.toLowerCase() === d.code.trim().toLowerCase())) errors.push('Department code already exists.');
      return errors;
    },

    user(u) {
      const errors = [];
      const all = Store.all('users');
      if (isBlank(u.name)) errors.push('Full name is required.');
      if (isBlank(u.email) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) errors.push('A valid email is required.');
      else if (all.some((x) => x.id !== u.id && x.email.toLowerCase() === u.email.trim().toLowerCase())) errors.push('Email already used by another user.');
      if (isBlank(u.departmentId)) errors.push('Department is required.');
      if (!u.roles || !u.roles.length) errors.push('Assign at least one role.');
      if (u.managerId && u.managerId === u.id) errors.push('A user cannot be their own manager.');
      if (u.managerId && u.id) {
        // prevent cycles in the management chain
        let cursor = u.managerId; const guard = new Set();
        while (cursor && !guard.has(cursor)) {
          if (cursor === u.id) { errors.push('This manager assignment would create a reporting cycle.'); break; }
          guard.add(cursor);
          const m = all.find((x) => x.id === cursor); cursor = m ? m.managerId : null;
        }
      }
      return errors;
    },

    /** Throws a BusinessError when errors exist. */
    assert(errors, message) {
      if (errors && errors.length) throw new BusinessError(message || errors[0], errors);
    }
  };

  function dedupe(list) { return Array.from(new Set(list)); }

  DRS.BusinessError = BusinessError;
  DRS.Validation = Validation;
})(typeof window !== 'undefined' ? window : globalThis);
