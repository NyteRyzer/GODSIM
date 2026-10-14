// Local View: the explorable city rendered on a 2D canvas.
(function (G) {
  'use strict';
  const UI = G.UI;
  const S = G.Sim;
  const U = G.Util;
  const L = (UI.Local = {});
  const BASE = 24; // pixels per tile at zoom 1

  const BUILD_COLORS = {
    palace: ['#5b4a7a', '#8a74b8'], manor: ['#5d4864', '#8e6f99'], barracks: ['#5c3b3b', '#8f5a55'], healer: ['#3f6150', '#62957a'],
    temple: ['#6f6146', '#d8c27a'], market: ['#6b5a3e', '#a68a5b'], academy: ['#3e5068', '#6d87ab'], tavern: ['#5f4632', '#93704f'],
    home: ['#5a4a3c', '#8a705a'], farmhouse: ['#6a5638', '#a3845a'],
  };

  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) >>> 0;
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
    return (h ^ (h >>> 16)) / 4294967296;
  }

  // Static ground layer drawn once.
  function buildGround() {
    const city = G.Data.city;
    const c = document.createElement('canvas');
    c.width = city.width * BASE;
    c.height = city.height * BASE;
    const g = c.getContext('2d');
    for (let y = 0; y < city.height; y++) {
      for (let x = 0; x < city.width; x++) {
        const n = hash(x, y);
        const east = x > city.river.x1;
        g.fillStyle = east ? `hsl(${88 + n * 10}, 32%, ${24 + n * 4}%)` : `hsl(${96 + n * 12}, 22%, ${21 + n * 4}%)`;
        g.fillRect(x * BASE, y * BASE, BASE, BASE);
      }
    }
    for (const z of city.zones) {
      g.fillStyle = '#6e6a32';
      g.fillRect(z.x * BASE, z.y * BASE, z.w * BASE, z.h * BASE);
      g.strokeStyle = '#8a8540';
      g.lineWidth = 2;
      for (let yy = z.y * BASE + 4; yy < (z.y + z.h) * BASE; yy += 7) {
        g.beginPath();
        g.moveTo(z.x * BASE + 2, yy);
        g.lineTo((z.x + z.w) * BASE - 2, yy);
        g.stroke();
      }
      g.fillStyle = '#ffffff66';
      g.font = 'bold 13px sans-serif';
      g.fillText(z.name, z.x * BASE + 6, (z.y + z.h) * BASE - 6);
    }
    g.fillStyle = '#8b7a58';
    for (const r of city.roads) g.fillRect(r.x0 * BASE, r.y0 * BASE, (r.x1 - r.x0 + 1) * BASE, (r.y1 - r.y0 + 1) * BASE);
    // River
    for (let y = 0; y < city.height; y++) {
      for (let x = city.river.x0; x <= city.river.x1; x++) {
        g.fillStyle = `hsl(212, 55%, ${30 + hash(x, y) * 6}%)`;
        g.fillRect(x * BASE, y * BASE, BASE, BASE);
      }
    }
    for (const b of city.bridges) {
      g.fillStyle = '#7a5a3a';
      g.fillRect(city.river.x0 * BASE - 4, b.y0 * BASE + 2, (city.river.x1 - city.river.x0 + 1) * BASE + 8, (b.y1 - b.y0 + 1) * BASE - 4);
      g.strokeStyle = '#4e3825';
      g.lineWidth = 2;
      g.strokeRect(city.river.x0 * BASE - 4, b.y0 * BASE + 2, (city.river.x1 - city.river.x0 + 1) * BASE + 8, (b.y1 - b.y0 + 1) * BASE - 4);
    }
    return c;
  }

  L.metrics = function (canvasW, canvasH) {
    const st = UI.state;
    const ts = BASE * st.camera.zoom;
    const ox = canvasW / 2 - st.camera.x * ts;
    const oy = canvasH / 2 - st.camera.y * ts;
    return { ts, ox, oy };
  };
  L.toTile = function (sx, sy, canvasW, canvasH) {
    const m = L.metrics(canvasW, canvasH);
    return { x: (sx - m.ox) / m.ts, y: (sy - m.oy) / m.ts };
  };

  L.hitTest = function (world, tx, ty) {
    let best = null;
    let bd = 0.75;
    for (const c of S.living(world)) {
      const d = U.dist(c.x, c.y, tx, ty);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best) return { kind: 'character', id: best.id };
    const b = S.buildingAt(world, tx, ty);
    if (b) return { kind: 'building', id: b.id };
    return null;
  };

  function nightAlpha(world) {
    const m = G.Time.minuteOfDay(world) / 60;
    if (m >= 7 && m <= 18) return 0;
    if (m > 18 && m < 21) return ((m - 18) / 3) * 0.5;
    if (m >= 21 || m < 5) return 0.5;
    return ((7 - m) / 2) * 0.5;
  }

  L.render = function (ctx, W, H, world, now) {
    const st = UI.state;
    if (!L.ground) L.ground = buildGround();
    const pos = S.playerPos(world);
    if (st.camera.follow) {
      st.camera.x = pos.x;
      st.camera.y = pos.y;
    }
    const city = G.Data.city;
    // Keep the map filling the viewport where possible.
    const tsz = BASE * st.camera.zoom;
    const clampAxis = (v, span, tiles) => (tiles * tsz <= span ? tiles / 2 : U.clamp(v, span / 2 / tsz, tiles - span / 2 / tsz));
    st.camera.x = clampAxis(st.camera.x, W, city.width);
    st.camera.y = clampAxis(st.camera.y, H, city.height);
    const { ts, ox, oy } = L.metrics(W, H);
    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(L.ground, ox, oy, city.width * ts, city.height * ts);
    const sx = (x) => ox + x * ts;
    const sy = (y) => oy + y * ts;

    // Flood water
    if (world.flood.level > 0) {
      const zone = world.flood.diverted ? city.northFields : city.floodplain;
      const wave = Math.sin(now / 500) * 0.05;
      ctx.fillStyle = `rgba(70,120,200,${0.55 + wave})`;
      for (let y = zone.y0; y <= zone.y1; y++) {
        for (let x = zone.x0; x <= zone.x1; x++) {
          if (S.isFlooded(world, x + 0.5, y + 0.5)) ctx.fillRect(sx(x), sy(y), ts + 0.5, ts + 0.5);
        }
      }
    } else if (world.flood.stage === 'warning') {
      ctx.strokeStyle = 'rgba(120,170,255,0.5)';
      ctx.setLineDash([6, 6]);
      const z = city.floodplain;
      ctx.strokeRect(sx(z.x0), sy(z.y0), (z.x1 - z.x0 + 1) * ts, (z.y1 - z.y0 + 1) * ts);
      ctx.setLineDash([]);
    }

    // Buildings
    const sel = st.selected;
    ctx.textAlign = 'center';
    for (const b of world.buildings) {
      const [wall, roof] = BUILD_COLORS[b.type] || BUILD_COLORS.home;
      const x = sx(b.x), y = sy(b.y), w = b.w * ts, h = b.h * ts;
      ctx.fillStyle = wall;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = roof;
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
      if (b.type === 'market') {
        ctx.fillStyle = '#00000022';
        for (let i = 1; i < b.w; i += 2) ctx.fillRect(x + i * ts, y + 3, ts * 0.5, h - 6);
      }
      if (b.type === 'temple') {
        ctx.fillStyle = '#fff3c4';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, ts * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.damage > 0) {
        ctx.fillStyle = `rgba(40,25,10,${b.damage / 160})`;
        ctx.fillRect(x, y, w, h);
      }
      if (b.protectedUntil > world.t) {
        ctx.strokeStyle = `rgba(255,215,90,${0.6 + Math.sin(now / 300) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
      }
      if (sel && sel.kind === 'building' && sel.id === b.id) {
        ctx.strokeStyle = '#e0b341';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
      }
      if (ts >= 18 && b.type !== 'home' && b.type !== 'farmhouse') {
        ctx.fillStyle = '#000000aa';
        ctx.font = `bold ${Math.max(10, ts * 0.45)}px sans-serif`;
        ctx.fillText(b.name, x + w / 2 + 1, y + h - 5 + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(b.name, x + w / 2, y + h - 5);
      }
    }

    // Characters
    const pending = new Map();
    for (const p of world.prayers) if (p.status === 'pending') pending.set(p.requesterId, p.urgency);
    const r = Math.max(3, ts * 0.3);
    const witnessMode = world.player.form !== 'spectral';
    const nightA = nightAlpha(world);
    for (const c of S.living(world)) {
      const x = sx(c.x), y = sy(c.y);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      if (c.possessed) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, 'rgba(255,220,120,0.8)');
        g.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (c.flags.trapped) {
        ctx.strokeStyle = `rgba(255,80,70,${0.5 + Math.sin(now / 200) * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = UI.roleColor(c);
      ctx.beginPath();
      ctx.arc(x, y, c.age < 14 ? r * 0.75 : r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.known.beliefs ? UI.beliefColor(c.belief) : '#00000099';
      ctx.lineWidth = c.known.beliefs ? 2 : 1;
      ctx.stroke();
      if (sel && sel.kind === 'character' && sel.id === c.id) {
        ctx.strokeStyle = '#e0b341';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      const fs = Math.max(9, ts * 0.42);
      ctx.font = `${fs}px sans-serif`;
      if (pending.has(c.id)) {
        const u = pending.get(c.id);
        ctx.fillStyle = u >= 3 ? '#ff8a80' : u >= 2 ? '#ffd27a' : '#cfe0ff';
        ctx.fillText('✦', x, y - r - 3);
      } else if (c.asleep) {
        ctx.fillStyle = '#9fb3d9';
        ctx.fillText('z', x + r, y - r);
      }
      if (c.prophet) {
        ctx.fillStyle = '#ffe58a';
        ctx.fillText('★', x - r - 4, y - r);
      }
      if (c.gift && c.known.beliefs) {
        ctx.fillStyle = '#c8a2ff';
        ctx.beginPath();
        ctx.arc(x + r, y + r, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Witness indicator: who can see your body right now.
      if (witnessMode && !c.asleep && !c.possessed && U.dist(c.x, c.y, pos.x, pos.y) <= 4) {
        ctx.fillStyle = '#ffffffcc';
        ctx.fillText('👁', x + r + 4, y + 3);
      }
      // Gifted people who perceive the spectral player
      if (!witnessMode && c.gift && !c.asleep && U.dist(c.x, c.y, pos.x, pos.y) <= 4) {
        ctx.fillStyle = '#c8a2ff';
        ctx.fillText('✧ senses you', x, y + r + fs);
      }
      if (ts >= 30 || (st.hover && st.hover.kind === 'character' && st.hover.id === c.id) || (sel && sel.kind === 'character' && sel.id === c.id)) {
        ctx.fillStyle = '#000000aa';
        ctx.fillText(c.first, x + 1, y + r + fs + 1 + (c.gift && !witnessMode ? fs : 0));
        ctx.fillStyle = '#fff';
        ctx.fillText(c.first, x, y + r + fs + (c.gift && !witnessMode ? fs : 0));
      }
    }

    // Night
    if (nightA > 0) {
      ctx.fillStyle = `rgba(8,14,40,${nightA})`;
      ctx.fillRect(0, 0, W, H);
      // Warm windows
      ctx.fillStyle = `rgba(255,200,110,${nightA * 0.7})`;
      for (const b of world.buildings) {
        if (b.type === 'home' || b.type === 'farmhouse' || b.type === 'tavern' || b.type === 'palace') {
          ctx.fillRect(sx(b.x + b.w / 2) - 2, sy(b.y + 1) - 2, 4, 4);
        }
      }
    }

    // Player
    const px = sx(pos.x), py = sy(pos.y);
    const p = world.player;
    if (p.form === 'spectral') {
      const pulse = 1 + Math.sin(now / 400) * 0.12;
      const g = ctx.createRadialGradient(px, py, 0, px, py, ts * 1.2 * pulse);
      g.addColorStop(0, 'rgba(255,255,240,0.95)');
      g.addColorStop(0.35, 'rgba(255,230,150,0.55)');
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, ts * 1.2 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,120,0.25)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(px, py, G.Data.possession.range * ts, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (p.form === 'human') {
      ctx.fillStyle = '#f4f1e8';
      ctx.strokeStyle = '#e0b341';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, r * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(10, ts * 0.42)}px sans-serif`;
      ctx.fillText(p.human.detainedUntil > world.t ? 'You (detained)' : 'You', px, py - r - 6);
    }
    if (st.moveTarget) {
      ctx.strokeStyle = '#e0b34188';
      ctx.beginPath();
      ctx.arc(sx(st.moveTarget.x), sy(st.moveTarget.y), 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
