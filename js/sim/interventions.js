// Divine abilities: cost calculation, validation and effects.
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;

  const influence = (c) => ({ monarch: 1, heir: 0.7, general: 0.8, noble: 0.7, priest: 0.6, official: 0.5, reformer: 0.5, scholar: 0.3 })[c.role] || 0.1;
  S.influenceOf = influence;
  S.isLeaderFigure = (world, c) => c && (c.id === world.country.leaderId || world.country.factions.some((f) => f.leaderId === c.id) || ['monarch', 'heir', 'general', 'noble', 'official'].includes(c.role));

  S.abilityCost = function (world, abilityId, target, option) {
    const a = G.Data.abilities[abilityId];
    if (!a) return Infinity;
    const phil = G.Data.philosophies[world.player.philosophy] || {};
    let cost = a.base;
    if (abilityId === 'subtle_sign') cost = 8 + (target ? target.traits.skepticism * 10 : 0);
    else if (abilityId === 'vision') cost = 30 + (target ? target.traits.skepticism * 20 + influence(target) * 10 : 0);
    else if (abilityId === 'heal' && target) cost = 50 + Math.max(target.illness ? target.illness.severity : 0, target.injury, 100 - target.health) * 0.9;
    else if (abilityId === 'provide') cost = 70;
    else if (abilityId === 'sway' && target) cost = 25 + influence(target) * 110 + target.traits.skepticism * 25;
    else if (abilityId === 'inspire' && target) cost = 45 + influence(target) * 40;
    else if (abilityId === 'protect' && target) {
      const occupants = S.living(world).filter((c) => c.at === target.id || c.homeId === target.id).length;
      cost = U.clamp(90 + occupants * 25 + target.w * target.h, 100, 300);
    } else if (abilityId === 'smite' && target) cost = 70 + influence(target) * 50;
    else if (abilityId === 'reveal' && target) cost = 140 + influence(target) * 140;
    else if (abilityId === 'inspire_leader' && target) cost = 150 + influence(target) * 200 + target.traits.skepticism * 50;
    else if (a.options && option && a.options[option] && a.options[option].cost) cost = a.options[option].cost;
    cost *= (phil.costMod && phil.costMod[abilityId]) || 1;
    if (world.player.form === 'possession' && abilityId !== 'subtle_sign') cost *= 0.9; // acting through a body is a little cheaper
    cost *= world.settings.costMultiplier || 1;
    return Math.round(cost);
  };

  // Returns { ok, reason } describing whether an ability can be used right now.
  S.canUseAbility = function (world, abilityId, target, option) {
    const a = G.Data.abilities[abilityId];
    if (!a) return { ok: false, reason: 'Unknown ability' };
    if (a.philosophy && a.philosophy !== world.player.philosophy) return { ok: false, reason: `Requires the ${G.Data.philosophies[a.philosophy].name} philosophy` };
    if (world.player.form === 'human') return { ok: false, reason: 'No divine abilities in human form' };
    if (world.faith.tier < a.tier) return { ok: false, reason: `Requires ${G.Data.tiers[a.tier - 1].title}` };
    if (a.target === 'character') {
      if (!target || !target.alive) return { ok: false, reason: 'Needs a living target' };
      if (abilityId === 'inspire_leader' && !S.isLeaderFigure(world, target)) return { ok: false, reason: 'Only leaders can be inspired this way' };
      if (abilityId === 'reveal' && !(target.corrupt || ['official', 'noble', 'monarch', 'general'].includes(target.role))) return { ok: false, reason: 'They hide nothing worth revealing' };
      if (world.player.form === 'possession' && target.id === world.player.possessId && abilityId !== 'heal') return { ok: false, reason: 'Cannot target your own vessel' };
    }
    if (a.options && a.options[option] && a.options[option].needs) {
      const need = a.options[option].needs;
      if (need === 'flood' && !(world.flood.stage === 'rising' || world.flood.stage === 'flooding' || world.flood.stage === 'warning')) return { ok: false, reason: 'There is no flood' };
      if (need === 'plague' && !world.plague.active) return { ok: false, reason: 'There is no plague' };
      if (need === 'war' && !world.war) return { ok: false, reason: 'There is no war' };
    }
    if (a.options && !option) return { ok: false, reason: 'Choose an option' };
    const cost = S.abilityCost(world, abilityId, target, option);
    if (world.faith.current < cost) return { ok: false, reason: `Not enough Faith (${cost})`, cost };
    return { ok: true, cost };
  };

  function vesselId(world) {
    return world.player.form === 'possession' ? world.player.possessId : null;
  }
  function originPoint(world, target) {
    if (world.player.form === 'possession') {
      const v = S.char(world, world.player.possessId);
      if (v) return { x: v.x, y: v.y };
    }
    if (target && target.x != null && target.w == null) return { x: target.x, y: target.y };
    if (target && target.w != null) return { x: target.x + target.w / 2, y: target.y + target.h / 2 };
    return { x: world.player.x, y: world.player.y };
  }

  // targetRef: { kind: 'character'|'building'|'province'|'country', id }
  S.useAbility = function (world, abilityId, targetRef, option, ctx = {}) {
    const a = G.Data.abilities[abilityId];
    let target = null;
    if (targetRef) {
      if (targetRef.kind === 'character') target = S.char(world, targetRef.id);
      else if (targetRef.kind === 'building') target = S.building(world, targetRef.id);
      else if (targetRef.kind === 'province') target = S.province(world, targetRef.id);
      else target = world.country;
    }
    const check = S.canUseAbility(world, abilityId, target, option);
    if (!check.ok) return { ok: false, msg: check.reason };
    S.spendFaith(world, check.cost, a.name);
    world.faith.lastMiracleAt = world.t;
    world.faith.miracles++;
    if (world.challenge.status === 'active' && abilityId !== 'subtle_sign' && abilityId !== 'vision' && abilityId !== 'inspire' && abilityId !== 'sway') world.challenge.miracles++;
    const res = EFFECTS[abilityId](world, target, option, ctx) || {};
    const msg = res.msg || `${a.name} performed.`;
    S.log(world, { title: `You used ${a.name}`, text: msg, level: a.tier >= 3 ? 2 : 1, kind: 'divine', entities: target && target.id && targetRef.kind === 'character' ? [target.id] : [], cost: check.cost });
    S.prayersAfterAbility(world, abilityId, target, option, targetRef ? targetRef.kind : null);
    S.recomputeFaithRates(world);
    return { ok: true, msg, cost: check.cost };
  };

  const EFFECTS = {
    sway(world, c, option) {
      const r = S.plantAgenda(world, c, option, 'vision');
      return { msg: r.msg };
    },
    subtle_sign(world, c) {
      const rng = world.rng;
      const believes = rng.chance(0.25 + c.belief / 150 - c.traits.skepticism * 0.3);
      if (believes) {
        S.adjustBelief(world, c, rng.float(2, 6));
        S.addMemory(world, c, 'sign', rng.pick(['A candle refused to go out. Took it as a sign.', 'A white bird landed at the window at the moment of prayer.', 'Found a lost keepsake exactly where they prayed it would be.']), 1);
      } else S.addMemory(world, c, 'sign', 'Noticed something odd, but shrugged it off.', 0.5);
      world.country.exposure = U.clamp(world.country.exposure + 0.05, 0, 100);
      return { msg: `${c.first} ${believes ? 'took it as a sign' : 'dismissed the sign as chance'}.` };
    },
    vision(world, c, option) {
      const rng = world.rng;
      c.divine.answered += 0; // visions are not prayer answers by themselves
      let msg;
      const receptive = rng.chance(0.35 + c.belief / 120 - c.traits.skepticism * 0.25);
      if (option === 'comfort') {
        c.flags.grief = 0;
        c.mood = U.clamp(c.mood + 25, 0, 100);
        S.adjustBelief(world, c, receptive ? 8 : 2);
        S.addMemory(world, c, 'vision', 'Dreamed of a warm light that said all would be well. Woke comforted.', 2);
        msg = `${c.first} was comforted.`;
      } else if (option === 'warning') {
        c.flags.warned = world.t;
        const danger = S.isInFloodDanger(world, c);
        if (danger && receptive) {
          c.flags.evacuating = true;
          c.flags.trapped = false;
          for (const f of S.familyOf(world, c)) if (f.alive && f.homeId === c.homeId) {
            f.flags.evacuating = true;
            f.flags.trapped = false;
          }
          msg = `${c.first} heeded the warning and is fleeing to the temple with the household.`;
        } else msg = receptive ? `${c.first} took the warning to heart.` : `${c.first} woke uneasy but did nothing.`;
        if (S.isLeaderFigure(world, c) && receptive) c.inspiration = { tag: 'mercy', strength: 0.6, until: world.t + T.DAY * 5 };
        S.addMemory(world, c, 'vision', 'Was warned of danger in a vision.', 2);
        S.adjustBelief(world, c, receptive ? 5 : 0);
      } else if (option === 'guidance') {
        S.adjustBelief(world, c, receptive ? 7 : 1);
        c.mood = U.clamp(c.mood + 10, 0, 100);
        S.addMemory(world, c, 'vision', 'Received guidance in a vision and feels clearer about the path ahead.', 2);
        msg = receptive ? `${c.first} feels guided.` : `${c.first} is unsure what the vision meant.`;
      } else if (option === 'calling') {
        if (c.belief > 50 && receptive && c.age >= 16) {
          c.prophet = true;
          S.adjustBelief(world, c, 15);
          S.addMemory(world, c, 'vision', 'Was called to speak for the divine.', 3);
          S.log(world, { title: 'A prophet is called', text: `${c.name} has been called to prophecy and will preach in the market.`, level: 2, kind: 'religion', entities: [c.id] });
          msg = `${c.first} accepted the calling.`;
        } else {
          c.mood = U.clamp(c.mood - 15, 0, 100);
          c.traits.skepticism = U.clamp(c.traits.skepticism + 0.05, 0, 1);
          S.addMemory(world, c, 'vision', 'Had a terrifying vision demanding they become a prophet. Refused.', 2);
          msg = `${c.first} was frightened and refused the calling.`;
        }
      } else if (option === 'insight') {
        const scholarly = c.role === 'scholar' || c.role === 'student';
        if (scholarly || rng.chance(0.3)) {
          world.country.technology = U.clamp(world.country.technology + 3, 0, 100);
          world.country.economy = U.clamp(world.country.economy + 2, 0, 100);
          c.renown = U.clamp(c.renown + 15, 0, 100);
          const credit = c.traits.skepticism > 0.6 ? 'their own genius' : 'divine inspiration';
          if (credit === 'divine inspiration') S.adjustBelief(world, c, 6);
          S.addMemory(world, c, 'discovery', `Had a sudden insight and credits ${credit}.`, 2);
          S.log(world, { title: 'A discovery', text: `${c.name} made a breakthrough in natural philosophy, crediting ${credit}.`, level: 2, kind: 'discovery', entities: [c.id] });
          msg = `${c.first} made a discovery.`;
        } else msg = `${c.first} could not make sense of the insight.`;
      }
      return { msg };
    },
    heal(world, c) {
      const was = c.illness ? c.illness.name : c.injury > 15 ? 'injuries' : 'frailty';
      c.illness = null;
      c.injury = 0;
      c.health = Math.max(c.health, 85);
      c.mood = U.clamp(c.mood + 25, 0, 100);
      S.adjustBelief(world, c, 15);
      S.addMemory(world, c, 'miracle', `Was miraculously healed of ${was}.`, 3);
      c.interpretation = 'protector';
      const o = originPoint(world, c);
      S.miracleWitnessed(world, { x: o.x, y: o.y, kind: 'heal', text: `the healing of ${c.first}`, magnitude: 2, beneficiaryId: c.id, vesselId: vesselId(world) });
      S.addGratitude(world, c);
      return { msg: `${c.name} was healed of ${was}.` };
    },
    provide(world, c) {
      const fam = [c, ...S.familyOf(world, c).filter((f) => f.alive && f.homeId === c.homeId)];
      for (const f of fam) {
        f.wealth = U.clamp(f.wealth + 40, 0, 100);
        f.hunger = 0;
      }
      S.adjustBelief(world, c, 10);
      S.addMemory(world, c, 'miracle', 'Found the larder full and a purse of coin on the table.', 2);
      const o = originPoint(world, c);
      S.miracleWitnessed(world, { x: o.x, y: o.y, kind: 'provide', text: `food appearing for the ${c.last} household`, magnitude: 1, beneficiaryId: c.id, vesselId: vesselId(world) });
      S.addGratitude(world, c);
      return { msg: `The ${c.last} household is provided for.` };
    },
    inspire(world, c, option) {
      c.inspired = { kind: option, until: world.t + T.DAY * 3 };
      if (option === 'courage') c.traits.courage = U.clamp(c.traits.courage + 0.05, 0, 1);
      if (option === 'compassion') c.traits.kindness = U.clamp(c.traits.kindness + 0.05, 0, 1);
      if (option === 'zeal') S.adjustBelief(world, c, 6);
      S.addMemory(world, c, 'inspired', `Felt a sudden surge of ${option}.`, 1);
      // Inspired people act on it.
      S.actOnInspiration(world, c, option);
      return { msg: `${c.first} is filled with ${option}.` };
    },
    protect(world, b) {
      b.protectedUntil = world.t + T.DAY * 2;
      const inside = S.living(world).filter((c) => c.at === b.id || c.homeId === b.id);
      for (const c of inside) {
        c.flags.trapped = false;
        c.flags.protected = b.protectedUntil;
        S.addMemory(world, c, 'miracle', `Felt a calm, golden stillness settle over ${b.name}.`, 2);
        S.adjustBelief(world, c, 6);
      }
      if (world.flood.level > 0.1 && S.inFloodZone(b.x + b.w / 2, b.y + b.h / 2, world)) {
        S.miracleWitnessed(world, { x: b.x + b.w / 2, y: b.y + b.h / 2, kind: 'protect', text: `the floodwaters parting around ${b.name}`, magnitude: 3, vesselId: vesselId(world) });
      }
      for (const c of inside) S.addGratitude(world, c, 12);
      return { msg: `${b.name} is warded for two days (${inside.length} people).` };
    },
    smite(world, c) {
      c.injury = U.clamp(c.injury + 55, 0, 100);
      c.mood = U.clamp(c.mood - 30, 0, 100);
      S.addMemory(world, c, 'miracle', 'Was struck down by an unseen force.', 3);
      c.interpretation = 'judge';
      const o = { x: c.x, y: c.y };
      S.miracleWitnessed(world, { x: o.x, y: o.y, kind: 'smite', text: `${c.first} being struck down`, magnitude: 2, harmful: true, vesselId: vesselId(world) });
      if (c.corrupt) {
        world.country.corruption = U.clamp(world.country.corruption - 6, 0, 100);
        c.corrupt = world.rng.chance(0.5);
      }
      return { msg: `${c.name} was struck down.` };
    },
    reveal(world, c) {
      const country = world.country;
      if (c.corrupt) {
        country.corruption = U.clamp(country.corruption - 15, 0, 100);
        country.legitimacy = U.clamp(country.legitimacy - 6, 0, 100);
        country.reformPressure = U.clamp(country.reformPressure + 8, 0, 100);
        c.corrupt = false;
        c.renown = U.clamp(c.renown - 30, 0, 100);
        c.flags.disgraced = world.t;
        if (c.role === 'official') {
          c.flags.detainedUntil = world.t + T.DAY * 20;
          S.goTo(world, c, 'barracks', 'detained');
        }
        S.addMemory(world, c, 'disgrace', 'Their hidden misdeeds were laid bare before the city.', 3);
        S.miracleWitnessed(world, { x: c.x, y: c.y, kind: 'reveal', text: `the ledgers of ${c.name} spilling open in the street`, magnitude: 2, vesselId: vesselId(world) });
        S.log(world, { title: 'Corruption exposed', text: `${c.name}'s embezzlement was exposed for all to see. Trust in the Crown falls; the Reformers are emboldened.`, level: 2, kind: 'politics', entities: [c.id] });
        return { msg: `${c.name}'s corruption is revealed.` };
      }
      country.legitimacy = U.clamp(country.legitimacy - 2, 0, 100);
      return { msg: `You found nothing damning about ${c.first}. Rumours spread anyway.` };
    },
    inspire_leader(world, c, option) {
      const country = world.country;
      if (option === 'embolden' || option === 'shake') {
        const sign = option === 'embolden' ? 1 : -1;
        if (c.id === country.leaderId) country.legitimacy = U.clamp(country.legitimacy + sign * 9, 0, 100);
        const f = country.factions.find((ff) => ff.leaderId === c.id);
        if (f) f.power = U.clamp(f.power + sign * 8, 0, 100);
        c.renown = U.clamp(c.renown + sign * 10, 0, 100);
        c.mood = U.clamp(c.mood + sign * 15, 0, 100);
        S.addMemory(world, c, 'inspired', option === 'embolden' ? 'Felt certain of their destiny.' : 'Was gripped by doubt and dread.', 2);
        return { msg: `${c.name} is ${option === 'embolden' ? 'emboldened' : 'shaken'}.` };
      }
      const strength = 0.6 + c.belief / 150;
      c.inspiration = { tag: option, strength, until: world.t + T.DAY * 10 };
      S.addMemory(world, c, 'inspired', `Felt drawn toward ${option}.`, 2);
      S.adjustBelief(world, c, 3);
      return { msg: `${c.name} feels drawn toward ${option}. They still decide for themselves.` };
    },
    regional(world, p, option) {
      const country = world.country;
      const rng = world.rng;
      if (option === 'calm_waters') {
        S.endFlood(world, 'The waters stilled and fell away within the hour.');
        S.miracleWitnessed(world, { x: 44, y: 22, kind: 'regional', text: 'the floodwaters suddenly falling still and receding', magnitude: 3, district: 'riverside' });
        bumpProvince(world, 'riverlands', 8);
        return { msg: 'The flood is calmed.' };
      }
      if (option === 'divert_river') {
        world.flood.diverted = true;
        for (const c of S.living(world)) {
          if (c.flags.trapped && !S.isFlooded(world, c.x, c.y)) c.flags.trapped = false;
        }
        S.log(world, { title: 'The river turns', text: 'The swollen river cut a new channel north, sparing the Riverside farms but drowning the North Fields and the Upland Farm.', level: 2, kind: 'disaster' });
        S.miracleWitnessed(world, { x: 44, y: 9, kind: 'regional', text: 'the river turning in its bed', magnitude: 3, district: 'riverside' });
        country.economy = U.clamp(country.economy - 2, 0, 100);
        return { msg: 'The river is diverted to the North Fields.' };
      }
      if (option === 'bountiful_harvest') {
        p.economy = U.clamp(p.economy + 15, 0, 100);
        country.economy = U.clamp(country.economy + 5, 0, 100);
        country.flags.famine = false;
        for (const c of S.living(world)) {
          c.hunger = 0;
          if (c.role === 'farmer') c.wealth = U.clamp(c.wealth + 20, 0, 100);
        }
        bumpProvince(world, p.id, 6);
        S.miracleWitnessed(world, { x: 54, y: 20, kind: 'regional', text: 'the fields bursting with grain overnight', magnitude: 2, district: 'riverside' });
        return { msg: `${p.name} enjoys a miraculous harvest.` };
      }
      if (option === 'cleanse_plague') {
        world.plague.active = false;
        for (const c of S.living(world)) if (c.illness && c.illness.name === 'the plague') c.illness = null;
        for (const pr of world.provinces) pr.plague = 0;
        S.log(world, { title: 'The sickness lifts', text: 'Overnight, the plague broke. The sick rose from their beds.', level: 3, kind: 'divine' });
        S.miracleWitnessed(world, { x: 20, y: 30, kind: 'regional', text: 'the plague vanishing overnight', magnitude: 3, district: 'oldtown' });
        bumpProvince(world, p.id, 10);
        return { msg: 'The plague is cleansed.' };
      }
      if (option === 'storm_on_enemy') {
        world.war.score = U.clamp(world.war.score + 30, -100, 100);
        S.log(world, { title: 'Storm over the Highmarch', text: `A sudden storm scattered the ${S.neighbor(world, world.war.enemy).name} army.`, level: 3, kind: 'war' });
        bumpProvince(world, 'highmarch', 8);
        country.exposure = U.clamp(country.exposure + 6 * rng.float(0.8, 1.2), 0, 100);
        return { msg: 'A storm breaks upon the invaders.' };
      }
      return { msg: 'Nothing happened.' };
    },
    national(world, _c, option) {
      const country = world.country;
      if (option === 'rally_nation') {
        country.legitimacy = U.clamp(country.legitimacy + 12, 0, 100);
        country.eliteLoyalty = U.clamp(country.eliteLoyalty + 10, 0, 100);
        country.revolutionRisk = Math.max(0, country.revolutionRisk - 20);
        for (const p of world.provinces) p.unrest = Math.max(0, p.unrest - 15);
        country.exposure = U.clamp(country.exposure + 8, 0, 100);
        S.log(world, { title: 'The nation rallies', text: 'A wave of shared purpose swept Velmora. Old quarrels were set aside, for now.', level: 3, kind: 'divine' });
        return { msg: 'The nation rallies.' };
      }
      if (option === 'forge_peace') {
        S.endWar(world, 'peace', 'Both armies laid down their arms after their commanders shared the same dream.');
        country.exposure = U.clamp(country.exposure + 10, 0, 100);
        return { msg: 'Peace is forged.' };
      }
      if (option === 'humble_ruler') {
        const l = S.leader(world);
        country.legitimacy = U.clamp(country.legitimacy - 25, 0, 100);
        country.corruption = U.clamp(country.corruption - 10, 0, 100);
        if (l) {
          l.traits.ambition = U.clamp(l.traits.ambition - 0.2, 0, 1);
          l.traits.kindness = U.clamp(l.traits.kindness + 0.15, 0, 1);
          S.addMemory(world, l, 'miracle', 'Was humbled before the whole court by a voice from heaven.', 3);
        }
        country.exposure = U.clamp(country.exposure + 12, 0, 100);
        S.log(world, { title: 'The ruler humbled', text: `${l ? l.name : 'The ruler'} was humbled before the court. The realm whispers of divine judgement.`, level: 3, kind: 'divine' });
        return { msg: 'The ruler is humbled.' };
      }
      return { msg: 'Nothing happened.' };
    },
    global(world) {
      for (const c of S.living(world)) {
        S.adjustBelief(world, c, 20 - c.traits.skepticism * 15);
        S.addMemory(world, c, 'miracle', 'Saw a sign blaze across the heavens.', 3);
      }
      for (const p of world.provinces) p.belief = U.clamp(p.belief + 15, 0, 100);
      world.country.exposure = U.clamp(world.country.exposure + 40, 0, 100);
      for (const n of world.neighbors) n.relation = U.clamp(n.relation + 10, -100, 100);
      S.log(world, { title: 'A sign in the heavens', text: 'For one night the sky burned with light seen across the whole world. Nothing will ever be quite the same.', level: 3, kind: 'divine' });
      return { msg: 'The whole world saw the sign.' };
    },
  };
  S.EFFECTS = EFFECTS;

  function bumpProvince(world, id, belief) {
    const p = S.province(world, id);
    if (p) p.belief = U.clamp(p.belief + belief, 0, 100);
    const r = world.reputation[id];
    if (r) r.protector += 5;
  }

  // Inspired people act according to their circumstances.
  S.actOnInspiration = function (world, c, kind) {
    if (kind === 'courage' || kind === 'compassion') {
      // Help someone in danger nearby, or organise a rescue if they hold office.
      const endangered = S.living(world).filter((o) => o.flags.trapped);
      if (endangered.length && (c.role === 'general' || c.role === 'official' || c.role === 'monarch' || c.role === 'heir' || c.role === 'soldier' || c.role === 'guard')) {
        S.organizeRescue(world, c);
      } else if (endangered.length && c.age >= 16) {
        const near = endangered.sort((a, b) => U.dist(a.x, a.y, c.x, c.y) - U.dist(b.x, b.y, c.x, c.y))[0];
        S.schedule(world, 90 + world.rng.int(0, 120), 'neighbor_rescue', { helperId: c.id, homeId: near.homeId });
        S.log(world, { title: `${c.first} sets out to help`, text: `${c.name} has resolved to reach the ${near.last} family.`, level: 1, kind: 'event', entities: [c.id, near.id] });
      }
    }
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
