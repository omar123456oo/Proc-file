/**
 * template-service.js
 * Configuration business logic: request templates, workflow versions,
 * checklist templates, departments and users. Admin-only writes.
 */
(function (global) {
  'use strict';
  const DRS = (global.DRS = global.DRS || {});
  const { Store, Clock, C, Validation, Auth, BusinessError } = DRS;
  const TS = C.TEMPLATE_STATUS;

  function normalizeStages(stages) {
    return (stages || []).map((s, i) => ({
      id: s.id || Store.uid('stg'),
      stageName: String(s.stageName || '').trim(),
      departmentId: s.departmentId || '',
      checklistTemplateId: s.checklistTemplateId || null,
      approvalLevel: Number(s.approvalLevel),
      approverMode: s.approverMode === 'role' ? 'role' : 'user',
      approverUserId: s.approverMode === 'role' ? null : s.approverUserId || null,
      approverRoleKey: s.approverMode === 'role' ? s.approverRoleKey || null : null,
      approverRole: String(s.approverRole || '').trim(),
      additionalApprovers: s.hierarchyKey ? [] : (s.additionalApprovers || []).map((a) => ({
        approverMode: a.approverMode === 'role' ? 'role' : 'user',
        approverUserId: a.approverMode === 'role' ? null : a.approverUserId || null,
        approverRoleKey: a.approverMode === 'role' ? a.approverRoleKey || null : null
      })),
      approvalRule: ['any', 'all', 'none'].includes(s.approvalRule) ? s.approvalRule : 'any',
      stageOrder: i + 1,
      mandatory: s.mandatory !== false,
      status: s.status === 'Inactive' ? 'Inactive' : 'Active',
      locked: !!s.hierarchyKey,
      hierarchyKey: s.hierarchyKey || null
    }));
  }

  /** Workflow-relevant configuration. Any difference => new workflow version. */
  function fingerprint(t) {
    const checklistVersions = {};
    (t.stages || []).forEach((s) => {
      if (s.checklistTemplateId) {
        const cl = Store.get('checklistTemplates', s.checklistTemplateId);
        checklistVersions[s.checklistTemplateId] = cl ? cl.version : null;
      }
    });
    return JSON.stringify({
      owner: t.ownerDepartmentId,
      concerned: t.concernedDepartmentIds || [],
      hierarchy: t.hierarchyType || 'none',
      stages: normalizeStages(t.stages).map((s) => Object.assign({}, s, { id: undefined })),
      checklistVersions
    });
  }

  function createVersion(template, actorId, changeNote) {
    const previous = template.currentVersionId ? Store.get('workflowVersions', template.currentVersionId) : null;
    const checklists = {};
    template.stages.forEach((s) => {
      if (s.checklistTemplateId && !checklists[s.checklistTemplateId]) {
        const cl = Store.get('checklistTemplates', s.checklistTemplateId);
        checklists[cl.id] = { id: cl.id, name: cl.name, version: cl.version, departmentId: cl.departmentId, estimatedHours: cl.estimatedHours, estimateValue: cl.estimateValue, estimateUnit: cl.estimateUnit || 'hour', requiresApproval: cl.requiresApproval !== false, items: Store.clone(cl.items) };
      }
    });
    const version = Store.insert('workflowVersions', {
      id: Store.uid('wfv'),
      templateId: template.id,
      versionNumber: previous ? previous.versionNumber + 1 : 1,
      createdAt: Clock.now(),
      createdBy: actorId,
      createdByName: (Store.get('users', actorId) || {}).name || 'System',
      changeNote: changeNote || (previous ? 'Workflow configuration updated.' : 'Initial workflow version.'),
      templateName: template.name,
      requestType: template.requestType,
      ownerDepartmentId: template.ownerDepartmentId,
      concernedDepartmentIds: Store.clone(template.concernedDepartmentIds),
      hierarchyType: template.hierarchyType || 'none',
      stages: Store.clone(template.stages),
      checklists,
      fingerprint: fingerprint(template)
    });
    return version;
  }

  function versionIsCurrent(template) {
    if (!template.currentVersionId) return false;
    const v = Store.get('workflowVersions', template.currentVersionId);
    return !!v && v.fingerprint === fingerprint(template);
  }

  const TemplateService = {
    fingerprint,
    normalizeStages,

    blankTemplate() {
      return { id: null, name: '', requestType: '', description: '', ownerDepartmentId: '', concernedDepartmentIds: [], status: TS.ACTIVE, hierarchyType: 'none', stages: [] };
    },

    /** Builds locked stage configs for a mandatory hierarchy. */
    hierarchyStages(type, startLevel) {
      const h = C.HIERARCHIES[type] || C.HIERARCHIES.none;
      return h.stages.map((def, i) => {
        const dept = def.deptCode ? Store.all('departments').find((d) => d.code === def.deptCode) : null;
        return {
          id: Store.uid('stg'),
          stageName: def.stageName,
          departmentId: def.departmentId || (dept ? dept.id : ''),
          checklistTemplateId: null,
          approvalLevel: (startLevel || 1) + i,
          approverMode: 'role',
          approverUserId: null,
          approverRoleKey: def.roleKey,
          approverRole: def.approverRole,
          mandatory: true,
          status: 'Active',
          locked: true,
          hierarchyKey: def.hierarchyKey
        };
      });
    },

    /**
     * Saves a template. Creates a new immutable workflow version when the
     * workflow configuration changed and is complete. Returns {template, version, versionCreated, warnings}.
     */
    save(draft, actorId, changeNote) {
      return Store.transaction(() => {
        Auth.requireAdmin(actorId);
        const existing = draft.id ? Store.get('requestTemplates', draft.id) : null;
        if (existing && existing.status === TS.ARCHIVED) throw new BusinessError('Archived legacy templates are read-only.');
        if (draft.status === TS.ARCHIVED && (!existing || existing.status !== TS.ARCHIVED)) throw new BusinessError('Use the Archive action to archive a template.');
        const t = Object.assign({}, existing || {}, {
          id: draft.id || Store.uid('tpl'),
          name: String(draft.name || '').trim(),
          requestType: String(draft.requestType || '').trim(),
          description: String(draft.description || '').trim(),
          ownerDepartmentId: draft.ownerDepartmentId,
          concernedDepartmentIds: Store.clone(draft.concernedDepartmentIds || []),
          status: draft.status === TS.ACTIVE ? TS.ACTIVE : TS.INACTIVE,
          hierarchyType: draft.hierarchyType || 'none',
          stages: normalizeStages(draft.stages)
        });
        const basic = Validation.template(t, { forActivation: false });
        Validation.assert(basic.errors, 'Please fix the template configuration.');
        const full = Validation.template(t, { forActivation: true });
        if (t.status === TS.ACTIVE) Validation.assert(full.errors, 'This template cannot be Active until its configuration is complete.');

        const now = Clock.now();
        t.updatedAt = now; t.updatedBy = actorId;
        if (!existing) { t.createdAt = now; t.createdBy = actorId; t.currentVersionId = null; t.versionNumber = 0; }

        let version = null;
        if (!full.errors.length && !versionIsCurrent(t)) {
          version = createVersion(t, actorId, changeNote);
          t.currentVersionId = version.id;
          t.versionNumber = version.versionNumber;
        }
        t.hasUnpublishedChanges = !versionIsCurrent(t);
        const saved = existing ? Store.update('requestTemplates', t.id, t) : Store.insert('requestTemplates', t);
        return { template: saved, version, versionCreated: !!version, warnings: full.warnings, incomplete: full.errors };
      });
    },

    setStatus(templateId, status, actorId) {
      const t = Store.get('requestTemplates', templateId);
      if (!t) throw new BusinessError('Template not found.');
      if (t.status === TS.ARCHIVED) throw new BusinessError('Archived legacy templates cannot be re-activated.');
      return TemplateService.save(Object.assign({}, t, { status }), actorId);
    },

    archive(templateId, actorId) {
      return Store.transaction(() => {
        Auth.requireAdmin(actorId);
        const t = Store.get('requestTemplates', templateId);
        if (!t) throw new BusinessError('Template not found.');
        return Store.update('requestTemplates', t.id, { status: TS.ARCHIVED, archivedAt: Clock.now(), updatedBy: actorId });
      });
    },

    duplicate(templateId, actorId) {
      Auth.requireAdmin(actorId);
      const t = Store.get('requestTemplates', templateId);
      if (!t) throw new BusinessError('Template not found.');
      let name = t.name + ' (Copy)'; let n = 2;
      while (Store.count('requestTemplates', (x) => x.name.toLowerCase() === name.toLowerCase())) name = t.name + ' (Copy ' + n++ + ')';
      const copy = {
        id: null, name, requestType: t.requestType, description: t.description, ownerDepartmentId: t.ownerDepartmentId,
        concernedDepartmentIds: t.concernedDepartmentIds.slice(), status: TS.INACTIVE, hierarchyType: t.hierarchyType,
        stages: t.stages.map((s) => Object.assign({}, s, { id: null }))
      };
      return TemplateService.save(copy, actorId, 'Duplicated from "' + t.name + '".');
    },

    remove(templateId, actorId) {
      return Store.transaction(() => {
        Auth.requireAdmin(actorId);
        const used = Store.count('requests', (r) => r.templateId === templateId);
        if (used) throw new BusinessError('This template has ' + used + ' request(s). Historical requests must remain unchanged, so deactivate or archive it instead.');
        Store.where('workflowVersions', (v) => v.templateId === templateId).forEach((v) => Store.remove('workflowVersions', v.id));
        return Store.remove('requestTemplates', templateId);
      });
    },

    versions(templateId) {
      return Store.where('workflowVersions', (v) => v.templateId === templateId).sort((a, b) => b.versionNumber - a.versionNumber);
    },
    usage(templateId) {
      return Store.count('requests', (r) => r.templateId === templateId);
    },

    // ------------------------------------------------------------ checklists
    blankChecklist() {
      return { id: null, name: '', description: '', departmentId: '', estimateValue: '', estimateUnit: 'hour', estimatedHours: '', requiresApproval: true, active: true, items: [] };
    },
    checklistUsage(checklistId) {
      return Store.where('requestTemplates', (t) => t.stages.some((s) => s.checklistTemplateId === checklistId));
    },
    /**
     * Saves a checklist template. Item changes increase its version and publish
     * new workflow versions for complete templates that use it. Requests already
     * submitted keep their own snapshot of the items.
     */
    saveChecklist(draft, actorId) {
      return Store.transaction(() => {
        Auth.requireAdmin(actorId);
        const items = (draft.items || []).map((it) => ({
          id: it.id || Store.uid('itm'),
          label: String(it.label || '').trim(),
          type: it.type,
          required: !!it.required,
          needAttachment: !!it.needAttachment,
          linkToAction: !!it.linkToAction,
          helpText: String(it.helpText || '').trim(),
          options: it.type === 'dropdown' ? (it.options || []).map((o) => String(o).trim()).filter(Boolean) : []
        }));
        const c = {
          id: draft.id || null, name: String(draft.name || '').trim(), description: String(draft.description || '').trim(), departmentId: draft.departmentId || '',
          estimateUnit: draft.estimateUnit === 'day' ? 'day' : 'hour',
          estimateValue: (function () {
            const v = draft.estimateValue !== undefined ? draft.estimateValue : draft.estimatedHours;
            return v === '' || v === null || v === undefined ? '' : Number(v);
          })(),
          requiresApproval: draft.requiresApproval !== false, active: draft.active !== false, items
        };
        c.estimatedHours = c.estimateValue === '' ? '' : DRS.Time.checklistHours(c);
        Validation.assert(Validation.checklist(c), 'Please fix the checklist.');
        const existing = c.id ? Store.get('checklistTemplates', c.id) : null;
        const usedBy = existing ? TemplateService.checklistUsage(existing.id) : [];
        if (existing && !c.active && usedBy.some((t) => t.status === TS.ACTIVE)) {
          throw new BusinessError('This checklist is used by active templates (' + usedBy.filter((t) => t.status === TS.ACTIVE).map((t) => t.name).join(', ') + '). Remove it from those templates first.');
        }
        const now = Clock.now();
        let saved;
        if (existing) {
          const sig = (x) => JSON.stringify([x.name, x.items, x.departmentId, x.estimateValue === undefined ? x.estimatedHours : x.estimateValue, x.estimateUnit || 'hour', x.requiresApproval !== false]);
          const itemsChanged = sig(existing) !== sig(c);
          saved = Store.update('checklistTemplates', existing.id, Object.assign(c, { version: existing.version + (itemsChanged ? 1 : 0), updatedAt: now, updatedBy: actorId }));
        } else {
          saved = Store.insert('checklistTemplates', Object.assign(c, { id: Store.uid('chk'), version: 1, createdAt: now, createdBy: actorId, updatedAt: now }));
        }
        // Re-publish dependent templates so new requests use the updated checklist.
        const republished = [];
        usedBy.forEach((t) => {
          if (t.status === TS.ARCHIVED || versionIsCurrent(t)) return;
          if (Validation.template(t, { forActivation: true }).errors.length) {
            Store.update('requestTemplates', t.id, { hasUnpublishedChanges: true });
            return;
          }
          const v = createVersion(t, actorId, 'Checklist "' + saved.name + '" updated to v' + saved.version + '.');
          Store.update('requestTemplates', t.id, { currentVersionId: v.id, versionNumber: v.versionNumber, hasUnpublishedChanges: false, updatedAt: now });
          republished.push(t.name + ' → v' + v.versionNumber);
        });
        return { checklist: saved, republished };
      });
    },
    removeChecklist(checklistId, actorId) {
      return Store.transaction(() => {
        Auth.requireAdmin(actorId);
        const used = TemplateService.checklistUsage(checklistId);
        if (used.length) throw new BusinessError('Checklist is assigned to stages in: ' + used.map((t) => t.name).join(', ') + '. Remove it from those stages first.');
        return Store.remove('checklistTemplates', checklistId);
      });
    },
    duplicateChecklist(checklistId, actorId) {
      const c = Store.get('checklistTemplates', checklistId);
      if (!c) throw new BusinessError('Checklist not found.');
      let name = c.name + ' (Copy)'; let n = 2;
      while (Store.count('checklistTemplates', (x) => x.name.toLowerCase() === name.toLowerCase())) name = c.name + ' (Copy ' + n++ + ')';
      return TemplateService.saveChecklist({ name, description: c.description, departmentId: c.departmentId, estimateValue: c.estimateValue, estimateUnit: c.estimateUnit, requiresApproval: c.requiresApproval, active: true, items: c.items.map((i) => Object.assign({}, i, { id: null })) }, actorId);
    },

    /**
     * Links a checklist to an approval cycle (request template) as a new stage.
     * The stage department is the checklist's department. The same checklist or
     * department may be linked several times; each link is an independent stage.
     */
    linkChecklist(checklistId, templateId, stageInput, actorId) {
      Auth.requireAdmin(actorId);
      const cl = Store.get('checklistTemplates', checklistId);
      if (!cl) throw new BusinessError('Checklist not found.');
      if (!cl.active) throw new BusinessError('Inactive checklists cannot be linked.');
      const t = Store.get('requestTemplates', templateId);
      if (!t) throw new BusinessError('Select an approval cycle (request template).');
      if (t.status === TS.ARCHIVED) throw new BusinessError('Archived templates cannot be changed.');
      const stage = Object.assign({
        id: null, stageName: cl.name, departmentId: cl.departmentId, checklistTemplateId: cl.id,
        approvalLevel: t.stages.reduce((m, s) => Math.max(m, Number(s.approvalLevel) || 0), 0) + 1,
        mandatory: true, status: 'Active', hierarchyKey: null
      }, stageInput || {});
      const stages = t.stages.slice();
      const pos = stageInput && Number.isInteger(stageInput.position) ? Math.max(0, Math.min(stageInput.position, stages.length)) : stages.length;
      delete stage.position; const renumber = !!stage.renumber; delete stage.renumber;
      stages.splice(pos, 0, stage);
      if (renumber) stages.forEach((s, i) => { s.approvalLevel = i + 1; });
      return TemplateService.save(Object.assign({}, t, { stages }), actorId, 'Checklist "' + cl.name + '" linked as Stage ' + (pos + 1) + '.');
    },

    // ------------------------------------------------------- org structure
    saveDepartment(draft, actorId) {
      return Store.transaction(() => {
        Auth.requireAdmin(actorId);
        const d = { id: draft.id || null, name: String(draft.name || '').trim(), code: String(draft.code || '').trim().toUpperCase(), managerId: draft.managerId || null, supervisorId: draft.supervisorId || null, active: draft.active !== false };
        Validation.assert(Validation.department(d), 'Please fix the department.');
        if (d.id) {
          if (!d.active && Store.count('requestTemplates', (t) => t.status === TS.ACTIVE && (t.ownerDepartmentId === d.id || t.concernedDepartmentIds.includes(d.id) || t.stages.some((s) => s.departmentId === d.id)))) {
            throw new BusinessError('Department is used by active templates and cannot be deactivated.');
          }
          return Store.update('departments', d.id, d);
        }
        return Store.insert('departments', Object.assign(d, { id: Store.uid('dep') }));
      });
    },
    removeDepartment(id, actorId) {
      return Store.transaction(() => {
        Auth.requireAdmin(actorId);
        const refs = [];
        if (Store.count('users', (u) => u.departmentId === id)) refs.push('users');
        if (Store.count('requestTemplates', (t) => t.ownerDepartmentId === id || t.concernedDepartmentIds.includes(id) || t.stages.some((s) => s.departmentId === id))) refs.push('templates');
        if (Store.count('requests', (r) => r.requesterDepartmentId === id)) refs.push('requests');
        if (refs.length) throw new BusinessError('Department is referenced by ' + refs.join(', ') + '. Deactivate it instead.');
        return Store.remove('departments', id);
      });
    },
    saveUser(draft, actorId) {
      return Store.transaction(() => {
        Auth.requireAdmin(actorId);
        const u = { id: draft.id || null, name: String(draft.name || '').trim(), email: String(draft.email || '').trim(), jobTitle: String(draft.jobTitle || '').trim(), departmentId: draft.departmentId || '', managerId: draft.managerId || null, roles: draft.roles || [], active: draft.active !== false };
        Validation.assert(Validation.user(u), 'Please fix the user.');
        if (u.id) {
          if (!u.active && u.id === actorId) throw new BusinessError('You cannot deactivate your own demo user.');
          return Store.update('users', u.id, u);
        }
        return Store.insert('users', Object.assign(u, { id: Store.uid('usr') }));
      });
    },
    removeUser(id, actorId) {
      return Store.transaction(() => {
        Auth.requireAdmin(actorId);
        if (id === actorId) throw new BusinessError('You cannot delete your own demo user.');
        const refs = [];
        if (Store.count('requests', (r) => r.requesterId === id)) refs.push('requests');
        if (Store.count('stageInstances', (s) => s.approverId === id)) refs.push('approval stages');
        if (Store.count('requestTemplates', (t) => t.stages.some((s) => s.approverUserId === id))) refs.push('template stages');
        if (Store.count('departments', (d) => d.managerId === id || d.supervisorId === id)) refs.push('department leadership');
        if (Store.count('users', (u) => u.managerId === id)) refs.push('direct reports');
        if (refs.length) throw new BusinessError('User is referenced by ' + refs.join(', ') + '. Deactivate the user instead.');
        return Store.remove('users', id);
      });
    }
  };

  DRS.TemplateService = TemplateService;
})(typeof window !== 'undefined' ? window : globalThis);
