import * as THREE from 'three';

// Procedural textures for Lanka. Wall textures are 4 x 3.2 world units (one window per tile),
// everything else tiles every 4 units. They are mostly light so per-building vertex colours can tint them.
export const TILE = 4;          // world units per texture repeat (width)
export const FLOOR_H = 3.2;     // world units per floor (height of a wall tile)

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const mk = (c, rep = true) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
};
const speckle = (x, w, h, n, a) => {
  for (let i = 0; i < n; i++) { const l = Math.floor(rnd() * 255); x.fillStyle = `rgba(${l},${l},${l},${a})`; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
};

// a wall with one window per tile (256 x 205 px = 4 x 3.2 units)
function wall(base, kind) {
  const [c, x] = cv(256, 205);
  x.fillStyle = base; x.fillRect(0, 0, 256, 205);
  if (kind === 'brick') {
    for (let r = 0; r < 12; r++) for (let k = -1; k < 6; k++) {
      const off = r % 2 ? 24 : 0, l = 150 + Math.floor(rnd() * 70);
      x.fillStyle = `rgb(${l},${Math.floor(l * 0.55)},${Math.floor(l * 0.4)})`;
      x.fillRect(k * 48 + off + 1, r * 17 + 1, 46, 15);
    }
  } else if (kind === 'wood') {
    for (let k = 0; k < 8; k++) {
      const l = 120 + Math.floor(rnd() * 50);
      x.fillStyle = `rgb(${l},${Math.floor(l * 0.64)},${Math.floor(l * 0.38)})`;
      x.fillRect(k * 32 + 1, 0, 30, 205);
      x.strokeStyle = 'rgba(40,20,5,.35)'; x.lineWidth = 1;
      for (let g = 0; g < 6; g++) { x.beginPath(); x.moveTo(k * 32 + 4 + rnd() * 24, 0); x.lineTo(k * 32 + 4 + rnd() * 24, 205); x.stroke(); }
    }
  } else {
    speckle(x, 256, 205, 700, 0.06);
    x.fillStyle = 'rgba(120,80,40,.07)';
    for (let i = 0; i < 6; i++) x.fillRect(rnd() * 256, 0, 6 + rnd() * 16, 205);
  }
  // cornice line at the bottom of each floor
  x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 197, 256, 8);
  x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(0, 194, 256, 3);
  // window: arched opening with a frame, shutters and a dark interior
  const wx = 96, wy = 44, ww = 64, wh = 100;
  x.fillStyle = kind === 'wood' ? '#4a2b14' : '#e8d3a8'; x.fillRect(wx - 7, wy - 7, ww + 14, wh + 14);
  x.fillStyle = '#1c1410';
  x.beginPath(); x.moveTo(wx, wy + wh); x.lineTo(wx, wy + 24); x.arc(wx + ww / 2, wy + 24, ww / 2, Math.PI, 0); x.lineTo(wx + ww, wy + wh); x.closePath(); x.fill();
  const g = x.createLinearGradient(0, wy, 0, wy + wh); g.addColorStop(0, 'rgba(255,190,90,.45)'); g.addColorStop(1, 'rgba(255,190,90,0)');
  x.fillStyle = g; x.fill();
  x.fillStyle = kind === 'wood' ? '#2d1a0c' : '#b89a64';
  x.fillRect(wx - 15, wy + 12, 12, wh - 12); x.fillRect(wx + ww + 3, wy + 12, 12, wh - 12);   // shutters
  x.fillRect(wx, wy + 62, ww, 5);                                                              // sill bar
  return mk(c);
}

function flat(draw, w = 256, h = 256) { const [c, x] = cv(w, h); draw(x, w, h); return mk(c); }

