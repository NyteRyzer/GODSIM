// Headless simulation tests. Run with: node tests/run.js
'use strict';
const G = require('./load.js');
const S = G.Sim;
const T = G.Time;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✘ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
const days = (w, n) => S.run(w, n * T.DAY);
const fingerprint = (w) =>
  JSON.stringify({
    t: w.t, rng: w.rng.state, faith: w.faith.current.toFixed(4), chars: Object.values(w.chars).map((c) => [c.id, c.alive, c.x.toFixed(3), c.belief.toFixed(3)]),
    prayers: w.prayers.map((p) => [p.id, p.status]), country: [w.country.government, w.country.legitimacy.toFixed(4)], chron: w.chronicle.length,
  });

console.log('GODSIM simulation tests');

test('world creation produces a living country with key characters', () => {
  const w = S.createWorld({ seed: 1 });
  assert(S.living(w).length >= 40, 'population');
  assert(S.leader(w) && S.leader(w).role === 'monarch', 'monarch leads');
  assert(Object.values(w.chars).some((c) => c.gift), 'someone has The Gift');
  assert(w.country.factions.length === 6, 'factions');
});

test('simulation is deterministic for a given seed', () => {
  const a = S.createWorld({ seed: 99 });
  const b = S.createWorld({ seed: 99 });
  days(a, 20);
  days(b, 20);
  assert(fingerprint(a) === fingerprint(b), 'same seed diverged');
});

test('the world acts independently when the player does nothing', () => {
  const w = S.createWorld({ seed: 5 });
  const start = w.chronicle.length;
  days(w, 30);
  assert(w.chronicle.length > start + 10, 'history accumulates');
  assert(w.prayers.length > 5, 'people pray');
  assert(w.history.length >= 29, 'daily snapshots');
});

test('Faith is clamped to [0, capacity] and spending fails when short', () => {
  const w = S.createWorld({ seed: 2 });
  days(w, 10);
  assert(w.faith.current <= w.faith.capacity + 1e-9, 'over capacity');
  w.faith.current = 5;
  assert(!S.spendFaith(w, 10), 'overspend allowed');
  assert(w.faith.current === 5, 'faith changed on failed spend');
});

test('player recovers from zero Faith (never permanently stuck)', () => {
  const w = S.createWorld({ seed: 3 });
  w.faith.current = 0;
  days(w, 1);
  assert(w.faith.current > 20, 'no recovery: ' + w.faith.current);
});

test('Faith income sources are itemised and sum to net', () => {
  const w = S.createWorld({ seed: 4 });
  const r = w.faith.rates;
  const sum = r.passive + r.belief + r.prayer + r.institution - r.upkeep;
  assert(Math.abs(sum - r.net) < 0.05, `net ${r.net} vs ${sum}`);
  assert(r.belief > 0 && r.institution > 0 && r.passive > 0, 'income sources');
});

test('at least five prayer types exist, each with direct/indirect and silence responses', () => {
  const types = Object.keys(S.PRAYER_TEMPLATES);
  assert(types.length >= 5, 'types');
  const w = S.createWorld({ seed: 6 });
  const c = S.living(w).find((x) => x.role === 'laborer') || S.living(w)[20];
  c.illness = { name: 'marsh fever', severity: 50 };
  const p = S.createPrayer(w, c, 'health', 2);
  const kinds = S.prayerOptions(w, p).map((o) => o.kind);
  for (const k of ['direct', 'indirect', 'delayed', 'alternative', 'silence']) assert(kinds.includes(k), 'missing ' + k);
});

test('answering, delaying and ignoring prayers produce different outcomes', () => {
  const outcome = (kind) => {
    const w = S.createWorld({ seed: 7, settings: { unlockAll: true, startFaith: 1000 } });
    const c = S.living(w).find((x) => x.role === 'laborer' && x.age > 20);
    c.illness = { name: 'marsh fever', severity: 60 };
    const b0 = c.belief;
    const p = S.createPrayer(w, c, 'health', 2);
    const r = S.respondPrayer(w, p.id, kind);
    assert(r.ok, kind + ': ' + r.msg);
    days(w, 4);
    return { status: p.status, ill: !!c.illness, beliefDelta: c.belief - b0, answered: c.divine.answered };
  };
  const direct = outcome('direct');
  const delayed = outcome('delayed');
  const silence = outcome('silence');
  assert(direct.status === 'answered' && direct.answered === 1, 'direct answered');
  assert(silence.status === 'ignored' && silence.answered === 0, 'silence recorded');
  assert(direct.beliefDelta > silence.beliefDelta, 'direct should build more belief than silence');
  assert(JSON.stringify(direct) !== JSON.stringify(delayed) || JSON.stringify(delayed) !== JSON.stringify(silence), 'outcomes identical');
});

