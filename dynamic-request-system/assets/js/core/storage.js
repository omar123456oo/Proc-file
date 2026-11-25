/**
 * storage.js
 * Persistence layer. Every collection is stored under its own LocalStorage key
 * so it maps 1:1 to a future MongoDB collection. Replace this module with a REST
 * client (same method names) when the Node.js backend is available.
 */
(function (global) {
  'use strict';
  const DRS = (global.DRS = global.DRS || {});

  // The test runner sets DRS_STORAGE_PREFIX so tests never touch the application data.
  const PREFIX = global.DRS_STORAGE_PREFIX || 'drs.v1.';
  const COLLECTIONS = [
    'departments',
    'users',
    'checklistTemplates',
    'requestTemplates',
    'workflowVersions',
    'requests',
    'stageInstances',
    'decisions',
    'history',
    'notifications'
  ];
  const DEFAULT_SETTINGS = {
    schemaVersion: 1,
    currentUserId: null,
    requestCounter: 1000,
    returnBehavior: 'resume', // 'resume' | 'restart'
    allowSkipOptional: false,
    workHoursPerDay: 8,          // Time Settings: one working day = 8 hours
    workDays: [0, 1, 2, 3, 4],   // Sunday–Thursday
    dayStartHour: 9
  };

  // ---- backend: LocalStorage, with an in-memory fallback (private mode, tests) ----
  const memory = {};
  const memoryBackend = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null),
    setItem: (k, v) => { memory[k] = String(v); },
    removeItem: (k) => { delete memory[k]; },
    keys: () => Object.keys(memory)
  };
  const backend = (function () {
    try {
      const ls = global.localStorage;
      const probe = '__drs_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return {
        getItem: (k) => ls.getItem(k),
        setItem: (k, v) => ls.setItem(k, v),
        removeItem: (k) => ls.removeItem(k),
        keys: () => { const out = []; for (let i = 0; i < ls.length; i++) out.push(ls.key(i)); return out; },
        persistent: true
      };
    } catch (e) {
      console.warn('[Storage] LocalStorage unavailable, using in-memory storage.');
      return memoryBackend;
    }
  })();

  const cache = {};

  function safeParse(text, fallback) {
    if (text === null || text === undefined || text === '') return fallback;
    try {
      const value = JSON.parse(text);
      return value === null || value === undefined ? fallback : value;
    } catch (e) {
      console.warn('[Storage] Corrupt JSON ignored:', e.message);
      return fallback;
    }
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function assertCollection(name) {
    if (!COLLECTIONS.includes(name)) throw new Error('Unknown collection: ' + name);
  }

  function load(name) {
    assertCollection(name);
    if (!cache[name]) {
      const value = safeParse(backend.getItem(PREFIX + name), []);
      cache[name] = Array.isArray(value) ? value : [];
    }
    return cache[name];
  }

  function persist(name) {
    try {
      backend.setItem(PREFIX + name, JSON.stringify(cache[name]));
    } catch (e) {
      throw new Error('Unable to save data (' + name + '). Browser storage may be full.');
    }
  }

  const Store = {
    COLLECTIONS,
    PREFIX,
    isPersistent: !!backend.persistent,
    safeParse,
    clone,

    all(name) { return clone(load(name)); },
    get(name, id) {
      const rec = load(name).find((r) => r.id === id);
      return rec ? clone(rec) : null;
    },
    where(name, predicate) { return clone(load(name).filter(predicate)); },
    count(name, predicate) { return predicate ? load(name).filter(predicate).length : load(name).length; },

    insert(name, record) {
      const list = load(name);
      const rec = clone(record);
      if (!rec.id) rec.id = Store.uid(name.slice(0, 3));
      if (list.some((r) => r.id === rec.id)) throw new Error('Duplicate id "' + rec.id + '" in ' + name);
      list.push(rec);
      persist(name);
      return clone(rec);
    },
    update(name, id, patch) {
      const list = load(name);
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error(name + ' record "' + id + '" not found');
      list[idx] = Object.assign({}, list[idx], clone(patch), { id });
      persist(name);
      return clone(list[idx]);
    },
    remove(name, id) {
      const list = load(name);
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) return false;
      list.splice(idx, 1);
      persist(name);
      return true;
    },
    replaceAll(name, records) {
      assertCollection(name);
      cache[name] = clone(records || []);
      persist(name);
    },

    settings() {
      return Object.assign({}, DEFAULT_SETTINGS, safeParse(backend.getItem(PREFIX + 'settings'), {}));
    },
    saveSettings(patch) {
      const next = Object.assign(Store.settings(), patch);
      backend.setItem(PREFIX + 'settings', JSON.stringify(next));
      return next;
    },

    uid(prefix) {
      return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },
    nextRequestNumber() {
      const settings = Store.settings();
      let n = (settings.requestCounter || 1000) + 1;
      while (load('requests').some((r) => r.id === 'REQ-' + n)) n++;
      Store.saveSettings({ requestCounter: n });
      return 'REQ-' + n;
    },

    /** Runs fn atomically: if it throws, every collection and the settings are restored. */
    transaction(fn) {
      const snapshot = {};
      COLLECTIONS.forEach((n) => { snapshot[n] = clone(load(n)); });
      const settingsSnapshot = backend.getItem(PREFIX + 'settings');
      try {
        return fn();
      } catch (err) {
        COLLECTIONS.forEach((n) => { cache[n] = snapshot[n]; persist(n); });
        if (settingsSnapshot === null) backend.removeItem(PREFIX + 'settings');
        else backend.setItem(PREFIX + 'settings', settingsSnapshot);
        throw err;
      }
    },

    isSeeded() { return backend.getItem(PREFIX + 'seeded') === '1'; },
    markSeeded() { backend.setItem(PREFIX + 'seeded', '1'); },
    clearAll() {
      backend.keys().filter((k) => k && k.indexOf(PREFIX) === 0).forEach((k) => backend.removeItem(k));
      Object.keys(cache).forEach((k) => delete cache[k]);
    },

    exportAll() {
      const out = { exportedAt: new Date().toISOString(), schemaVersion: DEFAULT_SETTINGS.schemaVersion, settings: Store.settings() };
      COLLECTIONS.forEach((n) => { out[n] = clone(load(n)); });
      return out;
    },
    importAll(data) {
      if (!data || typeof data !== 'object') throw new Error('Invalid file: expected a JSON object.');
      const missing = COLLECTIONS.filter((n) => !Array.isArray(data[n]));
      if (missing.length) throw new Error('Invalid file: missing collections ' + missing.join(', '));
      COLLECTIONS.forEach((n) => Store.replaceAll(n, data[n]));
      if (data.settings) backend.setItem(PREFIX + 'settings', JSON.stringify(Object.assign({}, DEFAULT_SETTINGS, data.settings)));
      Store.markSeeded();
    },
    usageBytes() {
      return backend.keys().filter((k) => k && k.indexOf(PREFIX) === 0)
        .reduce((sum, k) => sum + (backend.getItem(k) || '').length * 2, 0);
    }
  };

  /** Clock abstraction so sample data can be seeded with realistic past timestamps. */
  const Clock = {
    _fixed: null,
    now() { return this._fixed ? new Date(this._fixed).toISOString() : new Date().toISOString(); },
    set(iso) { this._fixed = iso ? new Date(iso).getTime() : null; },
    advance(minutes) { if (this._fixed) this._fixed += minutes * 60000; },
    reset() { this._fixed = null; }
  };

  DRS.Store = Store;
  DRS.Clock = Clock;
})(typeof window !== 'undefined' ? window : globalThis);
