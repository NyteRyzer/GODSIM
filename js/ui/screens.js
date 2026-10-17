// Modal screens: title / new game, menu (save, load, import, export), chronicle, help and tutorial.
(function (G) {
  'use strict';
  const UI = G.UI;
  const S = G.Sim;
  const T = G.Time;
  const esc = UI.esc;
  const Sc = (UI.Screens = {});

  Sc.open = function (html, opts = {}) {
    UI.$('#modal-box').innerHTML = html;
    UI.$('#modal').classList.remove('hidden');
    UI.$('#modal').dataset.closable = opts.closable === false ? '0' : '1';
  };
  Sc.close = function () {
    UI.$('#modal').classList.add('hidden');
    UI.$('#modal-box').innerHTML = '';
  };
  Sc.isOpen = () => !UI.$('#modal').classList.contains('hidden');

  // ---------- Title / new game ----------
  const ng = {
    mode: 'story', challenge: 'silent', philosophy: 'compassionate',
    startFaith: 120, capacityBonus: 0, unlockAll: false, crisisFrequency: 1, costMultiplier: 1, seed: '', tutorial: true,
  };

  Sc.title = function () {
    const meta = S.slotMeta('autosave');
    const sc = G.Data.scenarios.river_kingdom;
    let h = `<div class="title-screen"><div class="sub">DIVINE DOMINION</div><h1>GODSIM</h1>
      <div class="tagline">A living Earth. A changing humanity. A God whose power depends on faith.</div></div>`;
    h += `<div style="display:flex;gap:10px;justify-content:center;margin-bottom:16px">
      ${meta ? `<button class="btn" data-screen="continue">Continue · ${esc(meta.date)}</button>` : ''}
      <button class="btn ${meta ? 'secondary' : ''}" data-screen="load">Load game</button>
      <button class="btn secondary" data-screen="help">How to play</button></div>`;
    h += `<h3>New game</h3>
      <h4>Era & scenario</h4><div class="grid4" style="grid-template-columns:repeat(5,1fr)">${G.Data.eras.map((e) => `<button class="choice ${e.id === sc.era ? 'active' : ''}" disabled title="${esc(e.themes)}"><b>${esc(e.name)}</b><span class="small muted">${e.available ? 'The River Miracle' : 'Future update'}</span></button>`).join('')}</div>
      <p class="small">${esc(sc.blurb)}</p>
      <h4>Mode</h4><div class="grid4" style="grid-template-columns:repeat(3,1fr)">
        ${[['story', 'Story', 'The River Miracle with default settings and a short tutorial.'], ['sandbox', 'Sandbox', 'Tune starting Faith, capacity, abilities, crisis frequency and difficulty.'], ['challenge', 'Challenge', 'A scenario with objectives and constraints.']].map(([id, n, d]) => `<button class="choice ${ng.mode === id ? 'active' : ''}" data-ng="mode" data-val="${id}"><b>${n}</b><span class="small muted">${d}</span></button>`).join('')}
      </div>`;
    if (ng.mode === 'challenge') {
      h += `<h4>Challenge</h4><div class="grid2">${Object.keys(G.Data.challenges).filter((k) => k !== 'none').map((k) => `<button class="choice ${ng.challenge === k ? 'active' : ''}" data-ng="challenge" data-val="${k}"><b>${esc(G.Data.challenges[k].name)}</b><span class="small muted">${esc(G.Data.challenges[k].desc)}</span></button>`).join('')}</div>`;
    }
    h += `<h4>Divine philosophy</h4><div class="grid4">${Object.keys(G.Data.philosophies).map((k) => `<button class="choice ${ng.philosophy === k ? 'active' : ''}" data-ng="philosophy" data-val="${k}"><b>${esc(G.Data.philosophies[k].name)}</b><span class="small muted">${esc(G.Data.philosophies[k].desc)}</span></button>`).join('')}</div>
      <div class="small muted" style="margin-top:4px">Philosophies are playstyles, not moral grades.</div>`;
    if (ng.mode === 'sandbox') {
      h += `<h4>Sandbox settings</h4><div class="grid4">
        <label class="field">Starting Faith<input type="number" min="0" max="20000" value="${ng.startFaith}" data-ngi="startFaith"></label>
        <label class="field">Extra capacity<input type="number" min="0" max="50000" value="${ng.capacityBonus}" data-ngi="capacityBonus"></label>
        <label class="field">Crisis frequency<select data-ngi="crisisFrequency">${[[0.25, 'Rare'], [1, 'Normal'], [2, 'Frequent'], [4, 'Apocalyptic']].map(([v, n]) => `<option value="${v}" ${+ng.crisisFrequency === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field">Difficulty (costs)<select data-ngi="costMultiplier">${[[0.5, 'Generous'], [1, 'Normal'], [1.5, 'Hard']].map(([v, n]) => `<option value="${v}" ${+ng.costMultiplier === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field" style="flex-direction:row;align-items:center"><input type="checkbox" ${ng.unlockAll ? 'checked' : ''} data-ngi="unlockAll"> Unlock all abilities (creative)</label>
        <label class="field">Seed (optional)<input type="text" value="${esc(ng.seed)}" data-ngi="seed" placeholder="random"></label>
      </div>`;
    }
    h += `<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;align-items:center">
      <label class="small"><input type="checkbox" ${ng.tutorial ? 'checked' : ''} data-ngi="tutorial"> Show tutorial</label>
      <button class="btn" data-screen="start">Begin</button></div>`;
    Sc.open(h, { closable: false });
  };

  Sc.readNewGameInputs = function () {
    for (const el of UI.$$('[data-ngi]')) {
      const k = el.dataset.ngi;
      if (el.type === 'checkbox') ng[k] = el.checked;
      else if (el.type === 'number') ng[k] = Math.max(0, +el.value || 0);
      else ng[k] = el.value;
    }
  };
  Sc.ngSet = function (k, v) {
    Sc.readNewGameInputs();
    ng[k] = v;
    Sc.title();
  };

  Sc.newGameOptions = function () {
    Sc.readNewGameInputs();
    let seed;
    if (ng.seed) {
      seed = 0;
      for (const ch of String(ng.seed)) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
    }
    const settings = { mode: ng.mode, philosophy: ng.philosophy, tutorial: ng.tutorial, challenge: ng.mode === 'challenge' ? ng.challenge : 'none' };
    if (ng.mode === 'sandbox') Object.assign(settings, { startFaith: +ng.startFaith, capacityBonus: +ng.capacityBonus, unlockAll: !!ng.unlockAll, crisisFrequency: +ng.crisisFrequency, costMultiplier: +ng.costMultiplier });
    return { scenarioId: 'river_kingdom', seed, settings };
  };

  // ---------- Menu ----------
  Sc.menu = function () {
    const w = UI.state.world;
    let h = `<h2>Menu</h2><p class="muted">${esc(w.country.name)} · ${esc(T.format(w))}</p>
      <h4>Save</h4><div class="grid4">${['slot1', 'slot2', 'slot3'].map((s) => slotButton(s, 'save')).join('')}<button class="choice" data-export="1"><b>Export file</b><span class="small muted">Download a .json save</span></button></div>
      <h4>Load</h4><div class="grid4">${S.SLOTS.map((s) => slotButton(s, 'load')).join('')}</div>
      <div style="margin-top:8px"><label class="small">Import save file: <input type="file" accept=".json,application/json" id="import-file"></label></div>
      <div style="display:flex;gap:10px;margin-top:18px;justify-content:space-between">
        <div style="display:flex;gap:8px"><button class="btn secondary" data-screen="help">How to play</button><button class="btn secondary" data-screen="chronicle">Chronicle</button><button class="btn secondary" data-screen="title">Quit to title</button></div>
        <button class="btn" data-screen="close">Resume</button></div>`;
    Sc.open(h);
  };
  function slotButton(slot, action) {
    const m = S.slotMeta(slot);
    const name = slot === 'autosave' ? 'Autosave' : 'Slot ' + slot.slice(-1);
    const disabled = action === 'load' && !m;
    return `<button class="choice" data-slot="${slot}" data-slot-action="${action}" ${disabled ? 'disabled' : ''}><b>${action === 'save' ? 'Save to ' : ''}${name}</b><span class="small muted">${m ? `${esc(m.date)} · ${esc(m.country)}<br>saved ${new Date(m.savedAt).toLocaleString()}` : 'Empty'}</span></button>`;
  }

  Sc.loadMenu = function () {
    let h = `<h2>Load game</h2><div class="grid4">${S.SLOTS.map((s) => slotButton(s, 'load')).join('')}</div>
      <div style="margin-top:10px"><label class="small">Import save file: <input type="file" accept=".json,application/json" id="import-file"></label></div>
      <div style="text-align:right;margin-top:16px"><button class="btn secondary" data-screen="${UI.state.world ? 'menu' : 'title'}">Back</button></div>`;
    Sc.open(h, { closable: !!UI.state.world });
  };

  // ---------- Chronicle ----------
  Sc.chronicle = function (query = '', minLevel = 1) {
    const w = UI.state.world;
    const q = query.toLowerCase();
    const items = w.chronicle.filter((e) => e.level >= minLevel && (!q || (e.title + ' ' + e.text).toLowerCase().includes(q))).slice(-400).reverse();
    let h = `<div style="display:flex;justify-content:space-between;align-items:center"><h2>📜 Chronicle of ${esc(w.country.name)}</h2><button class="btn secondary" data-screen="close">Close</button></div>
      <p class="muted small">The world's record of events, causes and consequences — as far as anyone wrote them down.</p>
      <div style="display:flex;gap:8px;margin-bottom:8px"><input type="text" id="chron-q" value="${esc(query)}" placeholder="Search names, places, events…" style="flex:1;background:#1c2846;color:var(--text);border:1px solid #2e3d66;border-radius:6px;padding:6px">
      <select id="chron-level">${[[0, 'Everything'], [1, 'Notable'], [2, 'Major'], [3, 'Historic']].map(([v, n]) => `<option value="${v}" ${minLevel === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div>${items.length ? items.map((e) => `<div class="chron-item lvl${e.level}"><div class="t">${esc(T.format(w, e.t))} · ${esc(e.kind)}</div><b>${esc(e.title)}</b><div>${esc(e.text)}</div></div>`).join('') : '<div class="muted">Nothing recorded.</div>'}</div>`;
    Sc.open(h);
    const input = UI.$('#chron-q');
    input.focus();
    input.setSelectionRange(query.length, query.length);
    input.oninput = () => Sc.chronicle(input.value, +UI.$('#chron-level').value);
    UI.$('#chron-level').onchange = () => Sc.chronicle(input.value, +UI.$('#chron-level').value);
  };

  // ---------- The Thornhaven Herald ----------
  Sc.herald = function (index) {
    const w = UI.state.world;
    const eds = w.life.herald;
    w.life.heraldUnread = false;
    if (!eds.length) {
      Sc.open(`<div class="herald"><h1>The Thornhaven Herald</h1><p style="text-align:center;margin-top:16px">The first edition goes to press at dawn tomorrow.</p><div class="nav"><span></span><button data-screen="close">Close</button></div></div>`);
      return;
    }
    const i = index == null ? eds.length - 1 : Math.max(0, Math.min(eds.length - 1, index));
    const e = eds[i];
    const lead = e.headlines[0];
    let body = '';
    if (lead) body += `<article class="lead"><h3>${esc(lead.title)}</h3><p>${esc(lead.text)}</p></article>`;
    for (const hl of e.headlines.slice(1)) body += `<article><h3>${esc(hl.title)}</h3><p>${esc(hl.text)}</p></article>`;
    if (!e.headlines.length) body += '<article><h3>A Quiet Day in Thornhaven</h3><p>Nothing of note troubled the city. The bakers baked, the bells rang, and the river kept to its banks.</p></article>';
    body += `<div class="box"><b>Weather.</b> ${esc(e.season)}, ${esc(e.weather.toLowerCase())}.<br><b>Market.</b> A loaf of bread: ${e.bread} pennies.<br><b>Parish register.</b> ${e.births} born, ${e.deaths} buried.${e.notice ? `<br><b>Coming.</b> ${esc(e.notice)}` : ''}</div>`;
    if (e.rumours.length) body += `<div class="box"><b>Overheard at the Copper Kettle</b>${e.rumours.map((r) => `<p style="margin-top:4px;font-style:italic">${esc(r)}</p>`).join('')}</div>`;
    Sc.open(`<div class="herald"><h1>The Thornhaven Herald</h1>
      <div class="masthead"><span>${esc(e.date)}</span><span>By leave of ${esc(e.ruler)}</span><span>One penny</span></div>
      <div class="cols">${body}</div>
      <div class="nav"><button data-herald="${i - 1}" ${i > 0 ? '' : 'disabled'}>‹ Earlier edition</button><button data-screen="close">Close</button><button data-herald="${i + 1}" ${i < eds.length - 1 ? '' : 'disabled'}>Later edition ›</button></div></div>`);
  };

  // ---------- Help ----------
  Sc.help = function () {
    const back = UI.state.world ? 'menu' : 'title';
    Sc.open(`<h2>How to play</h2>
      <p>You are a god whose power depends on faith. The kingdom of Velmora lives on without you: people work, love, pray, age and die; factions scheme; crises emerge. Your job is not to win — it is to decide when, how, and whether to intervene.</p>
      <h4>Faith</h4><p>Faith is your only resource. It regenerates from passive divine energy, from the <b>belief</b> of the people (devout people count for much more than lukewarm ones), from gratitude after answered prayers, and from the Church and religious movements. Ongoing effects (possession, wards) have upkeep. Hover the Faith bar for the full breakdown. Acting in the world builds <b>renown</b>, unlocking new tiers of power.</p>
      <h4>Prayers</h4><p>People pray from their circumstances. Each prayer can be answered <b>directly</b> (a reliable but costly miracle), <b>indirectly</b> (move a human to act; they may refuse), with a <b>delayed</b> answer, an <b>alternative</b> outcome, or <b>silence</b>. People remember. Unanswered prayers breed doubt — especially where earlier miracles raised expectations.</p>
      <h4>Three forms</h4><p><b>Spectral</b>: drift unseen and observe; only people with <b>The Gift</b> can sense you. <b>Possession</b>: inhabit someone within range to act through them — warn neighbours, carry people from a flood, make a ruler's decision — at a cost and with aftereffects. <b>Human</b>: walk as an ordinary person; talk, help, learn rumours — but no divine powers, and guards, floods and suspicion are real dangers.</p>
      <h4>Politics and intrigue</h4><p>Use <b>Sway</b> on anyone to plant an ambition: war, an iron fist, a coup, revolt, theocracy, reform, peace, mercy or loyalty. People may refuse. A ruler acts on theirs (declaring war, imposing martial law). A general or noble pushed toward a coup starts a <b>conspiracy</b> that recruits allies, can be discovered, and strikes when strong enough. The Nation tab tracks it. In human form you can <b>persuade</b> people for free, at a risk. Possess a ruler to declare war, impose martial law or purge the nobles; possess a plotter to strike now, or a guard to betray the plot.</p>
      <h4>A living world</h4><p>Seasons turn and weather changes: storms drive people indoors and fog hides your miracles from witnesses. Festivals fill the square, funerals and weddings gather families, omens appear in the sky for you to interpret, and great miracles can leave relics that draw pilgrims. Follow (☆) people to hear about their lives, read the daily <b>Herald</b>, and collect <b>Deeds</b>. Turn on sound with 🔇.</p>
      <h4>Consequences</h4><p>Witnesses interpret miracles through their own beliefs: a protector, a judge, coincidence or fraud. Stories spread through families. Gatherings form, merge into the Church or split from it. Rulers claim your miracles for themselves. Politics responds to legitimacy, corruption, inequality, loyalty and religion — you can tip the balance, never dictate it.</p>
      <h4>Controls</h4><div class="kv"><div>WASD / arrows</div><div>Move (spirit, vessel, or human body)</div><div>Click</div><div>Select a person, building, prayer or province</div><div>Right-click</div><div>Move to a point</div><div>Mouse wheel</div><div>Zoom</div><div>Space / 1–5</div><div>Pause / speed</div><div>M / L</div><div>World / Local view</div><div>Q / E / H</div><div>Spectral / Possess selected / Human form</div><div>F</div><div>Camera follows you</div><div>V</div><div>Cycle lenses: belief, mood, danger, intrigue</div><div>N</div><div>Read the Herald</div><div>P</div><div>Photo mode (hide the interface)</div><div>[ and ]</div><div>Hide or show the side panels</div><div>?</div><div>This help</div><div>R</div><div>Lift all roofs (they also lift when you zoom in or look inside a building)</div><div>C</div><div>Chronicle</div><div>Esc</div><div>Menu</div></div>
      <div style="text-align:right;margin-top:16px"><button class="btn secondary" data-screen="${back}">Back</button></div>`);
  };

  // ---------- Tutorial ----------
  const STEPS = [
    ['Welcome, unseen one', 'You are drifting above Thornhaven, capital of Velmora. Time is paused. Press <b>▶▶</b> (or 2) when you are ready — the world will not wait for you after that.'],
    ['Faith is power', 'The golden bar at the top is your <b>Faith</b>. Hover it to see exactly where it comes from and where it goes. Miracles cost Faith; belief, gratitude and the Church restore it.'],
    ['Prayers', 'The inbox on the left fills with prayers. Click one to see who is asking, why, and your options: direct, indirect, delayed, alternative — or silence. Each has a different cost, certainty and consequence.'],
    ['The river is rising', 'Spring rains threaten the Riverside farms east of the river. When the water comes, some families will be trapped. You will not have enough Faith to save everyone directly. Watch, choose, and live with it.'],
    ['Three forms', 'Use the buttons at the top: <b>Spectral</b> to observe, <b>Possess</b> to act through the selected person (get close first), <b>Human</b> to walk among them without powers. Nell the healer has The Gift — she may sense you.'],
    ['Scales', 'Press <b>World</b> (M) for the grand map: provinces, overlays and national politics. The <b>Nation</b> tab shows the realm\'s condition and any decision the ruler must make. The <b>Chronicle</b> remembers everything.'],
  ];
  Sc.tutorial = function () {
    const w = UI.state.world;
    let el = UI.$('#tutorial');
    if (!w || !w.settings.tutorial || w.tutorialStep >= STEPS.length) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'tutorial';
      el.className = 'tutorial';
      document.body.appendChild(el);
    }
    const [title, text] = STEPS[w.tutorialStep];
    el.innerHTML = `<b class="gold">${esc(title)}</b><div style="margin-top:6px">${text}</div><div class="row"><span class="small muted">${w.tutorialStep + 1} / ${STEPS.length}</span><span><button class="btn secondary" data-tut="skip">Skip</button> <button class="btn" data-tut="next">${w.tutorialStep === STEPS.length - 1 ? 'Begin' : 'Next'}</button></span></div>`;
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
