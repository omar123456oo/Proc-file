/**
 * constants.js
 * Shared enumerations and business-rule definitions. Pure data, no side effects.
 */
(function (global) {
  'use strict';
  const DRS = (global.DRS = global.DRS || {});

  const REQUEST_STATUS = Object.freeze({
    DRAFT: 'Draft',
    PENDING: 'Pending Approval',
    IN_PROGRESS: 'In Progress',
    RETURNED: 'Returned for Correction',
    REJECTED: 'Rejected',
    APPROVED: 'Approved',
    COMPLETED: 'Completed'
  });

  const STAGE_STATUS = Object.freeze({
    WAITING: 'Waiting',
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    RETURNED: 'Returned',
    SKIPPED: 'Skipped'
  });

  const TEMPLATE_STATUS = Object.freeze({ ACTIVE: 'Active', INACTIVE: 'Inactive', ARCHIVED: 'Archived' });

  const EVENTS = Object.freeze({
    CREATED: 'Request Created',
    DRAFT_SAVED: 'Draft Saved',
    SUBMITTED: 'Request Submitted',
    STAGE_ACTIVATED: 'Stage Activated',
    CHECKLIST_UPDATED: 'Checklist Updated',
    CHECKLIST_COMPLETED: 'Checklist Completed',
    STAGE_COMPLETED: 'Stage Completed',
    STAGE_PARTIAL: 'Stage Approval Recorded',
    STAGE_SKIPPED: 'Stage Skipped',
    APPROVED: 'Request Approved',
    REJECTED: 'Request Rejected',
    RETURNED: 'Request Returned',
    RESUBMITTED: 'Request Resubmitted',
    APPROVER_REASSIGNED: 'Approver Reassigned',
    EXECUTION_COMPLETED: 'Execution Completed',
    COMPLETED: 'Request Completed'
  });

  const ROLES = Object.freeze({
    admin: 'System Administrator',
    employee: 'Employee',
    approver: 'Approver',
    execution: 'Department Execution Team'
  });

  /** Special department value: resolved to the requester's department at submission. */
  const REQUESTER_DEPT = '@requester';

  /**
   * Dynamic approver roles, resolved per request at submission time.
   * scope 'requester' -> relative to the requester; 'stage' -> the stage department;
   * 'dept' -> a fixed department identified by its code.
   */
  const APPROVER_ROLES = Object.freeze({
    requester_line_manager: { label: "Requester's Line Manager", scope: 'requester', field: 'line' },
    requester_dept_supervisor: { label: 'Requester Department Supervisor', scope: 'requester', field: 'supervisorId' },
    requester_dept_manager: { label: 'Requester Department Manager', scope: 'requester', field: 'managerId' },
    stage_dept_supervisor: { label: 'Stage Department Supervisor', scope: 'stage', field: 'supervisorId' },
    stage_dept_manager: { label: 'Stage Department Manager', scope: 'stage', field: 'managerId' },
    procurement_manager: { label: 'Procurement Manager', scope: 'dept', deptCode: 'PRC', field: 'managerId' },
    hr_manager: { label: 'HR Manager', scope: 'dept', deptCode: 'HR', field: 'managerId' },
    finance_manager: { label: 'Finance Manager', scope: 'dept', deptCode: 'FIN', field: 'managerId' }
  });

  /**
   * Mandatory approval hierarchies from the existing Procurement PRD.
   * These stages are locked in the builder: they cannot be removed, disabled,
   * re-pointed or reordered relative to each other.
   */
  const HIERARCHIES = Object.freeze({
    none: { label: 'No mandatory hierarchy', stages: [] },
    admin_procurement: {
      label: 'Admin Procurement Request',
      description: 'Line Manager → Procurement Manager → HR Manager',
      stages: [
        { hierarchyKey: 'line_manager', stageName: 'Line Manager Approval', departmentId: REQUESTER_DEPT, roleKey: 'requester_line_manager', approverRole: 'Line Manager' },
        { hierarchyKey: 'procurement_manager', stageName: 'Procurement Manager Approval', deptCode: 'PRC', roleKey: 'procurement_manager', approverRole: 'Procurement Manager' },
        { hierarchyKey: 'hr_manager', stageName: 'HR Manager Approval', deptCode: 'HR', roleKey: 'hr_manager', approverRole: 'HR Manager' }
      ]
    },
    non_admin_procurement: {
      label: 'Non-Admin Procurement Request',
      description: 'Department Supervisor → Department Manager → Procurement Manager',
      stages: [
        { hierarchyKey: 'dept_supervisor', stageName: 'Department Supervisor Approval', departmentId: REQUESTER_DEPT, roleKey: 'requester_dept_supervisor', approverRole: 'Department Supervisor' },
        { hierarchyKey: 'dept_manager', stageName: 'Department Manager Approval', departmentId: REQUESTER_DEPT, roleKey: 'requester_dept_manager', approverRole: 'Department Manager' },
        { hierarchyKey: 'procurement_manager', stageName: 'Procurement Manager Approval', deptCode: 'PRC', roleKey: 'procurement_manager', approverRole: 'Procurement Manager' }
      ]
    }
  });

  const ITEM_TYPES = Object.freeze({
    yesno: 'Yes / No',
    text: 'Text',
    number: 'Number',
    date: 'Date',
    dropdown: 'Dropdown',
    attachment: 'Attachment'
  });

  const REQUEST_TYPES = ['Procurement', 'Human Resources', 'Operations', 'Finance', 'IT', 'Administration', 'Other'];
  const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

  DRS.C = {
    REQUEST_STATUS, STAGE_STATUS, TEMPLATE_STATUS, EVENTS, ROLES, REQUESTER_DEPT,
    APPROVER_ROLES, HIERARCHIES, ITEM_TYPES, REQUEST_TYPES, PRIORITIES,
    ACTIVE_REQUEST_STATUSES: [REQUEST_STATUS.PENDING, REQUEST_STATUS.IN_PROGRESS],
    /** Answer key holding the file names attached to a checklist point. */
    filesKey: (itemId) => itemId + '__files'
  };
})(typeof window !== 'undefined' ? window : globalThis);