export function makeTextures() {
  const T = {};
  T.plaster = wall('#f2e4c6', 'plaster');
  T.brick = wall('#c9b79a', 'brick');
  T.wood = wall('#8a5a34', 'wood');
  T.stone = flat((x, w, h) => {
    x.fillStyle = '#dcc49c'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) {
      const off = r % 2 ? 64 : 0, l = 200 + Math.floor(rnd() * 40);
      x.fillStyle = `rgb(${l},${Math.floor(l * 0.84)},${Math.floor(l * 0.62)})`;
      x.fillRect(k * 128 + off + 2, r * 64 + 2, 124, 60);
    }
    x.strokeStyle = 'rgba(110,80,40,.5)'; x.lineWidth = 3;
    for (let r = 0; r <= 4; r++) { x.beginPath(); x.moveTo(0, r * 64); x.lineTo(w, r * 64); x.stroke(); }
    speckle(x, w, h, 500, 0.08);
  });
  T.roof = flat((x, w, h) => {            // flat terrace / terracotta
    x.fillStyle = '#c4784e'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) {
      const l = 170 + Math.floor(rnd() * 60);
      x.fillStyle = `rgb(${l},${Math.floor(l * 0.5)},${Math.floor(l * 0.3)})`;
      x.beginPath(); x.arc(k * 32 + 16 + (r % 2 ? 16 : 0), r * 32 + 8, 17, 0, Math.PI); x.fill();
    }
    speckle(x, w, h, 300, 0.07);
  });
  T.thatch = flat((x, w, h) => {
    x.fillStyle = '#c9a24d'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const l = 110 + Math.floor(rnd() * 120);
      x.strokeStyle = `rgba(${l},${Math.floor(l * 0.78)},${Math.floor(l * 0.35)},.7)`; x.lineWidth = 1;
      const px = rnd() * w, py = rnd() * h; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 6 + rnd() * 5, py + 18 + rnd() * 10); x.stroke();
    }
  });
  T.cloth = flat((x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#d8d8d8' : '#ffffff'; x.fillRect(k * 32, 0, 32, h); }
    x.strokeStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i < h; i += 3) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  });
  T.metal = flat((x, w, h) => {
    x.fillStyle = '#b6bcc2'; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 16; k++) { const g = x.createLinearGradient(k * 16, 0, k * 16 + 16, 0); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(0,0,0,.25)'); x.fillStyle = g; x.fillRect(k * 16, 0, 16, h); }
    speckle(x, w, h, 300, 0.1);
  });
  T.gold = flat((x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#ffe58a'); g.addColorStop(0.5, '#d9a02a'); g.addColorStop(1, '#a8701a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(80,40,0,.4)'; x.lineWidth = 2;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(32 + i * 64, 32 + j * 64, 20, 0, 6.283); x.stroke(); }
  });
  // ground: one tile = one city period (76 units). Street cross centred on the tile edges.
  T.ground = flat((x, w, h) => {
    const s = w / 76, st = 7 * s;           // street half width = 7 units
    x.fillStyle = '#6d6257'; x.fillRect(0, 0, w, h);                     // cobbled streets
    speckle(x, w, h, 4000, 0.12);
    x.fillStyle = '#b49a72'; x.fillRect(st, st, w - 2 * st, h - 2 * st); // block paving
    x.strokeStyle = 'rgba(80,60,30,.25)'; x.lineWidth = 1;
    for (let i = st; i < w - st; i += 12) { x.beginPath(); x.moveTo(i, st); x.lineTo(i, h - st); x.stroke(); x.beginPath(); x.moveTo(st, i); x.lineTo(w - st, i); x.stroke(); }
    x.strokeStyle = '#8a7658'; x.lineWidth = 3; x.strokeRect(st, st, w - 2 * st, h - 2 * st);   // kerb
    x.strokeStyle = 'rgba(255,230,170,.25)'; x.lineWidth = 2; x.setLineDash([10, 14]);        // lane markings
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.moveTo(0, h); x.lineTo(w, h); x.moveTo(0, 0); x.lineTo(0, h); x.moveTo(w, 0); x.lineTo(w, h); x.stroke();
  }, 1024, 1024);
  return T;
}

// Which materials can burn (used by the fire system in the next phase).
export const FLAMMABLE = { wood: true, thatch: true, cloth: true, plaster: false, brick: false, stone: false, roof: false, metal: false, gold: false, water: false };
