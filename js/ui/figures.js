// 2D people: appearance (derived deterministically from identity), canvas figures and dossier portraits.
// Presentation only: appearance is never stored in the save and never touches the simulation RNG.
(function (G) {
  'use strict';
  const UI = G.UI;
  const F = (UI.Figures = {});

  const SKIN = ['#f6d7c3', '#eec1a0', '#dcaa84', '#c08a62', '#9a6643', '#70472d'];
  const HAIR = ['#1f1611', '#3b2618', '#5e3b22', '#8a5a2e', '#b98a4a', '#d9bd78', '#9a3b22'];
  const EARTH = ['#6b5b4a', '#7a6248', '#5d6b4e', '#6e5a6b', '#4f5f6e', '#7d6a50', '#5a4c3e'];
  const PASTEL = ['#c98f8f', '#8fb0c9', '#a9c98f', '#c9b88f', '#b49ac9', '#c9a38f'];

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function rand(seed) {
    // Small deterministic generator for picking features.
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  // Clothing by role: [main, accent, garment] garment: tunic | dress | robe | armor
  const OUTFITS = {
    monarch: ['#6e2a7e', '#e0b341', 'robe'], heir: ['#34559a', '#e0b341', null], noble: ['#55366f', '#c9a24a', null],
    priest: ['#ebe4d2', '#c9a24a', 'robe'], general: ['#8f2b2b', '#e0b341', 'armor'], soldier: ['#8f2b2b', '#7d7f86', 'armor'],
    guard: ['#7a2e3a', '#7d7f86', 'armor'], reformer: ['#2f5f7a', '#d9d2c0', null], healer: ['#4f8a5e', '#f1ece0', null],
    farmer: ['#8a6a3c', '#d9c08a', null], merchant: ['#a26a32', '#e7d3a1', null], scholar: ['#2d3f66', '#b9c3dc', 'robe'],
    student: ['#3e5a86', '#d0d6e6', null], official: ['#474c58', '#c9a24a', null], clerk: ['#525866', '#c7ccd6', null],
    servant: ['#7a7468', '#e6e0d2', null], innkeeper: ['#6e4a32', '#e6d8bd', null], artisan: ['#6a5640', '#c9a77a', null],
  };

  const cache = new Map();
  F.look = function (c) {
    const key = c.id + ':' + c.role;
    let l = cache.get(key);
    if (l) return l;
    const fam = rand(hashStr(c.last || 'x'));
    const me = rand(hashStr(c.first + ':' + c.id));
    // Families share skin and (often) hair colour.
    let skinI = Math.floor(fam() * SKIN.length);
    if (me() < 0.35) skinI = Math.max(0, Math.min(SKIN.length - 1, skinI + (me() < 0.5 ? -1 : 1)));
    const famHair = Math.floor(fam() * HAIR.length);
    const hairI = me() < 0.7 ? famHair : Math.floor(me() * HAIR.length);
    const female = c.sex === 'f';
    const style = female ? pick(me, ['long', 'long', 'bun', 'braid', 'short']) : pick(me, ['short', 'short', 'crop', 'shaggy', 'long']);
    const outfit = OUTFITS[c.role];
    const main = outfit ? outfit[0] : c.role === 'child' ? pick(me, PASTEL) : pick(me, EARTH);
    const accent = outfit ? outfit[1] : '#d8ccb4';
    let garment = outfit && outfit[2] ? outfit[2] : female && c.age >= 12 ? 'dress' : 'tunic';
    if (female && garment === 'armor' && me() < 0.2) garment = 'armor';
    l = {
      skin: SKIN[skinI], hair: HAIR[hairI], style, main, accent, garment,
      trousers: pick(me, ['#3a3128', '#2f3540', '#4a3b2c', '#3d3a33']),
      beard: !female && me() < 0.45, balding: !female && me() < 0.35,
      hat: c.role === 'farmer' && me() < 0.6 ? 'straw' : c.role === 'monarch' ? 'crown' : c.role === 'heir' ? 'circlet' : c.role === 'soldier' || c.role === 'guard' ? 'helmet' : c.role === 'priest' && me() < 0.5 ? 'hood' : null,
      apron: c.role === 'healer' || c.role === 'innkeeper' || c.role === 'artisan',
    };
    cache.set(key, l);
    return l;
  };

  F.hairColor = function (c, l) {
    if (c.age >= 68) return '#e6e3dc';
    if (c.age >= 52) return '#a9a49b';
    return l.hair;
  };

  // Movement memory for facing and walk cycles (UI-only).
  const motion = new Map();
  F.motion = function (c, now) {
    let m = motion.get(c.id);
    if (!m) {
      m = { x: c.x, y: c.y, facing: c.id % 2 ? 1 : -1, moving: false, until: 0 };
      motion.set(c.id, m);
    }
    const dx = c.x - m.x;
    const dy = c.y - m.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.0005) {
      if (Math.abs(dx) > 0.0005) m.facing = dx < 0 ? -1 : 1;
      m.until = now + 160; // keep the walk cycle smooth between sim steps
    }
    m.moving = now < m.until;
    m.x = c.x;
    m.y = c.y;
    return m;
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Draws a person standing at (x, y) (their feet are slightly below y). u = pixels per base unit.
  // opts: { facing, moving, now, asleep, ring, ringColor, selected, look }
  F.draw = function (ctx, c, x, y, u, opts = {}) {
    const l = opts.look || F.look(c);
    const s = c.age < 6 ? 0.55 : c.age < 14 ? 0.72 : 1;
    const now = opts.now || 0;
    const swing = opts.moving ? Math.sin(now / 85 + c.id) : 0;
    const bob = opts.moving ? Math.abs(swing) * 0.6 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(u * s, u * s);
    // ground shadow, belief ring and selection
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (opts.ringColor) {
      ctx.strokeStyle = opts.ringColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 7, 7, 2.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (opts.selected) {
      ctx.strokeStyle = '#e0b341';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 7, 9, 3.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (opts.asleep) {
      // Lying down: a simple sideways figure under a blanket.
      ctx.fillStyle = l.main;
      rr(ctx, -8, 1, 13, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = l.skin;
      ctx.beginPath();
      ctx.arc(7.5, 3.5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = F.hairColor(c, l);
      ctx.beginPath();
      ctx.arc(8.6, 3, 3.2, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.translate(0, -bob);
    const flip = opts.facing || 1;
    const outline = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.8;
    const long = l.garment === 'robe' || l.garment === 'dress';
    // legs
    ctx.fillStyle = l.trousers;
    const legY = long ? 4.5 : 1.5;
    ctx.fillRect(-3 + swing * 1.2, legY, 2.2, 6.2 - legY + 1);
    ctx.fillRect(0.8 - swing * 1.2, legY, 2.2, 6.2 - legY + 1);
    ctx.fillStyle = '#2a211a'; // shoes
    ctx.fillRect(-3.4 + swing * 1.2, 6.4, 3, 1.4);
    ctx.fillRect(0.4 - swing * 1.2, 6.4, 3, 1.4);
    // long hair falls behind the body
    const hairC = F.hairColor(c, l);
    if (l.style === 'long' || l.style === 'braid') {
      ctx.fillStyle = hairC;
      rr(ctx, -4.6, -11, 9.2, l.style === 'long' ? 11 : 8, 3);
      ctx.fill();
    }
    // arms (behind torso edges)
    ctx.fillStyle = l.main;
    ctx.save();
    ctx.translate(-5.2, -4.5);
    ctx.rotate(swing * 0.5);
    rr(ctx, -1.2, 0, 2.4, 7, 1.2);
    ctx.fill();
    ctx.fillStyle = l.skin;
    ctx.beginPath();
    ctx.arc(0, 7.3, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(5.2, -4.5);
    ctx.rotate(-swing * 0.5);
    ctx.fillStyle = l.main;
    rr(ctx, -1.2, 0, 2.4, 7, 1.2);
    ctx.fill();
    ctx.fillStyle = l.skin;
    ctx.beginPath();
    ctx.arc(0, 7.3, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // torso / garment
    ctx.fillStyle = l.main;
    ctx.beginPath();
    ctx.moveTo(-4.6, -5.6);
    ctx.lineTo(4.6, -5.6);
    if (long) {
      ctx.lineTo(6, 6.5);
      ctx.lineTo(-6, 6.5);
    } else {
      ctx.lineTo(5, 2.4);
      ctx.lineTo(-5, 2.4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.stroke();
    // garment details
    if (l.garment === 'armor') {
      ctx.fillStyle = '#9da1aa';
      rr(ctx, -4, -5.2, 8, 5.5, 1.5);
      ctx.fill();
      ctx.fillStyle = l.accent;
      ctx.fillRect(-4.6, 0.6, 9.2, 1.1);
    } else if (l.apron) {
      ctx.fillStyle = l.accent;
      rr(ctx, -3, -3, 6, long ? 8 : 5.6, 1);
      ctx.fill();
    } else {
      ctx.fillStyle = l.accent; // belt / sash
      ctx.fillRect(-4.8, long ? -0.6 : 0.6, 9.6, 1.1);
    }
    if (c.role === 'monarch' || c.role === 'noble') {
      ctx.fillStyle = c.role === 'monarch' ? '#9c1f2e' : '#3a2350'; // cape edge
      ctx.fillRect(-5, -5.6, 1.4, long ? 11 : 7.5);
      ctx.fillRect(3.6, -5.6, 1.4, long ? 11 : 7.5);
    }
    // a hood frames the face from behind
    if (l.hat === 'hood') {
      ctx.fillStyle = l.main;
      ctx.beginPath();
      ctx.arc(0, -10.2, 5.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.stroke();
    }
    // neck & head
    ctx.fillStyle = l.skin;
    ctx.fillRect(-1.2, -7, 2.4, 2);
    ctx.beginPath();
    ctx.arc(0, -10, l.hat === 'hood' ? 3.9 : 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.stroke();
    // hair on top
    ctx.fillStyle = hairC;
    const bald = l.balding && c.age > 40;
    if (!bald && l.hat !== 'helmet' && l.hat !== 'hood') {
      ctx.beginPath();
      if (l.style === 'crop') ctx.arc(0, -10.6, 4.3, Math.PI * 1.05, Math.PI * 1.95);
      else ctx.arc(0, -10.4, 4.6, Math.PI * 0.95, Math.PI * 2.05);
      ctx.closePath();
      ctx.fill();
      // fringe swept toward facing side
      ctx.beginPath();
      ctx.ellipse(-1.2 * flip, -12.6, 3.4, 1.6, 0.2 * flip, 0, Math.PI * 2);
      ctx.fill();
      if (l.style === 'bun') {
        ctx.beginPath();
        ctx.arc(0, -15, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (l.style === 'shaggy') {
        ctx.fillRect(-4.6, -11, 1.6, 3.5);
        ctx.fillRect(3, -11, 1.6, 3.5);
      }
    } else if (bald) {
      ctx.fillRect(-4.6, -11, 1.3, 2.6);
      ctx.fillRect(3.3, -11, 1.3, 2.6);
    }
    // face: eyes look where they walk
    const ex = 0.7 * flip;
    ctx.fillStyle = '#20160f';
    ctx.beginPath();
    ctx.arc(-1.6 + ex, -9.8, 0.62, 0, Math.PI * 2);
    ctx.arc(1.6 + ex, -9.8, 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,40,30,0.55)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    const mood = c.mood == null ? 55 : c.mood;
    const curve = mood > 60 ? 0.7 : mood < 30 ? -0.6 : 0.1;
    ctx.moveTo(-1.1 + ex, -7.6);
    ctx.quadraticCurveTo(ex, -7.6 + curve, 1.1 + ex, -7.6);
    ctx.stroke();
    if (l.beard && c.age >= 22 && c.role !== 'child') {
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.arc(0, -8.4, 3.6, Math.PI * 0.1, Math.PI * 0.9);
      ctx.fill();
    }
    // headwear
    if (l.hat === 'crown' || l.hat === 'circlet') {
      ctx.fillStyle = '#e8c04a';
      if (l.hat === 'crown') {
        ctx.beginPath();
        ctx.moveTo(-3.6, -13.4);
        ctx.lineTo(-3.6, -16.4);
        ctx.lineTo(-1.8, -14.6);
        ctx.lineTo(0, -17);
        ctx.lineTo(1.8, -14.6);
        ctx.lineTo(3.6, -16.4);
        ctx.lineTo(3.6, -13.4);
        ctx.closePath();
        ctx.fill();
      } else ctx.fillRect(-3.8, -13.8, 7.6, 1.1);
    } else if (l.hat === 'straw') {
      ctx.fillStyle = '#d8b765';
      ctx.beginPath();
      ctx.ellipse(0, -13, 6.6, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      rr(ctx, -3.2, -16, 6.4, 3.4, 1.5);
      ctx.fill();
    } else if (l.hat === 'helmet') {
      ctx.fillStyle = '#8e939c';
      ctx.beginPath();
      ctx.arc(0, -11, 4.8, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-5.2, -11.2, 10.4, 1.3);
    }
    ctx.restore();
  };

  // Height of the figure's head top above its anchor, in pixels (for icons and labels).
  F.headTop = (c, u) => (c.age < 6 ? 0.55 : c.age < 14 ? 0.72 : 1) * 17 * u;

  // Portrait for the dossier (inline SVG bust).
  F.portrait = function (c, size = 64) {
    const l = F.look(c);
    const hairC = F.hairColor(c, l);
    const bald = l.balding && c.age > 40;
    let hair = '';
    if (l.style === 'long' || l.style === 'braid') hair += `<rect x="17" y="18" width="30" height="${l.style === 'long' ? 30 : 24}" rx="10" fill="${hairC}"/>`;
    const body = `<path d="M10 64 Q12 44 32 42 Q52 44 54 64 Z" fill="${l.main}"/>` +
      (l.garment === 'armor' ? `<path d="M18 64 Q20 48 32 47 Q44 48 46 64 Z" fill="#9da1aa"/>` : `<path d="M28 44 L32 52 L36 44" fill="none" stroke="${l.accent}" stroke-width="2.5"/>`) +
      (l.apron ? `<rect x="24" y="50" width="16" height="14" rx="2" fill="${l.accent}"/>` : '');
    let top = '';
    if (!bald && l.hat !== 'helmet' && l.hat !== 'hood') {
      top += `<path d="M17 30 Q17 13 32 13 Q47 13 47 30 Q44 20 32 21 Q20 20 17 30 Z" fill="${hairC}"/>`;
      if (l.style === 'bun') top += `<circle cx="32" cy="11" r="5" fill="${hairC}"/>`;
    }
    const beard = l.beard && c.age >= 22 && c.role !== 'child' ? `<path d="M21 33 Q22 47 32 47 Q42 47 43 33 Q38 40 32 40 Q26 40 21 33 Z" fill="${hairC}"/>` : '';
    let hat = '';
    if (l.hat === 'crown') hat = `<path d="M21 17 L21 8 L26 13 L32 6 L38 13 L43 8 L43 17 Z" fill="#e8c04a"/>`;
    else if (l.hat === 'circlet') hat = `<rect x="19" y="15" width="26" height="3" rx="1.5" fill="#e8c04a"/>`;
    else if (l.hat === 'straw') hat = `<ellipse cx="32" cy="17" rx="21" ry="4.5" fill="#d8b765"/><rect x="22" y="7" width="20" height="10" rx="5" fill="#d8b765"/>`;
    else if (l.hat === 'helmet') hat = `<path d="M16 27 Q16 11 32 11 Q48 11 48 27 Z" fill="#8e939c"/><rect x="15" y="25" width="34" height="3" fill="#7d8089"/>`;
    else if (l.hat === 'hood') hat = `<path d="M14 40 Q12 10 32 10 Q52 10 50 40 Q46 22 32 22 Q18 22 14 40 Z" fill="${l.main}"/>`;
    const mood = c.mood == null ? 55 : c.mood;
    const mouth = mood > 60 ? 'M27 37 Q32 41 37 37' : mood < 30 ? 'M27 39 Q32 35 37 39' : 'M27 38 L37 38';
    return `<svg class="portrait" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#1c2846"/>
      ${hair}${body}
      <rect x="28" y="38" width="8" height="6" fill="${l.skin}"/>
      <ellipse cx="32" cy="29" rx="14" ry="15" fill="${l.skin}"/>
      ${top}${beard}
      <circle cx="26.5" cy="29" r="1.7" fill="#20160f"/><circle cx="37.5" cy="29" r="1.7" fill="#20160f"/>
      <path d="${mouth}" stroke="#7a3a2c" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      ${c.age >= 55 ? '<path d="M22 24 Q26 23 29 24 M35 24 Q38 23 42 24" stroke="rgba(0,0,0,.25)" stroke-width="1" fill="none"/>' : ''}
      ${hat}
    </svg>`;
  };

  // The player's mortal body: a plain traveller in a grey cloak.
  F.travellerLook = { skin: '#e2b896', hair: '#4a3020', style: 'short', main: '#6f7380', accent: '#e0b341', garment: 'robe', trousers: '#3a3128', beard: true, balding: false, hat: 'hood', apron: false };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
