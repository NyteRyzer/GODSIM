// Atmosphere for the Local View: seasons, sky light, weather, wildlife, boats, pilgrims, festivals,
// speech bubbles, prayer lights, miracle effects, lenses, the minimap and the soundscape.
// Presentation only: nothing here changes the simulation, and its randomness never touches the sim RNG.
(function (G) {
  'use strict';
  const UI = G.UI;
  const S = G.Sim;
  const U = G.Util;
  const T = G.Time;
  const A = (UI.Atmos = {});

  const city = () => G.Data.city;
  const hourF = (world) => T.minuteOfDay(world) / 60;

  // ---------- ground layer touches (drawn over terrain, under people) ----------
  A.ground = function (ctx, world, sx, sy, ts, now) {
    const c = city();
    const season = S.season(world).id;
    const wk = world.life ? world.life.weather.kind : 'clear';
    const mapW = c.width * ts, mapH = c.height * ts;
    // Seasonal colour of the land
    if (season === 'winter') {
      ctx.fillStyle = `rgba(235,242,255,${wk === 'snow' ? 0.32 : 0.16})`;
      ctx.fillRect(sx(0), sy(0), mapW, mapH);
    } else if (season === 'autumn') {
      ctx.fillStyle = 'rgba(200,120,40,0.08)';
      ctx.fillRect(sx(0), sy(0), mapW, mapH);
    } else if (season === 'spring') {
      // blossom petals drifting over the grass
      ctx.fillStyle = 'rgba(255,200,225,0.7)';
      for (let i = 0; i < 40; i++) {
        const x = (i * 7.13 + now / 4000) % c.width, y = (i * 3.97 + Math.sin(now / 1500 + i) * 0.4) % c.height;
        ctx.fillRect(sx(x), sy(y), Math.max(1.5, ts * 0.07), Math.max(1.5, ts * 0.07));
      }
    }
    if (wk === 'rain' || wk === 'storm') {
      ctx.fillStyle = 'rgba(40,60,90,0.08)';
      ctx.fillRect(sx(0), sy(0), mapW, mapH);
    }
    const hour = hourF(world);
    const day = hour >= 6 && hour < 19;
    // Boats on the river
    if (world.flood.stage === 'none' && wk !== 'storm') {
      for (let i = 0; i < 2; i++) {
        const y = ((now / (9000 + i * 4000) + i * 0.5) % 1) * c.height;
        const x = c.river.x0 + 0.8 + i * 1.2;
        const bx = sx(x), by = sy(y);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(bx + 3, by + 3, ts * 0.22, ts * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6b4a2c';
        ctx.beginPath();
        ctx.ellipse(bx, by, ts * 0.2, ts * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#efe6d2';
        ctx.beginPath();
        ctx.moveTo(bx, by - ts * 0.35);
        ctx.lineTo(bx + ts * 0.35, by + ts * 0.1);
        ctx.lineTo(bx, by + ts * 0.1);
        ctx.closePath();
        ctx.fill();
        // wake
        ctx.strokeStyle = 'rgba(220,235,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(bx - ts * 0.15, by - ts * 0.6);
        ctx.lineTo(bx - ts * 0.3, by - ts * 1.2);
        ctx.moveTo(bx + ts * 0.15, by - ts * 0.6);
        ctx.lineTo(bx + ts * 0.3, by - ts * 1.2);
        ctx.stroke();
      }
    }
    // Chickens in the farmyards by day
    if (day && wk !== 'storm') {
      for (const b of world.buildings) {
        if (b.type !== 'farmhouse' || S.isFlooded(world, b.x + 1, b.y + 1)) continue;
        for (let k = 0; k < 3; k++) {
          const t = now / 1700 + k * 2.1 + b.x;
          const x = b.x + b.w + 0.2 + ((Math.sin(t) + 1) / 2) * 0.3;
          const y = b.y + 0.4 + k * 0.8 + Math.cos(t * 1.3) * 0.15;
          ctx.fillStyle = k === 2 ? '#a0522d' : '#f4efe4';
          ctx.beginPath();
          ctx.ellipse(sx(x), sy(y), ts * 0.11, ts * 0.08, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#d9412b';
          ctx.fillRect(sx(x) + ts * 0.05, sy(y) - ts * 0.08, ts * 0.04, ts * 0.04);
        }
      }
    }
    // Festival bunting and lanterns
    const fest = world.life && world.life.festival && world.life.festival.until > world.t ? world.life.festival : null;
    if (fest) {
      const b = S.building(world, fest.place);
      const cols = ['#d94b3a', '#f2c94c', '#3f8a4a', '#2f6fb8', '#e8913a'];
      for (let row = 0; row < 3; row++) {
        const y = b.y + 0.6 + row * (b.h - 1.2) / 2;
        ctx.strokeStyle = 'rgba(60,40,20,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx(b.x), sy(y));
        for (let x = b.x; x <= b.x + b.w; x += 0.5) ctx.lineTo(sx(x), sy(y + Math.sin((x - b.x) / b.w * Math.PI) * 0.25));
        ctx.stroke();
        for (let x = b.x + 0.25, i = 0; x < b.x + b.w; x += 0.5, i++) {
          const yy = y + Math.sin((x - b.x) / b.w * Math.PI) * 0.25;
          ctx.fillStyle = cols[(i + row) % cols.length];
          ctx.beginPath();
          ctx.moveTo(sx(x - 0.15), sy(yy));
          ctx.lineTo(sx(x + 0.15), sy(yy));
          ctx.lineTo(sx(x), sy(yy + 0.3));
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  };

  // ---------- pilgrims walking to the Temple ----------
  const PILGRIM_LOOK = { skin: '#d9a07a', hair: '#3b2618', style: 'short', main: '#7a6248', accent: '#c9a24a', garment: 'robe', trousers: '#3a3128', beard: true, balding: false, hat: 'hood', apron: false };
  A.pilgrims = function (ctx, world, sx, sy, ts, now) {
    const n = Math.min(6, (world.life && world.life.pilgrimsToday) || 0);
    const h = hourF(world);
    if (!n || h < 8 || h > 17) return;
    const u = ts / 20;
    for (let i = 0; i < n; i++) {
      const t = ((now / 40000 + i / n) % 1);
      // walk in from the west gate along the main road, then down to the temple door
      const x = t < 0.6 ? 0.5 + (t / 0.6) * 17.5 : 18.5;
      const y = t < 0.6 ? 9.6 + (i % 2) * 0.4 : 9.8 + ((t - 0.6) / 0.4) * 9.5;
      UI.Figures.draw(ctx, { id: -200 - i, first: 'Pilgrim', last: '', age: 40, role: 'pilgrim', mood: 70 }, sx(x), sy(y), u, { now, moving: true, facing: t < 0.6 ? 1 : -1, look: PILGRIM_LOOK });
    }
  };

  // ---------- lenses ----------
  A.LENSES = { none: 'No lens', belief: 'Belief', mood: 'Mood', danger: 'Danger', intrigue: 'Intrigue' };
  A.lens = function (ctx, world, people, sx, sy, ts) {
    const mode = UI.state.lens || 'none';
    if (mode === 'none') return;
    const plotters = new Set();
    for (const pl of world.plots) if (pl.status === 'active') [pl.leaderId, ...pl.members].forEach((id) => plotters.add(id));
    for (const c of people) {
      let col = null;
      if (mode === 'belief') col = c.known.beliefs ? UI.beliefColor(c.belief) : 'rgba(150,150,170,0.6)';
      else if (mode === 'mood') col = `hsl(${Math.round(c.mood * 1.2)},70%,50%)`;
      else if (mode === 'danger') {
        const d = Math.max(c.flags.trapped ? 100 : 0, c.illness ? c.illness.severity : 0, c.injury, c.hunger, c.flags.detainedUntil > world.t ? 70 : 0);
        if (d > 20) col = `rgba(230,60,50,${0.3 + d / 160})`;
      } else if (mode === 'intrigue') {
        if (plotters.has(c.id)) col = 'rgba(220,40,40,0.85)';
        else if (c.agenda) col = 'rgba(170,110,230,0.8)';
      }
      if (!col) continue;
      const g = ctx.createRadialGradient(sx(c.x), sy(c.y), 0, sx(c.x), sy(c.y), ts * 0.9);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx(c.x), sy(c.y), ts * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // ---------- sky: birds and omens (drawn above roofs) ----------
  A.sky = function (ctx, world, W, H, now) {
    const h = hourF(world);
    const wk = world.life ? world.life.weather.kind : 'clear';
    if (h > 6 && h < 19 && wk !== 'storm' && wk !== 'snow') {
      for (let f = 0; f < 2; f++) {
        const p = ((now / (26000 + f * 9000)) + f * 0.45) % 1;
        const fx = -100 + p * (W + 200), fy = H * (0.2 + f * 0.35) + Math.sin(now / 3000 + f) * 30;
        ctx.strokeStyle = 'rgba(30,30,35,0.75)';
        ctx.lineWidth = 1.5;
        for (let b = 0; b < 6; b++) {
          const bx = fx - (b % 3) * 14 - Math.floor(b / 3) * 7, by = fy + (b % 3) * 7 * (b < 3 ? 1 : -1);
          const flap = Math.sin(now / 120 + b) * 3;
          ctx.beginPath();
          ctx.moveTo(bx - 5, by - flap);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + 5, by - flap);
          ctx.stroke();
        }
      }
    }
    const omen = world.life && world.life.omens.find((o) => o.until > world.t);
    if (omen) {
      if (omen.kind === 'comet') {
        const x = W * 0.72, y = H * 0.14;
        const g = ctx.createLinearGradient(x, y, x - 220, y - 70);
        g.addColorStop(0, 'rgba(255,240,200,0.95)');
        g.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 220, y - 70);
        ctx.stroke();
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (omen.kind === 'blood_moon' && (h > 19 || h < 5)) {
        ctx.fillStyle = 'rgba(190,40,30,0.9)';
        ctx.beginPath();
        ctx.arc(W * 0.85, H * 0.12, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(120,10,10,0.15)';
        ctx.fillRect(0, 0, W, H);
      } else if (omen.kind === 'eclipse' && h > 10 && h < 15) {
        ctx.fillStyle = 'rgba(0,0,10,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,240,200,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(W * 0.85, H * 0.12, 20, 0, Math.PI * 2);
        ctx.stroke();
      } else if (omen.kind === 'twin_rainbow' && h > 7 && h < 18) {
        for (const [r, a] of [[260, 0.35], [300, 0.2]]) {
          ['#e33', '#f93', '#fd3', '#3c3', '#39f', '#93f'].forEach((col, i) => {
            ctx.strokeStyle = col;
            ctx.globalAlpha = a;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(W * 0.5, H + 40, r - i * 5, Math.PI, Math.PI * 2);
            ctx.stroke();
          });
        }
        ctx.globalAlpha = 1;
      }
    }
  };

  // ---------- light: dawn, day, dusk, night, weather ----------
  A.grade = function (ctx, world, W, H) {
    const h = hourF(world);
    let night = 0;
    if (h >= 21 || h < 4.5) night = 1;
    else if (h >= 4.5 && h < 7) night = 1 - (h - 4.5) / 2.5;
    else if (h >= 18 && h < 21) night = (h - 18) / 3;
    // warm light at the edges of the day
    const dawn = h >= 5 && h < 8 ? 1 - Math.abs(h - 6.5) / 1.5 : 0;
    const dusk = h >= 16.5 && h < 20 ? 1 - Math.abs(h - 18.2) / 1.8 : 0;
    if (dawn > 0) {
      ctx.fillStyle = `rgba(255,150,130,${0.16 * dawn})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (dusk > 0) {
      ctx.fillStyle = `rgba(255,130,40,${0.2 * dusk})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (night > 0) {
      ctx.fillStyle = `rgba(8,14,44,${0.55 * night})`;
      ctx.fillRect(0, 0, W, H);
    }
    const wk = world.life ? world.life.weather.kind : 'clear';
    const gloom = { cloudy: 0.06, rain: 0.12, storm: 0.24, fog: 0.04, snow: 0.06 }[wk] || 0;
    if (gloom) {
      ctx.fillStyle = `rgba(40,48,60,${gloom})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (S.season(world).id === 'winter') {
      ctx.fillStyle = 'rgba(120,160,220,0.06)';
      ctx.fillRect(0, 0, W, H);
    }
    return night;
  };

  // ---------- weather ----------
  let flashUntil = 0;
  A.weather = function (ctx, world, W, H, now) {
    const wk = world.life ? world.life.weather.kind : 'clear';
    if (wk === 'rain' || wk === 'storm') {
      const n = wk === 'storm' ? 260 : 150;
      ctx.strokeStyle = `rgba(190,210,240,${wk === 'storm' ? 0.35 : 0.25})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = ((i * 97.3 + now * (wk === 'storm' ? 0.6 : 0.35)) % (W + 60)) - 30;
        const y = ((i * 53.7 + now * 0.9) % (H + 40)) - 20;
        ctx.moveTo(x, y);
        ctx.lineTo(x - (wk === 'storm' ? 8 : 4), y + 12);
      }
      ctx.stroke();
      if (wk === 'storm') {
        if (now > flashUntil + 4000 && Math.random() < 0.006) flashUntil = now + 140;
        if (now < flashUntil) {
          ctx.fillStyle = 'rgba(235,240,255,0.55)';
          ctx.fillRect(0, 0, W, H);
          if (UI.Sound) UI.Sound.thunder();
        }
      }
    } else if (wk === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 160; i++) {
        const x = ((i * 71.7 + Math.sin(now / 900 + i) * 20 + now * 0.02) % (W + 20)) - 10;
        const y = ((i * 37.3 + now * 0.05) % (H + 20)) - 10;
        ctx.beginPath();
        ctx.arc(x, y, 1 + (i % 3) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (wk === 'fog') {
      for (let i = 0; i < 7; i++) {
        const x = ((i * 260 + now / 60) % (W + 600)) - 300, y = (i * 137) % H;
        const g = ctx.createRadialGradient(x, y, 10, x, y, 260);
        g.addColorStop(0, 'rgba(225,230,238,0.45)');
        g.addColorStop(1, 'rgba(225,230,238,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 260, y - 260, 520, 520);
      }
      ctx.fillStyle = 'rgba(220,225,235,0.18)';
      ctx.fillRect(0, 0, W, H);
    }
  };

  // ---------- speech bubbles ----------
  const bubbles = [];
  let nextBubble = 0;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function lineFor(world, c) {
    const wk = world.life ? world.life.weather.kind : 'clear';
    const fest = world.life && world.life.festival && world.life.festival.until > world.t;
    if (c.flags.trapped) return pick(['Help! The water!', 'Someone, please!', 'Hold on to me!']);
    if (c.flags.ceremony && c.flags.ceremony.until > world.t) return /mourn/.test(c.flags.ceremony.activity) ? pick(['A good soul, gone.', 'Rest now.', 'I can\'t believe it.']) : pick(['To the happy couple!', 'May they be blessed!', 'Another round!']);
    if (fest && /festival|fair|blessing|vigil/i.test(c.activity)) return pick(['What a day!', 'Pass the cider!', 'Blessings on us all!', 'Dance with me!', 'Light a candle for me.']);
    if (/preaching/.test(c.activity)) return pick(['Repent, the light is watching!', 'I have seen it with my own eyes!', 'Heaven walks among us!']);
    if (c.illness && c.illness.severity > 30) return pick(['I feel terrible…', '*cough* *cough*', 'My head is burning.']);
    if (c.hunger > 50) return pick(['When did I last eat?', 'Bread costs a fortune.', 'My children are hungry.']);
    if (c.flags.grief) return pick(['I miss them.', 'Why did they have to go?']);
    if (world.prayers.some((p) => p.status === 'pending' && p.requesterId === c.id)) return pick(['Please, hear me…', 'Are you there?', 'Just a sign. Anything.']);
    if (c.agenda && Math.random() < 0.5) {
      const a = { war: 'Kesh needs teaching a lesson.', iron_fist: 'This city needs a firm hand.', coup: 'The army deserves better masters.', revolt: 'Our day is coming.', theocracy: 'Only the Church can save us.', reform: 'We need a charter of rights.', peace: 'No more war, I say.', mercy: 'We must look after the poor.', loyalty: 'Long live the Crown.' }[c.agenda.kind];
      if (a) return a;
    }
    if (wk === 'rain' || wk === 'storm') return pick(['This rain…', 'Soaked through again.', 'The river will rise.']);
    if (wk === 'snow') return pick(['Cold enough to freeze the river.', 'Look, snow!']);
    if (wk === 'fog') return pick(['Can\'t see a thing.', 'Who goes there?']);
    if (Math.random() < 0.25 && S.latestRumour(world)) return '"' + S.latestRumour(world).slice(0, 70) + (S.latestRumour(world).length > 70 ? '…"' : '"');
    if (c.role === 'merchant' && c.activity === 'working') return pick(['Fresh bread! Fresh bread!', 'Best cloth in Velmora!', 'Two for a penny!']);
    if (c.role === 'farmer' && c.activity === 'working') return pick(['Good soil this year.', 'Steady now…']);
    if (c.role === 'guard' || c.role === 'soldier') return pick(['Move along.', 'Keep the peace.']);
    if (c.role === 'child') return pick(['Catch me!', 'Tag, you\'re it!', 'Mama!']);
    if (c.belief > 75) return pick(['Heaven watches over us.', 'Praise the Unseen Flame.']);
    if (c.belief < 20) return pick(['Prayers won\'t fix this.', 'Superstition, all of it.']);
    return pick(['Good day.', 'Lovely weather.', 'Did you hear?', 'Busy, busy.', 'Hmm.']);
  }
  A.bubbles = function (ctx, world, people, sx, sy, ts, u, now, covered) {
    if (ts < 20 || UI.state.speed > 4) return;
    if (now > nextBubble && bubbles.length < 4) {
      nextBubble = now + 900 + Math.random() * 900;
      const cands = people.filter((c) => !c.asleep && !covered(c) && c.age >= 4 && !bubbles.some((b) => b.id === c.id));
      const c = cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
      if (c) bubbles.push({ id: c.id, text: lineFor(world, c), until: now + 3800 });
    }
    ctx.font = `${Math.min(13, Math.max(10, ts * 0.36))}px sans-serif`;
    ctx.textAlign = 'center';
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      const c = S.char(world, b.id);
      if (!c || !c.alive || now > b.until || covered(c)) {
        bubbles.splice(i, 1);
        continue;
      }
      const x = sx(c.x), y = sy(c.y) - UI.Figures.headTop(c, u) - 12;
      const tw = Math.min(ctx.measureText(b.text).width, 220);
      const fade = Math.min(1, (b.until - now) / 400);
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(250,247,238,0.95)';
      ctx.strokeStyle = 'rgba(40,30,20,0.6)';
      ctx.lineWidth = 1;
      const bx = x - tw / 2 - 7, by = y - 18, bw = tw + 14, bh = 20;
      ctx.beginPath();
      ctx.moveTo(bx + 6, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, 6);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, 6);
      ctx.lineTo(x + 5, by + bh);
      ctx.lineTo(x, by + bh + 6);
      ctx.lineTo(x - 3, by + bh);
      ctx.arcTo(bx, by + bh, bx, by, 6);
      ctx.arcTo(bx, by, bx + bw, by, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2a2018';
      ctx.fillText(b.text, x, by + 14, 220);
      ctx.globalAlpha = 1;
    }
  };

  // ---------- prayer lights rising toward heaven ----------
  A.prayerLights = function (ctx, world, sx, sy, ts, u, now) {
    const h = hourF(world);
    for (const p of world.prayers) {
      if (p.status !== 'pending') continue;
      const c = S.char(world, p.requesterId);
      if (!c || !c.alive) continue;
      for (let k = 0; k < (p.urgency >= 3 ? 4 : 2); k++) {
        const t = ((now / 2600) + k / 3 + c.id * 0.13) % 1;
        const x = sx(c.x) + Math.sin(now / 500 + k + c.id) * ts * 0.25;
        const y = sy(c.y) - UI.Figures.headTop(c, u) - t * ts * 2.4;
        const a = (1 - t) * (h > 19 || h < 6 ? 0.95 : 0.7);
        const g = ctx.createRadialGradient(x, y, 0, x, y, ts * 0.22);
        const col = p.urgency >= 3 ? '255,140,120' : '255,225,150';
        g.addColorStop(0, `rgba(${col},${a})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, ts * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // ---------- miracle effects ----------
  const parts = [];
  let lastFx = 0;
  const FX_COL = { heal: '255,220,120', protect: '255,210,90', provide: '255,230,160', vision: '190,150,255', sway: '170,110,230', inspire: '255,160,80', inspire_leader: '255,180,90', smite: '220,230,255', reveal: '255,240,200', regional: '200,230,255', national: '255,230,180', global: '255,255,255', subtle_sign: '255,255,220', possess: '255,210,120' };
  function spawn(world, fx) {
    const col = FX_COL[fx.kind] || '255,230,160';
    const big = ['regional', 'national', 'global'].includes(fx.kind);
    const n = big ? 120 : fx.kind === 'subtle_sign' ? 12 : 40;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (big ? 3 : 1) * (0.3 + Math.random() * 1.2);
      parts.push({ x: fx.x, y: fx.y, vx: Math.cos(a) * sp * (fx.kind === 'heal' ? 0.3 : 1), vy: Math.sin(a) * sp * (fx.kind === 'heal' ? 0.3 : 1) - (fx.kind === 'heal' ? 1.4 : 0), life: 1, decay: 0.012 + Math.random() * 0.01, col, size: big ? 0.25 : 0.12 });
    }
    parts.push({ ring: true, x: fx.x, y: fx.y, r: 0, vr: big ? 0.5 : fx.kind === 'protect' ? 0.12 : 0.18, life: 1, decay: 0.012, col });
    if (fx.kind === 'smite') parts.push({ bolt: true, x: fx.x, y: fx.y, life: 1, decay: 0.05, col });
    if (UI.Sound) UI.Sound.chime(fx.kind);
  }
  A.fx = function (ctx, world, sx, sy, ts) {
    for (const f of world._fx || []) if (f.id > lastFx) {
      lastFx = f.id;
      spawn(world, f);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= p.decay;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      if (p.ring) {
        p.r += p.vr;
        ctx.strokeStyle = `rgba(${p.col},${p.life * 0.8})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), p.r * ts, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.bolt) {
        ctx.strokeStyle = `rgba(${p.col},${p.life})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        let x = sx(p.x), y = -10;
        ctx.moveTo(x, y);
        while (y < sy(p.y)) {
          y += 30;
          x += (Math.random() - 0.5) * 40;
          ctx.lineTo(x, Math.min(y, sy(p.y)));
        }
        ctx.stroke();
      } else {
        p.x += p.vx * 0.05;
        p.y += p.vy * 0.05;
        p.vy += 0.01;
        ctx.fillStyle = `rgba(${p.col},${p.life})`;
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), p.size * ts * (0.5 + p.life), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  // ---------- minimap ----------
  A.minimap = function (canvas, world) {
    if (!canvas || !UI.Local.terrain) return;
    const g = canvas.getContext('2d');
    const c = city();
    const W = canvas.width, H = canvas.height;
    const kx = W / c.width, ky = H / c.height;
    g.drawImage(UI.Local.terrain, 0, 0, W, H);
    for (const b of world.buildings) {
      g.fillStyle = b.type === 'market' ? '#8c8273' : UI.Scenery.roofColor(b);
      g.fillRect(b.x * kx, b.y * ky, b.w * kx, b.h * ky);
    }
    if (world.flood.level > 0) {
      const z = world.flood.diverted ? c.northFields : c.floodplain;
      g.fillStyle = 'rgba(70,120,200,0.6)';
      g.fillRect(z.x0 * kx, z.y0 * ky, (z.x1 - z.x0 + 1) * world.flood.level * kx, (z.y1 - z.y0 + 1) * ky);
    }
    const pend = new Set(world.prayers.filter((p) => p.status === 'pending').map((p) => p.requesterId));
    for (const ch of S.living(world)) {
      g.fillStyle = ch.flags.trapped ? '#ff5a4a' : pend.has(ch.id) ? '#ffd27a' : 'rgba(255,255,255,0.8)';
      g.fillRect(ch.x * kx - 1, ch.y * ky - 1, 2.5, 2.5);
    }
    const st = UI.state;
    const vw = A._view;
    if (vw) {
      g.strokeStyle = '#e0b341';
      g.lineWidth = 1.5;
      g.strokeRect(vw.x0 * kx, vw.y0 * ky, (vw.x1 - vw.x0) * kx, (vw.y1 - vw.y0) * ky);
    }
    const pos = S.playerPos(world);
    g.fillStyle = '#fff6c8';
    g.beginPath();
    g.arc(pos.x * kx, pos.y * ky, 3.5, 0, Math.PI * 2);
    g.fill();
    void st;
  };

  // ---------- soundscape (WebAudio, procedural, off until the player turns it on) ----------
  const Sound = (UI.Sound = { on: false });
  let ac = null, nodes = null, lastBell = 0, lastBird = 0, lastCricket = 0, lastThunder = 0;
  function noiseBuffer(ctx) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown-ish noise
      d[i] = last * 3.5;
    }
    return b;
  }
  function loop(ctx, buf, type, freq, q) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 0.7;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
    return g;
  }
  Sound.toggle = function () {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ac = new AC();
        const buf = noiseBuffer(ac);
        nodes = { wind: loop(ac, buf, 'lowpass', 400), rain: loop(ac, buf, 'highpass', 1200), crowd: loop(ac, buf, 'bandpass', 600, 1.5), river: loop(ac, buf, 'bandpass', 250, 0.6) };
      }
      Sound.on = !Sound.on;
      if (Sound.on) ac.resume();
      else ac.suspend();
      return Sound.on;
    } catch (e) {
      return false;
    }
  };
  function tone(freq, dur, vol, type, glideTo) {
    if (!ac || !Sound.on) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur + 0.05);
  }
  Sound.chime = function (kind) {
    if (kind === 'smite') return Sound.thunder(true);
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 1.2, 0.05, 'sine'), i * 90));
  };
  Sound.thunder = function (force) {
    if (!ac || !Sound.on) return;
    const now = performance.now();
    if (!force && now - lastThunder < 3000) return;
    lastThunder = now;
    tone(70, 2.2, 0.25, 'sawtooth', 30);
  };
  Sound.update = function (world, near, now) {
    if (!ac || !Sound.on || !nodes) return;
    const wk = world.life ? world.life.weather.kind : 'clear';
    const h = hourF(world);
    const set = (g, v) => g.gain.setTargetAtTime(v, ac.currentTime, 0.6);
    set(nodes.wind, wk === 'storm' ? 0.35 : wk === 'snow' ? 0.18 : 0.06);
    set(nodes.rain, wk === 'storm' ? 0.22 : wk === 'rain' ? 0.12 : 0);
    set(nodes.crowd, Math.min(0.12, near.crowd * 0.012));
    set(nodes.river, near.river ? 0.08 : 0.02);
    // Temple bells on Restday mornings, at festivals and funerals
    const bellTime = (T.isRestday(world) && h >= 8.8 && h < 9.2) || (world.life && world.life.festival && h >= 9.8 && h < 10.2);
    if (bellTime && now - lastBell > 2500) {
      lastBell = now;
      tone(392, 3, 0.09, 'triangle');
      setTimeout(() => tone(330, 3, 0.07, 'triangle'), 700);
    }
    if (h > 5.5 && h < 18 && wk !== 'storm' && wk !== 'rain' && now - lastBird > 1800 + Math.random() * 4000) {
      lastBird = now;
      const f = 2200 + Math.random() * 1600;
      tone(f, 0.12, 0.025, 'sine', f * 1.3);
      setTimeout(() => tone(f * 1.1, 0.1, 0.02, 'sine', f * 1.5), 150);
    }
    if ((h > 20.5 || h < 4.5) && S.season(world).id !== 'winter' && now - lastCricket > 600) {
      lastCricket = now;
      tone(4200, 0.05, 0.012, 'square');
    }
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
