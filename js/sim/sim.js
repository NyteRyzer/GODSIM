// Simulation orchestrator: one step = one game minute. Hourly and daily systems run on boundaries.
// The UI never mutates world state directly; it calls the command functions exported here.
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;

  S.MAX_STEPS_PER_CALL = 3000;

  S.stepMinute = function (world) {
    world.t++;
    S.processScheduled(world);
    S.moveCharacters(world);
    S.floodMinute(world);
    S.faithMinute(world);
    S.possessionMinute(world);
    S.observeMinute(world);
    if (world.t % 5 === 0) S.giftCheck(world);
    if (world.t % 60 === 0) S.hourly(world);
    if (T.minuteOfDay(world) === 0) S.daily(world);
  };

  S.hourly = function (world) {
    const hour = T.hour(world);
    for (const id in world.chars) S.hourlyRoutine(world, world.chars[id], hour);
    S.floodRoutineOverrides(world);
    S.floodHourly(world);
    S.generatePrayers(world);
    S.prayersHourly(world);
    S.politicsHourly(world);
    S.humanHourly(world);
    S.worshipHour(world, hour);
    S.updateTier(world);
    S.recomputeFaithRates(world);
  };

  S.daily = function (world) {
    S.dailyLife(world);
    S.dailyReligion(world);
    S.dailyPolitics(world);
    S.dailyCrises(world);
    S.checkChallenge(world);
    const p = T.dateParts(world);
    if (p.month === 0 && p.md === 1) {
      S.yearlyLife(world);
      S.log(world, { title: `The year ${p.year}`, text: `A new year begins in ${world.country.name}.`, level: 1, kind: 'history' });
    }
    const living = S.living(world);
    world.history.push({
      t: world.t, faith: Math.round(world.faith.current), net: world.faith.rates.net, belief: Math.round(living.reduce((s, c) => s + c.belief, 0) / Math.max(1, living.length)),
      legitimacy: Math.round(world.country.legitimacy), stability: Math.round(world.country.stability), exposure: Math.round(world.country.exposure), pop: living.length,
    });
    if (world.history.length > 720) world.history.splice(0, world.history.length - 720);
    world.autosaveDue = true;
  };

  // People with homes on the floodplain behave differently while the river is high.
  S.floodRoutineOverrides = function (world) {
    if (world.flood.stage === 'none' || world.flood.stage === 'receding') return;
    for (const c of S.living(world)) {
      if (c.possessed || c.flags.trapped || c.flags.evacuating || c.flags.detainedUntil > world.t) continue;
      const home = S.building(world, c.homeId);
      if (!home || !S.inFloodZone(home.x + 1, home.y + 1, world)) {
        // Others keep away from the water.
        const dest = S.building(world, c.at) || G.Data.city.zones.find((z) => z.id === c.at);
        if (dest && S.inFloodZone(dest.x + dest.w / 2, dest.y + dest.h / 2, world)) S.goTo(world, c, c.homeId, 'staying away from the flood');
        continue;
      }
      const homeWet = S.isFlooded(world, home.x + 1, home.y + 1);
      const physicallyHome = (S.buildingAt(world, c.x, c.y) || {}).id === c.homeId;
      if (homeWet && physicallyHome) {
        c.at = c.homeId; // the water is at the door: stay put
        c.path = [];
        c.activity = 'waiting out the flood';
      } else if (homeWet) {
        c.flags.evacuating = true; // cannot get home: go to the shelter
        S.goTo(world, c, 'temple', 'sheltering');
      } else {
        S.goTo(world, c, c.homeId, c.age >= 15 ? 'sandbagging the farm' : 'sheltering at home');
      }
    }
  };

  // Worship services generate a pulse of Faith and strengthen belief.
  S.worshipHour = function (world, hour) {
    if (!T.isRestday(world) || hour !== 11) return;
    const att = S.living(world).filter((c) => c.at === 'temple' && (c.activity === 'at worship' || c.activity === 'leading worship'));
    if (!att.length) return;
    const priest = S.char(world, world.church.leaderId);
    const pulse = U.round(att.length * 1.5 * (0.5 + world.church.strength / 100), 1);
    const before = world.faith.current;
    world.faith.current = U.clamp(world.faith.current + pulse, 0, world.faith.capacity);
    world.faith.earned += world.faith.current - before;
    for (const c of att) S.adjustBelief(world, c, priest && priest.alive ? 0.8 : 0.3);
    S.log(world, { title: 'Restday worship', text: `${att.length} gathered at the Temple. (+${pulse} Faith)`, level: 0, kind: 'religion' });
  };

  // Advance the world by real elapsed time scaled by speed. Returns steps run.
  S.advance = function (world, minutes) {
    const n = Math.min(Math.floor(minutes), S.MAX_STEPS_PER_CALL);
    for (let i = 0; i < n; i++) S.stepMinute(world);
    return n;
  };

  // Headless: run an exact number of minutes with no per-call cap (tests, tools).
  S.run = function (world, minutes) {
    for (let i = 0; i < minutes; i++) S.stepMinute(world);
  };

  // ---------- Challenge evaluation ----------
  S.checkChallenge = function (world) {
    const ch = world.challenge;
    if (ch.status !== 'active') return;
    const def = G.Data.challenges[ch.id];
    const c = world.country;
    const day = Math.floor(world.t / T.DAY);
    const fail = (why) => {
      ch.status = 'lost';
      S.log(world, { title: `Challenge failed: ${def.name}`, text: why, level: 3, kind: 'challenge', alert: true });
    };
    const win = (why) => {
      ch.status = 'won';
      S.log(world, { title: `Challenge complete: ${def.name}`, text: why, level: 3, kind: 'challenge', alert: true });
    };
    if (ch.id === 'silent') {
      ch.progress = day / def.days;
      if (c.exposure > 20) return fail('Too many people saw what you did. The age of silence is over.');
      if (world.church.strength < 45 && day > 30) return fail('The Church withered without signs.');
      if (day >= def.days) return win('Two years of quiet faith. The Church endures without a single public wonder.');
    } else if (ch.id === 'empire') {
      if (ch.possessedRuler) return fail('You seized the ruler directly. That is not an empire of faith.');
      if (c.religiousInfluence >= 85) ch.holdDays++;
      else ch.holdDays = 0;
      ch.progress = ch.holdDays / 60;
      if (ch.holdDays >= 60) return win('Faith shapes every law and every heart, and no one forced it.');
    } else if (ch.id === 'brink') {
      ch.progress = day / def.days;
      if (c.stability < 25 && day > 5) return fail('The kingdom tipped into collapse.');
      if (day >= def.days) return win('Velmora walked the edge of the abyss and did not fall.');
    } else if (ch.id === 'handsoff') {
      ch.progress = day / def.days;
      if (ch.miracles > def.maxMiracles) return fail('You could not keep your hands off.');
      if (day >= def.days) return c.stability >= 45 ? win('Humanity found its own way, with only the lightest touch.') : fail('Humanity floundered without you.');
    }
  };

  // ---------- Commands (the UI's only way to change the world) ----------
  S.command = function (world, cmd) {
    switch (cmd.type) {
      case 'ability':
        return S.useAbility(world, cmd.ability, cmd.target, cmd.option);
      case 'prayer':
        return S.respondPrayer(world, cmd.prayerId, cmd.kind);
      case 'form':
        return S.setForm(world, cmd.form, cmd.targetId);
      case 'possessedAct':
        return S.possessedAct(world, cmd.act);
      case 'humanAct':
        return S.humanAct(world, cmd.act);
      case 'speakGifted': {
        const c = S.char(world, cmd.targetId);
        if (!c || !c.gift) return { ok: false, msg: 'They cannot hear you.' };
        if (world.player.form !== 'spectral') return { ok: false, msg: 'Only in spectral form.' };
        if (U.dist(c.x, c.y, world.player.x, world.player.y) > 4) return { ok: false, msg: 'Move closer.' };
        if (!S.spendFaith(world, 3, 'Whisper')) return { ok: false, msg: 'Not enough Faith (3).' };
        c.known.traits = c.known.beliefs = c.known.memories = true;
        S.adjustBelief(world, c, c.belief > 40 ? 3 : -1);
        S.addMemory(world, c, 'gift', 'Heard a voice that no one else could hear.', 2);
        const r = S.rumour(world, c);
        return { ok: true, msg: `${c.first} hears you.${r ? ` They whisper back: "${r}"` : ' They whisper back that they will listen.'}` };
      }
      default:
        return { ok: false, msg: 'Unknown command' };
    }
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
