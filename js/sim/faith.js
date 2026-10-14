// The Faith economy. Net Faith = passive + belief + prayer + institutional - upkeep, clamped to [0, capacity].
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;

  S.updateTier = function (world) {
    const f = world.faith;
    // Divine renown: long-term play counts, but acting in the world counts more.
    f.renown = f.earned * 0.3 + f.spent * 0.7;
    let tier = 1;
    for (const t of G.Data.tiers) if (f.renown >= t.earned) tier = t.tier;
    if (world.settings.unlockAll) tier = 4;
    if (tier > f.tier && world.t > 0) {
      const info = G.Data.tiers[tier - 1];
      S.log(world, { title: `You have become ${info.title}`, text: `New powers: ${info.unlocks}.`, level: 2, kind: 'divine' });
    }
    f.tier = Math.max(f.tier, tier);
    f.capacity = G.Data.tiers[f.tier - 1].capacity + (world.settings.capacityBonus || 0);
  };

  // Rates are recomputed hourly and applied per minute (per hour units throughout).
  S.recomputeFaithRates = function (world) {
    const f = world.faith;
    const country = world.country;
    const phil = G.Data.philosophies[world.player.philosophy] || {};
    // Passive regeneration keeps the player from ever being permanently stuck.
    let passive = 1.2;
    if (phil.abstainBonus && world.t - f.lastMiracleAt > T.DAY * 3) passive *= phil.abstainBonus * 1.4;
    // Belief: intense devotion counts for more than loose affiliation.
    let belief = 0;
    const exposureMult = 1 + country.exposure / 200;
    for (const c of S.living(world)) {
      const b = c.belief / 100;
      belief += b * b * 0.22;
    }
    for (const p of world.provinces) {
      if (p.local) continue;
      const b = p.belief / 100;
      belief += p.pop * b * b * 0.1;
    }
    belief *= exposureMult;
    // Prayer-related: gratitude after answered prayers.
    let prayer = 0;
    f.boosts = f.boosts.filter((b) => b.until > world.t);
    for (const b of f.boosts) prayer += b.perHour;
    // Institutional: the church and organised movements.
    let institution = world.church.strength * 0.03 * (0.5 + country.religiousInfluence / 100);
    for (const m of world.movements) if (m.active) institution += m.strength * 0.02;
    // Upkeep
    let upkeep = 0;
    const upkeepItems = [];
    if (world.player.form === 'possession') {
      upkeep += G.Data.possession.upkeepPerHour;
      upkeepItems.push(['Possession', G.Data.possession.upkeepPerHour]);
    }
    for (const b of world.buildings) {
      if (b.protectedUntil > world.t) {
        upkeep += 2;
        upkeepItems.push([`Ward on ${b.name}`, 2]);
      }
    }
    f.rates = {
      passive: U.round(passive, 2), belief: U.round(belief, 2), prayer: U.round(prayer, 2), institution: U.round(institution, 2),
      upkeep: U.round(upkeep, 2), upkeepItems, net: U.round(passive + belief + prayer + institution - upkeep, 2),
    };
  };

  S.faithMinute = function (world) {
    const f = world.faith;
    const gain = (f.rates.passive + f.rates.belief + f.rates.prayer + f.rates.institution) / 60;
    const loss = f.rates.upkeep / 60;
    const before = f.current;
    f.current = U.clamp(f.current + gain - loss, 0, f.capacity);
    // Faith that overflows capacity is wasted and does not count toward renown.
    f.earned += Math.max(0, Math.min(gain, f.current - before + loss));
    if (f.current <= 0 && world.player.form === 'possession') S.endPossession(world, 'Your Faith ran dry and the possession broke.');
  };

  S.spendFaith = function (world, amount, what) {
    const f = world.faith;
    if (amount > f.current + 1e-6) return false;
    f.current -= amount;
    f.spent += amount;
    if (what) f.lastSpend = { what, amount, t: world.t };
    return true;
  };

  S.addGratitude = function (world, c, hours = 24) {
    const perHour = U.round(0.4 + (c.belief / 100) * 1.6, 2);
    world.faith.boosts.push({ perHour, until: world.t + hours * 60, source: c.name });
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
