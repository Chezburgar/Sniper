// Procedural canvas textures — gives surfaces realistic grain instead of flat colors.
import * as THREE from 'three';

// Deterministic PRNG so every client renders the identical map.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Speckle noise pass over the whole canvas.
function speckle(ctx, size, rnd, count, alpha, dark = true, light = true) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * size, y = rnd() * size, r = 0.5 + rnd() * 1.8;
    const v = rnd();
    if (dark && v < 0.5) ctx.fillStyle = `rgba(0,0,0,${alpha * rnd()})`;
    else if (light) ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7 * rnd()})`;
    else continue;
    ctx.fillRect(x, y, r, r);
  }
}

// ---- Sand / dirt ground ----
export function sandTexture(rnd) {
  const S = 512, [c, ctx] = canvas(S);
  ctx.fillStyle = '#c9a877'; ctx.fillRect(0, 0, S, S);
  // large soft patches
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(rnd() * S, rnd() * S, 0, rnd() * S, rnd() * S, 40 + rnd() * 110);
    const tone = rnd() < 0.5 ? '176,140,92' : '212,183,132';
    g.addColorStop(0, `rgba(${tone},${0.12 + rnd() * 0.2})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }
  speckle(ctx, S, rnd, 9000, 0.10);
  // scattered pebbles
  for (let i = 0; i < 160; i++) {
    const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 2.4;
    ctx.fillStyle = `rgba(${90 + rnd() * 60 | 0},${80 + rnd() * 50 | 0},${60 + rnd() * 40 | 0},0.5)`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  return finish(c);
}

// ---- Cobblestone plaza / roads ----
export function cobbleTexture(rnd) {
  const S = 512, [c, ctx] = canvas(S);
  ctx.fillStyle = '#6d6156'; ctx.fillRect(0, 0, S, S); // grout
  const cols = 8, rows = 8, cw = S / cols, ch = S / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const off = (j % 2) * cw * 0.5;
      const x = ((i * cw + off) % S), y = j * ch;
      const pad = 3 + rnd() * 3;
      const base = 128 + rnd() * 50;
      const rcol = base + rnd() * 18 - 9, gcol = base * 0.92, bcol = base * 0.8;
      ctx.fillStyle = `rgb(${rcol | 0},${gcol | 0},${bcol | 0})`;
      roundRect(ctx, x + pad, y + pad, cw - pad * 2, ch - pad * 2, 7 + rnd() * 6);
      ctx.fill();
      // top-light bevel
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      roundRect(ctx, x + pad, y + pad, cw - pad * 2, (ch - pad * 2) * 0.35, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      roundRect(ctx, x + pad, y + pad + (ch - pad * 2) * 0.62, cw - pad * 2, (ch - pad * 2) * 0.38, 7);
      ctx.fill();
    }
  }
  speckle(ctx, S, rnd, 6000, 0.09);
  return finish(c);
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- Stucco / plaster building walls ----
export function stuccoTexture(rnd, tint = [226, 205, 168]) {
  const S = 512, [c, ctx] = canvas(S);
  ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const g = ctx.createRadialGradient(rnd() * S, rnd() * S, 0, rnd() * S, rnd() * S, 30 + rnd() * 90);
    g.addColorStop(0, `rgba(${rnd() < 0.5 ? '120,100,70' : '255,248,230'},${0.05 + rnd() * 0.09})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }
  speckle(ctx, S, rnd, 12000, 0.06);
  // hairline cracks
  ctx.strokeStyle = 'rgba(70,55,40,0.28)'; ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    let x = rnd() * S, y = rnd() * S;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 46; y += rnd() * 34; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // grime along the bottom edge
  const g = ctx.createLinearGradient(0, S * 0.78, 0, S);
  g.addColorStop(0, 'rgba(80,62,44,0)'); g.addColorStop(1, 'rgba(80,62,44,0.34)');
  ctx.fillStyle = g; ctx.fillRect(0, S * 0.78, S, S * 0.22);
  return finish(c);
}

// ---- Rough stone (walls, tower) ----
export function stoneTexture(rnd) {
  const S = 512, [c, ctx] = canvas(S);
  ctx.fillStyle = '#8d7f6c'; ctx.fillRect(0, 0, S, S);
  const rows = 6;
  for (let j = 0; j < rows; j++) {
    const bh = S / rows;
    let x = (j % 2) * -40;
    while (x < S) {
      const bw = 60 + rnd() * 70;
      const base = 120 + rnd() * 55;
      ctx.fillStyle = `rgb(${base | 0},${base * 0.9 | 0},${base * 0.76 | 0})`;
      roundRect(ctx, x + 3, j * bh + 3, bw - 6, bh - 6, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, x + 3, j * bh + 3, bw - 6, bh * 0.3, 6); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      roundRect(ctx, x + 3, j * bh + bh * 0.66, bw - 6, bh * 0.3, 6); ctx.fill();
      x += bw;
    }
  }
  speckle(ctx, S, rnd, 8000, 0.08);
  return finish(c);
}

// ---- Wood planks ----
export function woodTexture(rnd, tone = [138, 100, 62]) {
  const S = 256, [c, ctx] = canvas(S);
  ctx.fillStyle = `rgb(${tone[0]},${tone[1]},${tone[2]})`; ctx.fillRect(0, 0, S, S);
  const planks = 5;
  for (let p = 0; p < planks; p++) {
    const y = p * S / planks;
    const v = (rnd() - 0.5) * 34;
    ctx.fillStyle = `rgba(${tone[0] + v | 0},${tone[1] + v | 0},${tone[2] + v * 0.7 | 0},0.85)`;
    ctx.fillRect(0, y + 1, S, S / planks - 2);
    // grain
    ctx.strokeStyle = 'rgba(60,38,20,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let gy = y + 3 + rnd() * (S / planks - 6);
      ctx.beginPath(); ctx.moveTo(0, gy);
      for (let x = 0; x <= S; x += 32) ctx.lineTo(x, gy + (rnd() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,18,8,0.6)';
    ctx.fillRect(0, y, S, 2);
  }
  speckle(ctx, S, rnd, 1200, 0.07);
  return finish(c);
}

// ---- Striped market awning ----
export function awningTexture(rnd, c1 = '#b8402e', c2 = '#e8dcc4') {
  const S = 256, [c, ctx] = canvas(S);
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? c2 : c1;
    ctx.fillRect(i * S / stripes, 0, S / stripes, S);
  }
  speckle(ctx, S, rnd, 2500, 0.10);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(60,40,20,0.22)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return finish(c);
}

// ---- Desert rock ----
export function rockTexture(rnd) {
  const S = 256, [c, ctx] = canvas(S);
  ctx.fillStyle = '#95816a'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const g = ctx.createRadialGradient(rnd() * S, rnd() * S, 0, rnd() * S, rnd() * S, 20 + rnd() * 60);
    g.addColorStop(0, `rgba(${rnd() < 0.5 ? '70,58,44' : '190,170,140'},${0.10 + rnd() * 0.14})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }
  speckle(ctx, S, rnd, 5000, 0.10);
  return finish(c);
}