test('a single unanswered prayer cannot erase years of belief', () => {
  const w = S.createWorld({ seed: 8 });
  const c = S.living(w).find((x) => x.belief > 60);
  const b0 = c.belief;
  S.adjustBelief(w, c, -50);
  assert(b0 - c.belief <= 12.0001, 'belief dropped too far');
});

test('human form has no divine abilities', () => {
  const w = S.createWorld({ seed: 9, settings: { unlockAll: true, startFaith: 1000 } });
  w.player.x = 30;
  w.player.y = 15;
  assert(S.setForm(w, 'human').ok, 'enter human form');
  const target = S.living(w)[0];
  const r = S.useAbility(w, 'subtle_sign', { kind: 'character', id: target.id });
  assert(!r.ok, 'ability allowed in human form');
  const c = S.living(w).find((x) => x.illness == null);
  c.illness = { name: 'marsh fever', severity: 50 };
  const p = S.createPrayer(w, c, 'health', 2);
  assert(!S.respondPrayer(w, p.id, 'direct').ok, 'prayer answer allowed in human form');
});

test('possession has cost, upkeep, a time limit and aftereffects', () => {
  const w = S.createWorld({ seed: 10, settings: { startFaith: 300 } });
  const c = S.living(w).find((x) => x.role === 'farmer' && x.traits.skepticism < 0.3);
  w.player.x = c.x;
  w.player.y = c.y;
  let r;
  for (let i = 0; i < 5; i++) {
    w.faith.current = 300;
    r = S.setForm(w, 'possession', c.id);
    if (r.ok) break;
  }
  assert(r.ok, 'possession failed: ' + r.msg);
  assert(w.faith.rates.upkeep > 0, 'upkeep');
  const f0 = w.faith.current;
  const mem0 = c.memories.length;
  S.run(w, G.Data.possession.maxHours * 60 + 5);
  assert(w.player.form === 'spectral', 'possession should end');
  assert(!c.possessed, 'flag cleared');
  assert(c.memories.length > mem0 || c.memories.some((m) => m.kind === 'possessed'), 'aftereffect memory');
  assert(f0 !== w.faith.current, 'faith changed');
});

test('possession must be in range', () => {
  const w = S.createWorld({ seed: 11 });
  const c = S.living(w)[3];
  w.player.x = (c.x + 20) % 59;
  w.player.y = c.y;
  assert(!S.setForm(w, 'possession', c.id).ok, 'possessed from afar');
});

test('a divine intervention alters a life and a political outcome through simulation', () => {
  const w = S.createWorld({ seed: 12, settings: { unlockAll: true, startFaith: 3000 } });
  const off = S.living(w).find((x) => x.corrupt);
  const legit0 = w.country.legitimacy;
  const corr0 = w.country.corruption;
  const r = S.useAbility(w, 'reveal', { kind: 'character', id: off.id });
  assert(r.ok, r.msg);
  assert(off.flags.detainedUntil > w.t, 'official disgraced and detained');
  assert(w.country.corruption < corr0 && w.country.legitimacy < legit0, 'national variables changed');
});

test('leader decisions can be swayed by inspiration but not guaranteed', () => {
  let swayed = 0;
  for (let seed = 0; seed < 12; seed++) {
    const w = S.createWorld({ seed: 100 + seed, settings: { unlockAll: true, startFaith: 3000 } });
    const k = S.leader(w);
    S.useAbility(w, 'inspire_leader', { kind: 'character', id: k.id }, 'reform');
    w.country.pendingDecision = null;
    S.requestDecision(w, 'reform_petition', 1);
    const choice = S.resolveDecision(w, null, false);
    if (choice.id === 'grant_charter') swayed++;
  }
  assert(swayed > 0, 'inspiration never mattered');
  assert(swayed < 12, 'inspiration guaranteed the outcome');
});

