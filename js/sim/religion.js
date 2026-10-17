// Religion as a social institution: witness interpretation, divine reputation, movements, schisms and The Gift.
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;

  const INTERP_LABEL = {
    protector: 'a compassionate protector',
    judge: 'a wrathful judge',
    coincidence: 'coincidence',
    deceiver: 'trickery or deception',
  };
  S.INTERP_LABEL = INTERP_LABEL;

  S.reputationLabel = function (world, communityId) {
    const r = world.reputation[communityId];
    if (!r) return 'Unknown';
    const total = r.protector + r.judge + r.coincidence + r.deceiver;
    if (total < 1) return 'No opinion yet';
    let best = 'protector';
    for (const k of Object.keys(r)) if (r[k] > r[best]) best = k;
    return { protector: 'Compassionate Protector', judge: 'Wrathful Judge', coincidence: 'Coincidence', deceiver: 'Deception' }[best];
  };

  // A witnessed miracle: each witness interprets it through their own beliefs.
  // opts: { x, y, kind, text, magnitude (1-4), harmful, beneficiaryId, vesselId, district, exposureMult }
  S.miracleWitnessed = function (world, opts) {
    const rng = world.rng;
    const phil = G.Data.philosophies[world.player.philosophy] || {};
    const radius = (4 + opts.magnitude * 1.5) * (S.visibility ? S.visibility(world) : 1);
    const ws = S.witnesses(world, opts.x, opts.y, radius, opts.vesselId);
    const district = opts.district || S.districtAt(world, opts.x, opts.y);
    const tally = { protector: 0, judge: 0, coincidence: 0, deceiver: 0, vessel: 0 };
    const vessel = S.char(world, opts.vesselId);
    for (const w of ws) {
      let interp;
      const bel = w.belief / 100;
      const pDivine = 0.15 + bel * 0.7 - w.traits.skepticism * 0.35 + opts.magnitude * 0.06;
      const r = rng.next();
      if (vessel && rng.chance(0.55)) interp = 'vessel';
      else if (r < pDivine) {
        const fear = opts.harmful ? 0.7 : (phil.fearBias || 0) + 0.08;
        interp = rng.chance(fear) ? 'judge' : 'protector';
        if (interp === 'protector' && phil.protectorBias) interp = 'protector';
      } else if (r < pDivine + 0.25 + w.traits.skepticism * 0.2) interp = 'coincidence';
      else interp = 'deceiver';
      tally[interp]++;
      w.divine.witnessed++;
      world.stats.miraclesWitnessed++;
      if (interp === 'protector' || interp === 'judge') {
        S.adjustBelief(world, w, rng.float(5, 10) + opts.magnitude * 2);
        w.interpretation = interp;
        S.addMemory(world, w, 'miracle', `Witnessed ${opts.text}. Believes it was the work of ${INTERP_LABEL[interp]}.`, 2 + opts.magnitude * 0.5);
        if (interp === 'judge') w.mood = Math.max(0, w.mood - 10);
      } else if (interp === 'vessel') {
        S.adjustBelief(world, w, rng.float(2, 6));
        S.addMemory(world, w, 'miracle', `Saw ${vessel.first} perform ${opts.text}. Some call ${vessel.sex === 'f' ? 'her' : 'him'} a saint.`, 2);
      } else if (interp === 'coincidence') {
        S.adjustBelief(world, w, rng.float(-1, 2));
        w.traits.skepticism = U.clamp(w.traits.skepticism + 0.01, 0, 1);
        S.addMemory(world, w, 'miracle', `Saw ${opts.text}, but thinks it was coincidence.`, 1);
      } else {
        S.adjustBelief(world, w, -rng.float(1, 4));
        const blame = rng.pick(['the healer', 'the royal court', 'some charlatan', 'the priests']);
        S.addMemory(world, w, 'miracle', `Saw ${opts.text} and suspects ${blame} staged it.`, 1);
      }
      w.known.memories = w.known.memories || false;
    }
    const rep = world.reputation[district];
    if (rep) for (const k of ['protector', 'judge', 'coincidence', 'deceiver']) rep[k] += tally[k];
    const crown = world.reputation.crownlands;
    if (crown) {
      crown.protector += tally.protector * 0.3;
      crown.judge += tally.judge * 0.3;
    }
    if (vessel) {
      vessel.renown = U.clamp(vessel.renown + 10 + ws.length * 2, 0, 100);
      S.addMemory(world, vessel, 'possessed', `Remembers fragments of performing ${opts.text}, as if in a dream.`, 2);
    }
    // Exposure
    const expMult = (phil.exposureMod || 1) * (vessel ? 0.6 : 1) * (opts.exposureMult || 1);
    const exp = (0.15 * ws.length + 0.3) * opts.magnitude * expMult;
    world.country.exposure = U.clamp(world.country.exposure + exp, 0, 100);
    const believers = tally.protector + tally.judge;
    if (S.maybeRelic) S.maybeRelic(world, opts, believers + tally.vessel);
    if (ws.length) {
      S.log(world, {
        title: 'Witnesses react',
        text: `${ws.length} witnessed ${opts.text}: ${believers} called it divine, ${tally.coincidence} coincidence, ${tally.deceiver} suspect deception${vessel ? `, ${tally.vessel} credit ${vessel.first}` : ''}.`,
        level: believers >= 3 || opts.magnitude >= 3 ? 2 : 1, kind: 'reaction', entities: ws.map((w) => w.id).slice(0, 12),
      });
    }
    // A new gathering may begin where enough people believe.
    if ((believers >= 3 || (vessel && tally.vessel >= 3)) && opts.magnitude >= 2) S.maybeFoundMovement(world, ws, district, opts, vessel, tally);
    if (opts.magnitude >= 2 && ws.length >= 2 && (district === 'riverside' || district === 'center' || district === 'oldtown' || district === 'palace')) {
      S.schedule(world, T.DAY * 0.6, 'crown_claims_miracle', { text: opts.text });
    }
    return { witnesses: ws.length, tally };
  };

  S.maybeFoundMovement = function (world, ws, district, opts, vessel, tally) {
    const rng = world.rng;
    if (world.movements.some((m) => m.active && m.district === district)) {
      const m = world.movements.find((mm) => mm.active && mm.district === district);
      m.strength = U.clamp(m.strength + 4 + opts.magnitude * 2, 0, 100);
      for (const w of ws) if (w.belief > 55 && !w.movementId) {
        w.movementId = m.id;
        m.members++;
      }
      return;
    }
    const founder = (ws.find((w) => w.gift) || ws.slice().sort((a, b) => b.belief - a.belief)[0]);
    if (!founder) return;
    let doctrine = tally.judge > tally.protector ? 'judge' : 'protector';
    let name = rng.pick(['The Watchers of the', 'The Brethren of the', 'The Circle of the', 'The Witnesses of the']) + ' ' + rng.pick(['Water', 'Lantern', 'Open Hand', 'Second Dawn', 'Quiet Flame']);
    if (vessel && tally.vessel >= 3) {
      doctrine = 'saint';
      name = `The Followers of Saint ${vessel.first}`;
    }
    const m = {
      id: world.nextId++, name, doctrine, district, founderId: founder.id, foundedAt: world.t, strength: 12 + opts.magnitude * 4,
      members: 0, active: true, origin: opts.text, schismRisk: 0,
    };
    for (const w of ws) if (w.belief > 50) {
      w.movementId = m.id;
      m.members++;
    }
    world.movements.push(m);
    S.log(world, {
      title: 'A new religious gathering begins',
      text: `${founder.name} began gathering believers after ${opts.text}. They call themselves ${m.name} and believe the divine is ${doctrine === 'saint' ? `working through ${vessel.name}` : INTERP_LABEL[doctrine]}.`,
      level: 2, kind: 'religion', entities: [founder.id],
    });
  };

  // Daily religious dynamics: movements grow or fade, merge into the church, or split from it.
  S.dailyReligion = function (world) {
    const rng = world.rng;
    const country = world.country;
    const living = S.living(world);
    const avgBelief = living.reduce((s, c) => s + c.belief, 0) / Math.max(1, living.length);
    const ch = world.church;
    ch.members = living.filter((c) => c.belief >= 35 && !c.movementId).length;
    const priest = S.char(world, ch.leaderId);
    if (!priest || !priest.alive) {
      const next = living.filter((c) => c.role === 'priest').sort((a, b) => b.belief - a.belief)[0];
      if (next) {
        ch.leaderId = next.id;
        if (next.title !== 'High Priestess' && next.title !== 'High Priest') {
          next.title = next.sex === 'f' ? 'High Priestess' : 'High Priest';
          next.name = `${next.title} ${next.first} ${next.last}`;
        }
        S.log(world, { title: 'A new head of the Church', text: `${next.name} now leads the ${ch.name}.`, level: 2, kind: 'religion', entities: [next.id] });
      }
    }
    const target = 20 + avgBelief * 0.6 + (priest && priest.alive ? 8 : -10) - country.exposure * 0.05;
    ch.strength = U.clamp(U.lerp(ch.strength, target, 0.02), 0, 100);

    for (const m of world.movements) {
      if (!m.active) continue;
      const members = living.filter((c) => c.movementId === m.id);
      m.members = members.length;
      const founder = S.char(world, m.founderId);
      const preaching = founder && founder.alive && (founder.prophet || founder.belief > 70) ? 1 : 0;
      m.strength = U.clamp(m.strength + preaching * 0.4 + members.length * 0.05 - 0.35 + rng.float(-0.3, 0.3), 0, 100);
      // Recruit
      if (preaching && rng.chance(0.25)) {
        const cand = rng.pick(living.filter((c) => !c.movementId && c.belief > 45 && c.age >= 14));
        if (cand) {
          cand.movementId = m.id;
          S.addMemory(world, cand, 'religion', `Joined ${m.name}.`, 1);
        }
      }
      // Fade, merge, or split
      if (m.strength <= 2) {
        m.active = false;
        for (const c of members) c.movementId = null;
        S.log(world, { title: `${m.name} fades away`, text: `With few left to keep the memory alive, ${m.name} dissolved. ${m.origin ? 'Its story lingers only as a rumour.' : ''}`, level: 1, kind: 'religion' });
        continue;
      }
      const doctrineClash = m.doctrine !== ch.doctrine;
      if (world.t - m.foundedAt > T.DAY * 20) {
        if (!doctrineClash && m.strength > 25 && rng.chance(0.03)) {
          m.active = false;
          ch.strength = U.clamp(ch.strength + m.strength * 0.3, 0, 100);
          for (const c of members) c.movementId = null;
          S.log(world, { title: `${m.name} joins the Church`, text: `${m.name} was absorbed into the ${ch.name}, its founding miracle written into scripture.`, level: 2, kind: 'religion' });
        } else if (doctrineClash && m.strength > 35 && rng.chance(0.02) && !m.schism) {
          m.schism = true;
          ch.strength = U.clamp(ch.strength - 8, 0, 100);
          country.religiousInfluence = U.clamp(country.religiousInfluence - 4, 0, 100);
          S.log(world, { title: 'Schism', text: `${m.name} declared the ${ch.name} blind to the true nature of the divine (${m.doctrine === 'saint' ? 'a living saint' : INTERP_LABEL[m.doctrine]}). The faithful are divided.`, level: 3, kind: 'religion' });
        }
      }
    }
    // Province belief drifts toward the capital's mood and church strength.
    for (const p of world.provinces) {
      if (p.local) {
        p.belief = U.lerp(p.belief, avgBelief, 0.2);
      } else {
        const t = 25 + ch.strength * 0.35 + (country.exposure > 30 ? 6 : 0) - country.literacy * 0.1;
        p.belief = U.clamp(U.lerp(p.belief, t, 0.01) + rng.float(-0.3, 0.3), 0, 100);
      }
    }
    // Science and changing belief: education raises scrutiny, but does not erase faith.
    country.literacy = U.clamp(country.literacy + 0.006 + (country.government === 'democracy' || country.government === 'republic' ? 0.01 : 0), 0, 100);
    country.exposure = U.clamp(country.exposure - 0.15, 0, 100);
  };

  // The Gift: rare people can sense the spectral player.
  S.giftCheck = function (world) {
    const p = world.player;
    if (p.form !== 'spectral') return;
    for (const c of S.living(world)) {
      if (!c.gift || c.asleep) continue;
      if (U.dist(c.x, c.y, p.x, p.y) > 4) continue;
      if (world.t - (c.flags.sensedAt || -99999) < T.DAY) continue;
      c.flags.sensedAt = world.t;
      c.flags.senses = (c.flags.senses || 0) + 1;
      const rng = world.rng;
      let reaction;
      if (c.belief > 55) {
        reaction = 'reverent';
        S.adjustBelief(world, c, 6);
        if (c.flags.senses >= 3 && !c.prophet && c.age >= 16) {
          c.prophet = true;
          S.log(world, { title: 'A prophet emerges', text: `${c.name} has sensed your presence again and again, and now speaks of it openly in the streets.`, level: 2, kind: 'religion', entities: [c.id] });
        }
      } else if (c.traits.skepticism > 0.6) {
        reaction = 'investigating';
        c.traits.skepticism = U.clamp(c.traits.skepticism - 0.03, 0, 1);
      } else reaction = rng.chance(0.5) ? 'frightened' : 'curious';
      const text = {
        reverent: 'Sensed a luminous presence nearby and wept with joy.',
        investigating: 'Saw a shimmer in the air. Is determined to find a rational explanation.',
        frightened: 'Saw a pale light watching. Is frightened.',
        curious: 'Felt something unseen nearby and is curious what it wants.',
      }[reaction];
      S.addMemory(world, c, 'gift', text, 2);
      c.known.beliefs = true;
      S.log(world, { title: `${c.first} senses you`, text: `${c.name} has The Gift and perceives your presence (${reaction}).`, level: 1, kind: 'gift', entities: [c.id] });
    }
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
