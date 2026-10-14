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
    ostmark: [180, 225], highmarch: [575, 215], crownlands: [330, 400], riverlands: [632, 292], saltcoast: [385, 505], kesh: [830, 385],
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

  // ---------- static painted terrain (built once at 2x map resolution) ----------
  M.towns = [
    { name: 'Thornhaven', x: 410, y: 330, capital: true, prov: 'crownlands' },
    { name: 'Riverford', x: 612, y: 395, prov: 'riverlands' },
    { name: 'Highwatch', x: 470, y: 150, prov: 'highmarch' },
    { name: 'Saltport', x: 455, y: 560, prov: 'saltcoast', port: true },
    { name: 'Greywell', x: 320, y: 300, prov: 'crownlands' },
    { name: 'Karsa', x: 830, y: 280, foreign: true },
    { name: 'Ostburg', x: 170, y: 140, foreign: true },
  ];
  M.roads = [['Thornhaven', 'Riverford'], ['Thornhaven', 'Highwatch'], ['Thornhaven', 'Saltport'], ['Thornhaven', 'Greywell'], ['Greywell', 'Ostburg'], ['Riverford', 'Karsa'], ['Highwatch', 'Karsa']];

  function seeded(seed) {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function polyPath(g, poly) {
    g.beginPath();
    poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  }
  function inLand(x, y) {
    for (const id in M.shapes) if (pointIn(M.shapes[id], x, y)) return id;
    return null;
  }
  function mountain(g, x, y, s) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.moveTo(x - s, y + 2);
    g.lineTo(x + s * 1.3, y + 2);
    g.lineTo(x + s * 0.2, y - s * 1.1);
    g.closePath();
    g.fill();
    g.fillStyle = '#8a7f6e';
    g.beginPath();
    g.moveTo(x - s, y);
    g.lineTo(x + s, y);
    g.lineTo(x, y - s * 1.3);
    g.closePath();
    g.fill();
    g.fillStyle = '#6b6254';
    g.beginPath();
    g.moveTo(x, y - s * 1.3);
    g.lineTo(x + s, y);
    g.lineTo(x + s * 0.15, y);
    g.closePath();
    g.fill();
    g.fillStyle = '#f2efe8';
    g.beginPath();
    g.moveTo(x, y - s * 1.3);
    g.lineTo(x - s * 0.32, y - s * 0.88);
    g.lineTo(x + s * 0.05, y - s * 0.95);
    g.lineTo(x + s * 0.3, y - s * 0.85);
    g.closePath();
    g.fill();
  }
  function forestTree(g, x, y, s, dark) {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath();
    g.ellipse(x + 1.5, y + 1.5, s, s * 0.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = dark ? '#2f5530' : '#3e6b38';
    g.beginPath();
    g.arc(x, y - s * 0.4, s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(160,200,120,0.35)';
    g.beginPath();
    g.arc(x - s * 0.3, y - s * 0.7, s * 0.4, 0, Math.PI * 2);
    g.fill();
  }

  M.buildBase = function () {
    const K = 2;
    const c = document.createElement('canvas');
    c.width = 1000 * K;
    c.height = 650 * K;
    const g = c.getContext('2d');
    g.scale(K, K);
    // Sea with depth gradient
    const sea = g.createRadialGradient(500, 330, 100, 500, 330, 650);
    sea.addColorStop(0, '#1d4a6e');
    sea.addColorStop(1, '#0b2236');
    g.fillStyle = sea;
    g.fillRect(0, 0, 1000, 650);
    const r = seeded(4242);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let k = 0; k < 260; k++) {
      const x = r() * 1000, y = r() * 650;
      if (inLand(x, y)) continue;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 5, y - 3, x + 10, y);
      g.stroke();
    }
    // Shallows around the coast
    for (const [w, a] of [[26, 0.08], [16, 0.12], [8, 0.18]]) {
      g.strokeStyle = `rgba(120,190,210,${a})`;
      g.lineWidth = w;
      g.lineJoin = 'round';
      for (const id in M.shapes) {
        polyPath(g, M.shapes[id]);
        g.stroke();
      }
    }
    // Land: painted terrain clipped to the continent
    for (const id in M.shapes) {
      g.save();
      polyPath(g, M.shapes[id]);
      g.clip();
      const base = { highmarch: '#7d8a5a', ostmark: '#7a8a5e', kesh: '#97845a', saltcoast: '#9aa267', crownlands: '#8aa060', riverlands: '#7fa05a' }[id];
      g.fillStyle = base;
      g.fillRect(0, 0, 1000, 650);
      const rr = seeded(id.length * 977 + id.charCodeAt(0));
      for (let k = 0; k < 900; k++) {
        g.fillStyle = `rgba(${rr() < 0.5 ? '40,60,20' : '230,230,170'},${0.04 + rr() * 0.06})`;
        g.beginPath();
        g.arc(rr() * 1000, rr() * 650, 3 + rr() * 9, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    // Beaches
    g.strokeStyle = 'rgba(230,215,160,0.55)';
    g.lineWidth = 2.5;
    for (const id in M.shapes) {
      polyPath(g, M.shapes[id]);
      g.stroke();
    }
    // Mountains: the Highmarch ridge, Ostmark hills, the Kesh range
    const ranges = [
      { x0: 360, x1: 670, y0: 70, y1: 150, n: 34, s: [9, 15] },
      { x0: 80, x1: 300, y0: 70, y1: 140, n: 18, s: [7, 11] },
      { x0: 720, x1: 930, y0: 120, y1: 260, n: 30, s: [9, 15] },
      { x0: 700, x1: 860, y0: 430, y1: 540, n: 10, s: [6, 9] },
    ];
    const mts = [];
    for (const rg of ranges) {
      const rr = seeded(rg.x0 * 31 + rg.y0);
      for (let k = 0; k < rg.n * 3 && mts.length < 400; k++) {
        const x = rg.x0 + rr() * (rg.x1 - rg.x0), y = rg.y0 + rr() * (rg.y1 - rg.y0);
        if (!inLand(x, y - 4) || !inLand(x - 12, y) || !inLand(x + 12, y)) continue;
        if (mts.filter((m) => m.rg === rg).length >= rg.n) break;
        mts.push({ x, y, s: rg.s[0] + rr() * (rg.s[1] - rg.s[0]), rg });
      }
    }
    // Forests in the lowlands
    const fr = seeded(99);
    const trees = [];
    const clusters = [[300, 380], [230, 330], [500, 470], [640, 470], [820, 470], [120, 230], [560, 210], [880, 360], [380, 520]];
    for (const [cx, cy] of clusters) {
      for (let k = 0; k < 40; k++) {
        const a = fr() * Math.PI * 2, d = Math.sqrt(fr()) * 38;
        const x = cx + Math.cos(a) * d * 1.3, y = cy + Math.sin(a) * d;
        if (!inLand(x, y) || !inLand(x + 8, y + 8)) continue;
        if (M.towns.some((t) => Math.hypot(t.x - x, t.y - y) < 22)) continue;
        trees.push({ x, y, s: 3 + fr() * 2.5, dark: fr() < 0.4 });
      }
    }
    const items = mts.map((m) => ({ y: m.y, draw: () => mountain(g, m.x, m.y, m.s) })).concat(trees.map((t) => ({ y: t.y, draw: () => forestTree(g, t.x, t.y, t.s, t.dark) })));
    items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());
    // Roads
    g.strokeStyle = 'rgba(110,80,45,0.7)';
    g.lineWidth = 2;
    g.setLineDash([6, 4]);
    for (const [a, b] of M.roads) {
      const ta = M.towns.find((t) => t.name === a), tb = M.towns.find((t) => t.name === b);
      g.beginPath();
      g.moveTo(ta.x, ta.y);
      g.quadraticCurveTo((ta.x + tb.x) / 2 + (ta.y - tb.y) * 0.1, (ta.y + tb.y) / 2 + (tb.x - ta.x) * 0.1, tb.x, tb.y);
      g.stroke();
    }
    g.setLineDash([]);
    // River with tributary
    for (const [w, col] of [[6, '#2e5f94'], [3.5, '#5d97d0']]) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.beginPath();
      M.river.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      g.lineWidth = w * 0.6;
      g.beginPath();
      g.moveTo(700, 300);
      g.quadraticCurveTo(650, 330, 598, 335);
      g.stroke();
    }
    // Compass rose
    const cx = 935, cy = 585;
    g.fillStyle = 'rgba(240,230,200,0.85)';
    for (let k = 0; k < 4; k++) {
      g.save();
      g.translate(cx, cy);
      g.rotate((k * Math.PI) / 2);
      g.beginPath();
      g.moveTo(0, -30);
      g.lineTo(6, 0);
      g.lineTo(-6, 0);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.strokeStyle = 'rgba(240,230,200,0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cy, 18, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#f2e7c4';
    g.font = 'bold 12px serif';
    g.textAlign = 'center';
    g.fillText('N', cx, cy - 34);
    g.font = 'italic 14px serif';
    g.fillStyle = 'rgba(220,235,255,0.5)';
    g.fillText('The Western Sea', 90, 460);
    g.fillText('The Saltwater Gulf', 700, 620);
    return c;
  };

  M.render = function (ctx, W, H, world, now) {
    const st = UI.state;
    const t = M.transform(W, H);
    if (!M.base) M.base = M.buildBase();
    ctx.fillStyle = '#0b2236';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(t.ox, t.oy);
    ctx.scale(t.s, t.s);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(M.base, 0, 0, 1000, 650);
    // drifting cloud shadows
    for (let k = 0; k < 5; k++) {
      const x = ((now / 90 + k * 260) % 1300) - 150, y = 90 + k * 115;
      const g = ctx.createRadialGradient(x, y, 5, x, y, 90);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, 120, 55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const sel = st.selected;
    // Overlay tint on Velmora's provinces; neighbours are shaded by stance
    for (const id in M.shapes) {
      const poly = M.shapes[id];
      polyPath(ctx, poly);
      const isNeighbor = id === 'kesh' || id === 'ostmark';
      if (isNeighbor) {
        const n = S.neighbor(world, id);
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = st.overlay === 'government' ? GOV_COLORS[n.government] : world.war && world.war.enemy === id ? '#7a1f1f' : '#20283a';
      } else {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = provinceColor(world, id, st.overlay);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = isNeighbor ? 1.5 : 2;
      ctx.strokeStyle = isNeighbor ? 'rgba(40,30,20,0.6)' : 'rgba(60,40,15,0.75)';
      ctx.setLineDash(isNeighbor ? [4, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      if (sel && (sel.kind === 'province' || sel.kind === 'neighbor') && sel.id === id) {
        ctx.strokeStyle = '#fff6d8';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
    // Velmora's national border, gilded
    ctx.save();
    ctx.shadowColor = 'rgba(224,179,65,0.6)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#e0b341';
    ctx.lineWidth = 2.5;
    for (const id of ['highmarch', 'crownlands', 'riverlands', 'saltcoast']) {
      polyPath(ctx, M.shapes[id]);
      ctx.stroke();
    }
    ctx.restore();
    // Towns
    ctx.textAlign = 'center';
    for (const tw of M.towns) {
      const cap = tw.capital;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(tw.x - (cap ? 8 : 5) + 2, tw.y - (cap ? 6 : 4) + 2, cap ? 16 : 10, cap ? 12 : 8);
      ctx.fillStyle = tw.foreign ? '#c9b48a' : '#f2e7c4';
      ctx.fillRect(tw.x - (cap ? 8 : 5), tw.y - (cap ? 6 : 4), cap ? 16 : 10, cap ? 12 : 8);
      ctx.fillStyle = '#8a3b2a';
      ctx.beginPath();
      ctx.moveTo(tw.x - (cap ? 9 : 6), tw.y - (cap ? 6 : 4));
      ctx.lineTo(tw.x, tw.y - (cap ? 13 : 9));
      ctx.lineTo(tw.x + (cap ? 9 : 6), tw.y - (cap ? 6 : 4));
      ctx.closePath();
      ctx.fill();
      if (cap) {
        ctx.fillStyle = '#e0b341';
        ctx.beginPath();
        ctx.arc(tw.x, tw.y - 18, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = `${cap ? 'bold 13px' : '11px'} serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(tw.name + (cap ? ' ▸ enter' : ''), tw.x + 1, tw.y + (cap ? 20 : 16) + 1);
      ctx.fillStyle = tw.foreign ? '#e6dcc4' : '#fff8e6';
      ctx.fillText(tw.name + (cap ? ' ▸ enter' : ''), tw.x, tw.y + (cap ? 20 : 16));
    }
    // Province labels and crisis icons
    for (const id in M.labels) {
      const [x, y] = M.labels[id];
      const isNeighbor = id === 'kesh' || id === 'ostmark';
      const name = isNeighbor ? S.neighbor(world, id).name : S.province(world, id).name;
      ctx.font = `${isNeighbor ? 'italic 17px' : 'bold 16px'} serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,14,6,0.7)';
      ctx.strokeText(name.toUpperCase(), x, y - 20);
      ctx.fillStyle = isNeighbor ? '#e6dcc4' : '#fff3d0';
      ctx.fillText(name.toUpperCase(), x, y - 20);
      if (!isNeighbor) {
        const p = S.province(world, id);
        ctx.font = '12px sans-serif';
        const v = st.overlay === 'belief' ? `Faith ${Math.round(p.belief)}` : st.overlay === 'stability' ? `Unrest ${Math.round(p.unrest)}` : st.overlay === 'economy' ? `Economy ${Math.round(p.economy)}` : st.overlay === 'reputation' ? S.reputationLabel(world, id) : st.overlay === 'exposure' ? `Exposure ${Math.round(world.country.exposure)}` : G.Data.governments[world.country.government].name;
        const txt = `${p.pop}k people · ${v}`;
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = 'rgba(15,12,8,0.65)';
        ctx.fillRect(x - tw / 2 - 5, y - 14, tw + 10, 17);
        ctx.fillStyle = '#f3e7c4';
        ctx.fillText(txt, x, y - 1);
        let icons = '';
        if (p.flooded || (id === 'riverlands' && world.flood.stage !== 'none')) icons += '🌊';
        if (p.plague || (p.local && world.plague.active)) icons += '☠';
        if (world.war && id === 'highmarch') icons += '⚔';
        if (p.devastation > 10) icons += '🏚';
        if (icons) {
          ctx.font = '20px sans-serif';
          ctx.fillText(icons, x, y + 26);
        }
      }
    }
    // Title cartouche
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(20,16,10,0.75)';
    ctx.fillRect(14, 12, 300, 52);
    ctx.strokeStyle = '#e0b341';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, 16, 292, 44);
    ctx.font = 'bold 18px serif';
    ctx.fillStyle = '#e0b341';
    ctx.fillText(world.country.name, 28, 36);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#e6dcc4';
    const l = S.leader(world);
    ctx.fillText(`${G.Data.governments[world.country.government].name} · ${l ? l.name : 'No leader'}`, 28, 53);
    // Legend for the active overlay
    const legend = {
      belief: ['Doubt', 'Devotion', [70, 80, 110], [240, 196, 80]],
      stability: ['Calm', 'Unrest', [60, 120, 90], [200, 70, 60]],
      economy: ['Poor', 'Prosperous', [110, 70, 60], [90, 170, 100]],
      exposure: ['Hidden', 'Exposed', [50, 60, 90], [255, 240, 200]],
    }[st.overlay];
    if (legend) {
      const lx = 20, ly = 600;
      const grad = ctx.createLinearGradient(lx, 0, lx + 160, 0);
      grad.addColorStop(0, `rgb(${legend[2].join(',')})`);
      grad.addColorStop(1, `rgb(${legend[3].join(',')})`);
      ctx.fillStyle = 'rgba(20,16,10,0.7)';
      ctx.fillRect(lx - 6, ly - 18, 172, 40);
      ctx.fillStyle = grad;
      ctx.fillRect(lx, ly, 160, 8);
      ctx.fillStyle = '#e6dcc4';
      ctx.font = '11px sans-serif';
      ctx.fillText(M.overlays[st.overlay].name, lx, ly - 5);
      ctx.fillText(legend[0], lx, ly + 19);
      ctx.textAlign = 'right';
      ctx.fillText(legend[1], lx + 160, ly + 19);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
