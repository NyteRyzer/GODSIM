// World state creation, lookups, chronicle and scheduled-event plumbing.
// World state is plain JSON (plus one Rng) so it can be saved as-is.
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;

  // ---------- lookups ----------
  S.char = (world, id) => (id == null ? null : world.chars[id] || null);
  S.living = (world) => {
    const out = [];
    for (const id in world.chars) if (world.chars[id].alive) out.push(world.chars[id]);
    return out;
  };
  S.building = (world, id) => world.buildingMap[id] || null;
  S.province = (world, id) => world.provinces.find((p) => p.id === id) || null;
  S.faction = (world, id) => world.country.factions.find((f) => f.id === id) || null;
  S.leader = (world) => S.char(world, world.country.leaderId);

  S.districtAt = (world, x, y) => {
    for (const d of G.Data.city.districts) if (x >= d.x0 && x <= d.x1 + 0.99 && y >= d.y0 && y <= d.y1 + 0.99) return d.id;
    return 'center';
  };
  S.districtName = (id) => (G.Data.city.districts.find((d) => d.id === id) || { name: id }).name;
  S.buildingAt = (world, x, y) => {
    for (const b of world.buildings) if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b;
    return null;
  };
  S.inRiver = (x, y) => {
    const r = G.Data.city.river;
    if (x < r.x0 || x >= r.x1 + 1) return false;
    for (const b of G.Data.city.bridges) if (y >= b.y0 && y < b.y1 + 1) return false;
    return true;
  };
  S.isFlooded = (world, x, y) => {
    const f = world.flood;
    if (!f || f.level <= 0) return false;
    const zone = f.diverted ? G.Data.city.northFields : G.Data.city.floodplain;
    const reach = zone.x0 + f.level * (zone.x1 - zone.x0 + 1);
    if (y < zone.y0 || y >= zone.y1 + 1 || x < zone.x0 || x >= reach) return false;
    const b = S.buildingAt(world, x, y);
    if (b && b.protectedUntil > world.t) return false;
    return true;
  };

  // ---------- chronicle ----------
  // level: 0 minor, 1 notable, 2 major, 3 historic
  S.log = function (world, entry) {
    const e = Object.assign({ id: world.nextId++, t: world.t, level: 1, kind: 'event', entities: [] }, entry);
    world.chronicle.push(e);
    if (world.chronicle.length > 1800) {
      // Keep all major history, drop the oldest minor entries.
      const cut = world.chronicle.length - 1500;
      let removed = 0;
      world.chronicle = world.chronicle.filter((x) => {
        if (removed < cut && x.level < 2) {
          removed++;
          return false;
        }
        return true;
      });
    }
    return e;
  };

  S.schedule = function (world, delayMin, type, data) {
    const s = { id: world.nextId++, at: world.t + Math.max(0, Math.round(delayMin)), type, data: data || {} };
    world.scheduled.push(s);
    return s;
  };
  S.handlers = S.handlers || {};
  S.processScheduled = function (world) {
    let due = null;
    for (const s of world.scheduled) if (s.at <= world.t) (due || (due = [])).push(s);
    if (!due) return;
    world.scheduled = world.scheduled.filter((s) => s.at > world.t);
    due.sort((a, b) => a.at - b.at || a.id - b.id);
    for (const s of due) {
      const h = S.handlers[s.type];
      if (h) h(world, s.data, s);
    }
  };

  // ---------- world creation ----------
  S.createWorld = function (opts = {}) {
    const sc = G.Data.scenarios[opts.scenarioId || 'river_kingdom'];
    const seed = opts.seed != null ? opts.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
    const settings = Object.assign(
      {
        mode: 'story', // story | sandbox | challenge
        challenge: 'none',
        philosophy: 'compassionate',
        startFaith: sc.startFaith,
        capacityBonus: 0,
        unlockAll: false,
        crisisFrequency: 1,
        costMultiplier: 1,
        tutorial: true,
      },
      opts.settings || {}
    );
    const startMinute = (sc.calendar.startDay * T.DAY) + sc.calendar.startHour * 60;
    const world = {
      version: G.SAVE_VERSION,
      gameVersion: G.VERSION,
      seed,
      rng: new G.Rng(seed),
      t: 0,
      calendar: { baseYear: sc.calendar.baseYear, startMinute },
      scenarioId: sc.id,
      settings,
      nextId: 1,
      faith: {
        current: settings.startFaith, capacity: 300, earned: 0, spent: 0, tier: 1,
        rates: { passive: 0, belief: 0, prayer: 0, institution: 0, upkeep: 0, net: 0 },
        boosts: [], lastMiracleAt: -99999, miracles: 0,
      },
      player: {
        form: 'spectral', x: 30, y: 16, possessId: null, possessUntil: 0,
        human: { x: 30, y: 16, health: 100, detainedUntil: 0, suspicion: 0, cooldownUntil: 0 },
        philosophy: settings.philosophy,
      },
      chars: {},
      buildings: G.Data.city.buildings.map((b) => Object.assign({ protectedUntil: 0, damage: 0 }, b)),
      buildingMap: {},
      country: null,
      provinces: sc.provinces.map((p) => Object.assign({ plague: 0, devastation: 0, flooded: false }, p)),
      neighbors: G.Data.neighbors.map((n) => Object.assign({}, n)),
      church: Object.assign({ id: 'church', leaderId: null, members: 0, founded: -1 }, sc.church),
      movements: [],
      plots: [],
      prayers: [],
      chronicle: [],
      scheduled: [],
      reputation: {},
      flood: { stage: 'none', level: 0, diverted: false, severity: 1, startedAt: 0 },
      plague: { active: false, until: 0 },
      war: null,
      challenge: { id: settings.challenge, status: settings.challenge === 'none' ? 'none' : 'active', progress: 0, miracles: 0, possessedRuler: false, holdDays: 0 },
      stats: { births: 0, deaths: 0, answered: 0, ignored: 0, unanswered: 0, natural: 0, miraclesWitnessed: 0, possessions: 0 },
      history: [], // daily snapshots for charts
      tutorialStep: 0,
    };
    for (const b of world.buildings) world.buildingMap[b.id] = b;
    for (const d of G.Data.city.districts) world.reputation[d.id] = { protector: 0, judge: 0, coincidence: 0, deceiver: 0 };
    for (const p of world.provinces) world.reputation[p.id] = { protector: 0, judge: 0, coincidence: 0, deceiver: 0 };

    // Country
    const c = sc.country;
    world.country = {
      name: c.name, government: c.government, leaderId: null, heirId: null, govSince: 0,
      treasury: c.treasury, legitimacy: c.legitimacy, institutionalTrust: c.institutionalTrust, eliteLoyalty: c.eliteLoyalty,
      economy: c.economy, inequality: c.inequality, corruption: c.corruption, security: c.security,
      religiousInfluence: c.religiousInfluence, reformPressure: c.reformPressure, warRisk: c.warRisk,
      literacy: c.literacy, technology: c.technology, exposure: 0, stability: 50,
      coupRisk: 0, revolutionRisk: 0, theocracyPressure: 0, lastElection: 0, nextElection: 0,
      factions: G.Data.factions.map((f) => ({ id: f.id, name: f.name, agenda: f.agenda, power: c.factions[f.id][0], approval: c.factions[f.id][1], leaderId: null })),
      pendingDecision: null, decisionCooldown: T.DAY * 2, flags: {},
    };

    G.Sim.initLife(world);
    G.Sim.populate(world, sc);
    G.Sim.updateTier(world);
    world.faith.current = Math.min(world.faith.current, world.faith.capacity);
    G.Sim.recomputeFaithRates(world);
    G.Sim.politicsDerived(world);

    for (const ev of sc.openingEvents) S.schedule(world, ev.delayHours * 60, ev.type, ev.data);
    if (settings.challenge === 'brink') {
      S.schedule(world, T.DAY * 40, 'plague_outbreak', {});
      S.schedule(world, T.DAY * 90, 'war_declared', { enemy: 'kesh' });
    }

    S.log(world, {
      title: 'The chronicle begins',
      text: `${world.country.name}, ${T.format(world, 0, false)}. ${S.char(world, world.country.leaderId).name} reigns from Thornhaven. The spring rains have been heavy.`,
      level: 2, kind: 'history',
    });
    S.log(world, {
      title: 'A god awakens',
      text: 'You drift above the rooftops of Thornhaven, unseen. Prayers rise like smoke.',
      level: 1, kind: 'divine',
    });
    return world;
  };

  // ---------- relationships helpers ----------
  S.relate = function (a, b, type, affinity) {
    a.relations[b.id] = { type, affinity: affinity == null ? 50 : affinity };
  };
  S.familyOf = function (world, c) {
    const out = [];
    for (const id in c.relations) {
      const r = c.relations[id];
      if (r.type === 'spouse' || r.type === 'parent' || r.type === 'child' || r.type === 'sibling') {
        const o = S.char(world, +id);
        if (o) out.push(o);
      }
    }
    return out;
  };

  S.addMemory = function (world, c, kind, text, weight = 1) {
    c.memories.push({ t: world.t, kind, text, weight });
    if (S.watchNotice) S.watchNotice(world, c, text, weight);
    if (c.memories.length > 14) {
      // Forget the least important old memory.
      let idx = 0;
      let best = Infinity;
      for (let i = 0; i < c.memories.length - 2; i++) {
        const m = c.memories[i];
        const score = m.weight - (world.t - m.t) / (T.DAY * 60);
        if (score < best) {
          best = score;
          idx = i;
        }
      }
      c.memories.splice(idx, 1);
    }
  };

  // Belief changes are buffered by faith stability: one bad event cannot erase years of belief.
  S.adjustBelief = function (world, c, delta) {
    if (delta < 0) delta = Math.max(-12, delta * (1 - 0.7 * c.faithStability));
    c.belief = U.clamp(c.belief + delta, 0, 100);
    if (delta > 0) c.faithStability = U.clamp(c.faithStability + delta * 0.002, 0, 0.95);
    else c.faithStability = U.clamp(c.faithStability + delta * 0.004, 0.05, 0.95);
  };

  S.witnesses = function (world, x, y, radius, excludeId) {
    const out = [];
    for (const c of S.living(world)) {
      if (c.id === excludeId || c.asleep) continue;
      if (U.dist(c.x, c.y, x, y) <= radius) out.push(c);
    }
    return out;
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
