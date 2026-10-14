// The three forms of God: spectral observer, possession, and powerless human form.
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;
  const W = () => G.Data.city.width;
  const Hh = () => G.Data.city.height;

  S.playerPos = function (world) {
    const p = world.player;
    if (p.form === 'possession') {
      const v = S.char(world, p.possessId);
      if (v) return { x: v.x, y: v.y };
    }
    if (p.form === 'human') return { x: p.human.x, y: p.human.y };
    return { x: p.x, y: p.y };
  };

  // Movement is in real time (works while paused) and does not touch the RNG.
  S.movePlayer = function (world, dx, dy) {
    const p = world.player;
    if (p.form === 'spectral') {
      p.x = U.clamp(p.x + dx, 0, W() - 0.01);
      p.y = U.clamp(p.y + dy, 0, Hh() - 0.01);
      return;
    }
    let body;
    if (p.form === 'possession') body = S.char(world, p.possessId);
    else body = p.human;
    if (!body) return;
    if (p.form === 'human' && p.human.detainedUntil > world.t) return;
    const nx = U.clamp(body.x + dx, 0, W() - 0.01);
    const ny = U.clamp(body.y + dy, 0, Hh() - 0.01);
    // Bodies cannot walk on water (except bridges) or through deep flood.
    if (!S.inRiver(nx, body.y) && !deepWater(world, nx, body.y)) body.x = nx;
    if (!S.inRiver(body.x, ny) && !deepWater(world, body.x, ny)) body.y = ny;
    if (p.form === 'possession') {
      body.path = [];
      body.at = (S.buildingAt(world, body.x, body.y) || {}).id || null;
    }
  };
  function deepWater(world, x, y) {
    return S.isFlooded(world, x, y) && world.flood.level > 0.85;
  }

  // ---------- Form changes ----------
  S.setForm = function (world, form, targetId) {
    const p = world.player;
    if (form === p.form && form !== 'possession') return { ok: true, msg: '' };
    if (p.form === 'possession') S.endPossession(world, null);
    if (p.form === 'human') leaveHuman(world);
    if (form === 'spectral') {
      p.form = 'spectral';
      return { ok: true, msg: 'You are a spectral presence again.' };
    }
    if (form === 'possession') return S.possess(world, targetId);
    if (form === 'human') {
      if (p.human.cooldownUntil > world.t) return { ok: false, msg: `Your mortal form needs ${T.duration(p.human.cooldownUntil - world.t)} to re-form.` };
      if (S.inRiver(p.x, p.y)) return { ok: false, msg: 'You cannot take form over the river.' };
      p.form = 'human';
      p.human.x = p.x;
      p.human.y = p.y;
      p.human.health = Math.max(p.human.health, 60);
      const ws = S.witnesses(world, p.x, p.y, 3);
      if (ws.length) {
        // Appearing from nowhere in front of people is noticed.
        p.human.suspicion = U.clamp(p.human.suspicion + 10 * ws.length, 0, 100);
        for (const w of ws) S.addMemory(world, w, 'stranger', 'A stranger seemed to appear out of thin air.', 1);
      }
      S.log(world, { title: 'You walk among them', text: 'You take the form of an ordinary traveller. No miracles now: only words and hands.', level: 0, kind: 'divine' });
      return { ok: true, msg: 'You walk as a human. Divine abilities are unavailable.' };
    }
    return { ok: false, msg: 'Unknown form' };
  };

  function leaveHuman(world) {
    const p = world.player;
    const ws = S.witnesses(world, p.human.x, p.human.y, 4);
    if (ws.length && p.human.detainedUntil <= world.t) {
      for (const w of ws) S.addMemory(world, w, 'stranger', 'A stranger they were watching simply vanished.', 1.5);
      world.country.exposure = U.clamp(world.country.exposure + 0.5 * ws.length, 0, 100);
    }
    if (p.human.detainedUntil > world.t) {
      world.country.exposure = U.clamp(world.country.exposure + 3, 0, 100);
      S.log(world, { title: 'A prisoner vanishes', text: 'The guards swear the stranger in the cell vanished into thin air. The tale spreads.', level: 2, kind: 'divine' });
      p.human.detainedUntil = 0;
    }
    p.x = p.human.x;
    p.y = p.human.y;
    p.form = 'spectral';
  }

  S.possessionCost = function (world, c) {
    const resist = S.influenceOf(c) * 40 + (c.traits.skepticism > 0.6 ? 25 : 0) + (c.belief > 80 ? -5 : 0);
    return Math.round((G.Data.possession.base + resist) * (world.settings.costMultiplier || 1));
  };

  S.possess = function (world, targetId) {
    const p = world.player;
    const c = S.char(world, targetId);
    if (!c || !c.alive) return { ok: false, msg: 'No one to possess.' };
    const pos = { x: p.x, y: p.y };
    if (U.dist(pos.x, pos.y, c.x, c.y) > G.Data.possession.range) return { ok: false, msg: `Move closer to ${c.first} (within ${G.Data.possession.range} tiles).` };
    const cost = S.possessionCost(world, c);
    if (!S.spendFaith(world, cost, 'Possession')) return { ok: false, msg: `Not enough Faith (${cost}).` };
    // Spiritually resistant people can throw you out.
    if (world.rng.chance(c.traits.skepticism * 0.25 + S.influenceOf(c) * 0.1)) {
      S.addMemory(world, c, 'possessed', 'Felt something try to take hold of them, and fought it off.', 2);
      p.form = 'spectral';
      return { ok: false, msg: `${c.first} resisted you. The Faith is spent.` };
    }
    p.form = 'possession';
    p.possessId = c.id;
    p.possessUntil = world.t + G.Data.possession.maxHours * 60;
    p.possessStart = world.t;
    p.possessOddness = 0;
    c.possessed = true;
    c.path = [];
    c.activity = 'possessed';
    c.known.traits = true;
    c.known.beliefs = true;
    c.known.memories = true;
    world.stats.possessions++;
    c.divine.possessed++;
    if (c.id === world.country.leaderId) world.challenge.possessedRuler = true;
    S.recomputeFaithRates(world);
    S.log(world, { title: `You possess ${c.first}`, text: `You slip into ${c.name}. You see what they see, and know what they know.`, level: 1, kind: 'divine', entities: [c.id], cost });
    return { ok: true, msg: `You are inside ${c.name}.` };
  };

  S.endPossession = function (world, reason) {
    const p = world.player;
    if (p.form !== 'possession') return;
    const c = S.char(world, p.possessId);
    p.form = 'spectral';
    p.possessId = null;
    p.pendingChoice = null;
    if (c) {
      p.x = c.x;
      p.y = c.y;
      c.possessed = false;
      if (c.alive) {
        // Aftereffects depend on circumstances and the person.
        const rng = world.rng;
        const dur = world.t - (p.possessStart || world.t);
        const odd = p.possessOddness || 0;
        let effect;
        if (c.gift || (c.belief > 65 && rng.chance(0.5))) {
          effect = 'calling';
          S.adjustBelief(world, c, 10);
          S.addMemory(world, c, 'possessed', 'Was filled by a holy presence. Takes it as a calling.', 3);
          if (c.belief > 75 && rng.chance(0.35) && c.age >= 16) c.prophet = true;
        } else if (dur > 120 && rng.chance(0.5)) {
          effect = 'fragments';
          S.addMemory(world, c, 'possessed', `Lost ${T.duration(dur)} and remembers only fragments.`, 2);
        } else if (rng.chance(0.4 + c.traits.caution * 0.3)) {
          effect = 'frightened';
          c.mood = U.clamp(c.mood - 20, 0, 100);
          S.addMemory(world, c, 'possessed', 'Woke with no memory of the last hours. Is terrified.', 2);
        } else {
          effect = 'nothing';
          S.addMemory(world, c, 'possessed', 'Felt strangely absent for a while.', 0.7);
        }
        if (odd >= 2) {
          c.renown = U.clamp(c.renown - 8, 0, 100);
          c.flags.thoughtMad = world.t;
          S.addMemory(world, c, 'possessed', 'People whisper that they acted strangely, like someone else entirely.', 2);
        }
        c.path = [];
        c.activity = 'disoriented';
        S.log(world, { title: `You leave ${c.first}`, text: `${reason ? reason + ' ' : ''}${c.name} ${{ calling: 'feels called by something holy', fragments: 'remembers only fragments', frightened: 'is frightened and confused', nothing: 'barely noticed' }[effect]}.`, level: 1, kind: 'divine', entities: [c.id] });
      }
    }
    S.recomputeFaithRates(world);
  };

  // Actions through a possessed body.
  S.possessedActions = function (world) {
    const p = world.player;
    if (p.form !== 'possession') return [];
    const c = S.char(world, p.possessId);
    if (!c) return [];
    const near = S.witnesses(world, c.x, c.y, 2.5, c.id);
    const acts = [];
    for (const o of near.slice(0, 6)) {
      acts.push({ id: 'preach', targetId: o.id, label: `Speak of the divine to ${o.first}` });
      if (world.flood.stage !== 'none' && S.isInFloodDanger(world, o)) acts.push({ id: 'warn', targetId: o.id, label: `Urge ${o.first} to flee the flood` });
      if (o.flags.trapped) acts.push({ id: 'carry', targetId: o.id, label: `Carry ${o.first}'s family to safety` });
    }
    if (world.flood.stage !== 'none' && ['general', 'official', 'monarch', 'heir', 'soldier', 'guard'].includes(c.role) && S.living(world).some((o) => o.flags.trapped)) acts.push({ id: 'rescue', label: 'Order a rescue of the trapped farms' });
    const pd = world.country.pendingDecision;
    if (pd && pd.leaderId === c.id) for (const o of G.Data.decisions[pd.decisionId].options) acts.push({ id: 'decide', optionId: o.id, label: `Decide: ${o.label}` });
    return acts;
  };

  S.possessedAct = function (world, act) {
    const p = world.player;
    const c = S.char(world, p.possessId);
    if (!c || p.form !== 'possession') return { ok: false, msg: 'You are not possessing anyone.' };
    const o = S.char(world, act.targetId);
    const rng = world.rng;
    const outOfCharacter = (lvl) => {
      p.possessOddness = (p.possessOddness || 0) + lvl;
    };
    if (act.id === 'preach' && o) {
      const credible = c.renown / 100 + (c.role === 'priest' ? 0.4 : 0) + c.belief / 200;
      const sway = (credible * 8 - o.traits.skepticism * 4) * rng.float(0.5, 1.2);
      S.adjustBelief(world, o, sway);
      if (c.belief < 30) outOfCharacter(1);
      S.addMemory(world, o, 'talk', `${c.first} spoke with unusual conviction about the divine.`, 1);
      return { ok: true, msg: sway > 2 ? `${o.first} listened, moved.` : `${o.first} was unconvinced.` };
    }
    if (act.id === 'warn' && o) {
      const listens = rng.chance(0.5 + c.renown / 200 + o.traits.caution * 0.3);
      if (listens) for (const f of S.living(world).filter((x) => x.homeId === o.homeId)) {
        f.flags.evacuating = true;
        f.flags.trapped = false;
      }
      return { ok: true, msg: listens ? `${o.first}'s household is leaving for the temple.` : `${o.first} refuses to abandon the farm.` };
    }
    if (act.id === 'carry' && o) {
      const fam = S.living(world).filter((x) => x.homeId === o.homeId && x.flags.trapped);
      const strong = c.age >= 16 && c.age < 60 && c.injury < 40;
      if (!strong) return { ok: false, msg: `${c.first}'s body is not strong enough.` };
      for (const f of fam) {
        f.flags.trapped = false;
        f.flags.evacuating = true;
        S.addMemory(world, f, 'rescue', `${c.first} waded into the flood and carried them out.`, 3);
        S.relate(f, c, 'friend', 85);
      }
      c.renown = U.clamp(c.renown + 12, 0, 100);
      if (rng.chance(0.35)) c.injury = U.clamp(c.injury + 20, 0, 100);
      S.log(world, { title: `${c.first} braves the flood`, text: `${c.name} waded into the floodwater and brought the ${o.last} family out.`, level: 2, kind: 'event', entities: [c.id, o.id] });
      return { ok: true, msg: `The ${o.last} family is safe.` };
    }
    if (act.id === 'rescue') {
      S.organizeRescue(world, c);
      if (c.traits.kindness < 0.35) outOfCharacter(1);
      return { ok: true, msg: 'A rescue is being organised.' };
    }
    if (act.id === 'decide') {
      const ch = S.resolveDecision(world, act.optionId, true);
      if (!ch) return { ok: false, msg: 'There is no decision to make.' };
      if (ch.tags.includes('mercy') && c.traits.kindness < 0.35) outOfCharacter(2);
      outOfCharacter(1);
      return { ok: true, msg: `${c.first} decreed: ${ch.label}.` };
    }
    return { ok: false, msg: 'Nothing happened.' };
  };

  // Called every minute while possessing.
  S.possessionMinute = function (world) {
    const p = world.player;
    if (p.form !== 'possession') return;
    const c = S.char(world, p.possessId);
    if (!c || !c.alive) return S.endPossession(world, 'Your vessel is gone.');
    if (world.t >= p.possessUntil) S.endPossession(world, 'The possession could not be sustained any longer.');
  };

  // ---------- Human form ----------
  S.humanActions = function (world) {
    const p = world.player;
    if (p.form !== 'human' || p.human.detainedUntil > world.t) return [];
    const near = S.witnesses(world, p.human.x, p.human.y, 2.2);
    const acts = [];
    for (const o of near.slice(0, 6)) {
      acts.push({ id: 'talk', targetId: o.id, label: `Talk with ${o.first}` });
      acts.push({ id: 'encourage', targetId: o.id, label: `Encourage ${o.first}` });
      if (o.flags.trapped) acts.push({ id: 'help_evacuate', targetId: o.id, label: `Help the ${o.last} family through the water` });
      if ((o.illness || o.injury > 20) && !o.flags.tended) acts.push({ id: 'tend', targetId: o.id, label: `Tend ${o.first}'s wounds (mundane)` });
    }
    return acts;
  };

  S.humanAct = function (world, act) {
    const p = world.player;
    const o = S.char(world, act.targetId);
    const rng = world.rng;
    if (p.form !== 'human') return { ok: false, msg: 'You are not in human form.' };
    if (!o || !o.alive) return { ok: false, msg: 'They are not here.' };
    if (U.dist(o.x, o.y, p.human.x, p.human.y) > 3) return { ok: false, msg: `${o.first} is too far away.` };
    if (act.id === 'talk') {
      o.known.traits = true;
      o.known.beliefs = true;
      if (rng.chance(0.6)) o.known.memories = true;
      p.human.suspicion = U.clamp(p.human.suspicion + (o.role === 'guard' || o.role === 'official' ? 4 : 1), 0, 100);
      const worry = describeWorry(world, o);
      const rumour = S.rumour(world, o);
      return { ok: true, msg: `${o.first} says: "${worry}"${rumour ? ` They mention a rumour: ${rumour}` : ''}` };
    }
    if (act.id === 'encourage') {
      const r = rng.next();
      o.mood = U.clamp(o.mood + 6 + r * 6, 0, 100);
      if (o.belief > 40 && r > 0.5) S.adjustBelief(world, o, 1.5);
      if (o.relations && !o.relations['stranger']) S.addMemory(world, o, 'talk', 'A kind stranger offered encouragement.', 0.6);
      return { ok: true, msg: `${o.first} seems a little lighter.` };
    }
    if (act.id === 'help_evacuate') {
      const fam = S.living(world).filter((x) => x.homeId === o.homeId && x.flags.trapped);
      for (const f of fam) {
        f.flags.trapped = false;
        f.flags.evacuating = true;
        S.addMemory(world, f, 'rescue', 'A stranger waded through the flood and led them to safety.', 3);
      }
      // Ordinary physical risk applies.
      if (rng.chance(0.4)) {
        p.human.health -= rng.int(15, 35);
        if (p.human.health <= 0) mortalDeath(world, 'You were swept away by the current.');
      }
      S.log(world, { title: 'A stranger in the flood', text: `An unknown traveller led the ${o.last} family through the water to safety.`, level: 2, kind: 'event', entities: [o.id] });
      return { ok: true, msg: `You guide the ${o.last} family to safety.` };
    }
    if (act.id === 'tend') {
      o.flags.tended = world.t;
      if (o.illness) o.illness.severity = Math.max(0, o.illness.severity - 10);
      o.injury = Math.max(0, o.injury - 10);
      o.mood = U.clamp(o.mood + 8, 0, 100);
      return { ok: true, msg: `You clean and bind ${o.first}'s wounds. It helps a little.` };
    }
    return { ok: false, msg: 'Nothing happened.' };
  };

  function describeWorry(world, o) {
    if (o.flags.trapped) return 'The water! My family!';
    if (o.illness) return `I have ${o.illness.name}. I am frightened.`;
    if (o.flags.grief) return 'I have lost someone. I cannot stop thinking about it.';
    if (o.hunger > 50) return 'We have not eaten properly in days.';
    if (o.factionId === 'reformers') return 'The magistrates line their pockets while we starve. It cannot last.';
    if (o.belief > 70) return 'Heaven watches over us. I feel it.';
    if (o.belief < 20) return 'Prayers? I believe in what I can see.';
    return rpick(world, ['Work is hard, but we manage.', 'The King is old. Who knows what comes next?', 'Did you hear the river is rising again?']);
  }
  function rpick(world, arr) {
    return arr[Math.floor(((world.t * 7919) % 1000) / 1000 * arr.length)];
  }

  // Rumours give the player imperfect, second-hand information.
  S.rumour = function (world, o) {
    const c = world.country;
    if (o.factionId === 'military' && c.coupRisk > 55) return 'some officers say the General would rule better than the King.';
    if (c.revolutionRisk > 55) return 'people are talking about storming the palace.';
    if (c.reformPressure > 55) return 'the Reformers are gathering signatures for a charter.';
    const off = S.living(world).find((x) => x.corrupt);
    if (off && o.role !== 'official' && world.rng.chance(0.3)) return `${off.name} has been skimming the grain tax.`;
    const m = world.movements.find((mm) => mm.active);
    if (m) return `${m.name} meets in secret near the ${S.districtName(m.district)}.`;
    return '';
  };

  function mortalDeath(world, text) {
    const p = world.player;
    p.human.health = 100;
    p.human.cooldownUntil = world.t + T.DAY;
    S.log(world, { title: 'Your mortal body dies', text: `${text} You return to spectral form; a new body will take a day to form.`, level: 2, kind: 'divine' });
    p.x = p.human.x;
    p.y = p.human.y;
    p.form = 'spectral';
  }

  // Hourly human-form risks: guards, suspicion, floodwater.
  S.humanHourly = function (world) {
    const p = world.player;
    if (p.form !== 'human') return;
    const h = p.human;
    if (h.detainedUntil > world.t) return;
    if (h.detainedUntil && h.detainedUntil <= world.t) {
      h.detainedUntil = 0;
      S.log(world, { title: 'Released', text: 'The guards released you with a warning.', level: 0, kind: 'divine' });
    }
    const b = S.buildingAt(world, h.x, h.y);
    const guards = S.witnesses(world, h.x, h.y, 5).filter((c) => c.role === 'guard' || c.role === 'soldier' || c.role === 'general');
    if (b && b.guarded && guards.length) h.suspicion = U.clamp(h.suspicion + 25, 0, 100);
    h.suspicion = Math.max(0, h.suspicion - 2);
    if (h.suspicion >= 60 && guards.length && world.rng.chance(0.5)) {
      h.detainedUntil = world.t + 12 * 60;
      h.x = 30;
      h.y = 4;
      h.suspicion = 20;
      S.log(world, { title: 'Detained', text: 'Guards seized you as a suspicious stranger and threw you in the gaol for the night. (Abandoning the body will be noticed.)', level: 2, kind: 'divine', alert: true });
    }
    if (S.isFlooded(world, h.x, h.y) && world.flood.level > 0.5 && world.rng.chance(0.3)) {
      h.health -= world.rng.int(10, 25);
      if (h.health <= 0) mortalDeath(world, 'You drowned in the floodwater.');
    }
  };

  // Spectral observation gradually reveals what people are like (imperfect information).
  S.observeMinute = function (world) {
    const pos = S.playerPos(world);
    if (world.t % 10 !== 0) return;
    for (const c of S.living(world)) {
      if (U.dist(c.x, c.y, pos.x, pos.y) > 3) continue;
      c.flags.observed = (c.flags.observed || 0) + 10;
      if (c.flags.observed >= 30) c.known.traits = true;
      if (c.flags.observed >= 60) c.known.beliefs = true;
      if (c.flags.observed >= 120) c.known.memories = true;
    }
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
