// Application shell: game loop, input, event wiring and persistence glue.
(function (G) {
  'use strict';
  const UI = G.UI;
  const S = G.Sim;
  const U = G.Util;
  const Sc = UI.Screens;
  const st = UI.state;

  let canvas, ctx, dpr = 1, cssW = 0, cssH = 0;
  let lastFrame = 0, minuteAcc = 0, lastPanel = 0, lastChronicleLen = 0;
  const AUTOSAVE_MS = 30000;

  // ---------- game lifecycle ----------
  UI.startWorld = function (world, fresh) {
    st.world = world;
    st.selected = null;
    st.speed = 0;
    st.view = 'local';
    st.camera = { x: world.player.x, y: world.player.y, zoom: 0.9, follow: true };
    st.seenAlerts = 0;
    lastChronicleLen = world.chronicle.length;
    st.lastAnnounced = world.chronicle.length ? world.chronicle[world.chronicle.length - 1].id : 0;
    st.lastAutosave = performance.now();
    UI.$('#app').classList.remove('hidden');
    Sc.close();
    resize();
    st.dirty = true;
    if (fresh) UI.toast(`A new world begins. Seed <b>${world.seed}</b>.`);
    Sc.tutorial();
  };

  UI.setView = function (v) {
    st.view = v;
    if (v === 'local') st.camera.follow = true;
    st.dirty = true;
  };

  UI.save = function (slot) {
    const ok = S.saveToSlot(st.world, slot);
    UI.toast(ok ? `Saved to ${slot === 'autosave' ? 'autosave' : 'slot ' + slot.slice(-1)}.` : 'Saving failed (storage full or blocked). Try exporting a file.', ok ? '' : 'bad');
  };

  UI.load = function (slot) {
    try {
      const w = S.loadFromSlot(slot);
      if (!w) return UI.toast('That slot is empty.', 'bad');
      UI.startWorld(w, false);
      UI.toast('Game loaded.');
    } catch (e) {
      UI.toast('Could not load: ' + UI.esc(e.message), 'bad');
    }
  };

  function exportSave() {
    const json = S.serialize(st.world);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `godsim-${st.world.country.name.replace(/\W+/g, '-').toLowerCase()}-${Math.floor(st.world.t / 1440)}d.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }
  function importSave(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        UI.startWorld(S.deserialize(r.result), false);
        UI.toast('Save imported.');
      } catch (e) {
        UI.toast('Import failed: ' + UI.esc(e.message), 'bad');
      }
    };
    r.readAsText(file);
  }

  // ---------- loop ----------
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    const w = st.world;
    if (!w || Sc.isOpen()) return;
    handleMovement(w, dt);
    if (st.speed > 0) {
      minuteAcc += UI.SPEEDS[st.speed] * dt;
      const n = Math.floor(minuteAcc);
      if (n > 0) {
        minuteAcc -= n;
        S.advance(w, n);
      }
    }
    if (w.chronicle.length !== lastChronicleLen) announce(w);
    // Autosave at most every 30 real seconds, after a new day.
    if (w.autosaveDue && now - st.lastAutosave > AUTOSAVE_MS) {
      w.autosaveDue = false;
      st.lastAutosave = now;
      S.saveToSlot(w, 'autosave');
    }
    draw(now);
    if (st.dirty || now - lastPanel > 400) {
      lastPanel = now;
      st.dirty = false;
      UI.Panels.topbar(w);
      UI.Panels.left(w);
      UI.Panels.right(w);
      UI.Panels.feed(w);
      UI.Panels.formBar(w);
      UI.Panels.viewHint(w);
    }
  }

  function announce(w) {
    const last = st.lastAnnounced || 0;
    const fresh = w.chronicle.filter((e) => e.id > last);
    for (const e of fresh) if (e.alert || e.level >= 3) UI.toast(`<b>${UI.esc(e.title)}</b><br>${UI.esc(e.text)}`, 'alert');
    st.lastAnnounced = w.chronicle.length ? w.chronicle[w.chronicle.length - 1].id : 0;
    lastChronicleLen = w.chronicle.length;
    // Slow down on a regime change or a challenge result so the player notices.
    if (fresh.some((e) => e.kind === 'regime' || e.kind === 'challenge') && st.speed >= 4) st.speed = 2;
  }

  function draw(now) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (st.view === 'world') UI.WorldMap.render(ctx, cssW, cssH, st.world, now);
    else UI.Local.render(ctx, cssW, cssH, st.world, now);
  }

  function resize() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  // ---------- input ----------
  function handleMovement(w, dt) {
    if (st.view !== 'local') return;
    let dx = 0, dy = 0;
    const k = st.keys;
    if (k.ArrowLeft || k.a) dx -= 1;
    if (k.ArrowRight || k.d) dx += 1;
    if (k.ArrowUp || k.w) dy -= 1;
    if (k.ArrowDown || k.s) dy += 1;
    const speed = w.player.form === 'spectral' ? 9 : 4.5; // tiles per real second
    if (dx || dy) {
      st.moveTarget = null;
      const len = Math.hypot(dx, dy);
      S.movePlayer(w, (dx / len) * speed * dt, (dy / len) * speed * dt);
      st.camera.follow = true;
    } else if (st.moveTarget) {
      const pos = S.playerPos(w);
      const d = U.dist(pos.x, pos.y, st.moveTarget.x, st.moveTarget.y);
      if (d < 0.15) st.moveTarget = null;
      else {
        const step = Math.min(d, speed * dt);
        const bx = pos.x, by = pos.y;
        S.movePlayer(w, ((st.moveTarget.x - pos.x) / d) * step, ((st.moveTarget.y - pos.y) / d) * step);
        const np = S.playerPos(w);
        if (np.x === bx && np.y === by) st.moveTarget = null; // blocked
      }
    }
  }

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onCanvasClick(e) {
    const w = st.world;
    if (!w) return;
    const p = canvasPoint(e);
    if (st.view === 'world') {
      const hit = UI.WorldMap.hitTest(w, p.x, p.y, cssW, cssH);
      if (!hit) return UI.select(null);
      if (hit.kind === 'capital') return UI.setView('local');
      return UI.select(hit.kind, hit.id);
    }
    const t = UI.Local.toTile(p.x, p.y, cssW, cssH);
    const hit = UI.Local.hitTest(w, t.x, t.y);
    if (hit) UI.select(hit.kind, hit.id);
    else UI.select(null);
  }

  function onCanvasContext(e) {
    e.preventDefault();
    const w = st.world;
    if (!w || st.view !== 'local') return;
    const p = canvasPoint(e);
    const t = UI.Local.toTile(p.x, p.y, cssW, cssH);
    st.moveTarget = { x: U.clamp(t.x, 0, G.Data.city.width - 0.01), y: U.clamp(t.y, 0, G.Data.city.height - 0.01) };
    st.camera.follow = true;
  }

  function onCanvasMove(e) {
    const w = st.world;
    if (!w || st.view !== 'local') return;
    const p = canvasPoint(e);
    if (st.drag) {
      st.camera.follow = false;
      const ts = 24 * st.camera.zoom;
      st.camera.x -= (p.x - st.drag.x) / ts;
      st.camera.y -= (p.y - st.drag.y) / ts;
      st.drag = p;
      st.dragMoved = true;
      return;
    }
    const t = UI.Local.toTile(p.x, p.y, cssW, cssH);
    st.hover = UI.Local.hitTest(w, t.x, t.y);
    canvas.title = '';
    if (st.hover && st.hover.kind === 'character') {
      const c = S.char(w, st.hover.id);
      canvas.title = `${c.name} — ${c.occupation}, ${c.activity}`;
    } else if (st.hover && st.hover.kind === 'building') canvas.title = S.building(w, st.hover.id).name;
  }

  function onKey(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    st.keys[key] = down;
    if (!down || !st.world) return;
    if (key === 'Escape') {
      if (Sc.isOpen()) {
        if (UI.$('#modal').dataset.closable !== '0') Sc.close();
      } else Sc.menu();
      return;
    }
    if (Sc.isOpen()) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) e.preventDefault();
    if (key === ' ') {
      st.speed = st.speed === 0 ? st.prevSpeed || 2 : 0;
      if (st.speed) st.prevSpeed = st.speed;
    } else if (/^[0-5]$/.test(key)) setSpeed(+key);
    else if (key === 'm') UI.setView('world');
    else if (key === 'l') UI.setView('local');
    else if (key === 'q') UI.cmd({ type: 'form', form: 'spectral' });
    else if (key === 'h') UI.cmd({ type: 'form', form: 'human' });
    else if (key === 'e') possessSelected();
    else if (key === 'f') st.camera.follow = true;
    else if (key === 'r') toggleRoofs();
    else if (key === 'c') Sc.chronicle();
    else if (key === '+' || key === '=') zoom(1.2);
    else if (key === '-') zoom(1 / 1.2);
    st.dirty = true;
  }

  function toggleRoofs() {
    st.roofMode = st.roofMode === 'cutaway' ? 'auto' : 'cutaway';
    UI.toast(st.roofMode === 'cutaway' ? 'Roofs lifted: you can see inside every building.' : 'Roofs shown. They lift when you zoom in or look inside.');
    st.dirty = true;
  }
  function setSpeed(s) {
    st.speed = s;
    if (s) st.prevSpeed = s;
    st.dirty = true;
  }
  function zoom(f) {
    st.camera.zoom = U.clamp(st.camera.zoom * f, 0.5, 3);
  }
  function possessSelected() {
    const sel = st.selected;
    if (!sel || sel.kind !== 'character') return UI.toast('Select a person first (click them), then possess.', 'bad');
    UI.cmd({ type: 'form', form: 'possession', targetId: sel.id });
  }

  // ---------- delegated clicks ----------
  function onClick(e) {
    const el = e.target.closest('button, [data-char], [data-prayer], [data-entry]');
    if (!el) return;
    const d = el.dataset;
    const w = st.world;
    if (d.screen) return screenAction(d.screen);
    if (d.ng) return Sc.ngSet(d.ng, d.val);
    if (d.slot) {
      if (d.slotAction === 'save') {
        UI.save(d.slot);
        return Sc.menu();
      }
      return UI.load(d.slot);
    }
    if (d.export) return exportSave();
    if (d.tut) {
      if (d.tut === 'skip') w.settings.tutorial = false;
      else w.tutorialStep++;
      return Sc.tutorial();
    }
    if (!w) return;
    if (d.speed != null) return setSpeed(+d.speed);
    if (d.view) return UI.setView(d.view);
    if (d.form) {
      if (d.form === 'possession') return possessSelected();
      return UI.cmd({ type: 'form', form: d.form });
    }
    if (d.formSwitch) return UI.cmd({ type: 'form', form: d.formSwitch });
    if (d.ltab) {
      st.ltab = d.ltab;
      st.dirty = true;
      return;
    }
    if (d.rtab) {
      st.rtab = d.rtab;
      st.dirty = true;
      return;
    }
    if (d.pfilter) {
      st.prayerFilter = d.pfilter;
      st.dirty = true;
      return;
    }
    if (d.overlay) {
      st.overlay = d.overlay;
      st.dirty = true;
      return;
    }
    if (d.enter) return UI.setView('local');
    if (d.roofs) return toggleRoofs();
    if (d.respond) return UI.cmd({ type: 'prayer', prayerId: +d.respond, kind: d.kind });
    if (d.ability) {
      const sel = document.querySelector(`select[data-optfor="${d.ability}"]`);
      const option = sel ? sel.value : undefined;
      const target = d.tkind === 'country' ? { kind: 'country', id: 'country' } : { kind: d.tkind, id: d.tkind === 'character' ? +d.tid : d.tid };
      return UI.cmd({ type: 'ability', ability: d.ability, target, option });
    }
    if (d.possess) return UI.cmd({ type: 'form', form: 'possession', targetId: +d.possess });
    if (d.whisper) return UI.cmd({ type: 'speakGifted', targetId: +d.whisper });
    if (d.formact != null) {
      const act = st.formActs && st.formActs[+d.formact];
      if (!act) return;
      return UI.cmd({ type: w.player.form === 'possession' ? 'possessedAct' : 'humanAct', act });
    }
    if (d.char) return UI.select('character', +d.char, { focus: e.target.closest('#right, #feed, #left') != null });
    if (d.prayer) {
      const p = w.prayers.find((x) => x.id === +d.prayer);
      UI.select('prayer', +d.prayer);
      const c = p && S.char(w, p.requesterId);
      if (c && st.view === 'local') {
        st.camera.follow = false;
        st.camera.x = c.x;
        st.camera.y = c.y;
      }
      return;
    }
    if (d.entry) {
      const entry = w.chronicle.find((x) => x.id === +d.entry);
      if (entry && entry.entities && entry.entities.length) UI.select('character', entry.entities[0], { focus: true });
    }
  }

  function screenAction(a) {
    if (a === 'start') {
      const opts = Sc.newGameOptions();
      return UI.startWorld(S.createWorld(opts), true);
    }
    if (a === 'continue') return UI.load('autosave');
    if (a === 'load') return Sc.loadMenu();
    if (a === 'help') return Sc.help();
    if (a === 'title') {
      if (st.world) S.saveToSlot(st.world, 'autosave');
      return Sc.title();
    }
    if (a === 'menu') return Sc.menu();
    if (a === 'chronicle') return Sc.chronicle();
    if (a === 'close') return Sc.close();
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.optfor) {
      st.abilityOptions[t.dataset.optfor] = t.value;
      st.dirty = true;
      t.blur();
    }
    if (t.id === 'import-file' && t.files && t.files[0]) importSave(t.files[0]);
  }

  // ---------- boot ----------
  function boot() {
    const bm = document.getElementById('boot-msg');
    if (bm) bm.remove();
    canvas = UI.$('#canvas');
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', () => {
      resize();
      st.dirty = true;
    });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    canvas.addEventListener('click', (e) => {
      if (st.dragMoved) {
        st.dragMoved = false;
        return;
      }
      onCanvasClick(e);
    });
    canvas.addEventListener('contextmenu', onCanvasContext);
    canvas.addEventListener('mousemove', onCanvasMove);
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || e.shiftKey) {
        st.drag = canvasPoint(e);
        st.dragMoved = false;
      }
    });
    window.addEventListener('mouseup', () => (st.drag = null));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (st.view === 'local') zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));
    window.addEventListener('blur', () => (st.keys = {}));
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    UI.$('#btn-menu').onclick = () => st.world && Sc.menu();
    UI.$('#btn-chronicle').onclick = () => st.world && Sc.chronicle();
    UI.$('#modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal' && UI.$('#modal').dataset.closable !== '0') Sc.close();
    });
    window.addEventListener('beforeunload', () => {
      if (st.world) S.saveToSlot(st.world, 'autosave');
    });
    Sc.title();
    requestAnimationFrame(frame);
  }

  UI.boot = boot;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})((globalThis.GODSIM = globalThis.GODSIM || {}));
