// Individual simulation: population, routines, movement, needs, life events and generations.
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;

  const WALK = 0.45; // tiles per game minute
  const RUN = 0.9;
  const MAX_DETAILED = 90;

  const ILLNESSES = ['marsh fever', 'the grey cough', 'a festering wound', 'river flux', 'the sweating sickness', 'a wasting illness'];

  S.traitTags = function (c) {
    const t = c.traits;
    const tags = [];
    if (t.kindness > 0.7) tags.push('Compassionate');
    else if (t.kindness < 0.3) tags.push('Callous');
    if (t.courage > 0.7) tags.push('Brave');
    else if (t.courage < 0.3) tags.push('Timid');
    if (t.ambition > 0.7) tags.push('Ambitious');
    if (t.piety > 0.7) tags.push('Devout');
    if (t.skepticism > 0.7) tags.push('Skeptic');
    if (t.caution > 0.7) tags.push('Cautious');
    else if (t.caution < 0.25) tags.push('Reckless');
    return tags;
  };

  function randTraits(rng) {
    const r = () => U.clamp(rng.gauss(0.5, 0.18), 0.02, 0.98);
    return { kindness: r(), courage: r(), ambition: r(), piety: r(), skepticism: r(), caution: r() };
  }

  S.makeCharacter = function (world, spec) {
    const rng = world.rng;
    const traits = spec.traits ? Object.assign({}, spec.traits) : randTraits(rng);
    const id = world.nextId++;
    const home = S.building(world, spec.home);
    const sx = home ? home.x + rng.float(0.5, home.w - 0.5) : 30;
    const sy = home ? home.y + rng.float(0.5, home.h - 0.5) : 30;
    const c = {
      id,
      first: spec.first,
      last: spec.last,
      title: spec.title || '',
      name: (spec.title ? spec.title + ' ' : '') + spec.first + ' ' + spec.last,
      sex: spec.sex,
      age: spec.age,
      alive: true,
      role: spec.role,
      occupation: spec.occupation,
      homeId: spec.home,
      workId: spec.work || null,
      factionId: spec.faction || 'commons',
      traits,
      belief: U.clamp(spec.belief != null ? spec.belief : 40, 0, 100),
      faithStability: U.clamp(0.25 + traits.piety * 0.5, 0.05, 0.95),
      gift: !!spec.gift,
      health: spec.health != null ? spec.health : 100,
      illness: null,
      injury: 0,
      wealth: spec.wealth != null ? spec.wealth : 40,
      hunger: 10,
      mood: 60,
      renown: spec.role === 'monarch' ? 80 : 0,
      corrupt: !!spec.corrupt,
      relations: {},
      memories: [],
      interpretation: 'unknown', // how they think of the divine
      divine: { answered: 0, unanswered: 0, witnessed: 0, possessed: 0 },
      x: sx,
      y: sy,
      path: [],
      activity: 'home',
      at: spec.home,
      asleep: false,
      known: { traits: false, beliefs: false, memories: false },
      flags: {},
      prayerCooldownUntil: 0,
      inspired: null, // { kind, until }
      inspiration: null, // leaders: { tag, strength, until }
      bornAt: world.t - Math.round(spec.age * T.YEAR_DAYS * T.DAY),
      diedAt: null,
      causeOfDeath: null,
      movementId: null,
      prophet: false,
      key: spec.key || null,
    };
    c.tags = S.traitTags(c);
    world.chars[id] = c;
    return c;
  };

  S.populate = function (world, sc) {
    const rng = world.rng;
    const N = G.Data.names;
    const byKey = {};
    for (const k of sc.keyCharacters) {
      const c = S.makeCharacter(world, k);
      byKey[k.key] = c;
      if (k.key === 'healer' || k.key === 'king' || k.key === 'priestess') c.known.traits = true;
    }
    // Key relationships
    S.relate(byKey.king, byKey.heir, 'child', 70);
    S.relate(byKey.heir, byKey.king, 'parent', 60);
    S.relate(byKey.hobb, byKey.lissa, 'spouse', 80);
    S.relate(byKey.lissa, byKey.hobb, 'spouse', 80);
    for (const kid of [byKey.tam, byKey.wren]) {
      for (const p of [byKey.hobb, byKey.lissa]) {
        S.relate(p, kid, 'child', 90);
        S.relate(kid, p, 'parent', 85);
      }
    }
    S.relate(byKey.tam, byKey.wren, 'sibling', 70);
    S.relate(byKey.wren, byKey.tam, 'sibling', 75);
    S.relate(byKey.noble, byKey.king, 'rival', 20);
    S.relate(byKey.king, byKey.noble, 'rival', 30);
    S.relate(byKey.reformer, byKey.scholar, 'friend', 70);
    S.relate(byKey.scholar, byKey.reformer, 'friend', 70);
    S.relate(byKey.healer, byKey.lissa, 'friend', 65);
    S.relate(byKey.lissa, byKey.healer, 'friend', 65);
    S.relate(byKey.priestess, byKey.acolyte, 'colleague', 60);
    S.relate(byKey.reformer, byKey.magistrate, 'rival', 15);

    const country = world.country;
    country.leaderId = byKey.king.id;
    country.heirId = byKey.heir.id;
    world.church.leaderId = byKey.priestess.id;
    const leaders = { crown: byKey.king, nobility: byKey.noble, clergy: byKey.priestess, military: byKey.general, reformers: byKey.reformer };
    for (const f of country.factions) f.leaderId = leaders[f.id] ? leaders[f.id].id : null;

    // Ordinary households
    const westHomes = world.buildings.filter((b) => b.type === 'home' && b.id !== 'home1');
    const eastHomes = world.buildings.filter((b) => b.type === 'farmhouse' && b.id !== 'farm3');
    const usedLast = new Set(['Brannoc', 'Ashby', 'Velmorne', 'Crane', 'Marsh', 'Fairweather', 'Thane', 'Vell', 'Pike', 'Solace']);
    const pickLast = () => {
      const avail = N.last.filter((l) => !usedLast.has(l));
      const l = avail.length ? rng.pick(avail) : rng.pick(N.last);
      usedLast.add(l);
      return l;
    };
    const keyFirst = new Set(sc.keyCharacters.map((k) => k.first));
    const pickFirst = (sex) => rng.pick((sex === 'm' ? N.male : N.female).filter((n) => !keyFirst.has(n)));
    const westJobs = [
      ['laborer', 'Laborer', 'market', 'commons'], ['merchant', 'Merchant', 'market', 'commons'], ['guard', 'Palace guard', 'palace', 'military'],
      ['soldier', 'Soldier', 'barracks', 'military'], ['artisan', 'Artisan', 'market', 'commons'], ['clerk', 'Clerk', 'palace', 'crown'],
      ['laborer', 'Dockhand', 'market', 'commons'], ['servant', 'Palace servant', 'palace', 'commons'], ['innkeeper', 'Barkeep', 'tavern', 'commons'],
      ['student', 'Student', 'academy', 'reformers'],
    ];
    const makeHousehold = (home, east) => {
      const last = pickLast();
      const adults = rng.chance(0.75) ? 2 : 1;
      const members = [];
      for (let i = 0; i < adults; i++) {
        const sex = i === 0 ? (rng.chance(0.5) ? 'm' : 'f') : members[0].sex === 'm' ? 'f' : 'm';
        const job = east ? ['farmer', 'Farmer', home.id === 'upland' ? 'north_fields' : 'river_fields', 'commons'] : rng.pick(westJobs);
        const c = S.makeCharacter(world, {
          first: pickFirst(sex), last, sex,
          age: Math.round(rng.float(20, 62)), role: job[0], occupation: job[1], home: home.id, work: job[2], faction: job[3],
          belief: U.clamp(rng.gauss(east ? 56 : 42, 16), 3, 97), gift: rng.chance(0.03),
          wealth: U.clamp(Math.round(rng.gauss(job[0] === 'merchant' ? 60 : 32, 12)), 5, 90),
        });
        members.push(c);
      }
      if (members.length === 2) {
        S.relate(members[0], members[1], 'spouse', rng.int(45, 90));
        S.relate(members[1], members[0], 'spouse', rng.int(45, 90));
      }
      const kids = members.length === 2 && members[0].age < 50 ? rng.int(0, 3) : 0;
      for (let k = 0; k < kids; k++) {
        const sex = rng.chance(0.5) ? 'm' : 'f';
        const avgB = members.reduce((s, m) => s + m.belief, 0) / members.length;
        const kid = S.makeCharacter(world, {
          first: pickFirst(sex), last, sex, age: rng.int(1, 15), role: 'child', occupation: 'Child',
          home: home.id, work: null, faction: 'commons', belief: U.clamp(avgB + rng.gauss(0, 8), 0, 100), gift: rng.chance(0.04),
          wealth: members[0].wealth,
        });
        for (const p of members) {
          S.relate(p, kid, 'child', rng.int(60, 95));
          S.relate(kid, p, 'parent', rng.int(50, 90));
        }
      }
    };
    for (let i = 0; i < Math.min(sc.householdHomes.west, westHomes.length); i++) makeHousehold(westHomes[i], false);
    for (let i = 0; i < Math.min(sc.householdHomes.east, eastHomes.length); i++) makeHousehold(eastHomes[i], true);

    // A few friendships and rivalries so the social graph is not empty.
    const all = S.living(world).filter((c) => c.age >= 14);
    for (const c of all) {
      for (let k = 0; k < 2; k++) {
        const o = rng.pick(all);
        if (!o || o.id === c.id || c.relations[o.id]) continue;
        const rival = rng.chance(0.18);
        S.relate(c, o, rival ? 'rival' : 'friend', rival ? rng.int(5, 30) : rng.int(45, 85));
        S.relate(o, c, rival ? 'rival' : 'friend', rival ? rng.int(5, 30) : rng.int(45, 85));
      }
    }
    for (const c of S.living(world)) c.tags = S.traitTags(c);
  };

  // ---------- movement ----------
  function bridgeY(fromY, toY) {
    const bs = G.Data.city.bridges.map((b) => (b.y0 + b.y1 + 1) / 2);
    let best = bs[0];
    let bd = Infinity;
    for (const y of bs) {
      const d = Math.abs(y - fromY) + Math.abs(y - toY);
      if (d < bd) {
        bd = d;
        best = y;
      }
    }
    return best;
  }
  S.planPath = function (fromX, fromY, tx, ty) {
    const r = G.Data.city.river;
    const westFrom = fromX < r.x0 + 1.5;
    const westTo = tx < r.x0 + 1.5;
    const path = [];
    if (westFrom !== westTo) {
      const by = bridgeY(fromY, ty);
      if (westFrom) path.push({ x: r.x0 - 0.5, y: by }, { x: r.x1 + 1.5, y: by });
      else path.push({ x: r.x1 + 1.5, y: by }, { x: r.x0 - 0.5, y: by });
    }
    path.push({ x: tx, y: ty });
    return path;
  };

  function goTo(world, c, placeId, activity) {
    c.activity = activity;
    if (c.at === placeId && c.path.length === 0) return;
    const b = S.building(world, placeId) || G.Data.city.zones.find((z) => z.id === placeId);
    if (!b) return;
    c.at = placeId;
    const tx = b.x + world.rng.float(0.6, b.w - 0.6);
    const ty = b.y + world.rng.float(0.6, b.h - 0.6);
    c.path = S.planPath(c.x, c.y, tx, ty);
  }
  S.goTo = goTo;

  S.moveCharacters = function (world) {
    for (const id in world.chars) {
      const c = world.chars[id];
      if (!c.alive || c.possessed || !c.path.length) continue;
      const speed = c.flags.evacuating || c.flags.fleeing ? RUN : c.age < 6 || c.age > 70 ? WALK * 0.7 : WALK;
      let budget = speed;
      while (budget > 0 && c.path.length) {
        const p = c.path[0];
        const d = U.dist(c.x, c.y, p.x, p.y);
        if (d <= budget) {
          c.x = p.x;
          c.y = p.y;
          c.path.shift();
          budget -= d;
        } else {
          c.x += ((p.x - c.x) / d) * budget;
          c.y += ((p.y - c.y) / d) * budget;
          budget = 0;
        }
      }
    }
  };

  // ---------- routines (hourly) ----------
  S.isAdult = (c) => c.age >= 15;

  S.hourlyRoutine = function (world, c, hour) {
    if (!c.alive || c.possessed) return;
    const rng = world.rng;
    c.asleep = false;
    if (c.flags.detainedUntil && c.flags.detainedUntil > world.t) return goTo(world, c, 'barracks', 'detained');
    if (c.flags.detainedUntil) {
      c.flags.detainedUntil = 0;
      S.addMemory(world, c, 'detained', 'Released from the gaol.', 1);
    }
    if (c.flags.trapped) {
      c.activity = 'trapped';
      c.path = [];
      return;
    }
    if (c.flags.evacuating) return goTo(world, c, 'temple', 'sheltering');
    const severe = (c.illness && c.illness.severity > 45) || c.injury > 45;
    if (severe) {
      if (c.role !== 'healer' && c.wealth > 5 && hour >= 8 && hour < 18 && rng.chance(0.5)) return goTo(world, c, 'healer', 'seeking care');
      return goTo(world, c, c.homeId, 'resting (ill)');
    }
    if (hour >= 22 || hour < 6) {
      goTo(world, c, c.homeId, 'sleeping');
      c.asleep = c.at === c.homeId && c.path.length === 0;
      return;
    }
    if (c.prophet && hour >= 10 && hour < 16 && rng.chance(0.6)) return goTo(world, c, 'market', 'preaching');
    if (T.isRestday(world) && hour >= 9 && hour < 12) {
      const attend = c.belief >= 35 || (c.role === 'priest') || (c.role === 'monarch' && c.belief > 25);
      if (attend) return goTo(world, c, 'temple', c.role === 'priest' ? 'leading worship' : 'at worship');
    }
    if (c.role === 'child') {
      if (c.age >= 6 && hour >= 8 && hour < 14 && !T.isRestday(world)) return goTo(world, c, 'academy', 'at school');
      return goTo(world, c, c.homeId, 'playing');
    }
    if (c.age > 70 && rng.chance(0.6)) return goTo(world, c, c.homeId, 'resting');
    if (hour >= 8 && hour < 17 && c.workId && !T.isRestday(world)) {
      if (hour === 12 && rng.chance(0.35)) return goTo(world, c, 'market', 'at lunch');
      return goTo(world, c, c.workId, 'working');
    }
    if (hour >= 18 && hour < 22) {
      const r = rng.next();
      if ((c.role === 'reformer' || c.factionId === 'reformers' || c.role === 'laborer') && r < 0.45) return goTo(world, c, 'tavern', 'drinking & debating');
      if (c.belief > 70 && r < 0.3) return goTo(world, c, 'temple', 'evening prayer');
      if (r < 0.2) {
        const friends = Object.keys(c.relations).filter((k) => c.relations[k].type === 'friend').map((k) => S.char(world, +k)).filter((o) => o && o.alive);
        const f = rng.pick(friends);
        if (f) return goTo(world, c, f.homeId, 'visiting ' + f.first);
      }
      if (r < 0.35) return goTo(world, c, 'market', 'strolling');
    }
    return goTo(world, c, c.homeId, 'at home');
  };

  // ---------- daily life ----------
  S.dailyLife = function (world) {
    const rng = world.rng;
    const country = world.country;
    const living = S.living(world);
    const ecoFactor = country.economy / 50;
    for (const c of living) {
      c.age += 1 / T.YEAR_DAYS;
      // Economy and needs
      const income = { merchant: 3.2, noble: 4, monarch: 5, general: 3, priest: 1.6, official: 2.6, clerk: 2, scholar: 2, healer: 1.8, guard: 1.8, soldier: 1.6, artisan: 2.2, farmer: 1.8, laborer: 1.5, servant: 1.4, innkeeper: 2, reformer: 1.4, student: 0.4, heir: 4 }[c.role] || 0;
      let earn = income * ecoFactor * (c.injury > 40 || (c.illness && c.illness.severity > 50) ? 0.2 : 1);
      if (c.role === 'farmer' && world.provinces[1].devastation > 0) earn *= 1 - world.provinces[1].devastation / 140;
      if (c.corrupt) earn += country.corruption / 40;
      c.wealth = U.clamp(c.wealth + earn - 1.25, 0, 100);
      // Households slowly repair damage to their homes.
      const home = S.building(world, c.homeId);
      if (home && home.damage > 0 && c.age >= 16 && world.flood.stage === 'none') {
        const work = c.wealth > 10 ? 4 : 1.5;
        home.damage = Math.max(0, home.damage - work);
        if (c.wealth > 10) c.wealth -= 0.5;
      }
      if (c.role === 'child') {
        const parent = S.familyOf(world, c).find((p) => p.alive && c.relations[p.id].type === 'parent');
        c.wealth = parent ? parent.wealth : c.wealth;
      }
      if (c.role === 'priest') c.wealth = Math.max(c.wealth, 20); // the temple feeds its own
      const spouse = S.spouseOf(world, c);
      if (spouse && spouse.homeId === c.homeId && c.id < spouse.id) {
        const avg = (c.wealth + spouse.wealth) / 2; // households pool their means
        c.wealth = spouse.wealth = avg;
      }
      // In a famine bread is dear: the poor go hungry first, the rich hardly notice.
      const famineHit = country.flags.famine && c.wealth < 45;
      if (c.wealth < 8 || famineHit) c.hunger = U.clamp(c.hunger + (famineHit && c.wealth >= 8 ? 8 : 14) - (country.flags.granaries ? 12 : 0), 0, 100);
      else c.hunger = Math.max(0, c.hunger - 25);
      // Alms from the Temple soften hunger.
      if (c.hunger > 40 && world.church.strength > 30) c.hunger = Math.max(0, c.hunger - world.church.strength / 6);
      // Health
      if (c.hunger > 80) c.health = Math.max(0, c.health - 2.5);
      if (!c.illness) {
        let p = 0.0025 + (c.age > 55 ? 0.004 : 0) + (c.hunger > 60 ? 0.01 : 0);
        if (world.plague.active) p += 0.035;
        if (rng.chance(p * world.settings.crisisFrequency)) {
          c.illness = { name: world.plague.active ? 'the plague' : rng.pick(ILLNESSES), severity: rng.int(20, 55) };
          S.addMemory(world, c, 'illness', `Fell ill with ${c.illness.name}.`, 1);
        }
      } else {
        const healerNear = c.activity === 'seeking care' ? 12 : 0;
        const drift = rng.float(-10, 9) - healerNear + (c.age > 60 ? 2 : 0) + (c.hunger > 60 ? 5 : 0) - (c.health - 50) / 10;
        c.illness.severity = U.clamp(c.illness.severity + drift, 0, 120);
        if (c.illness.severity <= 5) {
          S.addMemory(world, c, 'recovery', `Recovered from ${c.illness.name}.`, 1);
          c.illness = null;
        }
      }
      if (c.injury > 0) c.injury = Math.max(0, c.injury - rng.float(2, 7));
      c.health = U.clamp(c.health + (c.illness ? -c.illness.severity / 40 : 2) - (c.age > 65 ? 0.4 : 0), 0, 100);
      // Mood
      let mood = 55 + (c.wealth - 30) / 3 - c.hunger / 3 - (c.illness ? c.illness.severity / 4 : 0) - c.injury / 4;
      if (c.flags.grief && world.t - c.flags.grief > T.DAY * 40) c.flags.grief = 0;
      if (c.flags.grief) mood -= 20;
      c.mood = U.clamp(U.lerp(c.mood, mood, 0.3), 0, 100);
      if (c.inspired && c.inspired.until < world.t) c.inspired = null;
      if (c.inspiration && c.inspiration.until < world.t) c.inspiration = null;
      // Death
      let pDeath = 0;
      if (c.age > 55) pDeath += Math.pow((c.age - 55) / 40, 3) * 0.02;
      if (c.illness && c.illness.severity >= 100) pDeath += 0.5;
      if (c.health <= 0) pDeath += 0.6;
      if (c.injury >= 95) pDeath += 0.4;
      if (rng.chance(pDeath)) {
        const cause = c.illness && (c.illness.severity >= 100 || c.health <= 0) ? c.illness.name : c.injury >= 95 ? 'their injuries' : c.health <= 0 ? (c.hunger > 60 ? 'hunger' : 'frailty') : 'old age';
        S.killCharacter(world, c, cause);
      }
    }
    // Story telling: memories of miracles spread to family and friends.
    for (const c of S.living(world)) {
      const recent = c.memories.find((m) => m.kind === 'miracle' && world.t - m.t < T.DAY * 3 && !m.told);
      if (!recent) continue;
      recent.told = true;
      for (const id in c.relations) {
        const o = S.char(world, +id);
        if (!o || !o.alive || c.relations[id].type === 'rival') continue;
        const sway = (c.belief - 40) / 12 - o.traits.skepticism * 2;
        S.adjustBelief(world, o, U.clamp(sway, -2, 4));
        if (rng.chance(0.4)) S.addMemory(world, o, 'story', `Heard from ${c.first} about ${recent.text.replace(/\.$/, '').toLowerCase()}.`, 0.6);
      }
    }
    S.lifeEvents(world);
  };

  S.killCharacter = function (world, c, cause) {
    if (!c.alive) return;
    c.alive = false;
    c.diedAt = world.t;
    c.causeOfDeath = cause;
    c.path = [];
    c.activity = 'dead';
    world.stats.deaths++;
    if (c.possessed) S.endPossession(world, 'The vessel died.');
    for (const p of world.prayers) if (p.requesterId === c.id && p.status === 'pending') p.status = 'void';
    const fam = S.familyOf(world, c);
    for (const f of fam) {
      if (!f.alive) continue;
      f.flags.grief = world.t;
      S.addMemory(world, f, 'grief', `Lost ${c.first} to ${cause}.`, 2);
    }
    const level = c.role === 'monarch' || c.key ? 2 : c.age < 16 ? 1 : 0;
    S.log(world, { title: `${c.name} has died`, text: `${c.name}, aged ${Math.floor(c.age)}, died of ${cause}.`, level, kind: 'death', entities: [c.id] });
    S.onCharacterDeath(world, c);
  };

  S.lifeEvents = function (world) {
    const rng = world.rng;
    const living = S.living(world);
    if (living.length >= MAX_DETAILED) return;
    for (const c of living) {
      // Marriage among unmarried adults with a close friend
      if (c.age >= 18 && c.age < 45 && !S.spouseOf(world, c) && rng.chance(0.004)) {
        const cands = Object.keys(c.relations).map((k) => S.char(world, +k)).filter((o) => o && o.alive && o.sex !== c.sex && o.age >= 18 && o.age < 50 && !S.spouseOf(world, o) && c.relations[o.id].affinity > 55 && !S.familyOf(world, c).includes(o));
        const o = rng.pick(cands);
        if (o) {
          S.relate(c, o, 'spouse', 80);
          S.relate(o, c, 'spouse', 80);
          if (o.homeId !== c.homeId) {
            o.homeId = c.homeId;
          }
          S.addMemory(world, c, 'marriage', `Married ${o.first}.`, 2);
          S.addMemory(world, o, 'marriage', `Married ${c.first}.`, 2);
          if (c.flags.lonelyPrayer) c.flags.lonelyPrayer = 0;
          S.log(world, { title: 'A wedding', text: `${c.name} married ${o.name}.`, level: 0, kind: 'life', entities: [c.id, o.id] });
        }
      }
      // Births
      if (c.sex === 'f' && c.age >= 18 && c.age <= 42) {
        const sp = S.spouseOf(world, c);
        if (sp && sp.alive && rng.chance(0.0019)) S.birth(world, c, sp);
      }
    }
    // Migrants keep the city alive when the population falls.
    if (living.length < 40 && rng.chance(0.08)) {
      const empty = world.buildings.find((b) => b.type === 'home' && !living.some((c) => c.homeId === b.id));
      if (empty) {
        const N = G.Data.names;
        const sex = rng.chance(0.5) ? 'm' : 'f';
        const c = S.makeCharacter(world, {
          first: rng.pick(sex === 'm' ? N.male : N.female), last: rng.pick(N.last), sex, age: rng.int(18, 40), role: 'laborer',
          occupation: 'Laborer', home: empty.id, work: 'market', faction: 'commons', belief: U.clamp(rng.gauss(38, 18), 0, 100), gift: rng.chance(0.03), wealth: 20,
        });
        c.x = 0.5;
        c.y = 9.5;
        S.log(world, { title: 'A newcomer', text: `${c.name} arrived in Thornhaven looking for work.`, level: 0, kind: 'life', entities: [c.id] });
      }
    }
  };

  S.spouseOf = function (world, c) {
    for (const id in c.relations) if (c.relations[id].type === 'spouse') {
      const o = S.char(world, +id);
      if (o && o.alive) return o;
    }
    return null;
  };

  S.birth = function (world, mother, father) {
    const rng = world.rng;
    const N = G.Data.names;
    const sex = rng.chance(0.5) ? 'm' : 'f';
    // Descendants inherit cultural tradition (belief), not memories.
    const belief = U.clamp((mother.belief + father.belief) / 2 + rng.gauss(0, 10), 0, 100);
    const kid = S.makeCharacter(world, {
      first: rng.pick(sex === 'm' ? N.male : N.female), last: father.last, sex, age: 0, role: 'child', occupation: 'Child',
      home: mother.homeId, work: null, faction: mother.factionId === 'crown' ? 'crown' : 'commons', belief, gift: rng.chance(0.03), wealth: mother.wealth,
    });
    kid.x = mother.x;
    kid.y = mother.y;
    for (const p of [mother, father]) {
      S.relate(p, kid, 'child', 90);
      S.relate(kid, p, 'parent', 85);
      S.addMemory(world, p, 'birth', `Welcomed a child, ${kid.first}.`, 2);
    }
    for (const sib of S.familyOf(world, mother).filter((x) => x.alive && mother.relations[x.id].type === 'child' && x.id !== kid.id)) {
      S.relate(kid, sib, 'sibling', 60);
      S.relate(sib, kid, 'sibling', 60);
    }
    world.stats.births++;
    const royal = mother.role === 'monarch' || mother.role === 'heir' || father.role === 'monarch' || father.role === 'heir';
    S.log(world, { title: royal ? 'A royal birth' : 'A birth', text: `${kid.first} ${kid.last} was born to ${mother.first} and ${father.first}.`, level: royal ? 2 : 0, kind: 'life', entities: [kid.id] });
    return kid;
  };

  // Coming of age: children take up a trade.
  S.yearlyLife = function (world) {
    const rng = world.rng;
    for (const c of S.living(world)) {
      if (c.role === 'child' && c.age >= 15) {
        const parent = S.familyOf(world, c).find((p) => c.relations[p.id] && c.relations[p.id].type === 'parent');
        const inherit = parent && rng.chance(0.6) && ['farmer', 'merchant', 'artisan', 'laborer', 'soldier', 'guard'].includes(parent.role);
        const job = inherit ? [parent.role, parent.occupation, parent.workId, parent.factionId] : rng.pick([['laborer', 'Laborer', 'market', 'commons'], ['artisan', 'Artisan', 'market', 'commons'], ['student', 'Student', 'academy', 'reformers'], ['soldier', 'Soldier', 'barracks', 'military']]);
        c.role = job[0];
        c.occupation = job[1];
        c.workId = job[2];
        c.factionId = job[3];
        S.addMemory(world, c, 'life', `Came of age and became a ${c.occupation.toLowerCase()}.`, 1);
      }
    }
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