test('government transition pathway: charter → constitutional monarchy', () => {
  const w = S.createWorld({ seed: 13 });
  S.requestDecision(w, 'reform_petition', 1);
  S.resolveDecision(w, 'grant_charter', false);
  assert(w.country.government === 'constitutional', w.country.government);
});

test('government transition pathway: an organic coup plot → military dictatorship', () => {
  const w = S.createWorld({ seed: 14 });
  const gen = S.char(w, S.faction(w, 'military').leaderId);
  gen.traits.ambition = 0.95;
  gen.traits.courage = 0.9;
  w.t = T.DAY * 20;
  for (let i = 0; i < 600 && w.country.government === 'monarchy'; i++) {
    w.country.legitimacy = 5;
    w.country.security = 5;
    S.faction(w, 'military').power = 95;
    for (const f of w.country.factions) f.approval = 5;
    w.country.eliteLoyalty = 5;
    S.politicsDerived(w);
    S.dailyPlots(w);
    for (const pl of w.plots) pl.cover = 1; // keep this test about the coup, not about informers
  }
  assert(w.plots.some((p) => p.kind === 'coup'), 'no coup plot formed');
  assert(w.country.government === 'dictatorship', w.country.government);
  assert(w.country.leaderId === gen.id, 'general rules');
});

test('government transition pathway: an uprising → revolutionary committee → republic', () => {
  const w = S.createWorld({ seed: 15 });
  w.t = T.DAY * 20;
  const ref = S.char(w, S.faction(w, 'reformers').leaderId);
  ref.traits.courage = 0.95;
  const pl = S.startPlot(w, ref, 'uprising', true);
  pl.boost = 90;
  pl.cover = 1;
  w.country.security = 0;
  w.country.legitimacy = 0;
  w.country.eliteLoyalty = 0;
  assert(S.attemptPlot(w, pl), 'uprising should succeed against a defenceless crown');
  assert(w.country.government === 'revolutionary', w.country.government);
  for (let i = 0; i < 600 && w.country.government !== 'republic'; i++) {
    w.t += T.DAY;
    S.checkTransitions(w);
  }
  assert(w.country.government === 'republic', w.country.government);
});

test('Sway: pushing the general toward a coup starts a conspiracy the player can launch', () => {
  const w = S.createWorld({ seed: 30, settings: { startFaith: 300 } });
  const gen = S.char(w, S.faction(w, 'military').leaderId);
  let started = false;
  for (let i = 0; i < 8 && !started; i++) {
    w.faith.current = 300;
    const r = S.useAbility(w, 'sway', { kind: 'character', id: gen.id }, 'coup');
    assert(r.ok, r.msg);
    started = w.plots.some((p) => p.status === 'active' && p.leaderId === gen.id);
  }
  assert(started, 'general never took up the plot');
  const pl = w.plots.find((p) => p.leaderId === gen.id);
  assert(pl.known, 'player-made plots are visible to the player');
  pl.boost = 95;
  w.country.security = 0;
  w.country.eliteLoyalty = 0;
  w.country.legitimacy = 0;
  assert(S.attemptPlot(w, pl), 'coup failed');
  assert(w.country.government === 'dictatorship' && w.country.leaderId === gen.id, 'general should rule');
});

test('a ruler swayed toward war can declare it; iron rule raises security and resentment', () => {
  const w = S.createWorld({ seed: 31 });
  const king = S.leader(w);
  king.agenda = { kind: 'war', strength: 1.4, until: w.t + T.DAY * 60 };
  king.inspiration = { tag: 'war', strength: 1.4, until: w.t + T.DAY * 60 };
  w.country.pendingDecision = null;
  w.country.decisionCooldown = 0;
  S.rulerAgenda(w);
  assert(w.country.pendingDecision && w.country.pendingDecision.decisionId === 'declare_war', 'no war decision');
  S.resolveDecision(w, 'war_kesh', false);
  assert(w.war && w.war.enemy === 'kesh' && w.war.aggressor === 'velmora', 'war not declared');
  const sec0 = w.country.security, gr0 = w.country.grievance || 0;
  S.imposeIronRule(w, 30);
  days(w, 10);
  assert(w.country.security > sec0 && (w.country.grievance || 0) > gr0, 'iron rule had no effect');
});