// ---- Palm frond (alpha-tested leaf) ----
export function frondTexture(rnd) {
  const W = 256, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  // central stem
  ctx.strokeStyle = '#5a6e2e'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.quadraticCurveTo(W * 0.5, H / 2 - 6, W, H / 2); ctx.stroke();
  // leaflets
  for (let i = 0; i < 34; i++) {
    const t = 0.06 + (i / 34) * 0.92;
    const x = t * W;
    const len = 44 * (1 - Math.abs(t - 0.5) * 0.9) + 10;
    const green = 96 + rnd() * 46;
    ctx.strokeStyle = `rgba(${green * 0.55 | 0},${green | 0},${green * 0.38 | 0},0.95)`;
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(x, H / 2);
    ctx.lineTo(x + 14, H / 2 - len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, H / 2);
    ctx.lineTo(x + 14, H / 2 + len); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Window glass (dark panes + mullions + sky sheen, so windows don't read as holes) ----
export function windowTexture(rnd) {
  const S = 128, [c, ctx] = canvas(S);
  ctx.fillStyle = '#232b33'; ctx.fillRect(0, 0, S, S);
  // diagonal sky reflection streak
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, 'rgba(140,170,200,0.35)');
  g.addColorStop(0.35, 'rgba(140,170,200,0.05)');
  g.addColorStop(0.55, 'rgba(90,120,150,0.22)');
  g.addColorStop(0.7, 'rgba(90,120,150,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  // pane shading per quadrant
  for (const [qx, qy] of [[0, 0], [S / 2, 0], [0, S / 2], [S / 2, S / 2]]) {
    ctx.fillStyle = `rgba(10,14,18,${0.12 + rnd() * 0.18})`;
    ctx.fillRect(qx, qy, S / 2, S / 2);
  }
  // mullion cross + outer frame
  ctx.fillStyle = '#4a4234';
  ctx.fillRect(S / 2 - 3, 0, 6, S);
  ctx.fillRect(0, S / 2 - 3, S, 6);
  ctx.strokeStyle = '#4a4234'; ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, S, S);
  return finish(c);
}

// ---- Water (fountain) ----
export function waterTexture(rnd) {
  const S = 256, [c, ctx] = canvas(S);
  ctx.fillStyle = '#3a7f96'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(210,240,250,${0.10 + rnd() * 0.18})`;
    ctx.lineWidth = 1.5 + rnd() * 2;
    ctx.beginPath();
    ctx.arc(rnd() * S, rnd() * S, 8 + rnd() * 40, rnd() * 6, rnd() * 3 + 3);
    ctx.stroke();
  }
  return finish(c);
}

// ---- Sandbag ----
export function sandbagTexture(rnd) {
  const S = 128, [c, ctx] = canvas(S);
  ctx.fillStyle = '#a5966f'; ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, rnd, 3000, 0.12);
  ctx.strokeStyle = 'rgba(70,60,40,0.35)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * S / 10); ctx.lineTo(S, i * S / 10 + (rnd() - 0.5) * 8); ctx.stroke();
  }
  return finish(c);
}

// ---- Weathered metal ----
export function metalTexture(rnd) {
  const S = 128, [c, ctx] = canvas(S);
  ctx.fillStyle = '#7a7d80'; ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, rnd, 2200, 0.12);
  // rust streaks
  for (let i = 0; i < 8; i++) {
    const x = rnd() * S;
    const g = ctx.createLinearGradient(x, 0, x, S);
    g.addColorStop(0, 'rgba(140,80,40,0.25)'); g.addColorStop(1, 'rgba(140,80,40,0)');
    ctx.fillStyle = g; ctx.fillRect(x, rnd() * S * 0.4, 3 + rnd() * 5, S);
  }
  return finish(c);
}
