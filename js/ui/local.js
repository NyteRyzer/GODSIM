// Local View: the explorable city rendered on a 2D canvas.
// Layers: terrain -> interiors -> flood -> people -> roofs (smart cutaway) -> overlays -> night & weather -> markers.
(function (G) {
  'use strict';
  const UI = G.UI;
  const S = G.Sim;
  const U = G.Util;
  const L = (UI.Local = {});
  const BASE = 24; // pixels per tile at zoom 1
  L.roofAlpha = {};
  L.CUTAWAY_ZOOM = 1.7;

  function layers() {
    if (!L.terrain) {
      const Sc = UI.Scenery;
      L.terrain = Sc.buildTerrain();
      L.interiors = Sc.buildInteriors();
      L.roofs = Sc.buildRoofs();
      L.lamps = Sc.lamps();
    }
  }

  // Thumbnail of a building (roof and cutaway side by side) for the inspector.
  const thumbs = {};
  L.buildingThumb = function (b) {
    if (thumbs[b.id]) return thumbs[b.id];
    layers();
    const P = UI.Scenery.P;
    const R = UI.Scenery.roofRect(b);
    const pad = 0.5;
    const sw = (R.w + pad * 2) * P, sh = (R.h + pad * 2) * P;
    const scale = Math.min(1, 150 / sw, 110 / sh);
    const c = document.createElement('canvas');
    c.width = Math.round(sw * scale * 2 + 8);
    c.height = Math.round(sh * scale);
    const g = c.getContext('2d');
    const src = [(R.x - pad) * P, (R.y - pad) * P, sw, sh];
    g.drawImage(L.terrain, ...src, 0, 0, sw * scale, sh * scale);
    g.drawImage(L.roofs, ...src, 0, 0, sw * scale, sh * scale);
    g.drawImage(L.terrain, ...src, sw * scale + 8, 0, sw * scale, sh * scale);
    g.drawImage(L.interiors, ...src, sw * scale + 8, 0, sw * scale, sh * scale);
    thumbs[b.id] = c.toDataURL();
    return thumbs[b.id];
  };

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
      const d = Math.min(U.dist(c.x, c.y, tx, ty), U.dist(c.x, c.y - 0.45, tx, ty));
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

  // Which roofs are lifted: zoomed in, cutaway mode, or the building holds what you are looking at.
  function updateRoofs(world, pos) {
    const st = UI.state;
    const sel = st.selected;
    const focus = new Set();
    const at = (x, y) => {
      const b = S.buildingAt(world, x, y);
      if (b) focus.add(b.id);
    };
    at(pos.x, pos.y);
    if (sel && sel.kind === 'building') focus.add(sel.id);
    if (sel && sel.kind === 'character') {
      const c = S.char(world, sel.id);
      if (c && c.alive) at(c.x, c.y);
    }
    if (st.hover && st.hover.kind === 'building') focus.add(st.hover.id);
    const cut = st.roofMode === 'cutaway' || st.camera.zoom >= L.CUTAWAY_ZOOM;
    for (const b of world.buildings) {
      const target = b.type === 'market' || cut || focus.has(b.id) ? 0 : 1;
      const a = L.roofAlpha[b.id] == null ? target : L.roofAlpha[b.id];
      L.roofAlpha[b.id] = a + (target - a) * 0.18;
    }
  }

  L.render = function (ctx, W, H, world, now) {
    const st = UI.state;
    layers();
    const pos = S.playerPos(world);
    if (st.camera.follow) {
      // Glide after the player; snap on long jumps.
      const dx = pos.x - st.camera.x, dy = pos.y - st.camera.y;
      if (Math.abs(dx) + Math.abs(dy) > 10) {
        st.camera.x = pos.x;
        st.camera.y = pos.y;
      } else {
        st.camera.x += dx * 0.18;
        st.camera.y += dy * 0.18;
      }
    }
    const city = G.Data.city;
    // Keep the map filling the viewport where possible.
    const tsz = BASE * st.camera.zoom;
    const clampAxis = (v, span, tiles) => (tiles * tsz <= span ? tiles / 2 : U.clamp(v, span / 2 / tsz, tiles - span / 2 / tsz));
    st.camera.x = clampAxis(st.camera.x, W, city.width);
    st.camera.y = clampAxis(st.camera.y, H, city.height);
    const { ts, ox, oy } = L.metrics(W, H);
    const sx = (x) => ox + x * ts;
    const sy = (y) => oy + y * ts;
    const P = UI.Scenery.P;
    const sel = st.selected;
    updateRoofs(world, pos);

    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(L.terrain, ox, oy, city.width * ts, city.height * ts);
    UI.Scenery.drawRiverShimmer(ctx, sx, sy, ts, now, H);
    ctx.drawImage(L.interiors, ox, oy, city.width * ts, city.height * ts);

    // Flood water (rises over floors; roofs stay above it)
    if (world.flood.level > 0) {
      const zone = world.flood.diverted ? city.northFields : city.floodplain;
      const wave = Math.sin(now / 500) * 0.05;
      ctx.fillStyle = `rgba(78,110,140,${0.68 + wave})`;
      for (let y = zone.y0; y <= zone.y1; y++) {
        for (let x = zone.x0; x <= zone.x1; x++) {
          if (S.isFlooded(world, x + 0.5, y + 0.5)) ctx.fillRect(sx(x), sy(y), ts + 0.5, ts + 0.5);
        }
      }
      ctx.strokeStyle = 'rgba(220,235,255,0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        const fx = zone.x0 + ((i * 7.31) % (zone.x1 - zone.x0 + 1));
        const fy = zone.y0 + ((i * 3.77 + now / 2600) % (zone.y1 - zone.y0 + 1));
        if (!S.isFlooded(world, fx, fy)) continue;
        ctx.beginPath();
        ctx.arc(sx(fx), sy(fy), ts * (0.15 + ((now / 900 + i) % 1) * 0.35), 0, Math.PI);
        ctx.stroke();
      }
    } else if (world.flood.stage === 'warning') {
      ctx.strokeStyle = 'rgba(120,170,255,0.5)';
      ctx.setLineDash([6, 6]);
      const z = city.floodplain;
      ctx.strokeRect(sx(z.x0), sy(z.y0), (z.x1 - z.x0 + 1) * ts, (z.y1 - z.y0 + 1) * ts);
      ctx.setLineDash([]);
    }
    UI.Scenery.drawLampPosts(ctx, L.lamps, sx, sy, ts);
    UI.Atmos.ground(ctx, world, sx, sy, ts, now);
    UI.Atmos._view = { x0: -ox / ts, y0: -oy / ts, x1: (W - ox) / ts, y1: (H - oy) / ts };

    // People (figures only; markers are drawn later so they stay readable over roofs and at night)
    const r = Math.max(3, ts * 0.3);
    const u = ts / 20; // figure units -> pixels
    const people = S.living(world).sort((a, b) => a.y - b.y);
    UI.Atmos.lens(ctx, world, people, sx, sy, ts);
    UI.Atmos.pilgrims(ctx, world, sx, sy, ts, now);
    const onScreen = [];
    for (const c of people) {
      const x = sx(c.x), y = sy(c.y);
      if (x < -30 || y < -40 || x > W + 30 || y > H + 30) continue;
      onScreen.push(c);
      if (c.possessed) {
        const g = ctx.createRadialGradient(x, y - r, 0, x, y - r, r * 4);
        g.addColorStop(0, 'rgba(255,220,120,0.8)');
        g.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y - r, r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      const isSel = sel && sel.kind === 'character' && sel.id === c.id;
      const mo = UI.Figures.motion(c, now);
      UI.Figures.draw(ctx, c, x, y, u, {
        now, moving: mo.moving && !c.asleep, facing: mo.facing, asleep: c.asleep && c.activity === 'sleeping',
        ringColor: c.known.beliefs ? UI.beliefColor(c.belief) : null, selected: isSel,
      });
    }

    // Roofs (each building faded independently)
    const roofA = (id) => (L.roofAlpha[id] == null ? 1 : L.roofAlpha[id]);
    for (const b of world.buildings) {
      const a = roofA(b.id);
      if (a < 0.02 || b.type === 'market') continue;
      const R = UI.Scenery.roofRect(b);
      const pad = 0.4;
      ctx.globalAlpha = a;
      ctx.drawImage(L.roofs, (R.x - pad) * P, (R.y - pad) * P, (R.w + pad * 2) * P, (R.h + pad * 2) * P, sx(R.x - pad), sy(R.y - pad), (R.w + pad * 2) * ts, (R.h + pad * 2) * ts);
    }
    ctx.globalAlpha = 1;
    UI.Scenery.drawSmoke(ctx, world, sx, sy, ts, now, roofA);

    // Building overlays: damage, wards, selection
    for (const b of world.buildings) {
      const x = sx(b.x), y = sy(b.y), w = b.w * ts, h = b.h * ts;
      if (b.damage > 0) {
        ctx.fillStyle = `rgba(70,50,25,${b.damage / 220})`;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = `rgba(30,20,10,${b.damage / 150})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const cx = x + w * (0.2 + k * 0.3), cy = y + h * (0.3 + (k % 2) * 0.3);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + ts * 0.3, cy + ts * 0.2);
          ctx.lineTo(cx + ts * 0.15, cy + ts * 0.45);
        }
        ctx.stroke();
      }
      if (b.protectedUntil > world.t) {
        const pulse = 0.55 + Math.sin(now / 300) * 0.25;
        ctx.save();
        ctx.shadowColor = 'rgba(255,215,90,0.9)';
        ctx.shadowBlur = ts * 0.8;
        ctx.strokeStyle = `rgba(255,215,90,${pulse})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
        ctx.restore();
      }
      if (sel && sel.kind === 'building' && sel.id === b.id) {
        ctx.strokeStyle = '#e0b341';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
        ctx.setLineDash([]);
      }
    }

    // Sky, light and weather
    UI.Atmos.sky(ctx, world, W, H, now);
    const night = UI.Atmos.grade(ctx, world, W, H);
    if (night > 0) UI.Scenery.drawLights(ctx, world, L.lamps, sx, sy, ts, night, now);
    UI.Atmos.weather(ctx, world, W, H, now);

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
      const g = ctx.createRadialGradient(px, py - r, 0, px, py - r, ts * 1.1);
      g.addColorStop(0, 'rgba(255,220,120,0.35)');
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py - r, ts * 1.1, 0, Math.PI * 2);
      ctx.fill();
      const me = { id: -1, first: 'You', last: '', age: 30, role: 'traveller', mood: 60 };
      const mo = UI.Figures.motion({ id: -1, x: p.human.x, y: p.human.y }, now);
      UI.Figures.draw(ctx, me, px, py, u, { now, moving: mo.moving, facing: mo.facing, look: UI.Figures.travellerLook, selected: true });
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.min(14, Math.max(10, ts * 0.42))}px sans-serif`;
      ctx.fillText(p.human.detainedUntil > world.t ? 'You (detained)' : 'You', px, py - UI.Figures.headTop(me, u) - 6);
    }

    // Markers over everything: prayers, trapped, prophets, witnesses, names
    const pending = new Map();
    for (const pr of world.prayers) if (pr.status === 'pending') pending.set(pr.requesterId, pr.urgency);
    const witnessMode = p.form !== 'spectral';
    const fsz = Math.min(13, Math.max(9, ts * 0.42));
    ctx.textAlign = 'center';
    ctx.font = `${fsz}px sans-serif`;
    for (const c of onScreen) {
      const x = sx(c.x), y = sy(c.y);
      const b = S.buildingAt(world, c.x, c.y);
      const covered = b && roofA(b.id) > 0.6;
      const sleeping = c.asleep && c.activity === 'sleeping';
      const top = covered ? r : sleeping ? r : UI.Figures.headTop(c, u);
      if (c.flags.trapped) {
        ctx.strokeStyle = `rgba(255,80,70,${0.5 + Math.sin(now / 200) * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - r, r * 2.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (pending.has(c.id)) {
        const urg = pending.get(c.id);
        ctx.fillStyle = urg >= 3 ? '#ff8a80' : urg >= 2 ? '#ffd27a' : '#cfe0ff';
        ctx.fillText('✦', x, y - top - 3);
      } else if (c.asleep && !covered) {
        ctx.fillStyle = '#9fb3d9';
        ctx.fillText('z', x + r, y - top - ((now / 600) % 1) * 6);
      }
      if (covered) continue;
      if (c.prophet) {
        ctx.fillStyle = '#ffe58a';
        ctx.fillText('★', x - r - 4, y - top);
      }
      if (c.gift && c.known.beliefs) {
        ctx.fillStyle = '#c8a2ff';
        ctx.beginPath();
        ctx.arc(x + r, y - top + 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (witnessMode && !c.asleep && !c.possessed && U.dist(c.x, c.y, pos.x, pos.y) <= 4) {
        ctx.fillStyle = '#ffffffcc';
        ctx.fillText('👁', x + r + 6, y - top + fsz);
      }
      if (!witnessMode && c.gift && !c.asleep && U.dist(c.x, c.y, pos.x, pos.y) <= 4) {
        ctx.fillStyle = '#c8a2ff';
        ctx.fillText('✧ senses you', x, y + r + fsz * 1.6);
      }
      if (ts >= 44 || (st.hover && st.hover.kind === 'character' && st.hover.id === c.id) || (sel && sel.kind === 'character' && sel.id === c.id)) {
        const ly = y + r + fsz * 0.6 + (c.gift && !witnessMode ? fsz : 0);
        const tw = ctx.measureText(c.first).width;
        ctx.fillStyle = 'rgba(10,14,28,0.7)';
        ctx.fillRect(x - tw / 2 - 3, ly - fsz + 1, tw + 6, fsz + 3);
        ctx.fillStyle = '#fff';
        ctx.fillText(c.first, x, ly);
      }
    }

    // Living touches: rising prayers, speech, miracle effects
    UI.Atmos.prayerLights(ctx, world, sx, sy, ts, u, now);
    UI.Atmos.bubbles(ctx, world, onScreen, sx, sy, ts, u, now, (c) => {
      const b = S.buildingAt(world, c.x, c.y);
      return b && roofA(b.id) > 0.6;
    });
    UI.Atmos.fx(ctx, world, sx, sy, ts);

    // Building name plaques
    if (ts >= 16) {
      ctx.font = `600 ${Math.min(13, Math.max(10, ts * 0.42))}px sans-serif`;
      for (const b of world.buildings) {
        if (b.type === 'home' || b.type === 'farmhouse') continue;
        const x = sx(b.x + b.w / 2), y = sy(b.y + b.h) + Math.min(16, ts * 0.6);
        if (x < -100 || x > W + 100 || y < -20 || y > H + 20) continue;
        const tw = ctx.measureText(b.name).width;
        ctx.fillStyle = 'rgba(20,16,10,0.72)';
        ctx.fillRect(x - tw / 2 - 6, y - 12, tw + 12, 17);
        ctx.strokeStyle = 'rgba(224,179,65,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - tw / 2 - 5.5, y - 11.5, tw + 11, 16);
        ctx.fillStyle = '#f3e7c4';
        ctx.fillText(b.name, x, y + 1);
      }
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