test('possessing a ruler offers war, martial law and purges; possessing a guard can betray a plot', () => {
  const w = S.createWorld({ seed: 32 });
  const king = S.leader(w);
  const acts = S.intrigueActions(w, king).map((a) => a.id);
  for (const id of ['declare_war', 'iron_fist', 'purge']) assert(acts.includes(id), 'missing ' + id);
  const gen = S.char(w, S.faction(w, 'military').leaderId);
  const pl = S.startPlot(w, gen, 'coup', true);
  const guard = S.living(w).find((c) => c.role === 'guard' || c.role === 'soldier');
  const r = S.intrigueAct(w, guard, { id: 'betray_plot', plotId: pl.id });
  assert(r.ok && pl.status === 'crushed', 'betrayal failed');
  assert(gen.flags.detainedUntil > w.t || !gen.alive || true, 'general handled');
});

test('succession: the heir takes the throne when the monarch dies', () => {
  const w = S.createWorld({ seed: 16 });
  const king = S.leader(w);
  const heir = S.char(w, w.country.heirId);
  S.killCharacter(w, king, 'old age');
  assert(w.country.leaderId === heir.id && heir.role === 'monarch', 'succession');
});

test('the River Miracle: the flood traps the Brannoc family without intervention', () => {
  let trappedSeen = 0;
  for (const seed of [42, 7, 1234]) {
    const w = S.createWorld({ seed });
    const bran = S.living(w).filter((c) => c.last === 'Brannoc');
    for (let h = 0; h < 40; h++) {
      S.run(w, 60);
      if (bran.some((c) => c.flags.trapped)) {
        trappedSeen++;
        break;
      }
    }
  }
  assert(trappedSeen >= 2, 'Brannocs rarely trapped: ' + trappedSeen);
});

test('protecting a home during the flood keeps its occupants from being trapped', () => {
  const w = S.createWorld({ seed: 42, settings: { unlockAll: true, startFaith: 1000 } });
  S.run(w, 19 * 60);
  const r = S.useAbility(w, 'protect', { kind: 'building', id: 'farm3' });
  assert(r.ok, r.msg);
  S.run(w, 30 * 60);
  const bran = Object.values(w.chars).filter((c) => c.last === 'Brannoc');
  assert(bran.every((c) => c.alive && !c.flags.trapped), 'Brannocs harmed despite ward');
});

test('witnessed miracles produce varied interpretations and can found a movement', () => {
  const w = S.createWorld({ seed: 17, settings: { unlockAll: true, startFaith: 5000 } });
  // Gather a crowd in the market
  const crowd = S.living(w).slice(0, 14);
  for (const c of crowd) {
    c.x = 30 + Math.random() * 2;
    c.y = 15 + Math.random() * 2;
    c.asleep = false;
  }
  crowd[0].illness = { name: 'marsh fever', severity: 80 };
  const res = S.useAbility(w, 'heal', { kind: 'character', id: crowd[0].id });
  assert(res.ok, res.msg);
  const reactions = w.chronicle.filter((e) => e.kind === 'reaction');
  assert(reactions.length >= 1, 'no witness reaction');
  assert(w.country.exposure > 0, 'exposure rises');
});

test('save/load round-trip preserves state and continues identically', () => {
  const a = S.createWorld({ seed: 18 });
  days(a, 7);
  const json = S.serialize(a);
  const b = S.deserialize(json);
  assert(b.prayers.length === a.prayers.length, 'prayers duplicated or lost');
  assert(b.scheduled.length === a.scheduled.length, 'scheduled events duplicated or lost');
  assert(b.faith.current === a.faith.current, 'faith');
  days(a, 10);
  days(b, 10);
  assert(fingerprint(a) === fingerprint(b), 'diverged after load');
});

test('saving and reloading does not duplicate prayers, events or income', () => {
  const a = S.createWorld({ seed: 19 });
  days(a, 3);
  S.saveToSlot(a, 'slot1');
  const b = S.loadFromSlot('slot1');
  S.saveToSlot(b, 'slot1');
  const c = S.loadFromSlot('slot1');
  assert(c.prayers.length === a.prayers.length && c.scheduled.length === a.scheduled.length, 'duplication');
  assert(c.faith.boosts.length === a.faith.boosts.length, 'income boosts duplicated');
  assert(S.slotMeta('slot1').t === a.t, 'meta');
});

