// GODSIM core namespace, utilities, seeded RNG and calendar.
// Every file attaches to globalThis.GODSIM so the game runs from a plain
// <script> include in the browser and from require() in Node tests.
(function (G) {
  'use strict';

  G.VERSION = '0.1.0';
  G.SAVE_VERSION = 1;
  G.Data = G.Data || {};
  G.Sim = G.Sim || {};
  G.UI = G.UI || {};

  const U = (G.Util = {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.round = (v, d = 0) => {
    const m = Math.pow(10, d);
    return Math.round(v * m) / m;
  };
  U.escape = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  U.label = (v, labels) => {
    // labels: [[threshold, text], ...] ascending
    let out = labels[0][1];
    for (const [th, txt] of labels) if (v >= th) out = txt;
    return out;
  };
  U.level5 = (v) => U.label(v, [[0, 'Very low'], [20, 'Low'], [40, 'Moderate'], [60, 'High'], [80, 'Very high']]);

  // Mulberry32: small, fast, and its whole state is one integer, so it saves cleanly.
  class Rng {
    constructor(seed) {
      this.state = seed >>> 0 || 0x9e3779b9;
    }
    next() {
      this.state = (this.state + 0x6d2b79f5) >>> 0;
      let t = this.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    float(a = 0, b = 1) {
      return a + (b - a) * this.next();
    }
    int(a, b) {
      return a + Math.floor(this.next() * (b - a + 1));
    }
    chance(p) {
      return this.next() < p;
    }
    pick(arr) {
      return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined;
    }
    weighted(items, weightFn) {
      let total = 0;
      const ws = items.map((it) => {
        const w = Math.max(0, weightFn(it));
        total += w;
        return w;
      });
      if (total <= 0) return undefined;
      let r = this.next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= ws[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    }
    gauss(mean = 0, sd = 1) {
      // Irwin-Hall approximation keeps the call count fixed (determinism friendly)
      let s = 0;
      for (let i = 0; i < 6; i++) s += this.next();
      return mean + (s - 3) * sd * 1.41;
    }
    toJSON() {
      return { state: this.state };
    }
  }
  G.Rng = Rng;

  // Calendar: 12 months x 30 days. world.t is minutes since the game started.
  const T = (G.Time = {});
  T.HOUR = 60;
  T.DAY = 1440;
  T.YEAR_DAYS = 360;
  T.MONTHS = ['Frostwane', 'Thaw', 'Seedfall', 'Bloom', 'Highsun', 'Goldtide', 'Harvest', 'Emberfall', 'Mistmoon', 'Duskward', 'Snowtide', 'Deepwinter'];
  T.WEEKDAYS = ['Moonday', 'Toilday', 'Wellday', 'Thornday', 'Fairday', 'Marketday', 'Restday'];
  T.abs = (world) => world.calendar.startMinute + world.t;
  T.hour = (world) => Math.floor((T.abs(world) % T.DAY) / 60);
  T.minuteOfDay = (world) => T.abs(world) % T.DAY;
  T.dayIndex = (world) => Math.floor(T.abs(world) / T.DAY); // absolute day count
  T.weekday = (world) => T.dayIndex(world) % 7;
  T.isRestday = (world) => T.weekday(world) === 6;
  T.dateParts = (world, t) => {
    const abs = world.calendar.startMinute + (t === undefined ? world.t : t);
    const day = Math.floor(abs / T.DAY);
    const year = world.calendar.baseYear + Math.floor(day / T.YEAR_DAYS);
    const doy = day % T.YEAR_DAYS;
    const month = Math.floor(doy / 30);
    const md = (doy % 30) + 1;
    const mod = abs % T.DAY;
    return { year, month, md, hour: Math.floor(mod / 60), minute: mod % 60, weekday: day % 7 };
  };
  T.format = (world, t, withTime = true) => {
    const p = T.dateParts(world, t);
    const d = `${p.md} ${T.MONTHS[p.month]} ${p.year}`;
    if (!withTime) return d;
    return `${d}, ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  };
  T.duration = (min) => {
    if (min < 60) return `${Math.max(0, Math.round(min))}m`;
    if (min < T.DAY) return `${Math.round(min / 60)}h`;
    const d = min / T.DAY;
    return d < 60 ? `${Math.round(d)}d` : `${U.round(d / T.YEAR_DAYS, 1)}y`;
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
