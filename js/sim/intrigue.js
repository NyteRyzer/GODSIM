// Intrigue: ambitions planted in people, conspiracies (coups, uprisings, holy coups), iron rule and wars of choice.
// The player can push people toward an agenda; what they do with it, and whether it works, is still simulated.
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;

  // Agendas a person can be pushed toward. tag: how a ruler's decisions are biased. fit: how receptive a person is.
  G.Data.agendas = {
    war: { label: 'Wage war on a neighbour', tag: 'war', fit: (c) => c.traits.courage * 0.5 + c.traits.ambition * 0.5 },
    iron_fist: { label: 'Rule with an iron fist', tag: 'iron', fit: (c) => (1 - c.traits.kindness) * 0.5 + c.traits.ambition * 0.5 },
    coup: { label: 'Seize power in a coup', tag: 'order', fit: (c) => c.traits.ambition * 0.6 + c.traits.courage * 0.3 + (c.traits.caution < 0.4 ? 0.1 : 0) },
    revolt: { label: 'Rise up against the rulers', tag: 'reform', fit: (c) => (1 - c.mood / 100) * 0.5 + c.traits.courage * 0.4 + (c.hunger > 50 ? 0.2 : 0) },
    theocracy: { label: 'Put the Church in power', tag: 'piety', fit: (c) => c.traits.piety * 0.6 + c.belief / 250 },
    reform: { label: 'Push for reform', tag: 'reform', fit: (c) => c.traits.kindness * 0.4 + c.traits.skepticism * 0.3 + 0.1 },
    peace: { label: 'Seek peace', tag: 'peace', fit: (c) => c.traits.kindness * 0.5 + c.traits.caution * 0.4 },
    mercy: { label: 'Show mercy to the poor', tag: 'mercy', fit: (c) => c.traits.kindness * 0.8 + 0.1 },
    loyalty: { label: 'Stay loyal to the ruler', tag: 'order', fit: (c) => c.traits.caution * 0.5 + (1 - c.traits.ambition) * 0.4 },
  };

  G.Data.plotKinds = {
    coup: { name: 'Coup', verb: 'seize the palace', gov: 'dictatorship' },
    uprising: { name: 'Uprising', verb: 'storm the palace', gov: 'revolutionary' },
    holy: { name: 'Holy coup', verb: 'proclaim the rule of the Church', gov: 'theocracy' },
  };

  const plotKindFor = (agenda) => (agenda === 'coup' ? 'coup' : agenda === 'revolt' ? 'uprising' : agenda === 'theocracy' ? 'holy' : null);
  const isRuler = (world, c) => c && c.id === world.country.leaderId;

  // ---------- planting an agenda ----------
  // via: 'vision' (divine sway), 'persuade' (human form words), 'possess' (acting through someone)
  S.plantAgenda = function (world, c, agenda, via) {
    const def = G.Data.agendas[agenda];
    if (!c || !c.alive || !def) return { ok: false, msg: 'Nothing happened.' };
    const rng = world.rng;
    const base = via === 'persuade' ? 0.15 : 0.35;
    const p = U.clamp(base + def.fit(c) * 0.55 + (via === 'vision' ? c.belief / 300 : 0) - c.traits.skepticism * (via === 'vision' ? 0.25 : 0.1), 0.05, 0.95);
    c.known.traits = true;
    if (!rng.chance(p)) {
      S.addMemory(world, c, 'inspired', `Brushed aside a strange thought about how to ${def.label.toLowerCase()}.`, 0.6);
      return { ok: true, msg: `${c.first} dismissed the idea.`, success: false };
    }
    const strength = U.clamp((c.agenda && c.agenda.kind === agenda ? c.agenda.strength : 0) + 0.45 + def.fit(c) * 0.4, 0, 1.5);
    c.agenda = { kind: agenda, strength, since: world.t, until: world.t + T.DAY * 60, byPlayer: true };
    if (def.tag) c.inspiration = { tag: def.tag, strength: strength, until: world.t + T.DAY * 30 };
    S.addMemory(world, c, 'ambition', `Became convinced they must ${def.label.toLowerCase()}.`, 2);
    let extra = '';
    // Loyalty cools any conspiracy this person belongs to.
    if (agenda === 'loyalty') {
      for (const pl of world.plots) if (pl.status === 'active' && (pl.leaderId === c.id || pl.members.includes(c.id))) {
        if (pl.leaderId === c.id) S.endPlot(world, pl, 'abandoned', `${c.name} lost heart and abandoned the plot.`);
        else {
          pl.members = pl.members.filter((m) => m !== c.id);
          pl.boost -= 6;
        }
        extra = ' They have turned their back on the conspiracy.';
      }
    }
    const kind = plotKindFor(agenda);
    if (kind) {
      const existing = world.plots.find((pl) => pl.status === 'active' && pl.kind === kind);
      if (existing && existing.leaderId !== c.id) {
        S.joinPlot(world, existing, c, true);
        extra = ` They joined ${S.char(world, existing.leaderId).first}'s conspiracy.`;
      } else if (!existing && !isRuler(world, c) && S.canLeadPlot(world, c, kind)) {
        S.startPlot(world, c, kind, true);
        extra = ' They have begun gathering conspirators.';
      } else if (existing) {
        existing.boost += 8;
        extra = ' The conspiracy grows bolder.';
      } else if (!isRuler(world, c)) extra = ` They lack the standing to lead it, but will support whoever does.`;
    }
    if (agenda === 'war' && !isRuler(world, c)) {
      world.country.warRisk = U.clamp(world.country.warRisk + 4 + S.influenceOf(c) * 10, 0, 100);
      if (c.factionId === 'military') S.faction(world, 'military').power = U.clamp(S.faction(world, 'military').power + 3, 0, 100);
      extra = ' They will press the court for war.';
    }
    if (isRuler(world, c)) extra += ' The court will feel it soon.';
    return { ok: true, msg: `${c.first} now means to ${def.label.toLowerCase()}.${extra}`, success: true };
  };

  // ---------- conspiracies ----------
  S.canLeadPlot = function (world, c, kind) {
    if (!c || !c.alive || c.age < 18 || c.flags.detainedUntil > world.t) return false;
    if (kind === 'coup') return ['general', 'noble', 'official', 'soldier', 'guard', 'heir'].includes(c.role) || c.renown > 40;
    if (kind === 'holy') return c.role === 'priest' || c.prophet;
    return c.age >= 18; // anyone can start an uprising
  };

  S.startPlot = function (world, c, kind, byPlayer) {
    const pl = {
      id: world.nextId++, kind, leaderId: c.id, members: [], startedAt: world.t, status: 'active', support: 0, boost: byPlayer ? 10 : 0,
      known: !!byPlayer, byPlayer: !!byPlayer, launchAt: null,
    };
    world.plots.push(pl);
    c.agenda = c.agenda && plotKindFor(c.agenda.kind) === kind ? c.agenda : { kind: kind === 'coup' ? 'coup' : kind === 'uprising' ? 'revolt' : 'theocracy', strength: 0.8, since: world.t, until: world.t + T.DAY * 90 };
    S.addMemory(world, c, 'conspiracy', `Began plotting to ${G.Data.plotKinds[kind].verb}.`, 3);
    S.plotSupport(world, pl);
    S.log(world, {
      title: pl.known ? `A conspiracy forms: ${G.Data.plotKinds[kind].name}` : 'Whispers of a conspiracy',
      text: pl.known ? `${c.name} has begun secretly gathering allies to ${G.Data.plotKinds[kind].verb}.` : 'Something is being planned behind closed doors.',
      level: 2, kind: 'intrigue', entities: pl.known ? [c.id] : [],
    });
    return pl;
  };

  S.joinPlot = function (world, pl, c, byPlayer) {
    if (pl.members.includes(c.id) || pl.leaderId === c.id) return;
    pl.members.push(c.id);
    if (byPlayer) pl.boost += 4;
    S.addMemory(world, c, 'conspiracy', `Swore to help ${S.char(world, pl.leaderId).first} ${G.Data.plotKinds[pl.kind].verb}.`, 2);
  };

  S.plotSupport = function (world, pl) {
    const c = world.country;
    const lead = S.char(world, pl.leaderId);
    const n = pl.members.length;
    let s;
    if (pl.kind === 'coup') s = 12 + n * 6 + (100 - c.eliteLoyalty) * 0.25 + S.faction(world, 'military').power * 0.2 + (lead ? lead.renown * 0.12 + (lead.role === 'general' ? 12 : 0) : 0) + (50 - c.legitimacy) * 0.2;
    else if (pl.kind === 'uprising') s = 8 + n * 4 + c.revolutionRisk * 0.35 + c.reformPressure * 0.15 + (c.grievance || 0) * 0.3 + (lead ? lead.renown * 0.1 : 0);
    else s = 8 + n * 5 + c.theocracyPressure * 0.35 + world.church.strength * 0.2 + (lead ? lead.renown * 0.1 : 0);
    pl.support = U.clamp(s + pl.boost, 0, 100);
    return pl.support;
  };

  function recruitPool(world, pl) {
    const c = world.country;
    return S.living(world).filter((o) => {
      if (o.id === pl.leaderId || pl.members.includes(o.id) || o.age < 16 || o.id === c.leaderId) return false;
      if (o.flags.detainedUntil > world.t) return false;
      if (o.agenda && o.agenda.kind === 'loyalty') return false;
      if (pl.kind === 'coup') return ['soldier', 'guard', 'general', 'noble', 'official'].includes(o.role) && S.faction(world, o.factionId).approval < 65;
      if (pl.kind === 'uprising') return (o.factionId === 'commons' || o.factionId === 'reformers') && (o.mood < 55 || o.hunger > 40 || (o.agenda && o.agenda.kind === 'revolt'));
      return o.belief > 65;
    });
  }

  S.dailyPlots = function (world) {
    const rng = world.rng;
    const c = world.country;
    for (const pl of world.plots) {
      if (pl.status !== 'active') continue;
      const lead = S.char(world, pl.leaderId);
      if (!lead || !lead.alive) {
        S.endPlot(world, pl, 'collapsed', 'The conspiracy collapsed without its leader.');
        continue;
      }
      if (lead.flags.detainedUntil > world.t) {
        S.endPlot(world, pl, 'crushed', `${lead.name} is in chains; the plot fell apart.`);
        continue;
      }
      if (lead.id === c.leaderId) {
        S.endPlot(world, pl, 'abandoned', `${lead.name} already holds power.`);
        continue;
      }
      // Recruit
      if (rng.chance(0.35)) {
        const pool = recruitPool(world, pl);
        const o = rng.weighted(pool, (x) => 0.2 + x.traits.ambition * 0.5 + (x.agenda && plotKindFor(x.agenda.kind) === pl.kind ? 2 : 0) + (lead.relations[x.id] && lead.relations[x.id].type === 'friend' ? 1 : 0));
        if (o) S.joinPlot(world, pl, o, false);
      }
      S.plotSupport(world, pl);
      if (!pl.known && (lead.known.memories || pl.members.some((m) => S.char(world, m)?.known.memories))) pl.known = true;
      // Discovery: the more people know, the likelier someone talks.
      const pDisc = 0.006 + pl.members.length * 0.004 + c.security / 2500 + (c.flags.ironFistUntil > world.t ? 0.02 : 0) - (pl.cover || 0);
      if (rng.chance(Math.max(0.001, pDisc))) {
        S.exposePlot(world, pl, 'Informers revealed the plot to the palace guard.');
        continue;
      }
      // Launch when strong enough (or after waiting too long)
      const age = (world.t - pl.startedAt) / T.DAY;
      const ready = pl.support >= 62 || (age > 45 && pl.support >= 48 && lead.traits.courage > 0.5);
      if ((ready && rng.chance(0.25 + lead.traits.courage * 0.3)) || (pl.launchAt && world.t >= pl.launchAt)) S.attemptPlot(world, pl);
    }
    // Iron rule
    if (c.flags.ironFistUntil > world.t) {
      c.security = U.clamp(c.security + 0.35, 0, 100);
      c.grievance = U.clamp((c.grievance || 0) + 0.3, 0, 100);
      c.reformPressure = U.clamp(c.reformPressure - 0.3, 0, 100);
      c.corruption = U.clamp(c.corruption + 0.05, 0, 100);
      S.faction(world, 'military').approval = U.clamp(S.faction(world, 'military').approval + 0.2, 0, 100);
      S.faction(world, 'commons').approval = U.clamp(S.faction(world, 'commons').approval - 0.25, 0, 100);
      if (rng.chance(0.08)) {
        const victim = rng.pick(S.living(world).filter((o) => (o.factionId === 'reformers' || (o.agenda && ['revolt', 'reform'].includes(o.agenda.kind))) && !(o.flags.detainedUntil > world.t) && o.age >= 16));
        if (victim) {
          victim.flags.detainedUntil = world.t + T.DAY * 20;
          S.goTo(world, victim, 'barracks', 'detained');
          S.addMemory(world, victim, 'detained', 'Dragged from home by soldiers under martial law.', 3);
          for (const f of S.familyOf(world, victim)) if (f.alive) f.mood = U.clamp(f.mood - 15, 0, 100);
          S.log(world, { title: 'Arrest under martial law', text: `Soldiers arrested ${victim.name}.`, level: 1, kind: 'politics', entities: [victim.id] });
        }
      }
    } else if (c.flags.ironFistUntil && c.flags.ironFistUntil <= world.t) {
      c.flags.ironFistUntil = 0;
      S.log(world, { title: 'Martial law lifted', text: 'The soldiers withdrew from the streets.', level: 1, kind: 'politics' });
    }
    // Agendas fade with time; rulers act on theirs.
    for (const o of S.living(world)) if (o.agenda && o.agenda.until < world.t) o.agenda = null;
    S.rulerAgenda(world);
    S.organicPlots(world);
  };

  S.exposePlot = function (world, pl, how) {
    const lead = S.char(world, pl.leaderId);
    const c = world.country;
    pl.known = true;
    const caught = [lead, ...pl.members.map((m) => S.char(world, m))].filter((x) => x && x.alive && world.rng.chance(x === lead ? 0.85 : 0.5));
    for (const x of caught) {
      x.flags.detainedUntil = world.t + T.DAY * (x === lead ? 120 : 40);
      S.goTo(world, x, 'barracks', 'detained');
      S.addMemory(world, x, 'detained', 'Arrested for conspiracy.', 3);
      if (x.agenda && plotKindFor(x.agenda.kind)) x.agenda = null;
    }
    c.legitimacy = U.clamp(c.legitimacy + 3, 0, 100);
    if (pl.kind === 'uprising') c.grievance = U.clamp((c.grievance || 0) + 8, 0, 100);
    S.endPlot(world, pl, 'crushed', `${how} ${caught.length ? `Arrested: ${caught.map((x) => x.name).join(', ')}.` : 'The plotters escaped.'}`);
  };

  S.endPlot = function (world, pl, status, text) {
    if (pl.status !== 'active') return;
    pl.status = status;
    pl.endedAt = world.t;
    S.log(world, { title: `${G.Data.plotKinds[pl.kind].name} ${status}`, text, level: status === 'crushed' ? 2 : 1, kind: 'intrigue', entities: [pl.leaderId] });
  };

  S.attemptPlot = function (world, pl) {
    const c = world.country;
    const rng = world.rng;
    const lead = S.char(world, pl.leaderId);
    if (!lead || !lead.alive || pl.status !== 'active') return false;
    S.plotSupport(world, pl);
    const power = pl.support + rng.float(-15, 15);
    const defense = c.security * 0.35 + c.eliteLoyalty * 0.25 + c.legitimacy * 0.3 + (c.flags.ironFistUntil > world.t ? 8 : 0);
    const old = S.leader(world);
    pl.known = true;
    if (power > defense) {
      pl.status = 'succeeded';
      pl.endedAt = world.t;
      if (old && old.alive && old.id !== lead.id) {
        old.flags.detainedUntil = world.t + T.DAY * 365;
        S.goTo(world, old, 'barracks', 'detained');
        S.addMemory(world, old, 'coup', `Overthrown by ${lead.name}.`, 3);
      }
      lead.flags.detainedUntil = 0;
      let gov = G.Data.plotKinds[pl.kind].gov;
      let text;
      if (pl.kind === 'coup') {
        // A noble usurper keeps the crown; a soldier makes himself Lord Protector.
        if (lead.role === 'noble' || lead.role === 'heir') {
          gov = c.government === 'monarchy' || c.government === 'constitutional' ? 'monarchy' : 'dictatorship';
          text = `${lead.name}'s men seized the palace by night and proclaimed a new monarch.`;
        } else text = `Soldiers loyal to ${lead.name} seized the palace at dawn.`;
        S.faction(world, 'military').approval = 80;
        S.faction(world, 'reformers').approval = 15;
      } else if (pl.kind === 'uprising') text = `Thousands answered ${lead.name}'s call. The crowd stormed the palace gates.`;
      else text = `${lead.name} proclaimed from the Temple steps that heaven itself had chosen a new order. The guards knelt.`;
      for (const m of pl.members) {
        const x = S.char(world, m);
        if (x && x.alive) x.renown = U.clamp(x.renown + 8, 0, 100);
      }
      if (gov === c.government) {
        // Same system, new ruler.
        c.leaderId = lead.id;
        lead.role = 'monarch';
        lead.title = lead.sex === 'f' ? 'Queen' : 'King';
        lead.name = `${lead.title} ${lead.first} ${lead.last}`;
        S.faction(world, 'crown').leaderId = lead.id;
        c.legitimacy = U.clamp(c.legitimacy - 12, 0, 100);
        c.govSince = world.t;
        S.log(world, { title: 'Usurpation', text: `${text} ${lead.name} now rules ${c.name}.`, level: 3, kind: 'regime', entities: [lead.id], alert: true });
      } else S.transition(world, gov, text, lead);
      if (c.pendingDecision) c.pendingDecision.leaderId = c.leaderId;
      return true;
    }
    // Failure: bloodshed and arrests.
    const dead = rng.int(1, 4);
    c.stability = U.clamp(c.stability - 6, 0, 100);
    c.legitimacy = U.clamp(c.legitimacy + 2, 0, 100);
    for (let i = 0; i < Math.min(dead, pl.members.length); i++) {
      const x = S.char(world, pl.members[i]);
      if (x && x.alive && rng.chance(0.4)) S.killCharacter(world, x, `wounds from the failed ${G.Data.plotKinds[pl.kind].name.toLowerCase()}`);
    }
    if (rng.chance(0.3)) S.killCharacter(world, lead, `the failed ${G.Data.plotKinds[pl.kind].name.toLowerCase()}`);
    else S.exposePlot(world, pl, 'The attempt failed in the palace courtyard.');
    pl.status = 'failed';
    pl.endedAt = world.t;
    S.log(world, { title: `${G.Data.plotKinds[pl.kind].name} failed`, text: `${lead.name}'s attempt to ${G.Data.plotKinds[pl.kind].verb} was beaten back.`, level: 3, kind: 'intrigue', entities: [lead.id], alert: true });
    return false;
  };

  // Conspiracies also form on their own when conditions are ripe.
  S.organicPlots = function (world) {
    const c = world.country;
    const rng = world.rng;
    if (world.t - c.govSince < T.DAY * 15) return;
    const active = (k) => world.plots.some((p) => p.status === 'active' && p.kind === k);
    if (c.government !== 'dictatorship' && c.coupRisk > 66 && !active('coup') && rng.chance((c.coupRisk - 66) * 0.006)) {
      const gen = S.char(world, S.faction(world, 'military').leaderId);
      if (gen && gen.alive && gen.traits.ambition > 0.5 && gen.id !== c.leaderId) S.startPlot(world, gen, 'coup', false);
    }
    if (['monarchy', 'dictatorship', 'theocracy'].includes(c.government) && c.revolutionRisk > 64 && !active('uprising') && rng.chance((c.revolutionRisk - 64) * 0.006)) {
      const ref = S.char(world, S.faction(world, 'reformers').leaderId);
      if (ref && ref.alive && ref.id !== c.leaderId && !(ref.flags.detainedUntil > world.t)) S.startPlot(world, ref, 'uprising', false);
    }
    if (c.government !== 'theocracy' && c.theocracyPressure > 68 && !active('holy') && rng.chance((c.theocracyPressure - 68) * 0.005)) {
      const pr = S.char(world, world.church.leaderId);
      if (pr && pr.alive && pr.id !== c.leaderId) S.startPlot(world, pr, 'holy', false);
    }
  };

  // ---------- rulers acting on their agendas ----------
  S.rulerAgenda = function (world) {
    const c = world.country;
    const l = S.leader(world);
    if (!l || !l.agenda || c.pendingDecision || world.t < c.decisionCooldown) return;
    if (l.agenda.kind === 'war' && !world.war && world.t - (c.flags.warAskAt || -1e9) > T.DAY * 20) {
      c.flags.warAskAt = world.t;
      S.log(world, { title: 'War talk at court', text: `${l.name} speaks openly of marching on Velmora's neighbours.`, level: 2, kind: 'politics', entities: [l.id] });
      S.requestDecision(world, 'declare_war', T.DAY);
    } else if (l.agenda.kind === 'iron_fist' && !(c.flags.ironFistUntil > world.t) && world.t - (c.flags.ironAskAt || -1e9) > T.DAY * 15) {
      c.flags.ironAskAt = world.t;
      S.requestDecision(world, 'iron_rule', T.DAY);
    }
  };

  // ---------- wars of choice and iron rule ----------
  S.declareWar = function (world, enemyId, aggressorName) {
    if (world.war) return false;
    const n = S.neighbor(world, enemyId);
    if (!n) return false;
    const c = world.country;
    world.war = { enemy: n.id, score: 5, startedAt: world.t, casualties: 0, aggressor: 'velmora' };
    n.relation = -90;
    S.faction(world, 'military').approval = U.clamp(S.faction(world, 'military').approval + 10, 0, 100);
    S.faction(world, 'commons').approval = U.clamp(S.faction(world, 'commons').approval - 6, 0, 100);
    c.treasury = U.clamp(c.treasury - 8, 0, 100);
    S.log(world, { title: `Velmora declares war on ${n.name}`, text: `${aggressorName || 'The Crown'} sent the army across the border. The taverns are full of drums and dread.`, level: 3, kind: 'war', alert: true });
    return true;
  };

  S.imposeIronRule = function (world, days, how) {
    const c = world.country;
    c.flags.ironFistUntil = world.t + T.DAY * days;
    c.security = U.clamp(c.security + 10, 0, 100);
    c.legitimacy = U.clamp(c.legitimacy - 5, 0, 100);
    c.grievance = U.clamp((c.grievance || 0) + 8, 0, 100);
    for (const pl of world.plots) if (pl.status === 'active') pl.cover = (pl.cover || 0) - 0.01;
    S.log(world, { title: 'An iron fist', text: how || 'Martial law was declared. Soldiers patrol every street and curfew begins at dusk.', level: 3, kind: 'politics', alert: true });
  };

  S.purgeNobles = function (world) {
    const c = world.country;
    const noble = S.char(world, S.faction(world, 'nobility').leaderId);
    if (noble && noble.alive && noble.id !== c.leaderId) {
      noble.flags.detainedUntil = world.t + T.DAY * 90;
      S.goTo(world, noble, 'barracks', 'detained');
      S.addMemory(world, noble, 'detained', 'Arrested in the royal purge.', 3);
    }
    for (const pl of world.plots) if (pl.status === 'active' && pl.kind === 'coup' && world.rng.chance(0.6)) S.exposePlot(world, pl, 'The purge swept the plotters up with everyone else.');
    S.faction(world, 'nobility').approval = U.clamp(S.faction(world, 'nobility').approval - 25, 0, 100);
    S.faction(world, 'nobility').power = U.clamp(S.faction(world, 'nobility').power - 15, 0, 100);
    c.eliteLoyalty = U.clamp(c.eliteLoyalty - 8, 0, 100);
    S.log(world, { title: 'The purge', text: `${noble ? noble.name + ' and other' : 'Disloyal'} nobles were arrested on charges of treason.`, level: 3, kind: 'politics', alert: true });
  };

  // ---------- through a possessed body ----------
  S.intrigueActions = function (world, c) {
    const acts = [];
    const country = world.country;
    if (c.id === country.leaderId) {
      if (!world.war) for (const n of world.neighbors) acts.push({ id: 'declare_war', enemy: n.id, label: `Declare war on ${n.name}` });
      if (!(country.flags.ironFistUntil > world.t)) acts.push({ id: 'iron_fist', label: 'Impose martial law' });
      acts.push({ id: 'purge', label: 'Purge the nobility' });
    } else {
      const own = world.plots.find((p) => p.status === 'active' && p.leaderId === c.id);
      if (own) acts.push({ id: 'launch_plot', label: `Strike now (${G.Data.plotKinds[own.kind].name}, support ${Math.round(own.support)})` });
      else {
        if (S.canLeadPlot(world, c, 'coup') && !world.plots.some((p) => p.status === 'active' && p.kind === 'coup')) acts.push({ id: 'start_plot', kind: 'coup', label: 'Begin plotting a coup' });
        if (!world.plots.some((p) => p.status === 'active' && p.kind === 'uprising')) acts.push({ id: 'start_plot', kind: 'uprising', label: 'Start organising an uprising' });
        if (S.canLeadPlot(world, c, 'holy') && !world.plots.some((p) => p.status === 'active' && p.kind === 'holy')) acts.push({ id: 'start_plot', kind: 'holy', label: 'Plot to put the Church in power' });
      }
      for (const p of world.plots) if (p.status === 'active' && p.leaderId !== c.id) {
        if (!p.members.includes(c.id)) acts.push({ id: 'join_plot', plotId: p.id, label: `Join ${S.char(world, p.leaderId).first}'s ${G.Data.plotKinds[p.kind].name.toLowerCase()}` });
        acts.push({ id: 'betray_plot', plotId: p.id, label: `Betray ${S.char(world, p.leaderId).first}'s plot to the guards` });
      }
    }
    return acts;
  };

  S.intrigueAct = function (world, c, act) {
    const country = world.country;
    if (act.id === 'declare_war') {
      if (c.id !== country.leaderId) return { ok: false, msg: 'Only the ruler can declare war.' };
      S.declareWar(world, act.enemy, c.name);
      return { ok: true, msg: `${c.first} has declared war.`, odd: c.traits.courage < 0.4 ? 2 : 1 };
    }
    if (act.id === 'iron_fist') {
      if (c.id !== country.leaderId) return { ok: false, msg: 'Only the ruler can do that.' };
      S.imposeIronRule(world, 45, `${c.name} declared martial law. Soldiers patrol every street and curfew begins at dusk.`);
      return { ok: true, msg: 'Martial law is declared.', odd: c.traits.kindness > 0.6 ? 2 : 1 };
    }
    if (act.id === 'purge') {
      if (c.id !== country.leaderId) return { ok: false, msg: 'Only the ruler can do that.' };
      S.purgeNobles(world);
      return { ok: true, msg: 'The purge has begun.', odd: 1 };
    }
    if (act.id === 'start_plot') {
      if (world.plots.some((p) => p.status === 'active' && p.leaderId === c.id)) return { ok: false, msg: 'They are already plotting.' };
      if (!S.canLeadPlot(world, c, act.kind)) return { ok: false, msg: `${c.first} lacks the standing to lead that.` };
      const pl = S.startPlot(world, c, act.kind, true);
      pl.boost += 6;
      return { ok: true, msg: `${c.first} has begun quietly gathering allies.`, odd: c.traits.ambition < 0.4 ? 2 : 0 };
    }
    const pl = world.plots.find((p) => p.id === act.plotId) || world.plots.find((p) => p.status === 'active' && p.leaderId === c.id);
    if (!pl || pl.status !== 'active') return { ok: false, msg: 'There is no such plot.' };
    if (act.id === 'launch_plot') {
      const won = S.attemptPlot(world, pl);
      return { ok: true, msg: won ? 'The palace has fallen.' : 'The attempt failed.', odd: 1 };
    }
    if (act.id === 'join_plot') {
      S.joinPlot(world, pl, c, true);
      return { ok: true, msg: `${c.first} has sworn to the conspiracy.`, odd: 0 };
    }
    if (act.id === 'betray_plot') {
      S.exposePlot(world, pl, `${c.name} went to the palace guard and named every conspirator.`);
      c.renown = U.clamp(c.renown + 5, 0, 100);
      return { ok: true, msg: 'The plot is betrayed.', odd: 0 };
    }
    return { ok: false, msg: 'Nothing happened.' };
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
