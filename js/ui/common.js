// Shared UI state and helpers. The UI reads world state and sends commands; it never owns simulation logic.
(function (G) {
  'use strict';
  const UI = G.UI;
  const U = G.Util;
  const S = G.Sim;

  UI.SPEEDS = [0, 10, 30, 120, 720, 2880]; // game minutes per real second
  UI.SPEED_NAMES = ['Paused', 'Slow', 'Normal', 'Fast', 'Very fast', 'Generations'];

  UI.state = {
    world: null,
    view: 'local',
    speed: 0,
    selected: null, // { kind: 'character'|'building'|'prayer'|'province'|'country', id }
    ltab: 'prayers',
    rtab: 'inspect',
    prayerFilter: 'all',
    overlay: 'belief',
    camera: { x: 30, y: 16, zoom: 1, follow: true },
    keys: {},
    dirty: true,
    seenChronicle: 0,
    seenAlerts: 0,
    lastAutosave: 0,
    abilityOptions: {}, // remembers chosen option per ability
  };

  UI.esc = U.escape;
  UI.$ = (sel) => document.querySelector(sel);
  UI.$$ = (sel) => Array.from(document.querySelectorAll(sel));

  UI.meter = function (label, v, color, valText, title) {
    const pct = U.clamp(v, 0, 100);
    return `<div class="meter" ${title ? `title="${UI.esc(title)}"` : ''}><span>${label}</span><div class="bar"><div style="width:${pct}%;background:${color || 'var(--teal)'}"></div></div><span class="val">${valText != null ? valText : U.level5(v)}</span></div>`;
  };

  UI.toast = function (msg, kind) {
    if (!msg) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = msg;
    UI.$('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'alert' ? 7000 : 4200);
    const all = UI.$$('#toasts .toast');
    if (all.length > 5) all[0].remove();
  };

  // Send a command to the simulation and report the outcome.
  UI.cmd = function (cmd) {
    const w = UI.state.world;
    const r = G.Sim.command(w, cmd);
    if (r && r.msg) UI.toast(UI.esc(r.msg) + (r.cost ? ` <span class="gold">−${r.cost} Faith</span>` : ''), r.ok ? '' : 'bad');
    UI.state.dirty = true;
    return r;
  };

  UI.select = function (kind, id, opts = {}) {
    UI.state.selected = kind ? { kind, id } : null;
    if (kind && kind !== 'country') UI.state.rtab = 'inspect';
    if (opts.focus && kind === 'character') {
      const c = S.char(UI.state.world, id);
      if (c) {
        if (UI.state.view !== 'local') UI.setView('local');
        UI.state.camera.follow = false;
        UI.state.camera.x = c.x;
        UI.state.camera.y = c.y;
      }
    }
    UI.state.dirty = true;
  };

  UI.roleColor = function (c) {
    if (c.role === 'monarch' || c.role === 'heir') return '#f2c94c';
    if (c.role === 'priest') return '#f5f0e6';
    if (c.role === 'noble') return '#c58af9';
    if (c.role === 'general' || c.role === 'soldier' || c.role === 'guard') return '#e2564f';
    if (c.role === 'reformer' || c.factionId === 'reformers') return '#4fc3f7';
    if (c.role === 'healer') return '#7ee08a';
    if (c.role === 'farmer') return '#c9a46a';
    if (c.role === 'child') return '#ffd7a8';
    if (c.role === 'official' || c.role === 'clerk') return '#b0bec5';
    return '#d9c7b0';
  };

  UI.beliefColor = (b) => {
    // cool grey (doubt) -> gold (devotion)
    const t = U.clamp(b / 100, 0, 1);
    const r = Math.round(U.lerp(110, 245, t));
    const g = Math.round(U.lerp(120, 200, t));
    const bl = Math.round(U.lerp(150, 70, t));
    return `rgb(${r},${g},${bl})`;
  };

  UI.charLink = (c) => (c ? `<span class="link" data-char="${c.id}">${UI.esc(c.name)}</span>` : '—');
  UI.timeAgo = (w, t) => G.Time.duration(w.t - t) + ' ago';
})((globalThis.GODSIM = globalThis.GODSIM || {}));
