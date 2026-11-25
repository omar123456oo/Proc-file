/**
 * router.js
 * Minimal hash router: "#/path/:param". Supports a leave-guard for unsaved changes.
 */
(function (global) {
  'use strict';
  const DRS = (global.DRS = global.DRS || {});

  const routes = [];
  let guard = null;
  let lastHash = null;
  let suppress = false;

  function compile(pattern) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^\\/]+)'; }) + '\\/?$');
    return { re, keys };
  }

  const Router = {
    add(pattern, handler, meta) { routes.push(Object.assign({ pattern, handler }, compile(pattern), meta || {})); return Router; },
    current() { return (location.hash || '#/dashboard').slice(1).split('?')[0]; },
    query() {
      const q = (location.hash.split('?')[1] || '');
      return Object.fromEntries(q.split('&').filter(Boolean).map((p) => p.split('=').map(decodeURIComponent)));
    },
    go(path) { if (location.hash === '#' + path) Router.resolve(true); else location.hash = '#' + path; },
    /** Register a function returning a message when leaving would lose work, or null. */
    setGuard(fn) { guard = fn; },
    clearGuard() { guard = null; },
    resolve(force) {
      if (suppress) { suppress = false; return; }
      if (!force && guard && lastHash !== null && location.hash !== lastHash) {
        const msg = guard();
        if (msg && !global.confirm(msg)) { suppress = true; location.hash = lastHash; return; }
      }
      guard = null;
      lastHash = location.hash;
      const path = Router.current();
      for (const r of routes) {
        const m = path.match(r.re);
        if (m) {
          const params = {};
          r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
          return r.handler(params, r);
        }
      }
      Router.go('/dashboard');
    },
    start() {
      global.addEventListener('hashchange', () => Router.resolve(false));
      global.addEventListener('beforeunload', (e) => { if (guard && guard()) { e.preventDefault(); e.returnValue = ''; } });
      Router.resolve(true);
    }
  };

  DRS.Router = Router;
})(typeof window !== 'undefined' ? window : globalThis);
