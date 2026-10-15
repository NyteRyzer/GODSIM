// National politics: derived stability/risk variables, leader decisions, regime transitions, succession and elections.
// Divine intervention changes conditions or leaders' inclinations, never guarantees an outcome.
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;
  const H = S.handlers;

  S.govName = (world) => G.Data.governments[world.country.government].name;

  S.politicsDerived = function (world) {
    const c = world.country;
    const fp = (id) => S.faction(world, id);
    c.eliteLoyalty = U.clamp((fp('nobility').approval * 0.4 + fp('military').approval * 0.4 + fp('clergy').approval * 0.2), 0, 100);
    c.stability = U.clamp(c.legitimacy * 0.35 + c.economy * 0.2 + c.security * 0.15 + c.eliteLoyalty * 0.2 + (100 - c.inequality) * 0.1 - (world.war ? 10 : 0) - (c.flags.famine ? 10 : 0), 0, 100);
    const gen = S.char(world, fp('military').leaderId);
    const genAmb = gen && gen.alive ? gen.traits.ambition : 0.3;
    c.coupRisk = U.clamp((100 - c.eliteLoyalty) * 0.35 + (fp('military').power - 45) * 0.4 + (50 - c.legitimacy) * 0.45 + genAmb * 22 + (100 - fp('military').approval) * 0.15, 0, 100);
    const living = S.living(world);
    const hunger = living.reduce((s, x) => s + x.hunger, 0) / Math.max(1, living.length);
    c.revolutionRisk = U.clamp((55 - c.legitimacy) * 0.6 + hunger * 0.3 + fp('reformers').power * 0.3 + (c.inequality - 50) * 0.35 + (100 - fp('commons').approval) * 0.2 - c.security * 0.15 + (c.grievance || 0) * 0.8, 0, 100);
    c.theocracyPressure = U.clamp((c.religiousInfluence - 50) * 1.1 + (fp('clergy').power - 50) * 0.6 + (45 - c.legitimacy) * 0.4 + c.exposure * 0.2, 0, 100);
  };

  S.dailyPolitics = function (world) {
    const c = world.country;
    const rng = world.rng;
    const gov = G.Data.governments[c.government];
    const living = S.living(world);
    const avgBelief = living.reduce((s, x) => s + x.belief, 0) / Math.max(1, living.length);
    // Slow drift of conditions
    c.grievance = Math.max(0, (c.grievance || 0) - 0.2);
    c.inequality = U.clamp(c.inequality + gov.drift.inequality + rng.float(-0.05, 0.05), 0, 100);
    c.corruption = U.clamp(c.corruption + gov.drift.corruption + rng.float(-0.05, 0.05), 0, 100);
    const devastation = world.provinces.reduce((s, p) => s + p.devastation, 0) / world.provinces.length;
    c.economy = U.clamp(c.economy + (52 - c.economy) * 0.01 - devastation * 0.004 - (world.plague.active ? 0.15 : 0) + c.technology * 0.0006 + rng.float(-0.25, 0.25), 0, 100);
    for (const p of world.provinces) p.devastation = Math.max(0, p.devastation - 0.25);
    c.treasury = U.clamp(c.treasury + (c.economy - 45) * 0.03 - (world.war ? 0.4 : 0), 0, 100);
    if (c.treasury < 15 && !c.pendingDecision && rng.chance(0.1)) S.requestDecision(world, 'tax_policy', T.DAY);
    const legitTarget = 30 + (c.economy - 50) * 0.3 + (c.security - 50) * 0.1 - (c.corruption - 50) * 0.25 + (c.government === 'democracy' || c.government === 'republic' ? 15 : 0) + (S.leader(world) ? S.leader(world).renown * 0.12 : 0);
    c.legitimacy = U.clamp(U.lerp(c.legitimacy, legitTarget, 0.015), 0, 100);
    c.institutionalTrust = U.clamp(U.lerp(c.institutionalTrust, c.legitimacy * 0.6 + (100 - c.corruption) * 0.4, 0.02), 0, 100);
    c.religiousInfluence = U.clamp(U.lerp(c.religiousInfluence, avgBelief * 0.6 + world.church.strength * 0.4 + (c.government === 'theocracy' ? 20 : 0), 0.02), 0, 100);
    c.reformPressure = U.clamp(c.reformPressure + ((c.inequality + c.corruption) / 2 - c.legitimacy) * 0.012 + S.faction(world, 'reformers').power * 0.004 + c.literacy * 0.002 - (c.government !== 'monarchy' && c.government !== 'dictatorship' ? 0.3 : 0), 0, 100);
    c.security = U.clamp(U.lerp(c.security, S.faction(world, 'military').power * 0.8 + 10, 0.02), 0, 100);
    // Factions: approval tracks how the regime serves each group's agenda.
    for (const f of c.factions) {
      let target = 50;
      if (f.id === 'crown') target = c.government === 'monarchy' || c.government === 'constitutional' ? 70 : 20;
      if (f.id === 'nobility') target = 60 - (c.government === 'democracy' ? 20 : 0) + (c.inequality - 50) * 0.3;
      if (f.id === 'clergy') target = 40 + c.religiousInfluence * 0.3 + (c.government === 'theocracy' ? 25 : 0);
      if (f.id === 'military') target = 45 + (c.treasury - 40) * 0.2 + (c.government === 'dictatorship' ? 25 : 0) + (world.war && world.war.score > 0 ? 10 : 0);
      if (f.id === 'reformers') target = 25 + (c.government === 'democracy' || c.government === 'republic' ? 40 : c.government === 'constitutional' ? 20 : 0) - c.corruption * 0.1;
      if (f.id === 'commons') target = 30 + c.economy * 0.35 - avgHungerOf(world) * 0.3 + (c.legitimacy - 40) * 0.2;
      f.approval = U.clamp(U.lerp(f.approval, target, 0.03) + rng.float(-0.4, 0.4), 0, 100);
      // Faction leaders' renown and charisma affect power
      const lead = S.char(world, f.leaderId);
      const tPower = f.id === 'reformers' ? 15 + c.reformPressure * 0.5 + c.literacy * 0.2 : f.id === 'clergy' ? 25 + world.church.strength * 0.5 : f.power;
      f.power = U.clamp(U.lerp(f.power, tPower, 0.01) + (lead && lead.alive ? lead.renown * 0.002 : -0.1), 0, 100);
      if (lead && !lead.alive) S.replaceFactionLeader(world, f);
    }
    for (const p of world.provinces) {
      const t = 20 + (100 - c.stability) * 0.4 + p.devastation * 0.3 + (p.plague || 0) * 0.2;
      p.unrest = U.clamp(U.lerp(p.unrest, t, 0.03), 0, 100);
      p.economy = U.clamp(U.lerp(p.economy, c.economy + (p.id === 'saltcoast' ? 8 : 0) - p.devastation * 0.3, 0.03), 0, 100);
    }
    S.politicsDerived(world);
    // Decision triggers
    if (!c.pendingDecision && world.t > c.decisionCooldown) {
      if ((c.government === 'monarchy') && c.reformPressure > 62 && !c.flags.petitionAt) {
        c.flags.petitionAt = world.t;
        S.log(world, { title: 'The Reformers petition the Crown', text: `${S.char(world, S.faction(world, 'reformers').leaderId)?.name || 'The Reformers'} delivered a petition with ${rng.int(800, 3000)} signatures demanding a charter of rights.`, level: 2, kind: 'politics' });
        S.requestDecision(world, 'reform_petition', T.DAY * 2);
      } else if (world.church.strength > 60 && S.faction(world, 'clergy').power > 55 && world.t - (c.flags.churchAskAt || -1e9) > T.DAY * 150 && rng.chance(0.02)) {
        c.flags.churchAskAt = world.t;
        S.requestDecision(world, 'church_privileges', T.DAY * 2);
      }
    }
    if (c.flags.petitionAt && world.t - c.flags.petitionAt > T.DAY * 70) c.flags.petitionAt = 0;
    S.checkTransitions(world);
    // Elections
    if (gov.elections && world.t >= c.nextElection) S.holdElection(world);
  };

  function avgHungerOf(world) {
    const l = S.living(world);
    return l.reduce((s, x) => s + x.hunger, 0) / Math.max(1, l.length);
  }

  S.replaceFactionLeader = function (world, f) {
    const pool = S.living(world).filter((x) => x.factionId === f.id && x.age >= 20 && x.role !== 'child');
    pool.sort((a, b) => b.renown + b.traits.ambition * 30 - (a.renown + a.traits.ambition * 30));
    f.leaderId = pool[0] ? pool[0].id : null;
    if (pool[0]) S.log(world, { title: `New leader of ${f.name}`, text: `${pool[0].name} now leads ${f.name}.`, level: 1, kind: 'politics', entities: [pool[0].id] });
  };

  // ---------- Decisions ----------
  S.requestDecision = function (world, decisionId, delayMin) {
    const c = world.country;
    if (c.pendingDecision) return false;
    const leader = S.leader(world);
    if (!leader) return false;
    c.pendingDecision = { id: world.nextId++, decisionId, leaderId: leader.id, dueAt: world.t + delayMin, requestedAt: world.t };
    const d = G.Data.decisions[decisionId];
    S.log(world, { title: 'A decision looms', text: `${leader.name} must decide: ${d.title}. (In ${T.duration(delayMin)})`, level: 2, kind: 'politics', entities: [leader.id], alert: true });
    return true;
  };

  // Leader utility: personality + beliefs + divine inspiration + noise. Leaders keep their own goals.
  S.decisionUtilities = function (world, leader, decision) {
    const t = leader.traits;
    const insp = leader.inspiration && leader.inspiration.until > world.t ? leader.inspiration : null;
    return decision.options.map((o) => {
      let u = 0;
      for (const tag of o.tags) {
        if (tag === 'mercy') u += t.kindness * 1.2;
        if (tag === 'order') u += t.caution * 0.6 + t.ambition * 0.5 + (1 - t.kindness) * 0.3;
        if (tag === 'piety') u += t.piety * 0.8 + leader.belief / 100;
        if (tag === 'reform') u += (1 - t.ambition) * 0.5 + t.kindness * 0.4 + t.skepticism * 0.3 - (leader.role === 'monarch' ? 0.4 : 0);
        if (tag === 'peace') u += t.caution * 0.6 + t.kindness * 0.3;
        if (tag === 'war') u += t.courage * 0.6 + t.ambition * 0.4;
        if (tag === 'iron') u += (1 - t.kindness) * 0.6 + t.ambition * 0.4 + t.caution * 0.2;
        if (insp && insp.tag === tag) u += insp.strength * (0.6 + leader.belief / 100);
      }
      u /= Math.max(1, o.tags.length * 0.8);
      return { option: o, utility: u };
    });
  };

  S.resolveDecision = function (world, forcedOptionId, byPlayer) {
    const c = world.country;
    const pd = c.pendingDecision;
    if (!pd) return null;
    const d = G.Data.decisions[pd.decisionId];
    const leader = S.char(world, pd.leaderId);
    c.pendingDecision = null;
    c.decisionCooldown = world.t + T.DAY * 3;
    if (!leader || !leader.alive) return null;
    let choice;
    if (forcedOptionId) choice = d.options.find((o) => o.id === forcedOptionId);
    if (!choice) {
      const utils = S.decisionUtilities(world, leader, d);
      for (const u of utils) u.utility += world.rng.float(-0.25, 0.25); // a believer can still make a poor choice
      utils.sort((a, b) => b.utility - a.utility);
      choice = utils[0].option;
    }
    S.applyDecisionEffects(world, choice);
    S.addMemory(world, leader, 'decision', `Decided: ${choice.label}.`, 2);
    S.log(world, { title: `${leader.first} decides`, text: `${leader.name} chose to ${choice.label.charAt(0).toLowerCase() + choice.label.slice(1)}.${byPlayer ? ' The court thought the voice strange, as if someone else were speaking.' : ''}`, level: 2, kind: 'politics', entities: [leader.id] });
    if (byPlayer) {
      world.country.exposure = U.clamp(world.country.exposure + 1, 0, 100);
      leader.flags.oddBehaviour = (leader.flags.oddBehaviour || 0) + 1;
    }
    return choice;
  };

  S.applyDecisionEffects = function (world, o) {
    const c = world.country;
    for (const k in o.effects || {}) c[k] = U.clamp((c[k] || 0) + o.effects[k], 0, 100);
    for (const k in o.factions || {}) {
      const f = S.faction(world, k);
      if (f) f.approval = U.clamp(f.approval + o.factions[k], 0, 100);
    }
    if (o.flag === 'rescue') {
      const gen = S.char(world, S.faction(world, 'military').leaderId) || S.leader(world);
      if (gen) S.organizeRescue(world, gen);
    }
    if (o.flag === 'arrests') {
      const ref = S.char(world, S.faction(world, 'reformers').leaderId);
      if (ref && ref.alive) {
        ref.flags.detainedUntil = world.t + T.DAY * 30;
        S.goTo(world, ref, 'barracks', 'detained');
        S.addMemory(world, ref, 'detained', 'Arrested on the orders of the Crown.', 3);
        S.log(world, { title: 'Arrests', text: `${ref.name} was arrested and thrown in the gaol.`, level: 2, kind: 'politics', entities: [ref.id] });
      }
    }
    if (o.flag === 'mobilize') c.warRisk = U.clamp(c.warRisk - 15, 0, 100);
    if (o.flag === 'granaries') c.flags.granaries = true;
    if (o.flag && o.flag.startsWith('war:')) S.declareWar(world, o.flag.slice(4), S.leader(world) ? S.leader(world).name : null);
    if (o.flag === 'iron') S.imposeIronRule(world, 45);
    if (o.flag === 'purge') S.purgeNobles(world);
    if (o.transition) S.transition(world, o.transition, 'The charter was signed in the Great Hall.');
    S.politicsDerived(world);
  };

  H.decision_due = function () {};

  S.politicsHourly = function (world) {
    const pd = world.country.pendingDecision;
    if (pd && world.t >= pd.dueAt) {
      // If the player possesses the leader at the moment of decision, they decide.
      if (world.player.form === 'possession' && world.player.possessId === pd.leaderId && world.player.pendingChoice) {
        S.resolveDecision(world, world.player.pendingChoice, true);
        world.player.pendingChoice = null;
      } else S.resolveDecision(world, null, false);
    }
  };

  // ---------- Regime change ----------
  S.transition = function (world, toGov, text, newLeader) {
    const c = world.country;
    const from = c.government;
    if (from === toGov) return;
    c.government = toGov;
    c.govSince = world.t;
    if (newLeader) {
      c.leaderId = newLeader.id;
      newLeader.renown = U.clamp(newLeader.renown + 25, 0, 100);
    }
    const gov = G.Data.governments[toGov];
    if (gov.elections) c.nextElection = world.t + T.DAY * (toGov === 'democracy' ? 30 : 20);
    c.legitimacy = U.clamp(c.legitimacy + (toGov === 'democracy' || toGov === 'republic' ? 12 : toGov === 'constitutional' ? 8 : -5), 0, 100);
    const l = S.leader(world);
    if (l) retitle(world, l, gov.leaderTitle);
    S.log(world, {
      title: `${G.Data.governments[from].name} → ${gov.name}`,
      text: `${text} ${c.name} is now a ${gov.name.toLowerCase()}${l ? `, led by ${l.name}` : ''}.`,
      level: 3, kind: 'regime', alert: true,
    });
    if (toGov !== 'monarchy' && toGov !== 'constitutional') c.name = c.name.replace(/^Kingdom of /, toGov === 'theocracy' ? 'Holy State of ' : toGov === 'dictatorship' ? 'Protectorate of ' : 'Republic of ');
    else if (!/^Kingdom of /.test(c.name)) c.name = 'Kingdom of ' + c.name.replace(/^(Holy State of |Protectorate of |Republic of )/, '');
  };

  function retitle(world, ch, title) {
    if (!ch) return;
    const royal = ch.role === 'monarch' || ch.role === 'heir';
    const t = title === 'Monarch' ? (ch.sex === 'f' ? 'Queen' : 'King') : title;
    if (royal && title !== 'Monarch' && (ch.title === 'King' || ch.title === 'Queen')) ch.title = '';
    ch.title = t;
    ch.name = `${t ? t + ' ' : ''}${ch.first} ${ch.last}`;
  }

  S.checkTransitions = function (world) {
    const c = world.country;
    const rng = world.rng;
    const since = world.t - c.govSince;
    if (since < T.DAY * 15) return;
    // Coups, uprisings and holy coups now grow as conspiracies (see intrigue.js).
    // Revolutionary committee → republic
    if (c.government === 'revolutionary' && since > T.DAY * 40 && rng.chance(0.05)) {
      S.transition(world, 'republic', 'The Committee proclaimed a constitution and called the first presidential election.');
      return;
    }
    // Constitutional monarchy → democracy once the assembly matures
    if (c.government === 'constitutional' && since > T.DAY * 90 && c.reformPressure > 45 && rng.chance(0.015)) {
      S.transition(world, 'democracy', 'The assembly voted to hold elections for a First Minister; the crown became ceremonial.');
    }
  };

  S.holdElection = function (world) {
    const c = world.country;
    const gov = G.Data.governments[c.government];
    c.nextElection = world.t + T.DAY * gov.elections;
    c.lastElection = world.t;
    const cands = c.factions.filter((f) => f.leaderId && S.char(world, f.leaderId) && S.char(world, f.leaderId).alive && !['crown'].includes(f.id))
      .map((f) => {
        const l = S.char(world, f.leaderId);
        const support = f.power * 0.5 + l.renown * 0.4 + (f.id === 'reformers' ? c.reformPressure * 0.2 : 0) + (f.id === 'clergy' ? c.religiousInfluence * 0.2 : 0) + world.rng.float(0, 25) + (l.id === c.leaderId ? 8 : 0);
        return { f, l, support };
      })
      .sort((a, b) => b.support - a.support);
    if (!cands.length) return;
    const win = cands[0];
    const prev = S.leader(world);
    const old = c.leaderId;
    c.leaderId = win.l.id;
    if (prev && prev.id !== win.l.id && prev.alive && prev.role !== 'monarch') retitle(world, prev, '');
    retitle(world, win.l, gov.leaderTitle);
    win.f.approval = U.clamp(win.f.approval + 10, 0, 100);
    c.legitimacy = U.clamp(c.legitimacy + 4, 0, 100);
    S.log(world, { title: 'Election', text: `${win.l.name} (${win.f.name}) won the election${old === win.l.id ? ' and remains in office' : ''}. Runner-up: ${cands[1] ? cands[1].l.name : 'none'}.`, level: 2, kind: 'politics', entities: [win.l.id] });
  };

  // ---------- Succession ----------
  S.onCharacterDeath = function (world, ch) {
    const c = world.country;
    if (ch.id === c.leaderId) {
      if (c.government === 'monarchy' || c.government === 'constitutional') {
        const heir = S.char(world, c.heirId);
        if (heir && heir.alive) {
          c.leaderId = heir.id;
          heir.role = 'monarch';
          heir.occupation = heir.sex === 'f' ? 'Queen of Velmora' : 'King of Velmora';
          retitle(world, heir, 'Monarch');
          heir.renown = U.clamp(heir.renown + 40, 0, 100);
          c.legitimacy = U.clamp(c.legitimacy + (heir.traits.kindness > 0.6 ? 6 : 0) - 4, 0, 100);
          S.faction(world, 'crown').leaderId = heir.id;
          const kids = S.familyOf(world, heir).filter((k) => k.alive && heir.relations[k.id].type === 'child');
          c.heirId = kids.length ? kids[0].id : null;
          if (kids[0]) kids[0].role = kids[0].age >= 15 ? 'heir' : kids[0].role;
          S.log(world, { title: 'Succession', text: `${heir.name} ascends the throne after the death of ${ch.name}.`, level: 3, kind: 'regime', entities: [heir.id], alert: true });
        } else {
          // Succession crisis: a noble claimant
          const noble = S.char(world, S.faction(world, 'nobility').leaderId);
          c.legitimacy = U.clamp(c.legitimacy - 15, 0, 100);
          if (noble && noble.alive) {
            c.leaderId = noble.id;
            noble.role = 'monarch';
            retitle(world, noble, 'Monarch');
            S.faction(world, 'crown').leaderId = noble.id;
            S.log(world, { title: 'Succession crisis', text: `With no heir, ${noble.name} claimed the crown. Many doubt the claim.`, level: 3, kind: 'regime', entities: [noble.id], alert: true });
          }
        }
      } else if (c.government === 'theocracy') {
        world.church.leaderId = null;
        S.dailyReligion(world);
        c.leaderId = world.church.leaderId;
        S.log(world, { title: 'A new Hierarch', text: 'The Church chose a successor.', level: 2, kind: 'regime' });
      } else {
        const f = c.factions.slice().sort((a, b) => b.power - a.power).find((ff) => ff.leaderId && ff.leaderId !== ch.id && S.char(world, ff.leaderId)?.alive);
        if (f) {
          c.leaderId = f.leaderId;
          retitle(world, S.char(world, f.leaderId), G.Data.governments[c.government].leaderTitle);
          S.log(world, { title: 'Interim leader', text: `${S.char(world, f.leaderId).name} took power after the death of ${ch.name}.`, level: 2, kind: 'regime' });
        }
        c.legitimacy = U.clamp(c.legitimacy - 8, 0, 100);
      }
      if (c.pendingDecision) c.pendingDecision.leaderId = c.leaderId;
    }
    if (ch.id === c.heirId) {
      const king = S.leader(world);
      const kids = king ? S.familyOf(world, king).filter((k) => k.alive && king.relations[k.id].type === 'child') : [];
      c.heirId = kids.length ? kids[0].id : null;
      if (c.government === 'monarchy') S.log(world, { title: 'The heir is dead', text: c.heirId ? `${S.char(world, c.heirId).name} is now heir.` : 'The line of succession is broken.', level: 2, kind: 'regime' });
    }
  };

  // The Crown claims witnessed miracles as proof of divine favor; a rival may challenge the claim.
  H.crown_claims_miracle = function (world, data) {
    const c = world.country;
    const king = S.leader(world);
    if (!king || !king.alive || world.t - (c.flags.lastClaim || -99999) < T.DAY * 5) return;
    if (c.government !== 'monarchy' && c.government !== 'constitutional' && c.government !== 'theocracy') return;
    if (king.traits.ambition < 0.4 && king.belief < 50) return;
    c.flags.lastClaim = world.t;
    c.legitimacy = U.clamp(c.legitimacy + 5, 0, 100);
    S.log(world, { title: 'The Crown claims divine favor', text: `${king.name} proclaimed that ${data.text} proves heaven blesses the throne.`, level: 2, kind: 'politics', entities: [king.id] });
    const rival = S.char(world, S.faction(world, 'nobility').leaderId);
    if (rival && rival.alive && rival.traits.ambition > 0.6 && rival.id !== king.id) {
      c.eliteLoyalty = U.clamp(c.eliteLoyalty - 3, 0, 100);
      S.faction(world, 'nobility').approval = U.clamp(S.faction(world, 'nobility').approval - 5, 0, 100);
      S.log(world, { title: 'A rival challenges the claim', text: `${rival.name} sneered that the miracle owed nothing to the King, and much to the priests' theatre.`, level: 1, kind: 'politics', entities: [rival.id] });
    }
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
