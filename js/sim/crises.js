// Crises: floods, plague, famine and war. They emerge from simulation variables, with authored event chains for drama.
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;
  const H = S.handlers;

  S.neighbor = (world, id) => world.neighbors.find((n) => n.id === id);

  S.inFloodZone = function (x, y, world) {
    const zone = world && world.flood.diverted ? G.Data.city.northFields : G.Data.city.floodplain;
    return x >= zone.x0 && x < zone.x1 + 1 && y >= zone.y0 && y < zone.y1 + 1;
  };
  S.isInFloodDanger = function (world, c) {
    if (world.flood.stage === 'none' || world.flood.stage === 'receding') return false;
    const home = S.building(world, c.homeId);
    const atRisk = (x, y) => S.inFloodZone(x, y, world);
    if (home && home.protectedUntil > world.t) return atRisk(c.x, c.y) && c.at !== c.homeId;
    return atRisk(c.x, c.y) || (home && atRisk(home.x + 1, home.y + 1) && c.at === c.homeId);
  };

  // ---------- Flood ----------
  H.flood_warning = function (world, data) {
    if (world.flood.stage !== 'none') return;
    world.flood = { stage: 'warning', level: 0, diverted: false, severity: data.severity || 1, startedAt: world.t };
    world.provinces[1].flooded = true;
    S.log(world, { title: 'The river is rising', text: 'Days of rain have swollen the river. The Riverside farms lie in its path. Some families are packing; others will not leave their land.', level: 2, kind: 'disaster', alert: true });
    // Some cautious households evacuate on their own.
    for (const c of S.living(world)) {
      if (!S.isInFloodDanger(world, c)) continue;
      if (world.rng.chance(c.traits.caution * 0.6) && !(c.key && ['hobb', 'lissa', 'tam', 'wren'].includes(c.key))) {
        for (const f of [c, ...S.familyOf(world, c)]) if (f.alive && f.homeId === c.homeId) f.flags.evacuating = true;
      }
    }
    S.requestDecision(world, 'flood_relief', 10 * 60);
    S.schedule(world, 12 * 60, 'flood_rise', {});
  };
  H.flood_rise = function (world) {
    if (world.flood.stage !== 'warning') return;
    world.flood.stage = 'rising';
    S.log(world, { title: 'Floodwaters spill over the banks', text: 'Brown water creeps across the Riverside fields toward the farmhouses.', level: 2, kind: 'disaster', alert: true });
    S.schedule(world, 10 * 60, 'flood_peak', {});
  };
  H.flood_peak = function (world) {
    if (world.flood.stage !== 'rising') return;
    world.flood.stage = 'flooding';
    S.log(world, { title: 'The flood peaks', text: `The river has burst its banks. ${world.flood.diverted ? 'The North Fields are under water.' : 'The Riverside farms are under water.'}`, level: 2, kind: 'disaster', alert: true });
    S.schedule(world, 20 * 60, 'flood_recede', {});
  };
  H.flood_recede = function (world) {
    if (world.flood.stage !== 'flooding') return;
    world.flood.stage = 'receding';
    S.schedule(world, 16 * 60, 'flood_end', {});
  };
  H.flood_end = function (world) {
    if (world.flood.stage === 'none') return;
    S.endFlood(world, 'The waters drained back into the river.');
  };

  S.endFlood = function (world, text) {
    const wasDiverted = world.flood.diverted;
    world.floodEndedAt = world.t;
    const damaged = world.buildings.filter((b) => b.damage > 0).length;
    world.flood = { stage: 'none', level: 0, diverted: false, severity: 1, startedAt: 0 };
    world.provinces[1].flooded = false;
    for (const c of S.living(world)) {
      if (c.flags.trapped) {
        c.flags.trapped = false;
        S.addMemory(world, c, 'survival', 'Survived the flood, trapped until the waters fell.', 2);
      }
      if (c.flags.evacuating) {
        c.flags.evacuating = false;
        S.addMemory(world, c, 'survival', 'Sheltered in the temple during the flood.', 1);
      }
    }
    const dead = world.chronicle.filter((e) => e.kind === 'death' && /drowned/.test(e.text) && e.t > world.t - T.DAY * 4).length;
    S.log(world, {
      title: 'The flood is over',
      text: `${text} ${damaged} buildings were damaged${dead ? `, and ${dead} ${dead === 1 ? 'life was' : 'lives were'} lost` : ', but no lives were lost'}.${wasDiverted ? ' The North Fields harvest is ruined.' : ''}`,
      level: 2, kind: 'disaster',
    });
    const rl = world.provinces[1];
    rl.devastation = U.clamp(rl.devastation + damaged * 3 + dead * 6 + (wasDiverted ? 10 : 0), 0, 100);
    world.country.economy = U.clamp(world.country.economy - damaged * 0.4 - dead, 0, 100);
    S.schedule(world, T.DAY * 2, 'flood_aftermath', { dead, damaged });
  };
  H.flood_aftermath = function (world, data) {
    if (data.dead > 0 && world.country.legitimacy < 50) {
      world.country.legitimacy = U.clamp(world.country.legitimacy - data.dead * 2, 0, 100);
      S.log(world, { title: 'Anger in the Riverlands', text: 'Mourners ask why the Crown did not do more. The Reformers print the names of the dead.', level: 2, kind: 'politics' });
      world.country.reformPressure = U.clamp(world.country.reformPressure + data.dead * 3, 0, 100);
    }
  };

  // Each minute while the flood is active: water level, danger and drowning.
  S.floodMinute = function (world) {
    const f = world.flood;
    if (f.stage === 'none' || f.stage === 'warning') return;
    const target = f.stage === 'rising' ? 0.7 : f.stage === 'flooding' ? 1 : 0;
    f.level = U.clamp(f.level + (target > f.level ? 1 / 600 : -1 / 700), 0, 1);
  };
  S.floodHourly = function (world) {
    const f = world.flood;
    const rng = world.rng;
    if (f.stage === 'none' || f.stage === 'warning') return;
    for (const b of world.buildings) {
      if (S.isFlooded(world, b.x + 1, b.y + 1) && b.protectedUntil <= world.t) b.damage = U.clamp(b.damage + 5, 0, 100);
    }
    for (const c of S.living(world)) {
      if (c.possessed) continue;
      const wet = S.isFlooded(world, c.x, c.y);
      if (!wet) continue;
      if (c.flags.evacuating) continue; // already on the move
      const atHome = (S.buildingAt(world, c.x, c.y) || {}).id === c.homeId;
      if (!atHome && !c.flags.trapped) {
        // Caught in the open: flee to the shelter, perhaps hurt.
        c.flags.evacuating = true;
        if (rng.chance(0.3)) c.injury = U.clamp(c.injury + rng.int(5, 20), 0, 100);
        S.goTo(world, c, 'temple', 'fleeing the flood');
        continue;
      }
      // People at home in the flood zone get trapped if they did not leave in time.
      if (!c.flags.trapped && f.level > 0.25) {
        c.flags.trapped = true;
        c.path = [];
        c.at = c.homeId;
        S.addMemory(world, c, 'danger', 'Trapped at home by the rising water.', 2);
        const home = S.building(world, c.homeId);
        if (home && home.trappedLoggedAt !== world.flood.startedAt) {
          home.trappedLoggedAt = world.flood.startedAt;
          const fam = S.living(world).filter((o) => o.homeId === c.homeId);
          S.log(world, { title: 'Trapped by the flood', text: `The ${c.last} household (${fam.map((o) => o.first).join(', ')}) is trapped by the rising water at ${home.name}.`, level: 2, kind: 'disaster', entities: fam.map((o) => o.id), alert: true });
        }
      }
      if (c.flags.trapped && f.stage === 'flooding') {
        const frailty = c.age < 10 || c.age > 65 ? 1.6 : 1;
        if (rng.chance(0.012 * f.level * frailty * f.severity * (c.flags.endure > world.t ? 0.3 : 1))) {
          c.flags.trapped = false;
          S.killCharacter(world, c, 'drowning (drowned in the flood)');
        } else if (rng.chance(0.06 * f.level)) {
          c.injury = U.clamp(c.injury + rng.int(10, 30), 0, 100);
        }
      }
    }
  };

  // Rescue organised by an official or soldier (indirect answers lead here).
  S.organizeRescue = function (world, organizer) {
    if (world.flood.stage === 'none') return false;
    if (world.country.flags.rescueUnderway) return true;
    world.country.flags.rescueUnderway = true;
    const delay = 120 + world.rng.int(0, 180) - organizer.traits.courage * 60;
    S.schedule(world, delay, 'rescue_arrives', { organizerId: organizer.id });
    S.log(world, { title: 'A rescue is organised', text: `${organizer.name} is gathering boats and soldiers to reach the trapped farms.`, level: 2, kind: 'event', entities: [organizer.id] });
    return true;
  };
  H.rescue_arrives = function (world, data) {
    world.country.flags.rescueUnderway = false;
    const org = S.char(world, data.organizerId);
    const trapped = S.living(world).filter((c) => c.flags.trapped);
    let saved = 0;
    for (const c of trapped) {
      if (world.rng.chance(0.85)) {
        c.flags.trapped = false;
        c.flags.evacuating = true;
        saved++;
        S.addMemory(world, c, 'rescue', `Rescued from the flood by ${org ? org.first + "'s" : 'the'} boats.`, 2);
        if (org) S.relate(c, org, 'friend', 75);
      }
    }
    if (org) {
      org.renown = U.clamp(org.renown + 15, 0, 100);
      if (org.id === world.country.leaderId) world.country.legitimacy = U.clamp(world.country.legitimacy + 5, 0, 100);
      const f = world.country.factions.find((ff) => ff.leaderId === org.id || ff.id === org.factionId);
      if (f) f.power = U.clamp(f.power + 4, 0, 100);
    }
    world.country.factions.find((f) => f.id === 'commons').approval += 3;
    if (!trapped.length) {
      S.log(world, { title: 'Rescue boats reach the farms', text: `${org ? org.name : 'The rescuers'} reached the farms and found no one left to save.`, level: 1, kind: 'event', entities: org ? [org.id] : [] });
      return;
    }
    S.log(world, { title: 'Rescue boats reach the farms', text: `${org ? org.name : 'Rescuers'} reached the flooded farms and brought ${saved} people to safety. ${org ? `Many now speak well of ${org.first}.` : ''}`, level: 2, kind: 'event', entities: org ? [org.id] : [] });
  };
  H.neighbor_rescue = function (world, data) {
    const helper = S.char(world, data.helperId);
    if (!helper || !helper.alive) return;
    const fam = S.living(world).filter((c) => c.homeId === data.homeId && c.flags.trapped);
    if (!fam.length) return;
    const success = world.rng.chance(0.45 + helper.traits.courage * 0.4);
    if (success) {
      for (const c of fam) {
        c.flags.trapped = false;
        c.flags.evacuating = true;
        S.addMemory(world, c, 'rescue', `${helper.first} waded through the flood to save them.`, 3);
        S.relate(c, helper, 'friend', 85);
      }
      helper.renown = U.clamp(helper.renown + 10, 0, 100);
      S.addMemory(world, helper, 'rescue', `Saved the ${fam[0].last} family from the flood.`, 3);
      S.log(world, { title: 'A neighbour\'s courage', text: `${helper.name} reached the ${fam[0].last} family and led them to safety.`, level: 2, kind: 'event', entities: [helper.id, fam[0].id] });
    } else {
      helper.injury = U.clamp(helper.injury + 25, 0, 100);
      S.log(world, { title: 'A failed rescue', text: `${helper.name} tried to reach the ${fam[0].last} family but was swept back by the current.`, level: 1, kind: 'event', entities: [helper.id] });
    }
  };

  // ---------- Disease ----------
  H.ill_child = function (world) {
    // An authored small story near the start so the prayer inbox is not empty.
    const kids = S.living(world).filter((c) => c.role === 'child' && c.homeId.startsWith('home'));
    const c = world.rng.pick(kids);
    if (!c) return;
    c.illness = { name: 'marsh fever', severity: 48 };
    S.addMemory(world, c, 'illness', 'Fell ill with marsh fever.', 1);
  };
  H.plague_outbreak = function (world) {
    if (world.plague.active) return;
    world.plague = { active: true, until: world.t + T.DAY * world.rng.int(20, 40) };
    world.provinces[0].plague = 40;
    S.log(world, { title: 'Plague', text: 'A sickness spreads through Old Town. The healer cannot keep up.', level: 3, kind: 'disaster', alert: true });
    for (let i = 0; i < 4; i++) {
      const c = world.rng.pick(S.living(world).filter((x) => !x.illness));
      if (c) c.illness = { name: 'the plague', severity: world.rng.int(30, 60) };
    }
  };

  // ---------- War ----------
  H.war_declared = function (world, data) {
    if (world.war) return;
    const n = S.neighbor(world, data.enemy || 'kesh');
    world.war = { enemy: n.id, score: 0, startedAt: world.t, casualties: 0 };
    n.relation = -80;
    world.country.security = U.clamp(world.country.security - 5, 0, 100);
    S.log(world, { title: `War with ${n.name}`, text: `${n.name} has invaded the Highmarch.`, level: 3, kind: 'war', alert: true });
  };
  S.endWar = function (world, how, text) {
    if (!world.war) return;
    const n = S.neighbor(world, world.war.enemy);
    const country = world.country;
    if (how === 'victory') {
      country.legitimacy = U.clamp(country.legitimacy + 10, 0, 100);
      n.strength = Math.max(20, n.strength - 10);
    } else if (how === 'defeat') {
      country.legitimacy = U.clamp(country.legitimacy - 15, 0, 100);
      country.economy = U.clamp(country.economy - 8, 0, 100);
      S.province(world, 'highmarch').unrest += 25;
    }
    n.relation = how === 'peace' ? -10 : how === 'victory' ? -40 : -30;
    country.warRisk = 5;
    S.log(world, { title: how === 'victory' ? 'Victory' : how === 'defeat' ? 'Defeat' : 'Peace', text: text || `The war with ${n.name} has ended in ${how}.`, level: 3, kind: 'war' });
    world.war = null;
  };
  S.dailyWar = function (world) {
    const country = world.country;
    const rng = world.rng;
    if (world.war) {
      const n = S.neighbor(world, world.war.enemy);
      const own = (country.security + S.faction(world, 'military').power) / 2;
      world.war.score = U.clamp(world.war.score + (own - n.strength) * 0.08 + rng.float(-4, 4) + (world.war.tide || 0), -100, 100);
      world.war.casualties += rng.int(5, 40);
      country.economy = U.clamp(country.economy - 0.15, 0, 100);
      if (rng.chance(0.08)) {
        const soldier = rng.pick(S.living(world).filter((c) => c.role === 'soldier'));
        if (soldier) S.killCharacter(world, soldier, 'wounds taken in battle in the Highmarch');
      }
      if (world.war.score >= 60) S.endWar(world, 'victory', `The ${n.name} army was driven from the Highmarch.`);
      else if (world.war.score <= -60) S.endWar(world, 'defeat', `The Highmarch fell to ${n.name}. Velmora sued for peace.`);
      else if (world.t - world.war.startedAt > T.DAY * 120 && rng.chance(0.03)) S.endWar(world, 'peace', 'Exhausted, both sides signed a treaty.');
      return;
    }
    // War risk emerges from weakness and hostile neighbours.
    for (const n of world.neighbors) {
      const weakness = (60 - country.security) * 0.5 + (50 - country.stability) * 0.3;
      country.warRisk = U.clamp(country.warRisk + (weakness * n.aggression - n.relation * 0.2) * 0.012 - 0.03, 0, 100);
      n.relation = U.clamp(n.relation + rng.float(-0.4, 0.4), -100, 100);
      if (n.aggression > 0.4 && country.warRisk > 45 && !country.pendingDecision && !country.flags.warWarned) {
        country.flags.warWarned = world.t;
        S.requestDecision(world, 'war_response', 24 * 60);
      }
      if (n.aggression > 0.4 && country.warRisk > 70 && rng.chance(0.03 * world.settings.crisisFrequency)) H.war_declared(world, { enemy: n.id });
    }
    if (country.flags.warWarned && world.t - country.flags.warWarned > T.DAY * 60) country.flags.warWarned = 0;
  };

  // ---------- emergent crises (daily) ----------
  S.dailyCrises = function (world) {
    const rng = world.rng;
    const country = world.country;
    const freq = world.settings.crisisFrequency;
    const p = G.Time.dateParts(world);
    // Spring floods
    if (world.flood.stage === 'none' && (p.month === 2 || p.month === 3) && world.t - (world.floodEndedAt || -1e9) > T.DAY * 90 && rng.chance(0.008 * freq)) H.flood_warning(world, { severity: rng.float(0.7, 1.2) });
    // Plague from poverty and hunger
    const living = S.living(world);
    const avgHunger = living.reduce((s, c) => s + c.hunger, 0) / Math.max(1, living.length);
    if (!world.plague.active && rng.chance((0.0008 + avgHunger * 0.00008) * freq)) H.plague_outbreak(world);
    if (world.plague.active && world.t > world.plague.until) {
      world.plague.active = false;
      for (const pr of world.provinces) pr.plague = 0;
      S.log(world, { title: 'The plague subsides', text: 'Fewer fall sick each day. The worst has passed.', level: 2, kind: 'disaster' });
    }
    // Famine from a collapsing economy
    if (!country.flags.famine && country.economy < 25 && rng.chance(0.05)) {
      country.flags.famine = true;
      S.log(world, { title: 'Famine', text: 'Bread prices have tripled. Families go hungry.', level: 3, kind: 'disaster', alert: true });
      S.requestDecision(world, 'famine_relief', 24 * 60);
    } else if (country.flags.famine && country.economy > 35) {
      country.flags.famine = false;
      country.flags.granaries = false;
      S.log(world, { title: 'The famine ends', text: 'Grain flows again to the markets.', level: 2, kind: 'disaster' });
    }
    S.dailyWar(world);
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
