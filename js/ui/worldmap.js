// World View: a stylised map of Velmora and its neighbours with data overlays.
(function (G) {
  'use strict';
  const UI = G.UI;
  const S = G.Sim;
  const U = G.Util;
  const M = (UI.WorldMap = {});

  // Map space is 1000 x 650.
  M.shapes = {
    ostmark: [[60, 60], [330, 40], [360, 120], [330, 210], [250, 270], [150, 300], [70, 250], [40, 150]],
    highmarch: [[330, 40], [560, 50], [690, 110], [680, 220], [560, 250], [420, 240], [330, 210], [360, 120]],
    crownlands: [[250, 270], [330, 210], [420, 240], [520, 250], [530, 330], [500, 420], [400, 450], [300, 420], [240, 350]],
    riverlands: [[520, 250], [560, 250], [680, 220], [700, 320], [670, 440], [590, 470], [500, 420], [530, 330]],
    saltcoast: [[300, 420], [400, 450], [500, 420], [590, 470], [560, 560], [430, 590], [320, 560], [270, 480]],
    kesh: [[690, 110], [880, 90], [960, 220], [940, 420], [860, 560], [700, 580], [590, 470], [670, 440], [700, 320], [680, 220]],
  };
  M.labels = {
    ostmark: [180, 170], highmarch: [510, 150], crownlands: [380, 345], riverlands: [610, 360], saltcoast: [440, 520], kesh: [820, 330],
  };
  M.capital = [410, 330];
  M.river = [[600, 70], [610, 150], [590, 240], [600, 320], [585, 400], [560, 470], [540, 600]];

  function pointIn(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  M.transform = function (W, H) {
    const s = Math.min(W / 1000, H / 650) * 0.96;
    return { s, ox: (W - 1000 * s) / 2, oy: (H - 650 * s) / 2 };
  };

  M.hitTest = function (world, sx, sy, W, H) {
    const t = M.transform(W, H);
    const x = (sx - t.ox) / t.s;
    const y = (sy - t.oy) / t.s;
    if (U.dist(x, y, M.capital[0], M.capital[1]) < 16) return { kind: 'capital' };
    for (const id in M.shapes) {
      if (pointIn(M.shapes[id], x, y)) {
        if (id === 'kesh' || id === 'ostmark') return { kind: 'neighbor', id };
        return { kind: 'province', id };
      }
    }
    return null;
  };

  M.overlays = {
    belief: { name: 'Faith', desc: 'Average belief' },
    stability: { name: 'Unrest', desc: 'Provincial unrest' },
    economy: { name: 'Economy', desc: 'Provincial prosperity' },
    government: { name: 'Government', desc: 'Regime type' },
    exposure: { name: 'Divine exposure', desc: 'How openly your hand has been seen' },
    reputation: { name: 'Reputation', desc: 'How communities see you' },
  };

  const GOV_COLORS = { monarchy: '#a2803a', constitutional: '#b3a24c', democracy: '#3f8fb8', republic: '#4b6a8a', dictatorship: '#8a4b3a', theocracy: '#d8c27a', revolutionary: '#b84b6a' };
  const REP_COLORS = { 'Compassionate Protector': '#e0b341', 'Wrathful Judge': '#c0504d', Coincidence: '#7f8aa3', Deception: '#7c5ea8', 'No opinion yet': '#3a4560' };

  function provinceColor(world, id, overlay) {
    const p = S.province(world, id);
    const c = world.country;
    if (!p) return '#333';
    if (overlay === 'belief') return heat(p.belief, [70, 80, 110], [240, 196, 80]);
    if (overlay === 'stability') return heat(p.unrest, [60, 120, 90], [200, 70, 60]);
    if (overlay === 'economy') return heat(p.economy, [110, 70, 60], [90, 170, 100]);
    if (overlay === 'government') return GOV_COLORS[c.government];
    if (overlay === 'exposure') return heat(c.exposure * (p.local || id === 'riverlands' ? 1 : 0.6), [50, 60, 90], [255, 240, 200]);
    if (overlay === 'reputation') return REP_COLORS[S.reputationLabel(world, id)] || '#3a4560';
    return '#555';
  }
  function heat(v, a, b) {
    const t = U.clamp(v / 100, 0, 1);
    return `rgb(${Math.round(U.lerp(a[0], b[0], t))},${Math.round(U.lerp(a[1], b[1], t))},${Math.round(U.lerp(a[2], b[2], t))})`;
  }

  M.render = function (ctx, W, H, world, now) {
    const st = UI.state;
    const t = M.transform(W, H);
    ctx.fillStyle = '#0d2236';
    ctx.fillRect(0, 0, W, H);
    // Sea texture
    ctx.strokeStyle = '#ffffff08';
    for (let i = 0; i < 30; i++) {
      ctx.beginPath();
      const yy = (i * 37 + (now / 80) % 37) % H;
      ctx.moveTo(0, yy);
      ctx.lineTo(W, yy + 10);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(t.ox, t.oy);
    ctx.scale(t.s, t.s);
    const sel = st.selected;
    for (const id in M.shapes) {
      const poly = M.shapes[id];
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      const isNeighbor = id === 'kesh' || id === 'ostmark';
      if (isNeighbor) {
        const n = S.neighbor(world, id);
        ctx.fillStyle = st.overlay === 'government' ? GOV_COLORS[n.government] : '#2b3347';
        if (world.war && world.war.enemy === id) ctx.fillStyle = '#5a2a2a';
      } else ctx.fillStyle = provinceColor(world, id, st.overlay);
      ctx.fill();
      ctx.lineWidth = isNeighbor ? 1.5 : 2.5;
      ctx.strokeStyle = isNeighbor ? '#55607a' : '#e0b34199';
      if (sel && (sel.kind === 'province' || sel.kind === 'neighbor') && sel.id === id) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
      }
      ctx.stroke();
    }
    // Velmora border
    ctx.strokeStyle = '#e0b341';
    ctx.lineWidth = 1;
    // River
    ctx.strokeStyle = '#4a86d0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    M.river.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    // Labels
    ctx.textAlign = 'center';
    for (const id in M.labels) {
      const [x, y] = M.labels[id];
      const isNeighbor = id === 'kesh' || id === 'ostmark';
      const name = isNeighbor ? S.neighbor(world, id).name : S.province(world, id).name;
      ctx.font = `${isNeighbor ? 'italic ' : 'bold '}${isNeighbor ? 16 : 15}px sans-serif`;
      ctx.fillStyle = '#000a';
      ctx.fillText(name, x + 1, y + 1);
      ctx.fillStyle = isNeighbor ? '#c9cfdd' : '#fff';
      ctx.fillText(name, x, y);
      if (!isNeighbor) {
        const p = S.province(world, id);
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#ffffffcc';
        const v = st.overlay === 'belief' ? `Faith ${Math.round(p.belief)}` : st.overlay === 'stability' ? `Unrest ${Math.round(p.unrest)}` : st.overlay === 'economy' ? `Economy ${Math.round(p.economy)}` : st.overlay === 'reputation' ? S.reputationLabel(world, id) : st.overlay === 'exposure' ? `Exposure ${Math.round(world.country.exposure)}` : G.Data.governments[world.country.government].name;
        ctx.fillText(`${p.pop}k people · ${v}`, x, y + 16);
        // Crisis icons
        let icons = '';
        if (p.flooded || (id === 'riverlands' && world.flood.stage !== 'none')) icons += '🌊';
        if (p.plague || (p.local && world.plague.active)) icons += '☠';
        if (world.war && id === 'highmarch') icons += '⚔';
        if (p.devastation > 10) icons += '🏚';
        if (icons) {
          ctx.font = '20px sans-serif';
          ctx.fillText(icons, x, y + 40);
        }
      }
    }
    // Capital
    const [cx, cy] = M.capital;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e0b341';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('Thornhaven ▸ enter', cx, cy - 14);
    // Country header
    ctx.textAlign = 'left';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#e0b341';
    ctx.fillText(world.country.name, 20, 30);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#c9cfdd';
    const l = S.leader(world);
    ctx.fillText(`${G.Data.governments[world.country.government].name} · ${l ? l.name : 'No leader'}`, 20, 50);
    ctx.restore();
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
