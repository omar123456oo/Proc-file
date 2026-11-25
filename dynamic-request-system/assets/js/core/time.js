/**
 * time.js – Time Settings and working-time maths.
 * A working day has N working hours (default 8) on configured working days.
 * Checklist estimation times are in hours and are converted to working days
 * and due dates with these settings.
 */
(function (global) {
  'use strict';
  const DRS = (global.DRS = global.DRS || {});
  const { Store } = DRS;

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DEFAULTS = { workHoursPerDay: 8, workDays: [0, 1, 2, 3, 4], dayStartHour: 9 };

  const Time = {
    DAY_NAMES,
    DEFAULTS,
    settings() {
      const s = Store.settings();
      return {
        workHoursPerDay: Number(s.workHoursPerDay) > 0 ? Number(s.workHoursPerDay) : DEFAULTS.workHoursPerDay,
        workDays: Array.isArray(s.workDays) && s.workDays.length ? s.workDays.map(Number) : DEFAULTS.workDays,
        dayStartHour: Number.isInteger(Number(s.dayStartHour)) ? Number(s.dayStartHour) : DEFAULTS.dayStartHour
      };
    },
    validate(input) {
      const errors = [];
      const h = Number(input.workHoursPerDay);
      if (!(h > 0 && h <= 24)) errors.push('Working hours per day must be between 1 and 24.');
      if (!input.workDays || !input.workDays.length) errors.push('Select at least one working day.');
      const st = Number(input.dayStartHour);
      if (!(Number.isInteger(st) && st >= 0 && st <= 23)) errors.push('Day start must be an hour between 0 and 23.');
      else if (st + h > 24) errors.push('The working day must end before midnight.');
      return errors;
    },
    /** Hours as "6 h", "1 working day", "2 working days 3 h". */
    format(hours) {
      if (hours === null || hours === undefined || hours === '' || isNaN(Number(hours))) return '—';
      const h = Number(hours);
      const per = Time.settings().workHoursPerDay;
      const days = Math.floor(h / per + 1e-9);
      const rest = Math.round((h - days * per) * 10) / 10;
      const parts = [];
      if (days) parts.push(days + ' working day' + (days > 1 ? 's' : ''));
      if (rest || !days) parts.push(rest + ' h');
      return parts.join(' ');
    },
    /** Hours of a checklist estimate: value + Duration Type ('hour' | 'day'). */
    checklistHours(cl) {
      if (!cl) return null;
      const v = cl.estimateValue !== undefined && cl.estimateValue !== '' && cl.estimateValue !== null ? Number(cl.estimateValue) : (cl.estimatedHours === '' || cl.estimatedHours === undefined || cl.estimatedHours === null ? null : Number(cl.estimatedHours));
      if (v === null || isNaN(v)) return null;
      return cl.estimateUnit === 'day' ? v * Time.settings().workHoursPerDay : v;
    },
    unitLabel(unit) { return unit === 'day' ? 'Day (' + Time.settings().workHoursPerDay + ' Hours)' : 'Hour'; },
    /** Hours as decimal working days, e.g. 1.5. */
    toDays(hours) { return Math.round((Number(hours) || 0) / Time.settings().workHoursPerDay * 100) / 100; },
    /** Adds working hours to a date, skipping non-working hours and days. */
    addWorkingHours(startIso, hours) {
      const s = Time.settings();
      let t = new Date(startIso);
      let remaining = Math.round((Number(hours) || 0) * 60);
      const dayStart = (d) => { const x = new Date(d); x.setHours(s.dayStartHour, 0, 0, 0); return x; };
      const dayEnd = (d) => new Date(dayStart(d).getTime() + s.workHoursPerDay * 3600000);
      const nextDay = (d) => { const x = dayStart(d); x.setDate(x.getDate() + 1); return x; };
      for (let guard = 0; guard < 3660; guard++) {
        if (!s.workDays.includes(t.getDay()) || t >= dayEnd(t)) { t = nextDay(t); continue; }
        if (t < dayStart(t)) t = dayStart(t);
        const avail = (dayEnd(t) - t) / 60000;
        if (remaining <= avail) return new Date(t.getTime() + remaining * 60000).toISOString();
        remaining -= avail;
        t = nextDay(t);
      }
      return t.toISOString();
    },
    /** Due date of an active stage, or null when it has no estimation. */
    stageDue(stage) {
      if (!stage || !stage.activatedAt || stage.estimatedHours === null || stage.estimatedHours === undefined || stage.estimatedHours === '') return null;
      return Time.addWorkingHours(stage.activatedAt, stage.estimatedHours);
    },
    isOverdue(stage) {
      const due = Time.stageDue(stage);
      return !!(due && stage.status === 'Pending' && new Date(DRS.Clock.now()) > new Date(due));
    },
    /**
     * Time plan of a list of stages: total hours and hours per department.
     * resolveHours(stage) returns the stage's estimation in hours (or null).
     */
    plan(stages, resolveHours, deptOf) {
      const byDept = {}; let total = 0; let missing = 0;
      stages.forEach((s) => {
        const h = resolveHours(s);
        if (h === null || h === undefined || h === '' || isNaN(Number(h))) { missing++; return; }
        const d = deptOf ? deptOf(s) : s.departmentId;
        byDept[d] = (byDept[d] || 0) + Number(h);
        total += Number(h);
      });
      return { total, byDept, missing };
    }
  };

  DRS.Time = Time;
})(typeof window !== 'undefined' ? window : globalThis);
