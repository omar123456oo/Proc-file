/**
 * auth.js
 * DEMONSTRATION identity only. The "current user" is chosen with the role switcher
 * and stored in LocalStorage. This is NOT authentication or security: the backend
 * must enforce identity (e.g. JWT/SSO) and authorization on every API call.
 */
(function (global) {
  'use strict';
  const DRS = (global.DRS = global.DRS || {});
  const { Store, C } = DRS;

  const Auth = {
    currentUser() {
      const id = Store.settings().currentUserId;
      return (id && Store.get('users', id)) || Store.all('users').find((u) => u.active) || null;
    },
    switchUser(userId) {
      const u = Store.get('users', userId);
      if (!u) throw new DRS.BusinessError('User not found.');
      if (!u.active) throw new DRS.BusinessError(u.name + ' is inactive.');
      Store.saveSettings({ currentUserId: userId });
      return u;
    },
    hasRole(user, role) { return !!(user && user.roles && user.roles.includes(role)); },
    isAdmin(user) { return Auth.hasRole(user, 'admin'); },

    /** Server-side style guard: configuration changes are admin-only. */
    requireAdmin(actorId) {
      const u = Store.get('users', actorId);
      if (!u || !u.active || !u.roles.includes('admin')) {
        throw new DRS.BusinessError('Only System Administrators can modify system configuration.');
      }
      return u;
    },

    /** Ordered list of manager ids above a user (direct manager first). */
    managementChain(userId) {
      const chain = [];
      const seen = new Set([userId]);
      let u = Store.get('users', userId);
      while (u && u.managerId && !seen.has(u.managerId)) {
        chain.push(u.managerId);
        seen.add(u.managerId);
        u = Store.get('users', u.managerId);
      }
      return chain;
    },
    /** True when `userId` reports (directly or indirectly) to `managerId`. */
    isSubordinate(userId, managerId) {
      return Auth.managementChain(userId).includes(managerId);
    },

    /** Requests a user may see in lists: own, assigned, execution, or all for admins. */
    canViewRequest(user, request) {
      if (!user || !request) return false;
      if (Auth.isAdmin(user) || request.requesterId === user.id) return true;
      if (request.status === C.REQUEST_STATUS.DRAFT) return false;
      if (Store.count('stageInstances', (s) => s.requestId === request.id && (s.approverId === user.id || (s.approverIds || []).includes(user.id)))) return true;
      if (Auth.hasRole(user, 'execution') && (request.executionTasks || []).some((t) => t.departmentId === user.departmentId)) return true;
      return false;
    },
    visibleRequests(user) {
      return Store.all('requests').filter((r) => Auth.canViewRequest(user, r));
    }
  };

  DRS.Auth = Auth;
})(typeof window !== 'undefined' ? window : globalThis);
