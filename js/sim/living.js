// The living world: seasons, weather, festivals, omens, relics and pilgrims, rumours, ceremonies,
// the daily Herald, deeds (achievements) and the watchlist.
(function (G) {
  'use strict';
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;
  const H = S.handlers;

  // ---------- data ----------
  G.Data.seasons = {
    spring: { name: 'Spring', months: [1, 2, 3] },
    summer: { name: 'Summer', months: [4, 5] },
    autumn: { name: 'Autumn', months: [6, 7, 8] },
    winter: { name: 'Winter', months: [9, 10, 11, 0] },
  };
  G.Data.weather = {
    clear: { name: 'Clear', icon: '☀', outdoors: 1, visibility: 1 },
    cloudy: { name: 'Overcast', icon: '☁', outdoors: 0.9, visibility: 1 },
    rain: { name: 'Rain', icon: '🌧', outdoors: 0.5, visibility: 0.85 },
    storm: { name: 'Storm', icon: '⛈', outdoors: 0.15, visibility: 0.7 },
    fog: { name: 'Fog', icon: '🌫', outdoors: 0.8, visibility: 0.5 },
    snow: { name: 'Snow', icon: '❄', outdoors: 0.6, visibility: 0.8 },
  };
  // Markov weights per season: next weather kind
  const WEATHER_TABLE = {
    spring: { clear: 4, cloudy: 3, rain: 3, storm: 0.6, fog: 1, snow: 0 },
    summer: { clear: 7, cloudy: 2, rain: 1.2, storm: 0.8, fog: 0.3, snow: 0 },
    autumn: { clear: 3, cloudy: 4, rain: 3, storm: 0.7, fog: 2, snow: 0.2 },
    winter: { clear: 3, cloudy: 4, rain: 1, storm: 0.4, fog: 1.5, snow: 3.5 },
  };
  G.Data.festivals = [
    { id: 'blessing', name: 'Spring Blessing', month: 3, md: 1, place: 'temple', activity: 'at the Spring Blessing', desc: 'Seeds are blessed at the Temple before planting.' },
    { id: 'fair', name: 'Midsummer Fair', month: 4, md: 15, place: 'market', activity: 'at the Midsummer Fair', desc: 'Stalls, music and dancing fill the Market Square.' },
    { id: 'harvest', name: 'Harvest Festival', month: 6, md: 20, place: 'market', activity: 'at the Harvest Festival', desc: 'The first sheaves are carried through the streets.' },
    { id: 'vigil', name: 'Midwinter Vigil', month: 11, md: 15, place: 'temple', activity: 'keeping the Midwinter Vigil', desc: 'Candles burn all night at the Temple.' },
  ];
  G.Data.omens = [
    { id: 'comet', name: 'A comet', text: 'A comet with a burning tail hangs over Thornhaven.', days: 6 },
    { id: 'eclipse', name: 'An eclipse', text: 'The sun went dark at midday and the birds fell silent.', days: 1 },
    { id: 'blood_moon', name: 'A blood moon', text: 'The moon rose red as a wound.', days: 2 },
    { id: 'white_stag', name: 'A white stag', text: 'A white stag was seen at the edge of the North Fields.', days: 2 },
    { id: 'crows', name: 'A gathering of crows', text: 'Hundreds of crows gathered on the palace roof and would not leave.', days: 2 },
    { id: 'twin_rainbow', name: 'A double rainbow', text: 'Two rainbows arched over the river at once.', days: 1 },
  ];
  G.Data.omenMeanings = {
    blessing: { label: 'A blessing on the realm', desc: 'Believers take heart; the ruler gains legitimacy.' },
    warning: { label: 'A warning to be careful', desc: 'Conspirators lose nerve; war fever cools.' },
    doom: { label: 'Doom for the ruler', desc: 'Legitimacy falls; conspiracies grow bolder.' },
    calling: { label: 'A prophet will rise', desc: 'The most devout person in the city is called to prophecy.' },
  };
  G.Data.deeds = [
    { id: 'first_miracle', name: 'First Light', desc: 'Perform your first miracle.', check: (w) => w.faith.miracles >= 1 },
    { id: 'healer', name: 'The Healing Hand', desc: 'Heal five people.', check: (w) => (w.life.counters.heal || 0) >= 5 },
    { id: 'answered25', name: 'One Who Listens', desc: 'Answer 25 prayers.', check: (w) => w.stats.answered >= 25 },
    { id: 'answered100', name: 'The Ever-Present', desc: 'Answer 100 prayers.', check: (w) => w.stats.answered >= 100 },
    { id: 'prophet', name: 'A Voice in the Market', desc: 'See a prophet rise.', check: (w) => S.living(w).some((c) => c.prophet) },
    { id: 'movement', name: 'Gathered in Your Name', desc: 'Inspire a new religious movement.', check: (w) => w.movements.length > 0 },
    { id: 'relic', name: 'Holy Relic', desc: 'A relic is enshrined in the Temple.', check: (w) => w.life.relics.length > 0 },
    { id: 'omen', name: 'Reader of the Sky', desc: 'Interpret an omen for the people.', check: (w) => w.life.omens.some((o) => o.claimed) },
    { id: 'flood_saved', name: 'The Waters Parted', desc: 'See a flood end with no lives lost.', check: (w) => w.chronicle.some((e) => e.title === 'The flood is over' && /no lives were lost/.test(e.text)) },
    { id: 'possessed_ruler', name: 'The Hand Behind the Throne', desc: 'Possess the ruler.', check: (w) => w.challenge.possessedRuler || (w.life.counters.possessRuler || 0) > 0 },
    { id: 'coup', name: 'Kingmaker', desc: 'A conspiracy you encouraged seizes power.', check: (w) => w.plots.some((p) => p.byPlayer && p.status === 'succeeded') },
    { id: 'war_won', name: 'Lord of Hosts', desc: 'Velmora wins a war.', check: (w) => w.chronicle.some((e) => e.kind === 'war' && e.title === 'Victory') },
    { id: 'regime', name: 'Turner of Ages', desc: 'Witness a change of government.', check: (w) => w.chronicle.some((e) => e.kind === 'regime' && /→/.test(e.title)) },
    { id: 'festival', name: 'Joy of the People', desc: 'Watch a festival be celebrated.', check: (w) => (w.life.counters.festivals || 0) > 0 },
    { id: 'walk', name: 'Among Them', desc: 'Walk among mortals in human form.', check: (w) => (w.life.counters.humanForm || 0) > 0 },
    { id: 'tier3', name: 'World Shaper', desc: 'Reach the third tier of power.', check: (w) => w.faith.tier >= 3 },
    { id: 'tier4', name: 'Architect of Creation', desc: 'Reach the highest tier of power.', check: (w) => w.faith.tier >= 4 },
    { id: 'decade', name: 'A Decade Watched', desc: 'Guide Velmora for ten years.', check: (w) => w.t >= T.DAY * T.YEAR_DAYS * 10 },
    { id: 'schism', name: 'House Divided', desc: 'See the faithful split in schism.', check: (w) => w.chronicle.some((e) => e.title === 'Schism') },
    { id: 'herald', name: 'Front Page', desc: 'Your deeds make the Herald\'s headline.', check: (w) => w.life.herald.some((h) => h.headlines.some((x) => x.divine)) },
  ];

  // ---------- state ----------
  S.initLife = function (world) {
    if (world.life) return world.life;
    world.life = {
      weather: { kind: 'cloudy', since: world.t, until: world.t + 6 * 60 },
      festival: null, omens: [], relics: [], rumours: [], herald: [], heraldUnread: false,
      deeds: {}, watch: [], counters: {}, pilgrimsToday: 0,
    };
    return world.life;
  };
  S.count = (world, key, n = 1) => {
    const l = S.initLife(world);
    l.counters[key] = (l.counters[key] || 0) + n;
  };

  S.season = function (world) {
    const m = T.dateParts(world).month;
    for (const id in G.Data.seasons) if (G.Data.seasons[id].months.includes(m)) return Object.assign({ id }, G.Data.seasons[id]);
    return { id: 'spring', name: 'Spring' };
  };
  S.weather = (world) => G.Data.weather[(world.life && world.life.weather.kind) || 'clear'];
  S.visibility = (world) => S.weather(world).visibility;

  // Visual effects queue for the UI (transient, never saved: keys starting with "_" are skipped by serialize).
  S.fx = function (world, kind, x, y, extra) {
    if (!world._fx) world._fx = [];
    world._fx.push(Object.assign({ id: (world._fxId = (world._fxId || 0) + 1), kind, x, y, t: world.t }, extra || {}));
    if (world._fx.length > 40) world._fx.shift();
  };

  // ---------- weather ----------
  function rollWeather(world) {
    const l = world.life;
    const rng = world.rng;
    const fl = world.flood.stage;
    let kind;
    if (fl === 'warning' || fl === 'rising') kind = rng.chance(0.4) ? 'storm' : 'rain';
    else if (fl === 'flooding') kind = 'rain';
    else {
      const tbl = WEATHER_TABLE[S.season(world).id];
      const keys = Object.keys(tbl);
      // Weather tends to persist.
      kind = rng.chance(0.35) ? l.weather.kind : rng.weighted(keys, (k) => tbl[k]);
      if (kind === 'snow' && S.season(world).id !== 'winter') kind = 'rain';
    }
    const prev = l.weather.kind;
    l.weather = { kind, since: world.t, until: world.t + rng.int(4, 14) * 60 };
    if (kind === 'storm' && prev !== 'storm') S.log(world, { title: 'A storm breaks', text: 'Thunder rolls over Thornhaven. People hurry indoors.', level: 1, kind: 'weather' });
    if (kind === 'snow' && prev !== 'snow') S.log(world, { title: 'Snow', text: 'Snow begins to fall over the rooftops.', level: 0, kind: 'weather' });
    if (kind === 'fog' && prev !== 'fog') S.log(world, { title: 'Fog rolls in', text: 'A thick fog creeps up from the river. Anything done now will have fewer witnesses.', level: 0, kind: 'weather' });
  }

  S.lifeHourly = function (world, hour) {
    const l = S.initLife(world);
    const rng = world.rng;
    if (world.t >= l.weather.until) rollWeather(world);
    const w = S.weather(world);
    // Storms damage roofs now and then.
    if (l.weather.kind === 'storm' && rng.chance(0.04)) {
      const b = rng.pick(world.buildings.filter((x) => x.type !== 'market'));
      b.damage = U.clamp(b.damage + rng.int(5, 15), 0, 100);
      S.log(world, { title: 'Storm damage', text: `The wind tore slates from ${b.name}.`, level: 0, kind: 'weather' });
    }
    // People react to the sky, to festivals and to ceremonies.
    const fest = l.festival && l.festival.until > world.t ? l.festival : null;
    for (const c of S.living(world)) {
      if (c.possessed || c.flags.trapped || c.flags.evacuating || c.flags.detainedUntil > world.t || c.asleep) continue;
      const cer = c.flags.ceremony;
      if (cer && cer.until > world.t) {
        S.goTo(world, c, cer.place, cer.activity);
        continue;
      } else if (cer) c.flags.ceremony = null;
      if (fest && hour >= 10 && hour < 19 && !(c.illness && c.illness.severity > 40) && rng.chance(fest.muted ? 0.35 : 0.75)) {
        S.goTo(world, c, fest.place, fest.activity);
        continue;
      }
      const outdoors = ['market', 'tavern'].includes(c.at) && /strolling|lunch|drinking/.test(c.activity);
      if (outdoors && !rng.chance(w.outdoors)) S.goTo(world, c, c.homeId, 'sheltering from the ' + w.name.toLowerCase());
    }
    if (fest && hour === 18 && !fest.pulsed) festivalPulse(world, fest);
  };

  // ---------- festivals ----------
  function festivalPulse(world, fest) {
    fest.pulsed = true;
    const att = S.living(world).filter((c) => c.at === fest.place && /festival|fair|blessing|vigil/i.test(c.activity));
    const pulse = Math.round(att.length * (fest.muted ? 0.6 : 1.4));
    const before = world.faith.current;
    world.faith.current = U.clamp(world.faith.current + pulse, 0, world.faith.capacity);
    world.faith.earned += world.faith.current - before;
    for (const c of att) {
      c.mood = U.clamp(c.mood + (fest.muted ? 6 : 15), 0, 100);
      S.adjustBelief(world, c, fest.place === 'temple' ? 2 : 1);
      if (world.rng.chance(0.3)) S.addMemory(world, c, 'festival', `Celebrated the ${fest.name}.`, 0.8);
    }
    world.country.economy = U.clamp(world.country.economy + (fest.place === 'market' ? 1 : 0.3), 0, 100);
    S.count(world, 'festivals');
    S.log(world, {
      title: fest.name, text: `${att.length} people ${fest.muted ? 'gathered quietly, the mood dampened by hard times' : 'celebrated late into the evening'}. (+${pulse} Faith)`,
      level: 2, kind: 'festival',
    });
  }

  // ---------- omens ----------
  function newOmen(world) {
    const rng = world.rng;
    const def = rng.pick(G.Data.omens);
    const o = { id: world.nextId++, kind: def.id, name: def.name, text: def.text, t: world.t, until: world.t + T.DAY * def.days, claimed: null };
    world.life.omens.push(o);
    if (world.life.omens.length > 30) world.life.omens.shift();
    // Unclaimed, people read it through their own hopes and fears.
    for (const c of S.living(world)) {
      if (c.belief > 55) c.mood = U.clamp(c.mood + (rng.chance(0.5) ? 4 : -4), 0, 100);
      if (rng.chance(0.15)) S.addMemory(world, c, 'omen', `Saw ${def.name.toLowerCase()}. ${c.belief > 50 ? 'Wonders what heaven is saying.' : 'Thinks it means nothing.'}`, 0.8);
    }
    S.fx(world, 'omen', 30, 8, { omen: def.id });
    S.log(world, { title: `An omen: ${def.name}`, text: `${def.text} Everyone argues about what it means. (Open the Divinity tab to interpret it.)`, level: 2, kind: 'omen', alert: true });
  }

  S.claimOmen = function (world, omenId, meaning) {
    const o = world.life.omens.find((x) => x.id === omenId);
    if (!o || o.claimed || o.until < world.t) return { ok: false, msg: 'That omen has passed.' };
    if (world.player.form === 'human') return { ok: false, msg: 'In human form you are just one voice among many.' };
    const cost = Math.round(40 * (world.settings.costMultiplier || 1));
    if (!S.spendFaith(world, cost, 'Interpret omen')) return { ok: false, msg: `Not enough Faith (${cost}).` };
    const c = world.country;
    o.claimed = meaning;
    let text;
    if (meaning === 'blessing') {
      for (const p of S.living(world)) if (p.belief > 35) S.adjustBelief(world, p, 4);
      c.legitimacy = U.clamp(c.legitimacy + 4, 0, 100);
      text = 'Priests and gossips agree: heaven smiles on Velmora.';
    } else if (meaning === 'warning') {
      for (const pl of world.plots) if (pl.status === 'active') pl.boost -= 10;
      c.warRisk = U.clamp(c.warRisk - 10, 0, 100);
      text = 'A chill of caution passes through the city. Bold plans are put away.';
    } else if (meaning === 'doom') {
      c.legitimacy = U.clamp(c.legitimacy - 10, 0, 100);
      c.grievance = U.clamp((c.grievance || 0) + 8, 0, 100);
      for (const pl of world.plots) if (pl.status === 'active') pl.boost += 15;
      text = `Whispers spread that the omen foretells the fall of ${S.leader(world) ? S.leader(world).name : 'the ruler'}.`;
    } else {
      const cand = S.living(world).filter((p) => !p.prophet && p.age >= 16).sort((a, b) => b.belief - a.belief)[0];
      if (cand) {
        cand.prophet = true;
        S.addMemory(world, cand, 'vision', `Understood the ${o.name.toLowerCase()} as a call to prophecy.`, 3);
        text = `${cand.name} declared that the omen called them to prophesy.`;
      } else text = 'No one answered the call.';
    }
    world.country.exposure = U.clamp(world.country.exposure + 1, 0, 100);
    S.log(world, { title: `The meaning of ${o.name.toLowerCase()}`, text, level: 2, kind: 'omen' });
    S.checkDeeds(world);
    return { ok: true, msg: text, cost };
  };

  // ---------- relics & pilgrims ----------
  S.maybeRelic = function (world, opts, witnesses) {
    if (opts.magnitude < 2 || witnesses < 2 || !world.rng.chance(0.35)) return;
    const ben = S.char(world, opts.beneficiaryId);
    const names = {
      heal: ben ? `The Healing Cloth of ${ben.first}` : 'The Healing Cloth',
      protect: 'A Stone from the Spared House',
      regional: 'A Vial of the Stilled River',
      provide: 'The Loaf That Did Not Spoil',
      reveal: 'The Ledger of Shame',
      smite: 'The Scorched Staff',
    };
    const name = names[opts.kind] || 'A Holy Token';
    if (world.life.relics.some((r) => r.name === name)) return;
    world.life.relics.push({ id: world.nextId++, name, origin: opts.text, t: world.t });
    S.log(world, { title: 'A relic is enshrined', text: `${name} was carried to the Temple and placed beside the altar. Pilgrims will come to see it.`, level: 2, kind: 'religion' });
  };

  // ---------- rumours ----------
  const first = (e) => e.text.split('.')[0];
  const DISTORT = [
    (e) => `They say "${e.title}", and that it was worse than anyone admits.`,
    (e) => `Word in the Copper Kettle: ${first(e)}. Some say it was arranged.`,
    (e) => `A fishwife swears it's true: ${first(e)}. And she saw a light in the sky that night.`,
    (e) => `Everyone is talking about "${e.title}". The priests call it a sign; the scholars call it nonsense.`,
    (e) => `It's said that ${first(e)}, though the Herald won't print the half of it.`,
  ];
  function spreadRumours(world) {
    const l = world.life;
    const recent = world.chronicle.filter((e) => e.t > world.t - T.DAY && e.level >= 2 && !['weather', 'deed', 'divine'].includes(e.kind));
    for (const e of recent.slice(-2)) {
      l.rumours.push({ t: world.t, text: world.rng.pick(DISTORT)(e), source: e.id });
    }
    if (l.rumours.length > 30) l.rumours.splice(0, l.rumours.length - 30);
  }
  S.latestRumour = (world) => {
    const r = world.life && world.life.rumours;
    return r && r.length ? r[r.length - 1].text : '';
  };

  // ---------- the Herald ----------
  function printHerald(world) {
    const l = world.life;
    const since = world.t - T.DAY;
    const today = world.chronicle.filter((e) => e.t > since && e.level >= 2 && e.kind !== 'weather');
    const headlines = today.slice(-6).reverse().map((e) => ({ title: e.title, text: e.text, divine: e.kind === 'divine' || /miracle|witness/i.test(e.title + e.text) }));
    const births = world.chronicle.filter((e) => e.t > since && /born/.test(e.text)).length;
    const deaths = world.chronicle.filter((e) => e.t > since && e.kind === 'death').length;
    const bread = Math.max(1, Math.round(2 + (60 - world.country.economy) / 8 + (world.country.flags.famine ? 6 : 0)));
    const next = G.Data.festivals.map((f) => ({ f, d: daysUntil(world, f) })).sort((a, b) => a.d - b.d)[0];
    l.herald.push({
      t: world.t, date: T.format(world, world.t, false), headlines, rumours: l.rumours.slice(-2).map((r) => r.text),
      weather: S.weather(world).name, season: S.season(world).name, bread, births, deaths,
      notice: next ? `${next.f.name} in ${next.d} day${next.d === 1 ? '' : 's'}.` : '',
      ruler: S.leader(world) ? S.leader(world).name : 'No ruler',
    });
    if (l.herald.length > 14) l.herald.shift();
    l.heraldUnread = true;
  }
  function daysUntil(world, f) {
    const p = T.dateParts(world);
    const today = p.month * 30 + p.md;
    const day = f.month * 30 + f.md;
    return ((day - today + T.YEAR_DAYS) % T.YEAR_DAYS) || T.YEAR_DAYS;
  }

  // ---------- daily ----------
  S.lifeDaily = function (world) {
    const l = S.initLife(world);
    const rng = world.rng;
    const p = T.dateParts(world);
    const season = S.season(world).id;
    // Season effects
    for (const c of S.living(world)) {
      if (season === 'summer') c.mood = U.clamp(c.mood + 0.5, 0, 100);
      if (season === 'winter' && c.wealth < 15) c.health = U.clamp(c.health - 0.6, 0, 100);
      if (p.month === 6 && c.role === 'farmer') c.wealth = U.clamp(c.wealth + 1.5, 0, 100);
    }
    if (p.month === 6) world.country.economy = U.clamp(world.country.economy + 0.05, 0, 100);
    // Festivals
    if (l.festival && l.festival.until <= world.t) l.festival = null;
    const fest = G.Data.festivals.find((f) => f.month === p.month && f.md === p.md);
    if (fest) {
      const muted = world.plague.active || !!world.war || world.flood.stage !== 'none' || world.country.flags.famine;
      l.festival = Object.assign({}, fest, { until: world.t + T.DAY, muted, pulsed: false });
      S.log(world, { title: `${fest.name} today`, text: `${fest.desc}${muted ? ' Hard times hang over the celebrations.' : ''}`, level: 2, kind: 'festival', alert: true });
    }
    // Omens
    if (rng.chance(0.012)) newOmen(world);
    // Pilgrims come to see relics.
    l.pilgrimsToday = l.relics.length ? Math.round(l.relics.length * rng.float(1, 4) * (world.war || world.plague.active ? 0.3 : 1)) : 0;
    if (l.pilgrimsToday) {
      world.country.economy = U.clamp(world.country.economy + l.pilgrimsToday * 0.02, 0, 100);
      for (const m of S.living(world).filter((c) => c.role === 'merchant' || c.role === 'innkeeper')) m.wealth = U.clamp(m.wealth + l.pilgrimsToday * 0.15, 0, 100);
      if (T.weekday(world) === 6) S.log(world, { title: 'Pilgrims', text: `${l.pilgrimsToday} pilgrims came to pray before the relics this week's end.`, level: 0, kind: 'religion' });
    }
    spreadRumours(world);
    printHerald(world);
    S.checkDeeds(world);
  };

  // ---------- ceremonies ----------
  S.scheduleCeremony = function (world, type, about, guests) {
    const hour = type === 'funeral' ? 10 : 14;
    const now = T.minuteOfDay(world);
    let delay = hour * 60 - now;
    if (delay < 60) delay += T.DAY;
    S.schedule(world, delay, 'ceremony', { type, about: about.map((c) => c.id), guests: guests.map((c) => c.id) });
  };
  H.ceremony = function (world, d) {
    const about = d.about.map((id) => S.char(world, id)).filter(Boolean);
    const guests = d.guests.map((id) => S.char(world, id)).filter((c) => c && c.alive && !(c.flags.detainedUntil > world.t) && !c.flags.trapped && !c.possessed);
    if (!about.length) return;
    const names = about.map((c) => c.first).join(' and ');
    const activity = d.type === 'funeral' ? `mourning ${names}` : `celebrating the wedding of ${names}`;
    for (const g of guests) {
      g.flags.ceremony = { place: 'temple', activity, until: world.t + 150 };
      S.goTo(world, g, 'temple', activity);
    }
    for (const c of about) if (c.alive) {
      c.flags.ceremony = { place: 'temple', activity: 'getting married', until: world.t + 150 };
      S.goTo(world, c, 'temple', 'getting married');
    }
    if (d.type === 'funeral') {
      for (const g of guests) g.mood = U.clamp(g.mood + 4, 0, 100); // grief shared is lighter
      S.log(world, { title: `The funeral of ${about[0].name}`, text: `${guests.length} mourners gathered at the Temple to bury ${about[0].first}.`, level: about[0].key || about[0].role === 'monarch' ? 2 : 0, kind: 'life', entities: [about[0].id] });
    } else {
      for (const g of guests) g.mood = U.clamp(g.mood + 8, 0, 100);
      S.log(world, { title: 'A wedding at the Temple', text: `${guests.length} guests danced at the wedding of ${names}.`, level: 0, kind: 'life', entities: about.map((c) => c.id) });
    }
  };

  // ---------- deeds ----------
  S.checkDeeds = function (world) {
    const l = S.initLife(world);
    for (const d of G.Data.deeds) {
      if (l.deeds[d.id]) continue;
      let ok = false;
      try {
        ok = d.check(world);
      } catch (e) {
        ok = false;
      }
      if (ok) {
        l.deeds[d.id] = world.t;
        S.log(world, { title: `Deed: ${d.name}`, text: d.desc, level: 1, kind: 'deed', alert: true });
      }
    }
  };

  // ---------- watchlist ----------
  S.toggleWatch = function (world, id) {
    const l = S.initLife(world);
    const i = l.watch.indexOf(id);
    if (i >= 0) l.watch.splice(i, 1);
    else l.watch.push(id);
    return i < 0;
  };
  S.watchNotice = function (world, c, text, weight) {
    if (!world.life || weight < 2 || !world.life.watch.includes(c.id)) return;
    S.log(world, { title: `${c.first}: news`, text, level: 1, kind: 'watch', entities: [c.id], alert: true });
  };

  // ---------- life story ----------
  S.lifeStory = function (world, c) {
    const born = T.format(world, c.bornAt, false);
    const parts = [];
    const fam = S.familyOf(world, c);
    const parents = fam.filter((f) => c.relations[f.id].type === 'parent');
    parts.push(`${c.first} ${c.last} was born ${parents.length ? `to ${parents.map((p) => p.first).join(' and ')} ` : ''}around ${born.split(' ').slice(1).join(' ')}.`);
    parts.push(`${c.sex === 'f' ? 'She' : 'He'} ${c.alive ? 'works as' : 'worked as'} ${/^[aeiou]/i.test(c.occupation) ? 'an' : 'a'} ${c.occupation.toLowerCase()}${c.tags.length ? ` and is known to be ${c.tags.slice(0, 2).join(' and ').toLowerCase()}` : ''}.`);
    const sp = Object.keys(c.relations).map((k) => ({ o: S.char(world, +k), r: c.relations[k] })).find((x) => x.o && x.r.type === 'spouse');
    if (sp) parts.push(`${c.sex === 'f' ? 'She' : 'He'} married ${sp.o.first}${sp.o.alive ? '' : ', who has since died'}.`);
    const kids = fam.filter((f) => c.relations[f.id].type === 'child');
    if (kids.length) parts.push(`${kids.length === 1 ? 'One child' : kids.length + ' children'}: ${kids.map((k) => k.first).join(', ')}.`);
    const key = c.memories.filter((m) => m.weight >= 2).slice(-5);
    for (const m of key) parts.push(`In ${T.MONTHS[T.dateParts(world, m.t).month]} ${T.dateParts(world, m.t).year}: ${m.text.charAt(0).toLowerCase() + m.text.slice(1)}`);
    if (c.divine.answered) parts.push(`Heaven has answered ${c.divine.answered} of ${c.sex === 'f' ? 'her' : 'his'} prayers.`);
    if (!c.alive) parts.push(`${c.first} died of ${c.causeOfDeath}, aged ${Math.floor(c.age)}.`);
    return parts;
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