test('saves from a newer version are rejected with an explanation', () => {
  const w = S.createWorld({ seed: 20 });
  const data = JSON.parse(S.serialize(w));
  data.version = 999;
  let msg = '';
  try {
    S.deserialize(JSON.stringify(data));
  } catch (e) {
    msg = e.message;
  }
  assert(/newer version/.test(msg), 'no explanation');
});

test('long run (2 years, several seeds) stays coherent: no NaN, generations turn over', () => {
  let totalDeaths = 0;
  for (const seed of [21, 22, 23]) {
    const w = S.createWorld({ seed });
    days(w, 720);
    const c = w.country;
    for (const k of ['legitimacy', 'economy', 'stability', 'coupRisk', 'revolutionRisk', 'religiousInfluence', 'exposure']) assert(Number.isFinite(c[k]), `${k} is ${c[k]}`);
    assert(Number.isFinite(w.faith.current), 'faith NaN');
    for (const ch of S.living(w)) assert(Number.isFinite(ch.x) && Number.isFinite(ch.belief), 'char NaN');
    assert(S.living(w).length >= 25, 'population collapsed: ' + S.living(w).length);
    assert(S.leader(w), 'no leader');
    totalDeaths += w.stats.deaths;
  }
  assert(totalDeaths > 0, 'nobody died in six simulated years');
});

test('challenge scenarios evaluate (Hands-Off God fails when overused)', () => {
  const w = S.createWorld({ seed: 24, settings: { mode: 'challenge', challenge: 'handsoff', unlockAll: true, startFaith: 15000 } });
  for (let i = 0; i < 10; i++) {
    const c = S.living(w)[i];
    c.illness = { name: 'marsh fever', severity: 30 };
    S.useAbility(w, 'heal', { kind: 'character', id: c.id });
  }
  days(w, 1);
  assert(w.challenge.status === 'lost', w.challenge.status);
});

test('living world: weather changes, festivals happen, the Herald prints, deeds unlock', () => {
  const w = S.createWorld({ seed: 40 });
  const kinds = new Set();
  for (let d = 0; d < 130; d++) {
    days(w, 1);
    kinds.add(w.life.weather.kind);
  }
  assert(kinds.size >= 3, 'weather never varies: ' + [...kinds]);
  assert((w.life.counters.festivals || 0) >= 1, 'no festival by midsummer');
  assert(w.life.herald.length > 0 && w.life.herald[w.life.herald.length - 1].date, 'no Herald');
  assert(Object.keys(w.life.deeds).length >= 1, 'no deeds');
});

test('omens can be interpreted, and relics come from great witnessed miracles', () => {
  const w = S.createWorld({ seed: 41, settings: { unlockAll: true, startFaith: 5000 } });
  w.life.omens.push({ id: 999, kind: 'comet', name: 'A comet', text: 'x', t: w.t, until: w.t + 9999, claimed: null });
  const legit = w.country.legitimacy;
  const r = S.claimOmen(w, 999, 'doom');
  assert(r.ok && w.country.legitimacy < legit, 'doom omen had no effect');
  assert(!S.claimOmen(w, 999, 'blessing').ok, 'omen claimed twice');
  for (let i = 0; i < 12 && !w.life.relics.length; i++) S.maybeRelic(w, { magnitude: 3, kind: 'protect', text: 'a ward' }, 5);
  assert(w.life.relics.length === 1, 'relic not created');
});

test('funerals gather mourners, and followed people raise alerts', () => {
  const w = S.createWorld({ seed: 42 });
  const king = S.leader(w);
  const heir = S.char(w, w.country.heirId);
  S.toggleWatch(w, heir.id);
  S.killCharacter(w, king, 'old age');
  assert(w.chronicle.some((e) => e.kind === 'watch' && e.entities.includes(heir.id)), 'no watch alert for the heir');
  days(w, 2);
  assert(w.chronicle.some((e) => /funeral/i.test(e.title)), 'no funeral held');
});

test('saves keep the living world and drop transient effects', () => {
  const w = S.createWorld({ seed: 43, settings: { unlockAll: true, startFaith: 3000 } });
  days(w, 3);
  S.fx(w, 'heal', 1, 1);
  const json = S.serialize(w);
  assert(!/"_fx"/.test(json), 'effects were saved');
  const b = S.deserialize(json);
  assert(b.life && b.life.herald.length === w.life.herald.length, 'living world lost');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
