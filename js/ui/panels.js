// Side panels, feed, top bar and contextual form bar.
(function (G) {
  'use strict';
  const UI = G.UI;
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;
  const esc = UI.esc;
  const P = (UI.Panels = {});

  const FILTERS = [
    ['all', 'All'], ['urgent', 'Urgent+'], ['health', '✚'], ['provision', '⚘'], ['safety', '☂'], ['family', '♥'], ['justice', '⚖'], ['guidance', '✦'], ['victory', '⚔'], ['discovery', '☉'],
  ];

  // ---------- Top bar ----------
  P.topbar = function (world) {
    const f = world.faith;
    const r = f.rates;
    UI.$('#faith-num').textContent = `${Math.floor(f.current)} / ${f.capacity}`;
    UI.$('#faith-fill').style.width = `${(f.current / f.capacity) * 100}%`;
    const net = UI.$('#faith-net');
    net.textContent = `${r.net >= 0 ? '+' : ''}${r.net.toFixed(1)}/h`;
    net.className = 'faith-net ' + (r.net >= 0 ? 'green' : 'red');
    const tier = G.Data.tiers[f.tier - 1];
    const next = G.Data.tiers[f.tier];
    UI.$('#faith-tip').innerHTML = `
      <b class="gold">Faith economy</b> <span class="muted small">(per game hour)</span>
      <table>
        <tr><td>Passive regeneration</td><td class="green">+${r.passive.toFixed(2)}</td></tr>
        <tr><td>Belief of the people</td><td class="green">+${r.belief.toFixed(2)}</td></tr>
        <tr><td>Answered prayers (gratitude)</td><td class="green">+${r.prayer.toFixed(2)}</td></tr>
        <tr><td>Church &amp; movements</td><td class="green">+${r.institution.toFixed(2)}</td></tr>
        ${(r.upkeepItems || []).map(([n, v]) => `<tr><td>${esc(n)}</td><td class="red">−${v.toFixed(2)}</td></tr>`).join('')}
        <tr><td><b>Net</b></td><td><b>${r.net >= 0 ? '+' : ''}${r.net.toFixed(2)}</b></td></tr>
      </table>
      <div class="small muted" style="margin-top:6px">Reserve ${Math.floor(f.current)} of ${f.capacity}. Restday worship adds a pulse. Faith is clamped between 0 and capacity; at 0 you can still observe and walk as a human.</div>
      <div class="small" style="margin-top:6px">${esc(tier.title)}${next ? ` · next: ${esc(next.title)} at ${next.earned} renown (now ${Math.floor(f.renown || 0)})` : ''}</div>`;
    UI.$('#tier').textContent = `${tier.title}`;
    const p = T.dateParts(world);
    UI.$('#clock').innerHTML = `${T.WEEKDAYS[p.weekday]}, ${T.format(world)}`;
    UI.$$('#speed button').forEach((b) => b.classList.toggle('active', +b.dataset.speed === UI.state.speed));
    UI.$$('#views button').forEach((b) => b.classList.toggle('active', b.dataset.view === UI.state.view));
    UI.$$('#forms button').forEach((b) => b.classList.toggle('active', b.dataset.form === world.player.form));
  };

  // ---------- Left: prayers & alerts ----------
  P.left = function (world) {
    const st = UI.state;
    const pending = world.prayers.filter((p) => p.status === 'pending');
    const crit = pending.some((p) => p.urgency >= 3);
    const pc = UI.$('#prayer-count');
    pc.textContent = pending.length;
    pc.classList.toggle('hot', crit);
    const alerts = world.chronicle.filter((e) => e.alert);
    const newAlerts = alerts.filter((e) => e.id > st.seenAlerts).length;
    UI.$('#alert-count').textContent = newAlerts || '';
    UI.$$('#left .tabs button').forEach((b) => b.classList.toggle('active', b.dataset.ltab === st.ltab));
    const filters = UI.$('#prayer-filters');
    filters.classList.toggle('hidden', st.ltab !== 'prayers');
    filters.innerHTML = FILTERS.map(([id, label]) => `<button class="chip ${st.prayerFilter === id ? 'active' : ''}" data-pfilter="${id}" title="${id}">${label}</button>`).join('');
    const body = UI.$('#left-body');
    if (st.ltab === 'alerts') {
      st.seenAlerts = alerts.length ? alerts[alerts.length - 1].id : 0;
      body.innerHTML = alerts.length
        ? alerts.slice(-60).reverse().map((e) => `<div class="card clickable" data-entry="${e.id}"><div class="small muted">${T.format(world, e.t)}</div><b>${esc(e.title)}</b><div>${esc(e.text)}</div></div>`).join('')
        : '<div class="muted">No alerts yet. Major developments will appear here.</div>';
      return;
    }
    let list = pending.slice();
    if (st.prayerFilter === 'urgent') list = list.filter((p) => p.urgency >= 2);
    else if (st.prayerFilter !== 'all') list = list.filter((p) => p.typeId === st.prayerFilter);
    list.sort((a, b) => b.urgency - a.urgency || a.expiresAt - b.expiresAt);
    const sel = st.selected;
    let html = list.length ? '' : '<div class="muted" style="padding:6px 2px">No pending prayers match. The world goes on.</div>';
    for (const p of list) {
      const c = S.char(world, p.requesterId);
      html += `<div class="card clickable ${sel && sel.kind === 'prayer' && sel.id === p.id ? 'selected' : ''}" data-prayer="${p.id}">
        <div class="row">${c ? UI.Figures.portrait(c, 26) : ''}<span class="prayer-icon">${p.icon}</span><b>${esc(c ? c.first + ' ' + c.last : p.requesterName)}</b><span class="urg urg${p.urgency}" style="margin-left:auto">${S.URGENCY[p.urgency]}</span></div>
        <div class="small muted">${esc(p.location.place)} · ${T.duration(p.expiresAt - world.t)} left</div>
        <div style="margin-top:3px">${esc(p.situation)}</div></div>`;
    }
    const recent = world.prayers.filter((p) => p.status !== 'pending' && p.status !== 'void').slice(-6).reverse();
    if (recent.length) {
      html += '<h4>Recently closed</h4>';
      for (const p of recent) {
        html += `<div class="card clickable" data-prayer="${p.id}" style="opacity:.8"><div class="row"><span class="prayer-icon">${p.icon}</span><span>${esc(p.requesterName)}</span><span class="small muted" style="margin-left:auto">${statusLabel(p)}</span></div><div class="small muted">${esc(p.outcome || '')}</div></div>`;
      }
    }
    body.innerHTML = html;
  };
  function statusLabel(p) {
    return { answered: `answered (${p.response})`, ignored: 'silence', unanswered: 'unanswered', resolved: 'resolved naturally' }[p.status] || p.status;
  }

  // ---------- Right ----------
  P.right = function (world) {
    const st = UI.state;
    UI.$$('#right .tabs button').forEach((b) => b.classList.toggle('active', b.dataset.rtab === st.rtab));
    const body = UI.$('#right-body');
    // Do not rebuild while the player is choosing from a dropdown.
    if (document.activeElement && body.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    let html;
    if (st.rtab === 'nation') html = P.nation(world);
    else if (st.rtab === 'faith') html = P.divinity(world);
    else html = P.inspect(world);
    body.innerHTML = html;
  };

  P.inspect = function (world) {
    const sel = UI.state.selected;
    if (!sel) return P.inspectNothing(world);
    if (sel.kind === 'character') return P.dossier(world, S.char(world, sel.id));
    if (sel.kind === 'building') return P.buildingPanel(world, S.building(world, sel.id));
    if (sel.kind === 'prayer') return P.prayerPanel(world, world.prayers.find((p) => p.id === sel.id));
    if (sel.kind === 'province') return P.provincePanel(world, S.province(world, sel.id));
    if (sel.kind === 'neighbor') return P.neighborPanel(world, S.neighbor(world, sel.id));
    return P.inspectNothing(world);
  };

  P.inspectNothing = function (world) {
    const pos = S.playerPos(world);
    const near = S.living(world).filter((c) => U.dist(c.x, c.y, pos.x, pos.y) < 5).sort((a, b) => U.dist(a.x, a.y, pos.x, pos.y) - U.dist(b.x, b.y, pos.x, pos.y));
    return `<h3>Nothing selected</h3>
      <p class="muted">Click a person or building in Thornhaven, a prayer in the inbox, or a province on the World map.</p>
      <h4>Near you</h4>
      ${near.length ? near.slice(0, 10).map((c) => `<div class="card clickable row" data-char="${c.id}" style="display:flex;gap:8px;align-items:center">${UI.Figures.portrait(c, 28)}<span><b>${esc(c.name)}</b> <br><span class="muted small">${esc(c.occupation)} · ${esc(c.activity)}</span></span></div>`).join('') : '<div class="muted">No one.</div>'}`;
  };

  function abilityButtons(world, targetKind, target) {
    const out = [];
    for (const id in G.Data.abilities) {
      const a = G.Data.abilities[id];
      if (a.target !== targetKind) continue;
      if (a.philosophy && a.philosophy !== world.player.philosophy) continue;
      if (id === 'inspire_leader' && !S.isLeaderFigure(world, target)) continue;
      if (id === 'reveal' && !['official', 'noble', 'monarch', 'general'].includes(target.role) && !target.corrupt) continue;
      let optHtml = '';
      let opt = UI.state.abilityOptions[id];
      if (a.options) {
        const keys = Object.keys(a.options);
        if (!opt || !a.options[opt]) opt = keys[0];
        optHtml = `<select data-optfor="${id}">${keys.map((k) => `<option value="${k}" ${k === opt ? 'selected' : ''}>${esc(typeof a.options[k] === 'string' ? a.options[k] : a.options[k].label)}</option>`).join('')}</select>`;
      }
      const check = S.canUseAbility(world, id, target, opt);
      const cost = S.abilityCost(world, id, target, opt);
      const locked = world.faith.tier < a.tier;
      out.push(`<div>${optHtml}<button class="action" data-ability="${id}" data-tkind="${targetKind}" data-tid="${targetKind === 'country' ? 'country' : target.id}" ${check.ok ? '' : 'disabled'} title="${esc(a.desc)}">
        <span>${locked ? '🔒 ' : ''}${esc(a.name)}<span class="sub">${esc(check.ok ? a.scope : check.reason)}</span></span><span class="cost">${cost}</span></button></div>`);
    }
    return out.join('');
  }
  P.abilityButtons = abilityButtons;

  P.dossier = function (world, c) {
    if (!c) return P.inspectNothing(world);
    const k = c.known;
    const pos = S.playerPos(world);
    const dist = U.dist(c.x, c.y, pos.x, pos.y);
    const place = (S.building(world, c.at) || G.Data.city.zones.find((z) => z.id === c.at) || { name: S.districtName(S.districtAt(world, c.x, c.y)) }).name;
    let h = `<div style="display:flex;gap:10px;align-items:center">${UI.Figures.portrait(c, 60)}<div><h3>${esc(c.name)}</h3>
      <div class="muted">${c.sex === 'f' ? 'Woman' : 'Man'}, ${Math.floor(c.age)} · ${esc(c.occupation)}${c.alive ? '' : ` · <span class="red">died of ${esc(c.causeOfDeath)}</span>`}</div></div></div>`;
    if (!c.alive) return h + memoriesHtml(world, c, true);
    h += `<div style="margin-top:6px">${esc(capital(c.activity))} at ${esc(place)}${c.asleep ? ' (asleep)' : ''}</div>`;
    const tags = [];
    if (c.flags.trapped) tags.push('<span class="tag warn">Trapped by flood</span>');
    if (c.prophet) tags.push('<span class="tag" style="border-color:var(--gold)">Prophet</span>');
    if (c.gift && (k.beliefs || c.flags.sensedAt)) tags.push('<span class="tag gift">The Gift</span>');
    if (c.flags.detainedUntil > world.t) tags.push('<span class="tag warn">Detained</span>');
    if (c.id === world.country.leaderId) tags.push(`<span class="tag" style="border-color:var(--gold)">${esc(G.Data.governments[world.country.government].leaderTitle)}</span>`);
    const fl = world.country.factions.find((f) => f.leaderId === c.id);
    if (fl) tags.push(`<span class="tag">Leads ${esc(fl.name)}</span>`);
    if (c.corrupt && k.memories) tags.push('<span class="tag warn">Corrupt</span>');
    if (tags.length) h += `<div style="margin-top:4px">${tags.join('')}</div>`;
    h += '<h4>Condition</h4>';
    h += UI.meter('Health', c.health, c.health < 40 ? 'var(--red)' : 'var(--green)', Math.round(c.health));
    if (c.illness) h += `<div class="red small">Ill: ${esc(c.illness.name)} (${c.illness.severity > 70 ? 'grave' : c.illness.severity > 40 ? 'serious' : 'mild'})</div>`;
    if (c.injury > 10) h += `<div class="red small">Injured (${c.injury > 60 ? 'badly' : 'moderately'})</div>`;
    h += UI.meter('Mood', c.mood, 'var(--blue)');
    h += UI.meter('Means', c.wealth, 'var(--gold-dim)', c.wealth < 10 ? 'Destitute' : c.wealth < 25 ? 'Poor' : c.wealth < 60 ? 'Getting by' : 'Comfortable');
    if (c.hunger > 40) h += `<div class="red small">Hungry</div>`;
    h += '<h4>Personality</h4>';
    h += k.traits ? (c.tags.length ? c.tags.map((t) => `<span class="tag">${t}</span>`).join('') : '<span class="muted">Unremarkable temperament.</span>') : '<div class="unknown">Unknown. Observe them a while, talk to them in human form, or possess them.</div>';
    h += '<h4>Belief</h4>';
    if (k.beliefs) {
      h += UI.meter('Belief', c.belief, UI.beliefColor(c.belief), Math.round(c.belief));
      h += UI.meter('Steadfastness', c.faithStability * 100, 'var(--purple)');
      h += `<div class="small">Sees the divine as: <b>${c.interpretation === 'unknown' ? 'undecided' : esc(S.INTERP_LABEL[c.interpretation] || c.interpretation)}</b></div>`;
      const mv = world.movements.find((m) => m.id === c.movementId);
      if (mv) h += `<div class="small">Member of <b>${esc(mv.name)}</b></div>`;
      h += `<div class="small muted">Prayers answered ${c.divine.answered} · unanswered ${c.divine.unanswered} · miracles witnessed ${c.divine.witnessed}${c.divine.possessed ? ` · possessed ${c.divine.possessed}×` : ''}</div>`;
    } else h += '<div class="unknown">Their private faith is unknown to you.</div>';
    const pr = world.prayers.find((p) => p.requesterId === c.id && p.status === 'pending');
    if (pr) h += `<div class="card clickable" data-prayer="${pr.id}" style="margin-top:8px"><span class="urg urg${pr.urgency}">${S.URGENCY[pr.urgency]}</span> <b>Praying:</b> ${esc(pr.situation)}</div>`;
    // Actions
    h += '<h4>Divine actions</h4>';
    const p = world.player;
    if (p.form === 'human') h += '<div class="muted">You are in human form: no divine abilities. Use the actions at the bottom of the map.</div>';
    else {
      if (p.form === 'spectral') {
        const cost = S.possessionCost(world, c);
        const inRange = dist <= G.Data.possession.range;
        h += `<button class="action" data-possess="${c.id}" ${inRange && world.faith.current >= cost ? '' : 'disabled'}><span>✋ Possess ${esc(c.first)}<span class="sub">${inRange ? `Upkeep ${G.Data.possession.upkeepPerHour}/h, up to ${G.Data.possession.maxHours}h` : `Move within ${G.Data.possession.range} tiles (now ${dist.toFixed(1)})`}</span></span><span class="cost">${cost}</span></button>`;
        if (c.gift) h += `<button class="action" data-whisper="${c.id}" ${dist <= 4 ? '' : 'disabled'}><span>✧ Whisper to ${esc(c.first)}<span class="sub">Only the Gifted can hear you</span></span><span class="cost">3</span></button>`;
      }
      h += abilityButtons(world, 'character', c);
    }
    h += '<h4>Relationships</h4>';
    const rels = Object.keys(c.relations).map((id) => ({ o: S.char(world, +id), r: c.relations[id] })).filter((x) => x.o);
    const family = rels.filter((x) => ['spouse', 'parent', 'child', 'sibling'].includes(x.r.type));
    const others = rels.filter((x) => !['spouse', 'parent', 'child', 'sibling'].includes(x.r.type));
    const relRow = (x) => `<div>${UI.charLink(x.o)} <span class="muted small">${x.r.type}${x.o.alive ? '' : ', deceased'}</span></div>`;
    h += family.map(relRow).join('') || '<div class="muted small">No family.</div>';
    if (k.traits) h += others.map(relRow).join('');
    else if (others.length) h += '<div class="unknown small">Friends and rivals unknown.</div>';
    h += memoriesHtml(world, c, k.memories);
    return h;
  };
  function capital(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  function memoriesHtml(world, c, known) {
    let h = '<h4>Memories</h4>';
    if (!known) return h + '<div class="unknown">Their memories are closed to you. Possess them, or spend more time near them.</div>';
    const ms = c.memories.slice(-10).reverse();
    if (!ms.length) return h + '<div class="muted">Nothing notable yet.</div>';
    return h + ms.map((m) => `<div class="mem"><div class="t">${T.format(world, m.t, false)}</div>${esc(m.text)}</div>`).join('');
  }

  const BUILDING_ABOUT = {
    palace: 'Seat of the Crown. A marble throne hall hung with banners; courtiers, clerks and guards come and go. Guards watch for strangers.',
    manor: 'The townhouse of Lord Halvard Crane: parquet floors, a four-poster bed and a desk where ambitions are written down.',
    barracks: 'Bunks for the army, a weapon rack, a training yard, and the city gaol behind iron bars.',
    healer: "Nell Ashby's house of cots, drying herbs and remedies. The sick come here when they can afford to.",
    temple: 'The Temple of the Unseen Flame. Pews face an altar where the flame never goes out. Every Restday the faithful gather here, and in a flood it is the city\'s shelter.',
    market: 'Striped stalls around the town well: grain, cloth, fruit and gossip.',
    academy: 'Desks, a blackboard and shelves of books. Scholars and students argue about how the world is made.',
    tavern: 'Ale barrels, a warm hearth and round tables where the Reformers print their pamphlets and plot.',
    home: 'A modest town house: beds, a hearth, a table and a chest of everything the family owns.',
    farmhouse: 'A thatched farmhouse with a fenced yard, hay and a cart. It stands on the floodplain.',
  };

  P.buildingPanel = function (world, b) {
    if (!b) return P.inspectNothing(world);
    const inside = S.living(world).filter((c) => S.buildingAt(world, c.x, c.y) === b);
    const residents = S.living(world).filter((c) => c.homeId === b.id);
    let h = `<h3>${esc(b.name)}</h3><div class="muted">${esc(capital(b.type))} · ${esc(S.districtName(S.districtAt(world, b.x + 1, b.y + 1)))}</div>`;
    try {
      h += `<img class="bthumb" alt="" src="${UI.Local.buildingThumb(b)}">`;
    } catch (e) {
      /* thumbnails are decorative */
    }
    const about = BUILDING_ABOUT[b.type];
    if (about) h += `<div class="small" style="margin:6px 0">${esc(about)}</div>`;
    if (b.protectedUntil > world.t) h += `<div class="gold">Warded for ${T.duration(b.protectedUntil - world.t)}</div>`;
    if (b.damage > 0) h += UI.meter('Damage', b.damage, 'var(--red)', Math.round(b.damage));
    if (S.inFloodZone(b.x + 1, b.y + 1, world) && !world.flood.diverted) h += '<div class="small muted">Lies on the floodplain.</div>';
    h += '<h4>Inside now</h4>' + (inside.length ? inside.map((c) => `<div>${UI.charLink(c)} <span class="muted small">${esc(c.activity)}</span></div>`).join('') : '<div class="muted">Empty.</div>');
    if (residents.length) h += '<h4>Residents</h4>' + residents.map((c) => `<div>${UI.charLink(c)}</div>`).join('');
    if (world.player.form !== 'human') h += '<h4>Divine actions</h4>' + abilityButtons(world, 'building', b);
    return h;
  };

  P.prayerPanel = function (world, p) {
    if (!p) return P.inspectNothing(world);
    const c = S.char(world, p.requesterId);
    let h = `<div class="row" style="display:flex;gap:6px;align-items:center"><span class="prayer-icon">${p.icon}</span><h3>Prayer</h3><span class="urg urg${p.urgency}" style="margin-left:auto">${S.URGENCY[p.urgency]}</span></div>
      <div class="muted">${esc(p.category)}</div>
      <div class="kv" style="margin-top:8px">
        <div>From</div><div>${UI.charLink(c)}</div>
        <div>Where</div><div>${esc(p.location.place)}, ${esc(S.districtName(p.location.district))}</div>
        <div>Prayed</div><div>${T.format(world, p.createdAt)}</div>
        <div>Status</div><div>${p.status === 'pending' ? `pending · ${T.duration(p.expiresAt - world.t)} left` : esc(statusLabel(p))}</div>
        <div>Belief</div><div>${c && c.known.beliefs ? Math.round(p.beliefAtTime) + ' / 100' : 'unknown'}</div>
      </div>
      <h4>Situation</h4><div>${esc(p.situation)}</div>
      <blockquote style="margin:8px 0;padding-left:10px;border-left:3px solid var(--gold-dim);font-style:italic">“${esc(p.plea)}”</blockquote>
      <h4>Past experience with the divine</h4><div class="small">Answered ${p.history.answered} · unanswered ${p.history.unanswered} · witnessed ${p.history.witnessed} miracles</div>`;
    if (p.memories.length) h += '<h4>Relevant memories</h4>' + p.memories.map((m) => `<div class="mem">${esc(m)}</div>`).join('');
    if (p.status !== 'pending') {
      h += `<h4>Outcome</h4><div>${esc(p.outcome || '—')}</div>`;
      return h;
    }
    h += '<h4>How will you respond?</h4><div class="small muted">Costs are estimates; human reactions are not guaranteed.</div>';
    for (const o of S.prayerOptions(world, p)) {
      h += `<button class="action ${o.kind === 'silence' ? 'silence' : ''}" data-respond="${p.id}" data-kind="${o.kind}" ${o.available ? '' : 'disabled'}>
        <span><b>${capital(o.kind)}:</b> ${esc(o.label)}<span class="sub">${esc(o.available ? `${o.certainty} · ${o.risk}` : o.reason)}</span></span><span class="cost">${o.cost || '—'}</span></button>`;
    }
    return h;
  };

  P.provincePanel = function (world, p) {
    if (!p) return P.inspectNothing(world);
    let h = `<h3>${esc(p.name)}</h3><div class="muted">Province of ${esc(world.country.name)} · ${p.pop}k people</div>`;
    h += UI.meter('Belief', p.belief, UI.beliefColor(p.belief), Math.round(p.belief));
    h += UI.meter('Economy', p.economy, 'var(--green)', Math.round(p.economy));
    h += UI.meter('Unrest', p.unrest, 'var(--red)', Math.round(p.unrest));
    if (p.devastation > 1) h += UI.meter('Devastation', p.devastation, 'var(--orange)', Math.round(p.devastation));
    h += `<div class="small" style="margin-top:6px">Reputation: <b>${esc(S.reputationLabel(world, p.id))}</b></div>`;
    const notes = [];
    if (p.id === 'riverlands' && world.flood.stage !== 'none') notes.push(`🌊 Flood: ${world.flood.stage}`);
    if (p.id === 'highmarch' && world.war) notes.push(`⚔ War front: ${world.war.score > 15 ? 'Velmora advancing' : world.war.score < -15 ? 'Velmora retreating' : 'stalemate'}`);
    if (p.local && world.plague.active) notes.push('☠ Plague in the capital');
    if (notes.length) h += `<div style="margin-top:6px">${notes.join('<br>')}</div>`;
    if (p.local) h += '<button class="action" data-enter="1"><span>Enter Thornhaven<span class="sub">Explore the capital in Local View</span></span></button>';
    if (world.player.form !== 'human') h += '<h4>Regional miracles</h4>' + abilityButtons(world, 'province', p);
    return h;
  };

  P.neighborPanel = function (world, n) {
    if (!n) return P.inspectNothing(world);
    return `<h3>${esc(n.name)}</h3><div class="muted">${esc(G.Data.governments[n.government].name)}</div>
      ${UI.meter('Military strength', n.strength, 'var(--red)', Math.round(n.strength))}
      ${UI.meter('Relations', (n.relation + 100) / 2, 'var(--teal)', n.relation > 30 ? 'Friendly' : n.relation > -10 ? 'Cool' : n.relation > -50 ? 'Hostile' : 'Enemies')}
      <div style="margin-top:6px">${world.war && world.war.enemy === n.id ? '<b class="red">At war with Velmora.</b>' : 'At peace with Velmora.'}</div>
      <p class="muted small">Foreign nations are simulated in aggregate in this scenario. Your influence reaches them through war, peace and global miracles.</p>`;
  };

  // ---------- Nation tab ----------
  P.nation = function (world) {
    const c = world.country;
    const gov = G.Data.governments[c.government];
    const l = S.leader(world);
    const heir = S.char(world, c.heirId);
    let h = `<h3>${esc(c.name)}</h3><div class="muted">${esc(gov.name)} · since ${T.format(world, c.govSince, false)}</div>
      <div class="small" style="margin-top:4px">${esc(gov.mechanics)}.</div>
      <div class="kv" style="margin-top:8px"><div>${esc(gov.leaderTitle)}</div><div>${UI.charLink(l)}</div>
      ${(c.government === 'monarchy' || c.government === 'constitutional') ? `<div>Heir</div><div>${heir && heir.alive ? UI.charLink(heir) : '<span class="red">None</span>'}</div>` : ''}
      ${gov.elections ? `<div>Next election</div><div>${T.duration(c.nextElection - world.t)}</div>` : ''}</div>`;
    if (c.pendingDecision) {
      const pd = c.pendingDecision;
      const d = G.Data.decisions[pd.decisionId];
      const dl = S.char(world, pd.leaderId);
      const utils = dl ? S.decisionUtilities(world, dl, d).sort((a, b) => b.utility - a.utility) : [];
      h += `<div class="card" style="margin-top:10px;border-color:var(--gold-dim)"><b class="gold">Pending decision</b> · in ${T.duration(pd.dueAt - world.t)}<div style="margin:4px 0">${esc(d.title)}</div>
        ${d.options.map((o) => `<div class="small">• ${esc(o.label)}</div>`).join('')}
        ${utils.length ? `<div class="small muted" style="margin-top:6px">Court gossip: ${esc(dl.first)} leans toward “${esc(utils[0].option.label)}”, but nothing is certain.</div>` : ''}
        <div class="small muted">To sway it: a vision, Inspire a Leader, or possess ${esc(dl ? dl.first : 'the ruler')} and decide yourself.</div></div>`;
    }
    h += '<h4>Condition of the realm</h4>';
    h += UI.meter('Legitimacy', c.legitimacy, 'var(--gold)');
    h += UI.meter('Stability', c.stability, 'var(--teal)');
    h += UI.meter('Economy', c.economy, 'var(--green)');
    h += UI.meter('Treasury', c.treasury, 'var(--gold-dim)');
    h += UI.meter('Security', c.security, 'var(--red)');
    h += UI.meter('Inst. trust', c.institutionalTrust, 'var(--blue)');
    h += UI.meter('Elite loyalty', c.eliteLoyalty, 'var(--purple)');
    h += UI.meter('Inequality', c.inequality, 'var(--orange)');
    h += UI.meter('Corruption', c.corruption, 'var(--orange)');
    h += UI.meter('Religious infl.', c.religiousInfluence, '#f5d36c');
    h += UI.meter('Literacy', c.literacy, '#9cc0ff');
    h += '<h4>Pressures</h4>';
    h += UI.meter('Reform', c.reformPressure, '#4fc3f7');
    h += UI.meter('Coup', c.coupRisk, 'var(--red)');
    h += UI.meter('Revolution', c.revolutionRisk, '#ff7a59');
    h += UI.meter('Theocracy', c.theocracyPressure, '#f5d36c');
    h += '<h4>Factions</h4><table class="t"><tr><th>Faction</th><th>Leader</th><th>Power</th><th>Approval</th></tr>';
    for (const f of c.factions) h += `<tr><td>${esc(f.name)}</td><td>${UI.charLink(S.char(world, f.leaderId))}</td><td>${U.level5(f.power)}</td><td>${U.level5(f.approval)}</td></tr>`;
    h += '</table>';
    h += '<h4>Foreign affairs</h4>';
    if (world.war) {
      const n = S.neighbor(world, world.war.enemy);
      h += `<div class="red">At war with ${esc(n.name)} — ${world.war.score > 15 ? 'winning' : world.war.score < -15 ? 'losing' : 'stalemate'} (${world.war.casualties} dead)</div>`;
    }
    for (const n of world.neighbors) h += `<div>${esc(n.name)}: <span class="muted">${n.relation > 30 ? 'friendly' : n.relation > -10 ? 'cool' : 'hostile'}</span></div>`;
    h += UI.meter('War risk', c.warRisk, 'var(--red)');
    if (world.player.form !== 'human') h += '<h4>National interventions</h4>' + abilityButtons(world, 'country', c);
    return h;
  };

  // ---------- Divinity tab ----------
  P.divinity = function (world) {
    const f = world.faith;
    const phil = G.Data.philosophies[world.player.philosophy];
    let h = `<h3>${esc(G.Data.tiers[f.tier - 1].title)}</h3><div class="muted">${esc(phil.name)} philosophy · ${esc(phil.desc)}</div>`;
    h += '<h4>Faith</h4>';
    h += `<div class="kv"><div>Reserve</div><div>${Math.floor(f.current)} / ${f.capacity}</div><div>Net income</div><div>${f.rates.net.toFixed(2)} / hour</div><div>Total earned</div><div>${Math.floor(f.earned)}</div><div>Total spent</div><div>${Math.floor(f.spent)}</div><div>Divine renown</div><div>${Math.floor(f.renown || 0)}</div></div>`;
    h += '<h4>Path of power</h4>';
    for (const t of G.Data.tiers) h += `<div class="${f.tier >= t.tier ? '' : 'muted'}">${f.tier >= t.tier ? '✔' : '○'} <b>${esc(t.title)}</b> <span class="small">(${t.earned} renown, capacity ${t.capacity})</span><div class="small muted">${esc(t.unlocks)}</div></div>`;
    h += '<h4>Divine exposure</h4>' + UI.meter('Exposure', world.country.exposure, '#fff2c0', Math.round(world.country.exposure), 'How openly people have witnessed or documented your interventions.');
    h += '<h4>The Church</h4>';
    const ch = world.church;
    h += `<div><b>${esc(ch.name)}</b> led by ${UI.charLink(S.char(world, ch.leaderId))}</div><div class="small muted">Teaches that the divine is ${esc(S.INTERP_LABEL[ch.doctrine] || ch.doctrine)}.</div>`;
    h += UI.meter('Strength', ch.strength, '#f5d36c', Math.round(ch.strength));
    const mv = world.movements.filter((m) => m.active);
    h += '<h4>Movements</h4>' + (mv.length ? mv.map((m) => `<div class="card"><b>${esc(m.name)}</b><div class="small muted">Founded ${T.format(world, m.foundedAt, false)} by ${UI.charLink(S.char(world, m.founderId))} after ${esc(m.origin)}. ${m.members} members.${m.schism ? ' <span class="red">In schism with the Church.</span>' : ''}</div>${UI.meter('Strength', m.strength, '#f5d36c', Math.round(m.strength))}</div>`).join('') : '<div class="muted">None. Witnessed miracles can spark new gatherings.</div>');
    h += '<h4>Reputation by community</h4><table class="t">';
    for (const d of G.Data.city.districts) h += `<tr><td>${esc(d.name)}</td><td>${esc(S.reputationLabel(world, d.id))}</td></tr>`;
    for (const p of world.provinces) h += `<tr><td>${esc(p.name)} (province)</td><td>${esc(S.reputationLabel(world, p.id))}</td></tr>`;
    h += '</table>';
    const s = world.stats;
    h += `<h4>Record</h4><div class="small">Prayers answered ${s.answered} · met with silence ${s.ignored} · unanswered ${s.unanswered} · resolved naturally ${s.natural}<br>Miracles performed ${f.miracles} · possessions ${s.possessions} · births ${s.births} · deaths ${s.deaths}</div>`;
    const chal = world.challenge;
    if (chal.status !== 'none') {
      const def = G.Data.challenges[chal.id];
      h += `<h4>Challenge</h4><div><b>${esc(def.name)}</b> — ${chal.status === 'active' ? 'in progress' : chal.status === 'won' ? '<span class="green">complete</span>' : '<span class="red">failed</span>'}</div><div class="small muted">${esc(def.desc)}</div>${UI.meter('Progress', (chal.progress || 0) * 100, 'var(--gold)', Math.round((chal.progress || 0) * 100) + '%')}${chal.id === 'handsoff' ? `<div class="small">Direct miracles used: ${chal.miracles} / ${def.maxMiracles}</div>` : ''}`;
    }
    if (world.history.length > 1) h += '<h4>Trends (daily)</h4>' + sparkline(world.history, 'belief', '#f5d36c', 'Avg belief') + sparkline(world.history, 'legitimacy', '#e0b341', 'Legitimacy') + sparkline(world.history, 'stability', '#3fb8a5', 'Stability') + sparkline(world.history, 'faith', '#fff', 'Faith reserve');
    return h;
  };

  function sparkline(hist, key, color, label) {
    const data = hist.slice(-120).map((x) => x[key]);
    const max = Math.max(1, ...data);
    const min = Math.min(...data);
    const w = 300, hgt = 34;
    const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${hgt - ((v - min) / Math.max(1, max - min)) * (hgt - 4) - 2}`).join(' ');
    return `<div class="small muted">${label}: ${data[data.length - 1]}</div><svg width="100%" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" style="height:${hgt}px"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
  }

  // ---------- Feed ----------
  P.feed = function (world) {
    const items = [];
    for (let i = world.chronicle.length - 1; i >= 0 && items.length < 40; i--) {
      const e = world.chronicle[i];
      if (e.level < 1 && e.kind !== 'divine' && e.kind !== 'prayer') continue;
      items.push(`<div class="feed-item lvl${e.level}" data-entry="${e.id}"><span class="feed-time">${T.format(world, e.t)}</span><span><b>${esc(e.title)}</b> — ${esc(e.text)}</span></div>`);
    }
    UI.$('#feed').innerHTML = items.join('');
  };

  // ---------- Form bar (bottom of the map) ----------
  P.formBar = function (world) {
    const p = world.player;
    const st = UI.state;
    let h = '';
    if (st.view === 'world') {
      UI.$('#form-bar').innerHTML = '';
      return;
    }
    if (p.form === 'spectral') {
      h += `<span class="pill">👁 Spectral · WASD/arrows to drift · click people to inspect</span>`;
      const sel = st.selected && st.selected.kind === 'character' ? S.char(world, st.selected.id) : null;
      if (sel && sel.alive && U.dist(sel.x, sel.y, p.x, p.y) <= G.Data.possession.range) h += `<button data-possess="${sel.id}">✋ Possess ${esc(sel.first)} (${S.possessionCost(world, sel)})</button>`;
      for (const c of S.living(world)) if (c.gift && U.dist(c.x, c.y, p.x, p.y) <= 4 && !c.asleep) h += `<button data-whisper="${c.id}">✧ Whisper to ${esc(c.first)} (3)</button>`;
    } else if (p.form === 'possession') {
      const c = S.char(world, p.possessId);
      h += `<span class="pill">✋ Inside <b>${esc(c ? c.first : '?')}</b> · −${G.Data.possession.upkeepPerHour} Faith/h · ${T.duration(p.possessUntil - world.t)} left · WASD to move</span>`;
      st.formActs = S.possessedActions(world);
      st.formActs.forEach((a, i) => (h += `<button data-formact="${i}">${esc(a.label)}</button>`));
      h += `<button data-form-switch="spectral">Release (Q)</button>`;
    } else if (p.form === 'human') {
      const hu = p.human;
      h += `<span class="pill">🚶 Human · health ${Math.round(hu.health)} · suspicion ${U.level5(hu.suspicion).toLowerCase()}${hu.detainedUntil > world.t ? ` · <b class="red">detained ${T.duration(hu.detainedUntil - world.t)}</b>` : ''}</span>`;
      st.formActs = S.humanActions(world);
      st.formActs.slice(0, 8).forEach((a, i) => (h += `<button data-formact="${i}">${esc(a.label)}</button>`));
      h += `<button data-form-switch="spectral">Return to spirit (Q)</button>`;
    }
    UI.$('#form-bar').innerHTML = h;
  };

  P.viewHint = function (world) {
    const st = UI.state;
    const el = UI.$('#view-hint');
    if (st.view === 'world') {
      el.innerHTML = 'World View · click a province to inspect · click <b>Thornhaven</b> to descend';
      UI.$('#overlay-bar').classList.remove('hidden');
      UI.$('#overlay-bar').innerHTML = Object.keys(UI.WorldMap.overlays).map((k) => `<button data-overlay="${k}" class="${st.overlay === k ? 'active' : ''}" title="${esc(UI.WorldMap.overlays[k].desc)}">${esc(UI.WorldMap.overlays[k].name)}</button>`).join('');
      return;
    }
    UI.$('#overlay-bar').classList.remove('hidden');
    UI.$('#overlay-bar').innerHTML = `<button data-roofs="1" class="${st.roofMode === 'cutaway' ? 'active' : ''}" title="Toggle roofs (R)">🏠 Roofs: ${st.roofMode === 'cutaway' ? 'lifted' : 'auto'}</button>`;
    const pos = S.playerPos(world);
    const b = S.buildingAt(world, pos.x, pos.y);
    const d = S.districtName(S.districtAt(world, pos.x, pos.y));
    let flood = '';
    if (world.flood.stage !== 'none') flood = ` · <span class="red">Flood: ${world.flood.stage}</span>`;
    el.innerHTML = `${esc(G.Data.city.name)} · ${esc(d)}${b ? ' · ' + esc(b.name) : ''}${flood}${st.camera.follow ? '' : ' · <span class="muted">camera detached (F to follow)</span>'}`;
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
