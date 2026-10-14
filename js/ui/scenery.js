// Detailed 2D scenery for the Local View: terrain, building interiors (cutaway), roofs, lights and weather.
// Static art is rendered once into offscreen layers at P pixels per tile; the Local View composites them each frame.
(function (G) {
  'use strict';
  const UI = G.UI;
  const Sc = (UI.Scenery = {});
  const P = 32; // pixels per tile in the offscreen layers
  Sc.P = P;

  function hash(x, y, k = 0) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(k | 0, 2246822519)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rnd(seed) {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255;
    const p = Math.abs(f);
    r = Math.round((t - r) * p + r);
    gg = Math.round((t - gg) * p + gg);
    b = Math.round((t - b) * p + b);
    return `rgb(${r},${gg},${b})`;
  }

  // ---------- occupancy (where decoration may go) ----------
  function occupancy() {
    const city = G.Data.city;
    const W = city.width, H = city.height;
    const grid = Array.from({ length: W }, () => new Array(H).fill(0));
    const mark = (x0, y0, w, h, v) => {
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) grid[x][y] = v;
    };
    for (const z of city.zones) mark(z.x, z.y, z.w, z.h, 2);
    for (const r of city.roads) mark(r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1, 3);
    mark(city.river.x0 - 1, 0, city.river.x1 - city.river.x0 + 3, H, 4);
    for (const b of city.buildings) mark(b.x - 1, b.y - 1, b.w + 2, b.h + 2, 5);
    return grid;
  }

  // ---------- terrain ----------
  Sc.buildTerrain = function () {
    const city = G.Data.city;
    const c = canvas(city.width * P, city.height * P);
    const g = c.getContext('2d');
    const occ = occupancy();
    // Grass with tonal variation and blades
    for (let y = 0; y < city.height; y++) {
      for (let x = 0; x < city.width; x++) {
        const n = hash(x, y);
        const east = x > city.river.x1;
        g.fillStyle = east ? `hsl(${86 + n * 10}, 34%, ${27 + n * 5}%)` : `hsl(${94 + n * 10}, 26%, ${25 + n * 5}%)`;
        g.fillRect(x * P, y * P, P, P);
        const r = rnd(strHash(`g${x},${y}`));
        for (let k = 0; k < 7; k++) {
          const bx = x * P + r() * P, by = y * P + r() * P;
          g.strokeStyle = r() < 0.5 ? 'rgba(20,40,10,0.35)' : 'rgba(170,200,110,0.22)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(bx, by);
          g.lineTo(bx + (r() - 0.5) * 3, by - 3 - r() * 3);
          g.stroke();
        }
        if (occ[x][y] === 0 && r() < 0.05) {
          // wildflowers
          const col = ['#f2e27a', '#e8a0c8', '#ffffff', '#b9a0ff'][Math.floor(r() * 4)];
          for (let k = 0; k < 4; k++) {
            g.fillStyle = col;
            g.beginPath();
            g.arc(x * P + r() * P, y * P + r() * P, 1.3, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    // Fields: tilled soil with crop rows
    for (const z of city.zones) {
      const wheat = z.id === 'north_fields';
      g.fillStyle = '#5f4a2c';
      g.fillRect(z.x * P, z.y * P, z.w * P, z.h * P);
      for (let yy = z.y * P + 6; yy < (z.y + z.h) * P - 2; yy += 10) {
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(z.x * P + 3, yy + 3, z.w * P - 6, 3);
        const r = rnd(strHash(z.id + yy));
        for (let xx = z.x * P + 5; xx < (z.x + z.w) * P - 4; xx += wheat ? 4 : 9) {
          if (wheat) {
            g.strokeStyle = r() < 0.5 ? '#d9b65a' : '#c79f43';
            g.lineWidth = 1.4;
            g.beginPath();
            g.moveTo(xx, yy + 4);
            g.lineTo(xx + (r() - 0.5) * 2, yy - 4);
            g.stroke();
            g.fillStyle = '#e8c870';
            g.fillRect(xx - 1, yy - 6, 2, 3);
          } else {
            g.fillStyle = r() < 0.5 ? '#5f9a46' : '#4f8a3c';
            g.beginPath();
            g.arc(xx, yy, 3.4, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(200,240,160,0.35)';
            g.beginPath();
            g.arc(xx - 1, yy - 1, 1.4, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      g.strokeStyle = '#3e3020';
      g.lineWidth = 2;
      g.strokeRect(z.x * P + 1, z.y * P + 1, z.w * P - 2, z.h * P - 2);
    }
    // Roads: cobbles in town, dirt tracks in the country
    // Split roads at the river: cobbles on the town side, dirt on the farm side.
    const segs = [];
    for (const rd of city.roads) {
      if (rd.x0 < city.river.x0 && rd.x1 > city.river.x1) {
        segs.push({ x0: rd.x0, y0: rd.y0, x1: city.river.x0 - 1, y1: rd.y1, town: true });
        segs.push({ x0: city.river.x1 + 1, y0: rd.y0, x1: rd.x1, y1: rd.y1, town: false });
      } else segs.push(Object.assign({ town: rd.x1 <= city.river.x0 }, rd));
    }
    for (const rd of segs) {
      const x0 = rd.x0 * P, y0 = rd.y0 * P, w = (rd.x1 - rd.x0 + 1) * P, h = (rd.y1 - rd.y0 + 1) * P;
      const town = rd.town;
      g.fillStyle = town ? '#7d7466' : '#8a6d45';
      g.fillRect(x0, y0, w, h);
      const r = rnd(strHash(`road${rd.x0},${rd.y0}`));
      if (town) {
        for (let yy = y0 + 2; yy < y0 + h - 2; yy += 6) {
          for (let xx = x0 + 2 + ((yy / 6) % 2) * 3; xx < x0 + w - 2; xx += 7) {
            g.fillStyle = `hsl(35, ${8 + r() * 8}%, ${40 + r() * 14}%)`;
            rr(g, xx, yy, 5.5, 4.5, 1.5);
            g.fill();
          }
        }
      } else {
        const horiz = w > h;
        g.fillStyle = 'rgba(60,40,20,0.35)';
        if (horiz) {
          g.fillRect(x0, y0 + h * 0.3, w, 2);
          g.fillRect(x0, y0 + h * 0.68, w, 2);
        } else {
          g.fillRect(x0 + w * 0.3, y0, 2, h);
          g.fillRect(x0 + w * 0.68, y0, 2, h);
        }
        for (let k = 0; k < (w * h) / 200; k++) {
          g.fillStyle = 'rgba(40,30,15,0.4)';
          g.fillRect(x0 + r() * w, y0 + r() * h, 2, 2);
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.15)';
      if (w > h) {
        g.fillRect(x0, y0, w, 2);
        g.fillRect(x0, y0 + h - 2, w, 2);
      } else {
        g.fillRect(x0, y0, 2, h);
        g.fillRect(x0 + w - 2, y0, 2, h);
      }
    }
    // River with sandy banks, depth gradient and reeds
    const rx0 = city.river.x0 * P, rw = (city.river.x1 - city.river.x0 + 1) * P;
    g.fillStyle = '#b4a27a';
    g.fillRect(rx0 - 7, 0, rw + 14, city.height * P);
    const grad = g.createLinearGradient(rx0, 0, rx0 + rw, 0);
    grad.addColorStop(0, '#3f6f9e');
    grad.addColorStop(0.5, '#244e7c');
    grad.addColorStop(1, '#3f6f9e');
    g.fillStyle = grad;
    g.fillRect(rx0 - 2, 0, rw + 4, city.height * P);
    const rr2 = rnd(77);
    for (let k = 0; k < 220; k++) {
      g.strokeStyle = `rgba(200,225,255,${0.06 + rr2() * 0.12})`;
      g.lineWidth = 1;
      const yy = rr2() * city.height * P, xx = rx0 + rr2() * rw;
      g.beginPath();
      g.moveTo(xx, yy);
      g.quadraticCurveTo(xx + 3, yy + 6, xx, yy + 12);
      g.stroke();
    }
    for (let k = 0; k < 140; k++) {
      const side = rr2() < 0.5;
      const xx = side ? rx0 - 6 + rr2() * 6 : rx0 + rw + rr2() * 6;
      const yy = rr2() * city.height * P;
      g.strokeStyle = rr2() < 0.5 ? '#5e7a3a' : '#7a8f48';
      g.lineWidth = 1.2;
      for (let j = 0; j < 3; j++) {
        g.beginPath();
        g.moveTo(xx + j * 2, yy);
        g.lineTo(xx + j * 2 + (rr2() - 0.5) * 3, yy - 6 - rr2() * 4);
        g.stroke();
      }
    }
    // Bridges: planks, rails and posts
    for (const b of city.bridges) {
      const bx = rx0 - 10, bw = rw + 20, by = b.y0 * P + 3, bh = (b.y1 - b.y0 + 1) * P - 6;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(bx + 4, by + 6, bw, bh);
      for (let xx = bx; xx < bx + bw; xx += 6) {
        g.fillStyle = (xx / 6) % 2 ? '#8a6440' : '#7a5636';
        g.fillRect(xx, by, 5.5, bh);
      }
      g.fillStyle = '#4e3825';
      g.fillRect(bx, by - 3, bw, 4);
      g.fillRect(bx, by + bh - 1, bw, 4);
      for (let xx = bx; xx <= bx + bw; xx += 16) {
        g.fillRect(xx - 2, by - 5, 5, 6);
        g.fillRect(xx - 2, by + bh - 2, 5, 6);
      }
    }
    // Farm yards: fences with a gate on the south side
    for (const b of city.buildings.filter((x) => x.type === 'farmhouse')) {
      const fx = (b.x - 0.6) * P, fy = (b.y - 0.6) * P, fw = (b.w + 1.2) * P, fh = (b.h + 1.2) * P;
      g.fillStyle = 'rgba(120,95,55,0.25)';
      g.fillRect(fx, fy, fw, fh);
      g.strokeStyle = '#6b4f30';
      g.lineWidth = 2;
      const gateL = fx + fw / 2 - P * 0.6, gateR = fx + fw / 2 + P * 0.6;
      g.beginPath();
      g.moveTo(gateL, fy + fh);
      g.lineTo(fx, fy + fh);
      g.lineTo(fx, fy);
      g.lineTo(fx + fw, fy);
      g.lineTo(fx + fw, fy + fh);
      g.lineTo(gateR, fy + fh);
      g.stroke();
      g.fillStyle = '#4e3825';
      const post = (px, py) => g.fillRect(px - 1.5, py - 1.5, 3, 3);
      for (let xx = fx; xx <= fx + fw; xx += 10) {
        post(xx, fy);
        if (xx < gateL || xx > gateR) post(xx, fy + fh);
      }
      for (let yy = fy; yy <= fy + fh; yy += 10) {
        post(fx, yy);
        post(fx + fw, yy);
      }
      // hay and a cart
      const r = rnd(strHash(b.id));
      g.fillStyle = '#d0aa52';
      rr(g, fx + fw - 14, fy + 4, 10, 8, 3);
      g.fill();
      g.strokeStyle = '#a07e34';
      g.stroke();
      if (r() < 0.6) {
        g.fillStyle = '#6b4f30';
        g.fillRect(fx + 4, fy + 5, 14, 8);
        g.fillStyle = '#2b2118';
        g.beginPath();
        g.arc(fx + 7, fy + 14, 2.4, 0, Math.PI * 2);
        g.arc(fx + 15, fy + 14, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Trees and bushes on free grass
    const trees = [];
    for (let y = 0; y < city.height; y++) {
      for (let x = 0; x < city.width; x++) {
        if (occ[x][y] !== 0) continue;
        const n = hash(x, y, 9);
        const east = x > city.river.x1;
        if (n < (east ? 0.16 : 0.1)) trees.push({ x: x + 0.3 + hash(x, y, 3) * 0.4, y: y + 0.3 + hash(x, y, 4) * 0.4, s: 0.7 + hash(x, y, 5) * 0.5, kind: hash(x, y, 6) < 0.25 ? 'pine' : 'oak' });
        else if (n < (east ? 0.24 : 0.18)) {
          const bx = (x + 0.5) * P, by = (y + 0.5) * P;
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath();
          g.ellipse(bx + 2, by + 4, 7, 3, 0, 0, Math.PI * 2);
          g.fill();
          for (const [dx, dy, rad, col] of [[-3, 0, 5, '#3f6b2c'], [3, -1, 5, '#4a7a33'], [0, -3, 5, '#558a3a']]) {
            g.fillStyle = col;
            g.beginPath();
            g.arc(bx + dx, by + dy, rad, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    trees.sort((a, b) => a.y - b.y);
    for (const t of trees) drawTree(g, t.x * P, t.y * P, t.s * P * 0.55, t.kind);
    return c;
  };

  function drawTree(g, x, y, r, kind) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(x + r * 0.35, y + r * 0.55, r * 1.05, r * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4a3420';
    g.fillRect(x - r * 0.12, y - r * 0.1, r * 0.24, r * 0.65);
    if (kind === 'pine') {
      for (let i = 0; i < 3; i++) {
        g.fillStyle = ['#244a2e', '#2d5a36', '#376a40'][i];
        const w = r * (1 - i * 0.25);
        const top = y - r * (0.6 + i * 0.45);
        g.beginPath();
        g.moveTo(x, top - r * 0.6);
        g.lineTo(x + w, top + r * 0.45);
        g.lineTo(x - w, top + r * 0.45);
        g.closePath();
        g.fill();
      }
    } else {
      const blobs = [[0, -0.75, 0.75, '#2f5a26'], [-0.45, -0.45, 0.6, '#36652b'], [0.45, -0.5, 0.6, '#36652b'], [0, -1.05, 0.55, '#427534'], [-0.2, -0.9, 0.35, '#5a9045']];
      for (const [dx, dy, rad, col] of blobs) {
        g.fillStyle = col;
        g.beginPath();
        g.arc(x + dx * r, y + dy * r, rad * r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // ---------- building styles ----------
  const STYLE = {
    palace: { floor: 'marble', wall: '#cfc6b4', roof: '#4d5578', roofKind: 'slate' },
    manor: { floor: 'parquet', wall: '#b8a58a', roof: '#6e3b3b', roofKind: 'tile' },
    barracks: { floor: 'stone', wall: '#8a8478', roof: '#6f6a60', roofKind: 'flat' },
    healer: { floor: 'planks', wall: '#bfae8e', roof: '#5f6f4a', roofKind: 'tile' },
    temple: { floor: 'flags', wall: '#d8d0bc', roof: '#6d7177', roofKind: 'slate' },
    market: { floor: 'cobble', wall: null, roof: null },
    academy: { floor: 'planks', wall: '#b9b2a2', roof: '#4a5a6e', roofKind: 'slate' },
    tavern: { floor: 'planks', wall: '#a88a64', roof: '#7b4a2c', roofKind: 'tile' },
    home: { floor: 'planks', wall: '#b39c7c', roof: null, roofKind: 'tile' },
    farmhouse: { floor: 'earth', wall: '#a8916c', roof: '#b8964f', roofKind: 'thatch' },
  };
  const HOME_ROOFS = ['#9c4a32', '#8a5a3a', '#7d4433', '#a35a3a', '#6e4a3a'];
  Sc.roofColor = (b) => STYLE[b.type].roof || HOME_ROOFS[strHash(b.id) % HOME_ROOFS.length];

  function floor(g, b, kind) {
    const x0 = b.x * P, y0 = b.y * P, w = b.w * P, h = b.h * P;
    const r = rnd(strHash(b.id + 'f'));
    if (kind === 'planks' || kind === 'parquet') {
      g.fillStyle = kind === 'parquet' ? '#8a6238' : '#9a7448';
      g.fillRect(x0, y0, w, h);
      for (let yy = y0; yy < y0 + h; yy += 6) {
        g.fillStyle = `rgba(60,35,15,${0.15 + r() * 0.15})`;
        g.fillRect(x0, yy, w, 1);
        for (let xx = x0 + r() * 20; xx < x0 + w; xx += 18 + r() * 14) g.fillRect(xx, yy, 1, 6);
      }
    } else if (kind === 'marble') {
      for (let yy = 0; yy < b.h * 2; yy++) for (let xx = 0; xx < b.w * 2; xx++) {
        g.fillStyle = (xx + yy) % 2 ? '#e4ddd0' : '#b9b0a4';
        g.fillRect(x0 + xx * P / 2, y0 + yy * P / 2, P / 2, P / 2);
      }
    } else if (kind === 'stone' || kind === 'flags' || kind === 'cobble') {
      g.fillStyle = kind === 'flags' ? '#a9a092' : kind === 'cobble' ? '#8c8273' : '#7e786e';
      g.fillRect(x0, y0, w, h);
      const step = kind === 'cobble' ? 7 : 12;
      for (let yy = y0; yy < y0 + h; yy += step) {
        for (let xx = x0 + ((yy / step) % 2) * step / 2; xx < x0 + w; xx += step) {
          g.fillStyle = `rgba(255,255,255,${r() * 0.08})`;
          g.fillRect(xx + 1, yy + 1, step - 2, step - 2);
          g.strokeStyle = 'rgba(0,0,0,0.18)';
          g.lineWidth = 1;
          g.strokeRect(xx + 0.5, yy + 0.5, step - 1, step - 1);
        }
      }
    } else {
      g.fillStyle = '#7d6446';
      g.fillRect(x0, y0, w, h);
      for (let k = 0; k < b.w * b.h * 6; k++) {
        g.fillStyle = `rgba(40,25,10,${r() * 0.25})`;
        g.fillRect(x0 + r() * w, y0 + r() * h, 2, 2);
      }
      for (let k = 0; k < b.w * 3; k++) {
        g.strokeStyle = 'rgba(220,190,110,0.5)';
        const sx = x0 + r() * w, sy = y0 + r() * h;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + 4, sy + 1);
        g.stroke();
      }
    }
  }

  // Furniture helpers (coordinates in tiles relative to building origin)
  function bed(g, b, tx, ty, blanket, vertical = true) {
    const x = (b.x + tx) * P, y = (b.y + ty) * P;
    const w = vertical ? P * 0.55 : P * 0.95, h = vertical ? P * 0.95 : P * 0.55;
    g.fillStyle = '#5b3d22';
    rr(g, x, y, w, h, 2);
    g.fill();
    g.fillStyle = blanket;
    rr(g, x + 2, y + (vertical ? h * 0.3 : 2), w - 4, vertical ? h * 0.67 : h - 4, 2);
    g.fill();
    g.fillStyle = '#efe9dc';
    if (vertical) rr(g, x + 3, y + 2, w - 6, h * 0.22, 2);
    else rr(g, x + 2, y + 3, w * 0.22, h - 6, 2);
    g.fill();
  }
  function table(g, b, tx, ty, tw, th, round) {
    const x = (b.x + tx) * P, y = (b.y + ty) * P;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    if (round) {
      g.beginPath();
      g.arc(x + 2, y + 3, tw * P / 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6e4a2a';
      g.beginPath();
      g.arc(x, y, tw * P / 2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#4a3018';
      g.stroke();
      for (let a = 0; a < 4; a++) stool(g, x + Math.cos(a * Math.PI / 2 + 0.6) * tw * P * 0.75, y + Math.sin(a * Math.PI / 2 + 0.6) * tw * P * 0.75);
      return;
    }
    g.fillRect(x + 2, y + 3, tw * P, th * P);
    g.fillStyle = '#6e4a2a';
    g.fillRect(x, y, tw * P, th * P);
    g.strokeStyle = '#4a3018';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, tw * P - 1, th * P - 1);
  }
  function stool(g, x, y) {
    g.fillStyle = '#7a5530';
    g.beginPath();
    g.arc(x, y, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  function hearth(g, b, tx, ty) {
    const x = (b.x + tx) * P, y = (b.y + ty) * P;
    g.fillStyle = '#6a6460';
    rr(g, x, y, P * 0.9, P * 0.55, 3);
    g.fill();
    g.fillStyle = '#2b2522';
    g.fillRect(x + 5, y + 4, P * 0.9 - 10, P * 0.55 - 7);
    g.fillStyle = '#e8792a';
    g.beginPath();
    g.arc(x + P * 0.45, y + P * 0.32, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd36b';
    g.beginPath();
    g.arc(x + P * 0.45, y + P * 0.32, 2, 0, Math.PI * 2);
    g.fill();
  }
  function barrel(g, x, y) {
    g.fillStyle = '#7a5530';
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3e2a16';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.stroke();
  }
  function shelf(g, x, y, w, items) {
    g.fillStyle = '#5b3d22';
    g.fillRect(x, y, w, 6);
    const r = rnd(strHash(`${x},${y}`));
    for (let xx = x + 1; xx < x + w - 2; xx += 3) {
      g.fillStyle = items[Math.floor(r() * items.length)];
      g.fillRect(xx, y + 1, 2.4, 4);
    }
  }
  function rug(g, b, tx, ty, tw, th, col, border) {
    const x = (b.x + tx) * P, y = (b.y + ty) * P;
    g.fillStyle = col;
    g.fillRect(x, y, tw * P, th * P);
    g.strokeStyle = border;
    g.lineWidth = 2;
    g.strokeRect(x + 3, y + 3, tw * P - 6, th * P - 6);
  }

  function furnish(g, b) {
    const r = rnd(strHash(b.id + 'furn'));
    const X = (t) => (b.x + t) * P, Y = (t) => (b.y + t) * P;
    switch (b.type) {
      case 'home': {
        const blankets = ['#7a3b3b', '#3b5a7a', '#5a7a3b', '#7a6a3b', '#5b3b7a'];
        rug(g, b, 1.3, 1.1, 1.4, 1.1, '#7a4a3a', '#c9a24a');
        bed(g, b, 0.25, 0.3, blankets[Math.floor(r() * blankets.length)]);
        if (r() < 0.7) bed(g, b, 0.9, 0.3, blankets[Math.floor(r() * blankets.length)]);
        hearth(g, b, b.w - 1.15, 0.2);
        table(g, b, b.w - 1.4, 1.5, 0.9, 0.6);
        stool(g, X(b.w - 1.55), Y(1.8));
        stool(g, X(b.w - 0.35), Y(1.8));
        g.fillStyle = '#5b3d22';
        g.fillRect(X(0.3), Y(b.h - 0.65), P * 0.7, P * 0.35); // chest
        g.fillStyle = '#c9a24a';
        g.fillRect(X(0.62), Y(b.h - 0.55), 3, 3);
        break;
      }
      case 'farmhouse': {
        bed(g, b, 0.25, 0.3, '#6b5a3a');
        bed(g, b, 0.9, 0.3, '#5a4a3a');
        hearth(g, b, b.w - 1.15, 0.2);
        table(g, b, 1.6, 1.4, 1, 0.6);
        barrel(g, X(b.w - 0.4), Y(b.h - 0.45));
        barrel(g, X(b.w - 0.85), Y(b.h - 0.4));
        g.fillStyle = '#d0aa52';
        rr(g, X(0.25), Y(b.h - 0.85), P * 0.8, P * 0.6, 3);
        g.fill();
        break;
      }
      case 'palace': {
        g.fillStyle = '#7a1f2a'; // carpet runner
        g.fillRect(X(b.w / 2 - 0.6), Y(1.4), P * 1.2, Y(b.h) - Y(1.4));
        g.strokeStyle = '#e0b341';
        g.lineWidth = 1.5;
        g.strokeRect(X(b.w / 2 - 0.5), Y(1.5), P * 1.0, Y(b.h) - Y(1.5));
        g.fillStyle = '#9a8a72'; // dais
        g.fillRect(X(b.w / 2 - 1.6), Y(0.3), P * 3.2, P * 1.2);
        g.fillStyle = '#e0b341'; // throne
        rr(g, X(b.w / 2 - 0.45), Y(0.35), P * 0.9, P * 0.85, 4);
        g.fill();
        g.fillStyle = '#7a1f2a';
        g.fillRect(X(b.w / 2 - 0.3), Y(0.55), P * 0.6, P * 0.5);
        for (const px of [1.3, b.w - 1.3]) for (let py = 1.8; py < b.h - 0.5; py += 1.8) {
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath();
          g.arc(X(px) + 2, Y(py) + 3, P * 0.32, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#e9e3d6';
          g.beginPath();
          g.arc(X(px), Y(py), P * 0.32, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#b9b0a4';
          g.stroke();
        }
        for (const bx of [0.4, 2.3, b.w - 2.9, b.w - 1]) {
          g.fillStyle = '#6e2a7e'; // banners on the north wall
          g.fillRect(X(bx), Y(0.12), P * 0.5, P * 0.7);
          g.fillStyle = '#e0b341';
          g.beginPath();
          g.arc(X(bx + 0.25), Y(0.45), 3, 0, Math.PI * 2);
          g.fill();
        }
        table(g, b, 2.2, b.h - 2.2, 2.2, 0.7);
        break;
      }
      case 'manor': {
        rug(g, b, 1, 1.5, b.w - 2, 2.4, '#5a2f3e', '#c9a24a');
        bed(g, b, 0.3, 0.3, '#4a2f5a');
        g.fillStyle = '#4a3018'; // four-poster posts
        for (const [px, py] of [[0.3, 0.3], [0.85, 0.3], [0.3, 1.25], [0.85, 1.25]]) g.fillRect(X(px), Y(py), 3, 3);
        table(g, b, b.w - 2, 0.4, 1.4, 0.7);
        shelf(g, X(2), Y(0.15), P * 2, ['#7a3b3b', '#3b5a7a', '#5a7a3b', '#c9a24a']);
        hearth(g, b, b.w - 1.2, b.h - 0.8);
        break;
      }
      case 'barracks': {
        for (let i = 0; i < 4; i++) bed(g, b, 0.3 + i * 0.8, 0.3, '#5a5a4a');
        for (let i = 0; i < 4; i++) bed(g, b, 0.3 + i * 0.8, 1.4, '#5a5a4a');
        // weapon rack
        g.fillStyle = '#5b3d22';
        g.fillRect(X(0.3), Y(b.h - 0.5), P * 1.6, 4);
        g.strokeStyle = '#b8bcc4';
        g.lineWidth = 1.5;
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.moveTo(X(0.4) + k * 8, Y(b.h - 0.5));
          g.lineTo(X(0.4) + k * 8, Y(b.h - 1.3));
          g.stroke();
        }
        // gaol cells with bars on the east side
        const cx = b.w - 3;
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(X(cx), Y(0.2), P * 2.8, P * 2.2);
        g.strokeStyle = '#3a3a3a';
        g.lineWidth = 2;
        for (let k = 0; k <= 2; k++) {
          g.beginPath();
          g.moveTo(X(cx + k * 1.4), Y(0.2));
          g.lineTo(X(cx + k * 1.4), Y(2.4));
          g.stroke();
        }
        g.lineWidth = 1;
        for (let xx = X(cx); xx < X(cx + 2.8); xx += 4) {
          g.beginPath();
          g.moveTo(xx, Y(2.4));
          g.lineTo(xx, Y(2.4) + 2);
          g.stroke();
        }
        g.strokeStyle = '#8f939c';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(X(cx), Y(2.4));
        g.lineTo(X(cx + 2.8), Y(2.4));
        g.stroke();
        // training dummy
        g.fillStyle = '#c9a77a';
        g.beginPath();
        g.arc(X(b.w / 2), Y(b.h - 1), 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#5b3d22';
        g.fillRect(X(b.w / 2) - 8, Y(b.h - 1) - 1, 16, 2);
        break;
      }
      case 'healer': {
        for (let i = 0; i < 3; i++) bed(g, b, 0.3 + i * 0.8, 0.3, '#e9e4d8');
        shelf(g, X(b.w - 2.2), Y(0.15), P * 2, ['#4f8a5e', '#7ab36a', '#b37a4a', '#c9c27a', '#7a4a8a']);
        table(g, b, b.w - 2, 1.6, 1.2, 0.6);
        g.fillStyle = '#9a9080'; // mortar
        g.beginPath();
        g.arc(X(b.w - 1.4), Y(1.9), 4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#4f8a5e'; // drying herbs
        g.lineWidth = 2;
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          g.moveTo(X(0.5) + k * 9, Y(b.h - 0.4));
          g.lineTo(X(0.5) + k * 9 + 3, Y(b.h - 0.8));
          g.stroke();
        }
        break;
      }
      case 'temple': {
        g.fillStyle = '#6b2a2a'; // aisle carpet
        g.fillRect(X(b.w / 2 - 0.45), Y(1.6), P * 0.9, Y(b.h) - Y(1.6));
        for (let row = 0; row < 3; row++) {
          for (const side of [-1, 1]) {
            const px = side < 0 ? 0.7 : b.w / 2 + 0.7;
            g.fillStyle = 'rgba(0,0,0,0.25)';
            g.fillRect(X(px) + 2, Y(2.4 + row * 1.3) + 3, P * (b.w / 2 - 1.4), P * 0.4);
            g.fillStyle = '#6e4a2a';
            g.fillRect(X(px), Y(2.4 + row * 1.3), P * (b.w / 2 - 1.4), P * 0.4);
            g.fillStyle = '#5b3d22';
            g.fillRect(X(px), Y(2.4 + row * 1.3) + P * 0.32, P * (b.w / 2 - 1.4), 3);
          }
        }
        // altar with candles and the flame
        g.fillStyle = '#e9e3d6';
        g.fillRect(X(b.w / 2 - 1.3), Y(0.4), P * 2.6, P * 0.8);
        g.fillStyle = '#c9a24a';
        g.fillRect(X(b.w / 2 - 1.3), Y(0.4) + P * 0.6, P * 2.6, 3);
        for (const cx of [-1, -0.6, 0.6, 1]) {
          g.fillStyle = '#f5f0e0';
          g.fillRect(X(b.w / 2 + cx) - 1.5, Y(0.55), 3, 7);
          g.fillStyle = '#ffd36b';
          g.beginPath();
          g.arc(X(b.w / 2 + cx), Y(0.5), 2, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#ffb648';
        g.beginPath();
        g.moveTo(X(b.w / 2), Y(0.3));
        g.quadraticCurveTo(X(b.w / 2) + 7, Y(0.75), X(b.w / 2), Y(1.05));
        g.quadraticCurveTo(X(b.w / 2) - 7, Y(0.75), X(b.w / 2), Y(0.3));
        g.fill();
        for (const px of [0.35, b.w - 0.35]) for (let py = 1.5; py < b.h - 0.5; py += 1.6) {
          g.fillStyle = '#c8c0ae';
          g.beginPath();
          g.arc(X(px), Y(py), P * 0.22, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'academy': {
        g.fillStyle = '#2f3a32'; // blackboard
        g.fillRect(X(b.w / 2 - 1.2), Y(0.12), P * 2.4, P * 0.35);
        g.strokeStyle = '#e9e3d6';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(X(b.w / 2 - 1), Y(0.25));
        g.lineTo(X(b.w / 2 - 0.2), Y(0.3));
        g.moveTo(X(b.w / 2), Y(0.22));
        g.lineTo(X(b.w / 2 + 0.8), Y(0.3));
        g.stroke();
        for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) table(g, b, 1 + col * 1.9, 1.2 + row * 1.4, 0.9, 0.45);
        shelf(g, X(0.15), Y(0.2), P * 1.6, ['#7a3b3b', '#3b5a7a', '#5a7a3b', '#c9a24a', '#5b3b7a']);
        shelf(g, X(b.w - 1.8), Y(0.2), P * 1.6, ['#7a3b3b', '#3b5a7a', '#5a7a3b', '#c9a24a', '#5b3b7a']);
        g.fillStyle = '#3f6f9e'; // globe
        g.beginPath();
        g.arc(X(b.w - 0.6), Y(b.h - 0.6), 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#5f9a46';
        g.beginPath();
        g.arc(X(b.w - 0.5), Y(b.h - 0.7), 3, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'tavern': {
        g.fillStyle = '#5b3d22'; // bar counter
        g.fillRect(X(0.3), Y(0.3), P * (b.w * 0.45), P * 0.45);
        g.fillStyle = '#7a5530';
        g.fillRect(X(0.3), Y(0.3), P * (b.w * 0.45), 4);
        for (let k = 0; k < 3; k++) barrel(g, X(0.5 + k * 0.5), Y(0.2) - 2);
        for (let k = 0; k < 3; k++) table(g, b, b.w * 0.55 + k * 1.2, 1.1 + (k % 2) * 0.9, 0.55, 0, true);
        hearth(g, b, b.w - 1.1, 0.15);
        break;
      }
      case 'market': {
        // stalls with striped awnings, crates and a well
        const cols = [['#b8442f', '#efe4cf'], ['#2f6fb8', '#efe4cf'], ['#3f8a4a', '#efe4cf'], ['#c99a2f', '#5b3d22']];
        let i = 0;
        for (let sx = 0.6; sx < b.w - 1.5; sx += 2.4) {
          for (const sy of [0.4, b.h - 1.6]) {
            const [a1, a2] = cols[i++ % cols.length];
            const x = X(sx), y = Y(sy), w = P * 1.7, h = P * 1.1;
            g.fillStyle = 'rgba(0,0,0,0.3)';
            g.fillRect(x + 3, y + 4, w, h);
            for (let k = 0; k < 6; k++) {
              g.fillStyle = k % 2 ? a2 : a1;
              g.fillRect(x + (k * w) / 6, y, w / 6 + 0.5, h * 0.6);
            }
            g.fillStyle = '#7a5530';
            g.fillRect(x, y + h * 0.6, w, h * 0.4);
            const r2 = rnd(strHash(b.id + sx + sy));
            for (let k = 0; k < 5; k++) {
              g.fillStyle = ['#d94b3a', '#f2c94c', '#7ab36a', '#e8913a', '#a77be0'][Math.floor(r2() * 5)];
              g.beginPath();
              g.arc(x + 5 + k * (w - 10) / 4, y + h * 0.8, 2.5, 0, Math.PI * 2);
              g.fill();
            }
          }
        }
        const wx = X(b.w / 2), wy = Y(b.h / 2);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.arc(wx + 3, wy + 4, P * 0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#8a8478';
        g.beginPath();
        g.arc(wx, wy, P * 0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1f3a5a';
        g.beginPath();
        g.arc(wx, wy, P * 0.32, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#5b3d22';
        g.fillRect(wx - P * 0.55, wy - 2, P * 1.1, 4);
        for (let k = 0; k < 4; k++) {
          g.fillStyle = '#8a6440';
          g.fillRect(X(1 + k * 2.3), Y(b.h / 2 - 0.2), 8, 8);
          g.strokeStyle = '#5b3d22';
          g.strokeRect(X(1 + k * 2.3) + 0.5, Y(b.h / 2 - 0.2) + 0.5, 7, 7);
        }
        break;
      }
    }
  }

  // Walls with a door gap on the south side and windows on the long walls.
  function walls(g, b, col) {
    const x0 = b.x * P, y0 = b.y * P, w = b.w * P, h = b.h * P;
    const t = 5;
    const doorW = P * 0.9;
    const dx = x0 + w / 2 - doorW / 2;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x0 + 3, y0 + h, w, 4); // cast shadow
    g.fillRect(x0 + w, y0 + 3, 4, h);
    g.fillStyle = col;
    g.fillRect(x0, y0, w, t);
    g.fillRect(x0, y0, t, h);
    g.fillRect(x0 + w - t, y0, t, h);
    g.fillRect(x0, y0 + h - t, dx - x0, t);
    g.fillRect(dx + doorW, y0 + h - t, x0 + w - dx - doorW, t);
    g.strokeStyle = shade(col.startsWith('#') ? col : '#888888', -0.45);
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    g.strokeRect(x0 + t - 0.5, y0 + t - 0.5, w - 2 * t + 1, h - 2 * t + 1);
    // windows
    g.fillStyle = '#9cc4e4';
    for (let xx = x0 + P; xx < x0 + w - P * 0.8; xx += P * 1.6) g.fillRect(xx, y0 + 1, P * 0.45, t - 2);
    for (let yy = y0 + P * 0.9; yy < y0 + h - P * 0.6; yy += P * 1.4) {
      g.fillRect(x0 + 1, yy, t - 2, P * 0.4);
      g.fillRect(x0 + w - t + 1, yy, t - 2, P * 0.4);
    }
    // door
    g.fillStyle = '#5b3d22';
    g.fillRect(dx, y0 + h - 2, doorW, 3);
    g.fillStyle = '#7a6a5a'; // threshold step
    g.fillRect(dx, y0 + h + 1, doorW, 3);
  }

  Sc.buildInteriors = function () {
    const city = G.Data.city;
    const c = canvas(city.width * P, city.height * P);
    const g = c.getContext('2d');
    for (const b of city.buildings) {
      const st = STYLE[b.type];
      floor(g, b, st.floor);
      furnish(g, b);
      if (st.wall) walls(g, b, st.wall);
      else {
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 2;
        g.strokeRect(b.x * P + 1, b.y * P + 1, b.w * P - 2, b.h * P - 2);
      }
    }
    return c;
  };

  // ---------- roofs ----------
  const OVER = 0.22; // roof overhang in tiles
  Sc.roofRect = (b) => ({ x: b.x - OVER, y: b.y - OVER - (b.type === 'temple' ? 0 : 0), w: b.w + OVER * 2, h: b.h + OVER * 2 });

  function hipRoof(g, x, y, w, h, col, kind, seed) {
    const horiz = w >= h;
    const inset = (horiz ? h : w) / 2;
    const faces = horiz
      ? [ // north, south, west, east
          [[x, y], [x + w, y], [x + w - inset, y + inset], [x + inset, y + inset], 0.18],
          [[x, y + h], [x + w, y + h], [x + w - inset, y + inset], [x + inset, y + inset], -0.22],
          [[x, y], [x, y + h], [x + inset, y + inset], -0.05],
          [[x + w, y], [x + w, y + h], [x + w - inset, y + inset], -0.12],
        ]
      : [
          [[x, y], [x, y + h], [x + inset, y + h - inset], [x + inset, y + inset], 0.12],
          [[x + w, y], [x + w, y + h], [x + w - inset, y + h - inset], [x + w - inset, y + inset], -0.2],
          [[x, y], [x + w, y], [x + inset, y + inset], 0.2],
          [[x, y + h], [x + w, y + h], [x + inset, y + h - inset], -0.25],
        ];
    const r = rnd(seed);
    for (const f of faces) {
      const pts = f.slice(0, -1);
      const light = f[f.length - 1];
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
      g.fillStyle = shade(col, light);
      g.fill();
      // shingle / thatch texture clipped to the face
      g.save();
      g.clip();
      if (kind === 'thatch') {
        for (let k = 0; k < (w * h) / 6; k++) {
          g.strokeStyle = r() < 0.5 ? 'rgba(90,60,20,0.35)' : 'rgba(255,230,160,0.25)';
          const sx = x + r() * w, sy = y + r() * h;
          g.beginPath();
          g.moveTo(sx, sy);
          g.lineTo(sx + (r() - 0.5) * 3, sy + 5);
          g.stroke();
        }
      } else {
        const step = kind === 'slate' ? 5 : 6;
        g.strokeStyle = 'rgba(0,0,0,0.22)';
        g.lineWidth = 1;
        for (let yy = y; yy < y + h; yy += step) {
          g.beginPath();
          g.moveTo(x, yy);
          g.lineTo(x + w, yy);
          g.stroke();
          for (let xx = x + ((yy - y) / step % 2) * 4; xx < x + w; xx += 8) {
            g.beginPath();
            g.moveTo(xx, yy);
            g.lineTo(xx, yy + step);
            g.stroke();
          }
        }
        for (let k = 0; k < (w * h) / 120; k++) {
          g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.06 + r() * 0.06})`;
          g.fillRect(x + r() * w, y + r() * h, 7, step - 1);
        }
      }
      g.restore();
    }
    // ridges
    g.strokeStyle = shade(col, -0.4);
    g.lineWidth = 2;
    g.beginPath();
    if (horiz) {
      g.moveTo(x + inset, y + inset);
      g.lineTo(x + w - inset, y + inset);
      g.moveTo(x, y);
      g.lineTo(x + inset, y + inset);
      g.lineTo(x, y + h);
      g.moveTo(x + w, y);
      g.lineTo(x + w - inset, y + inset);
      g.lineTo(x + w, y + h);
    } else {
      g.moveTo(x + inset, y + inset);
      g.lineTo(x + inset, y + h - inset);
      g.moveTo(x, y);
      g.lineTo(x + inset, y + inset);
      g.lineTo(x + w, y);
      g.moveTo(x, y + h);
      g.lineTo(x + inset, y + h - inset);
      g.lineTo(x + w, y + h);
    }
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function chimney(g, x, y) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x + 3, y + 3, 9, 9);
    g.fillStyle = '#7a6a60';
    g.fillRect(x, y, 9, 9);
    g.fillStyle = '#2b2522';
    g.fillRect(x + 2, y + 2, 5, 5);
  }
  function tower(g, cx, cy, rad, wallCol, roofCol) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.arc(cx + 4, cy + 5, rad, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = wallCol;
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fill();
    const grad = g.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 1, cx, cy, rad * 0.9);
    grad.addColorStop(0, shade(roofCol, 0.35));
    grad.addColorStop(1, shade(roofCol, -0.3));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, rad * 0.85, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e0b341';
    g.beginPath();
    g.arc(cx, cy, 2, 0, Math.PI * 2);
    g.fill();
  }
  function flag(g, x, y, col) {
    g.fillStyle = '#3a3128';
    g.fillRect(x, y - 16, 2, 16);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x + 2, y - 16);
    g.lineTo(x + 14, y - 12);
    g.lineTo(x + 2, y - 8);
    g.closePath();
    g.fill();
  }

  // Roofs are drawn per building into one sheet; the Local View blits each building's rect with its own alpha.
  Sc.chimneys = [];
  Sc.buildRoofs = function () {
    const city = G.Data.city;
    const c = canvas(city.width * P, city.height * P);
    const g = c.getContext('2d');
    Sc.chimneys = [];
    for (const b of city.buildings) {
      const st = STYLE[b.type];
      if (b.type === 'market') continue;
      const R = Sc.roofRect(b);
      const x = R.x * P, y = R.y * P, w = R.w * P, h = R.h * P;
      const col = Sc.roofColor(b);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 5, y + 6, w, h);
      if (st.roofKind === 'flat') {
        g.fillStyle = col;
        g.fillRect(x, y, w, h);
        const r = rnd(strHash(b.id));
        for (let k = 0; k < 60; k++) {
          g.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
          g.fillRect(x + r() * w, y + r() * h, 6, 6);
        }
        // crenellations
        g.fillStyle = shade(col, 0.2);
        for (let xx = x; xx < x + w - 4; xx += 9) {
          g.fillRect(xx, y, 6, 6);
          g.fillRect(xx, y + h - 6, 6, 6);
        }
        for (let yy = y; yy < y + h - 4; yy += 9) {
          g.fillRect(x, yy, 6, 6);
          g.fillRect(x + w - 6, yy, 6, 6);
        }
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        tower(g, x + 10, y + 10, 13, '#8a8478', '#6f6a60');
        flag(g, x + w / 2, y + h / 2, '#8f2b2b');
        continue;
      }
      hipRoof(g, x, y, w, h, col, st.roofKind, strHash(b.id + 'roof'));
      if (b.type === 'home' || b.type === 'farmhouse' || b.type === 'tavern' || b.type === 'manor' || b.type === 'healer') {
        const cx = x + w * (strHash(b.id) % 2 ? 0.22 : 0.7), cy = y + h * 0.25;
        chimney(g, cx, cy);
        Sc.chimneys.push({ x: (cx + 4.5) / P, y: (cy + 4.5) / P, id: b.id });
      }
      if (b.type === 'palace') {
        for (const [tx, ty] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) tower(g, tx, ty, 16, '#cfc6b4', '#3f4766');
        flag(g, x + w / 2, y + h * 0.5, '#6e2a7e');
      }
      if (b.type === 'temple') {
        // bell tower with spire at the south front
        const tx = x + w / 2, ty = y + h - P * 0.9;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(tx - P * 0.7 + 5, ty - P * 0.7 + 6, P * 1.4, P * 1.4);
        g.fillStyle = '#d8d0bc';
        g.fillRect(tx - P * 0.7, ty - P * 0.7, P * 1.4, P * 1.4);
        g.beginPath();
        g.moveTo(tx - P * 0.6, ty - P * 0.6);
        g.lineTo(tx + P * 0.6, ty - P * 0.6);
        g.lineTo(tx, ty);
        g.closePath();
        g.fillStyle = '#7d8187';
        g.fill();
        g.beginPath();
        g.moveTo(tx - P * 0.6, ty + P * 0.6);
        g.lineTo(tx + P * 0.6, ty + P * 0.6);
        g.lineTo(tx, ty);
        g.closePath();
        g.fillStyle = '#55595f';
        g.fill();
        g.beginPath();
        g.moveTo(tx - P * 0.6, ty - P * 0.6);
        g.lineTo(tx - P * 0.6, ty + P * 0.6);
        g.lineTo(tx, ty);
        g.closePath();
        g.fillStyle = '#686c72';
        g.fill();
        g.beginPath();
        g.moveTo(tx + P * 0.6, ty - P * 0.6);
        g.lineTo(tx + P * 0.6, ty + P * 0.6);
        g.lineTo(tx, ty);
        g.closePath();
        g.fillStyle = '#5e6268';
        g.fill();
        g.fillStyle = '#e0b341';
        g.beginPath();
        g.arc(tx, ty, 3.5, 0, Math.PI * 2);
        g.fill();
        // rose window on the nave
        g.fillStyle = '#c9a24a';
        g.beginPath();
        g.arc(x + w / 2, y + P * 1.2, 7, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#7a3b8a';
        g.beginPath();
        g.arc(x + w / 2, y + P * 1.2, 4, 0, Math.PI * 2);
        g.fill();
      }
      if (b.type === 'academy') {
        const cx = x + w / 2, cy = y + h / 2;
        const grad = g.createRadialGradient(cx - 5, cy - 5, 1, cx, cy, P * 0.75);
        grad.addColorStop(0, '#9fb3c8');
        grad.addColorStop(1, '#3d4c5e');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx, cy, P * 0.75, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.4)';
        g.stroke();
      }
      if (b.type === 'tavern') {
        // hanging sign over the door
        g.fillStyle = '#5b3d22';
        g.fillRect(b.x * P + b.w * P / 2 + P * 0.6, (b.y + b.h) * P - 2, 14, 10);
        g.fillStyle = '#c47a3a';
        g.beginPath();
        g.arc(b.x * P + b.w * P / 2 + P * 0.6 + 7, (b.y + b.h) * P + 3, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    return c;
  };

  // Street lamps along town roads (lit at night).
  Sc.lamps = function () {
    const city = G.Data.city;
    const out = [];
    for (const rd of city.roads) {
      if (rd.x1 > 37) continue;
      const horiz = rd.x1 - rd.x0 >= rd.y1 - rd.y0;
      if (horiz) for (let x = rd.x0 + 3; x <= rd.x1; x += 6) out.push({ x: x + 0.5, y: rd.y0 - 0.15 });
      else for (let y = rd.y0 + 3; y <= rd.y1; y += 6) out.push({ x: rd.x0 - 0.15, y: y + 0.5 });
    }
    return out;
  };

  Sc.drawLampPosts = function (ctx, lamps, sx, sy, ts) {
    for (const l of lamps) {
      const x = sx(l.x), y = sy(l.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x - 1, y + 1, ts * 0.12, ts * 0.12);
      ctx.fillStyle = '#2b2522';
      ctx.fillRect(x - ts * 0.05, y - ts * 0.05, ts * 0.1, ts * 0.1);
      ctx.fillStyle = '#e8c870';
      ctx.fillRect(x - ts * 0.03, y - ts * 0.03, ts * 0.06, ts * 0.06);
    }
  };

  // Additive warm light at night: lamps, lit windows, hearths.
  Sc.drawLights = function (ctx, world, lamps, sx, sy, ts, alpha, now) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, rad, a, col) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    };
    const flick = 0.9 + Math.sin(now / 130) * 0.05 + Math.sin(now / 57) * 0.05;
    for (const l of lamps) glow(sx(l.x), sy(l.y), ts * 2.4, 0.45 * alpha * flick, '255,190,100');
    for (const b of world.buildings) {
      if (b.type === 'market') continue;
      const lit = b.type !== 'home' || S_occupied(world, b.id);
      if (!lit) continue;
      glow(sx(b.x + b.w / 2), sy(b.y + b.h), ts * 1.6, 0.35 * alpha * flick, '255,180,90');
      if (b.type === 'temple') glow(sx(b.x + b.w / 2), sy(b.y + 1), ts * 3, 0.4 * alpha * flick, '255,210,140');
    }
    ctx.restore();
  };
  function S_occupied(world, id) {
    for (const k in world.chars) {
      const c = world.chars[k];
      if (c.alive && c.homeId === id && c.at === id) return true;
    }
    return false;
  }

  // Animated touches: river shimmer, chimney smoke, rain.
  Sc.drawRiverShimmer = function (ctx, sx, sy, ts, now, H) {
    const city = G.Data.city;
    ctx.strokeStyle = 'rgba(220,235,255,0.22)';
    ctx.lineWidth = Math.max(1, ts * 0.04);
    const flow = (now / 900) % 1;
    for (let i = 0; i < city.height * 1.2; i++) {
      const yy = ((i + flow) / 1.2) % city.height;
      const xx = city.river.x0 + ((i * 0.37) % 1) * (city.river.x1 - city.river.x0 + 0.7);
      const py = sy(yy);
      if (py < -20 || py > H + 20) continue;
      ctx.beginPath();
      ctx.moveTo(sx(xx), py);
      ctx.lineTo(sx(xx + 0.05), py + ts * 0.35);
      ctx.stroke();
    }
  };
  Sc.drawSmoke = function (ctx, world, sx, sy, ts, now, roofAlpha) {
    const hour = G.Time.hour(world);
    const cooking = hour >= 5 && hour <= 9 || hour >= 17 && hour <= 22 || (G.Time.dateParts(world).month >= 9 || G.Time.dateParts(world).month <= 1);
    if (!cooking) return;
    for (const ch of Sc.chimneys) {
      const a = roofAlpha(ch.id);
      if (a < 0.3) continue;
      for (let k = 0; k < 4; k++) {
        const t = ((now / 1600) + k / 4 + (ch.x % 1)) % 1;
        const x = sx(ch.x + t * 0.6 + Math.sin(now / 700 + k) * 0.1);
        const y = sy(ch.y - t * 1.1);
        ctx.fillStyle = `rgba(210,210,215,${(1 - t) * 0.35 * a})`;
        ctx.beginPath();
        ctx.arc(x, y, ts * (0.12 + t * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  Sc.drawRain = function (ctx, W, H, now, intensity) {
    ctx.strokeStyle = `rgba(190,210,240,${0.25 * intensity})`;
    ctx.lineWidth = 1;
    const n = Math.floor(160 * intensity);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = ((i * 97.3 + now * 0.35) % (W + 60)) - 30;
      const y = ((i * 53.7 + now * 0.9) % (H + 40)) - 20;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 12);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(40,50,70,${0.12 * intensity})`;
    ctx.fillRect(0, 0, W, H);
  };
})((globalThis.GODSIM = globalThis.GODSIM || {}));
