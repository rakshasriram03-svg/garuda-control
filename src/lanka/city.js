import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, FLOOR_H, FLAMMABLE } from './textures.js';

// City layout: streets on a grid. One period P = street (14) + city block (62).
// Street centre lines are at multiples of P; a block spans [i*P + 7, (i+1)*P - 7].
export const P = 76, STREET = 14, BLOCK = 62, CB = 4, CHUNK = P * CB, CELL = 40;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash2 = (a, b) => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0;

export function makeMaterials(T) {
  const m = (map, o = {}) => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.92, metalness: 0, ...o });
  return {
    plaster: m(T.plaster), brick: m(T.brick), wood: m(T.wood), stone: m(T.stone, { roughness: 0.85 }),
    roof: m(T.roof), thatch: m(T.thatch, { roughness: 1 }),
    cloth: m(T.cloth, { side: THREE.DoubleSide, roughness: 0.8 }),
    metal: m(T.metal, { metalness: 0.7, roughness: 0.45 }),
    gold: m(T.gold, { metalness: 0.8, roughness: 0.35, emissive: 0x2a1a00 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2e8fa0, roughness: 0.08, metalness: 0.35, vertexColors: true }),
  };
}

// ---------- geometry helpers ----------
const WALLS = new Set(['plaster', 'brick', 'wood']);

function boxGeo(w, h, d, key) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, wall = WALLS.has(key);
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) {
    const side = f < 2 || f > 3, [a, b] = dims[f];
    const tv = wall && side ? FLOOR_H : TILE;
    for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * a / TILE, uv.getY(i) * b / tv); }
  }
  return g;
}

function finish(geo, tint) {
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('burn', new THREE.BufferAttribute(new Float32Array(n), 1));   // 0..1, used by the fire system
  return geo;
}

class Acc {
  constructor() { this.lists = {}; this.counts = {}; }
  push(key, geo, bld) {
    (this.lists[key] ||= []).push(geo);
    const n = this.counts[key] || 0, c = geo.attributes.position.count;
    bld.ranges.push({ key, start: n, count: c });
    this.counts[key] = n + c;
  }
}

const WHITE = new THREE.Color(1, 1, 1);
function B(acc, bld, key, w, h, d, cx, cy, cz, tint = WHITE) {
  const g = boxGeo(w, h, d, key); g.translate(cx, cy, cz);
  acc.push(key, finish(g, tint), bld);
}
function G(acc, bld, key, geo, x, y, z, tint = WHITE) {
  geo.translate(x, y, z);
  acc.push(key, finish(geo, tint), bld);
}

const C = (r, g, b) => new THREE.Color(r, g, b);
const PLASTER = [C(1, 0.96, 0.86), C(1, 0.84, 0.76), C(1, 0.87, 0.62), C(0.84, 0.92, 1), C(0.9, 1, 0.86), C(1, 0.78, 0.64)];
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
function wallTint(key, rng) {
  if (key === 'plaster') return pick(PLASTER, rng);
  const v = 0.82 + rng() * 0.25;
  return C(v, v * 0.97, v * 0.94);
}
const CLOTH = [C(0.9, 0.12, 0.1), C(1, 0.55, 0.05), C(1, 0.8, 0.1), C(0.15, 0.55, 0.3), C(0.2, 0.35, 0.8), C(0.85, 0.2, 0.55)];
const DARKWOOD = C(0.45, 0.3, 0.2);

function newBld(ctx, kind, x0, z0, x1, z1, top, walk = true, solid = true) {
  const b = { id: ctx.nextId++, kind, x0, z0, x1, z1, top, walk, solid, ranges: [], chunk: ctx.chunk };
  ctx.blds.push(b);
  return b;
}

// ---------- building types ----------
function denseBuilding(ctx, lot) {
  const { rng, acc } = ctx;
  const x0 = lot.x0 + 0.4, x1 = lot.x1 - 0.4, z0 = lot.z0 + 0.4, z1 = lot.z1 - 0.4;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const r = rng();
  let floors = 2 + Math.floor(rng() * 5), wallKey, roofKey, kind, upperWood = false;
  if (r < 0.32) { kind = 'timber'; wallKey = 'wood'; roofKey = 'wood'; }
  else if (r < 0.58) { kind = 'brick'; wallKey = 'brick'; roofKey = 'stone'; }
  else if (r < 0.80) { kind = 'plaster'; wallKey = 'plaster'; roofKey = 'roof'; }
  else if (r < 0.91) { kind = 'tenement'; wallKey = 'plaster'; roofKey = 'wood'; upperWood = true; floors = Math.max(floors, 4); }
  else if (r < 0.97) { kind = 'warehouse'; wallKey = 'wood'; roofKey = 'wood'; floors = 2; }
  else { kind = 'workshop'; wallKey = 'brick'; roofKey = 'metal'; floors = Math.min(floors, 3); }
  const h = floors * FLOOR_H;
  const bld = newBld(ctx, kind, x0, z0, x1, z1, h + 0.5);
  const tint = wallTint(wallKey, rng);

  if (upperWood) {
    const hl = Math.ceil(floors * 0.4) * FLOOR_H, hu = h - hl;
    B(acc, bld, 'plaster', w, hl, d, cx, hl / 2, cz, tint);
    B(acc, bld, 'wood', w + 0.25, hu, d + 0.25, cx, hl + hu / 2, cz, wallTint('wood', rng));
  } else B(acc, bld, wallKey, w, h, d, cx, h / 2, cz, tint);

  const rt = roofKey === 'wood' ? wallTint('wood', rng) : roofKey === 'stone' ? C(0.95, 0.9, 0.82) : WHITE;
  B(acc, bld, roofKey, w + 0.5, 0.5, d + 0.5, cx, h + 0.25, cz, rt);
  const pk = roofKey === 'metal' ? 'brick' : roofKey, py = h + 0.5 + 0.45;       // parapet walls
  B(acc, bld, pk, w + 0.5, 0.9, 0.4, cx, py, z0 - 0.05, rt); B(acc, bld, pk, w + 0.5, 0.9, 0.4, cx, py, z1 + 0.05, rt);
  B(acc, bld, pk, 0.4, 0.9, d + 0.5, x0 - 0.05, py, cz, rt); B(acc, bld, pk, 0.4, 0.9, d + 0.5, x1 + 0.05, py, cz, rt);
  if (wallKey !== 'wood') B(acc, bld, 'stone', w + 0.3, 0.9, d + 0.3, cx, 0.45, cz, C(0.9, 0.85, 0.75));   // plinth

  // door, with an awning (cloth burns) on a random side
  const side = Math.floor(rng() * 4), dx = side === 0 ? 1 : side === 1 ? -1 : 0, dz = side === 2 ? 1 : side === 3 ? -1 : 0;
  const ex = dx ? (dx > 0 ? x1 : x0) : cx + (rng() - 0.5) * w * 0.4, ez = dz ? (dz > 0 ? z1 : z0) : cz + (rng() - 0.5) * d * 0.4;
  B(acc, bld, 'wood', dx ? 0.25 : 1.8, 2.7, dz ? 0.25 : 1.8, ex + dx * 0.1, 1.4, ez + dz * 0.1, DARKWOOD);
  if (rng() < 0.6) B(acc, bld, 'cloth', dx ? 1.3 : 2.8, 0.15, dz ? 1.3 : 2.8, ex + dx * 0.7, 3.15, ez + dz * 0.7, pick(CLOTH, rng));
  // balcony
  if (floors >= 3 && rng() < 0.4) {
    const s2 = Math.floor(rng() * 2);
    const bx = s2 ? cx : x1 + 0.45, bz = s2 ? z1 + 0.45 : cz;
    B(acc, bld, 'wood', s2 ? 3.2 : 1.2, 0.22, s2 ? 1.2 : 3.2, bx, 2 * FLOOR_H + 0.1, bz, DARKWOOD);
    B(acc, bld, 'cloth', s2 ? 3.4 : 1.4, 0.12, s2 ? 1.4 : 3.4, bx, 2 * FLOOR_H + 2.3, bz, pick(CLOTH, rng));
  }

  // rooftop details
  const props = Math.floor(rng() * 3);
  for (let i = 0; i < props && w > 8 && d > 8; i++) {
    const px = x0 + 2.5 + rng() * (w - 5), pz = z0 + 2.5 + rng() * (d - 5), ty = h + 0.5, q = rng();
    if (q < 0.28) G(acc, bld, 'metal', new THREE.CylinderGeometry(0.9, 0.9, 1.6, 14), px, ty + 0.8, pz);                 // water tank
    else if (q < 0.55) {                                                                                                  // thatched hut
      B(acc, bld, 'wood', 2.4, 1.8, 2.4, px, ty + 0.9, pz, wallTint('wood', rng));
      G(acc, bld, 'thatch', new THREE.ConeGeometry(2.2, 1.5, 4).rotateY(Math.PI / 4), px, ty + 2.55, pz);
    } else if (q < 0.8) {                                                                                                 // washing line
      B(acc, bld, 'wood', 0.12, 2.2, 0.12, px - 2, ty + 1.1, pz, DARKWOOD); B(acc, bld, 'wood', 0.12, 2.2, 0.12, px + 2, ty + 1.1, pz, DARKWOOD);
      for (let k = 0; k < 3; k++) B(acc, bld, 'cloth', 1.0, 1.1, 0.05, px - 1.2 + k * 1.2, ty + 1.5, pz, pick(CLOTH, rng));
    } else B(acc, bld, 'thatch', 1.8, 1.1, 1.8, px, ty + 0.55, pz);                                                       // hay stack
  }
  return bld;
}

function templeBlock(ctx, bx, bz) {
  const { acc } = ctx, cx = bx + BLOCK / 2, cz = bz + BLOCK / 2, S = new THREE.Color(0.98, 0.92, 0.8);
  let y = 0;
  for (const s of [50, 40, 30, 20]) {
    const b = newBld(ctx, 'temple', cx - s / 2, cz - s / 2, cx + s / 2, cz + s / 2, y + 1.6);
    B(acc, b, 'stone', s, 1.6, s, cx, y + 0.8, cz, S);
    y += 1.6;
  }
  const tw = 11, th = 15;                                       // central shrine
  const sh = newBld(ctx, 'temple', cx - tw / 2, cz - tw / 2, cx + tw / 2, cz + tw / 2, y + th);
  B(acc, sh, 'stone', tw, th, tw, cx, y + th / 2, cz, S);
  B(acc, sh, 'stone', tw + 1.2, 1, tw + 1.2, cx, y + th + 0.5, cz, S);
  G(acc, sh, 'gold', new THREE.SphereGeometry(3.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cx, y + th + 1, cz);
  G(acc, sh, 'gold', new THREE.ConeGeometry(0.5, 4, 8), cx, y + th + 6, cz);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {        // corner shrines
    const px = cx + sx * 21, pz = cz + sz * 21, e = newBld(ctx, 'temple', px - 2.5, pz - 2.5, px + 2.5, pz + 2.5, 1.6 + 7);
    B(acc, e, 'stone', 5, 7, 5, px, 1.6 + 3.5, pz, S);
    G(acc, e, 'gold', new THREE.SphereGeometry(2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), px, 1.6 + 7, pz);
  }
}

function palaceBlock(ctx, bx, bz) {
  const { acc } = ctx, cx = bx + BLOCK / 2, cz = bz + BLOCK / 2, S = new THREE.Color(1, 0.93, 0.78), s = 52, bh = 11;
  const base = newBld(ctx, 'palace', cx - s / 2, cz - s / 2, cx + s / 2, cz + s / 2, bh + 0.5);
  B(acc, base, 'stone', s, bh, s, cx, bh / 2, cz, S);
  B(acc, base, 'stone', s + 1, 0.6, s + 1, cx, bh + 0.3, cz, S);
  for (let i = -3; i <= 3; i++) {                                // columns on the facade
    G(acc, base, 'stone', new THREE.CylinderGeometry(0.7, 0.8, bh - 2, 10), cx + i * 7, bh / 2, cz + s / 2 + 0.9, C(1, 0.95, 0.85));
    G(acc, base, 'stone', new THREE.CylinderGeometry(0.7, 0.8, bh - 2, 10), cx + i * 7, bh / 2, cz - s / 2 - 0.9, C(1, 0.95, 0.85));
  }
  const hall = newBld(ctx, 'palace', cx - 13, cz - 13, cx + 13, cz + 13, bh + 0.5 + 7);
  B(acc, hall, 'stone', 26, 7, 26, cx, bh + 0.5 + 3.5, cz, S);
  G(acc, hall, 'gold', new THREE.SphereGeometry(8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), cx, bh + 7.5, cz);
  G(acc, hall, 'gold', new THREE.ConeGeometry(0.8, 6, 8), cx, bh + 7.5 + 11, cz);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = cx + sx * 22, pz = cz + sz * 22, t = newBld(ctx, 'palace', px - 3.5, pz - 3.5, px + 3.5, pz + 3.5, bh + 0.5 + 9);
    B(acc, t, 'stone', 7, 9, 7, px, bh + 0.5 + 4.5, pz, S);
    G(acc, t, 'gold', new THREE.SphereGeometry(3.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), px, bh + 9.5, pz);
  }
}

function marketBlock(ctx, rng, bx, bz) {
  const { acc } = ctx, n = 4, cell = BLOCK / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = bx + i * cell + cell / 2, z = bz + j * cell + cell / 2;
    if (Math.abs(i - 1.5) < 1 && Math.abs(j - 1.5) < 1) continue;           // open plaza in the middle
    const b = newBld(ctx, 'stall', x - 4, z - 3, x + 4, z + 3, 3.3);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(acc, b, 'wood', 0.3, 3.1, 0.3, x + sx * 3.6, 1.55, z + sz * 2.6, DARKWOOD);
    B(acc, b, 'cloth', 8.4, 0.2, 6.4, x, 3.2, z, pick(CLOTH, rng));
    B(acc, b, 'wood', 6, 0.9, 1.5, x, 0.45, z + 1.2, wallTint('wood', rng));
    if (rng() < 0.6) B(acc, b, 'thatch', 1.4, 0.8, 1.4, x - 2, 1.2, z - 1.5);
  }
  const f = newBld(ctx, 'fountain', bx + BLOCK / 2 - 4, bz + BLOCK / 2 - 4, bx + BLOCK / 2 + 4, bz + BLOCK / 2 + 4, 1.2);
  B(acc, f, 'stone', 8, 1.2, 8, bx + BLOCK / 2, 0.6, bz + BLOCK / 2, C(1, 0.95, 0.85));
  B(acc, f, 'water', 7, 0.1, 7, bx + BLOCK / 2, 1.25, bz + BLOCK / 2, C(0.6, 0.85, 0.95));
}

function pondBlock(ctx, bx, bz) {
  const { acc } = ctx, cx = bx + BLOCK / 2, cz = bz + BLOCK / 2, S = C(1, 0.94, 0.82);
  const w = newBld(ctx, 'water', cx - 25, cz - 25, cx + 25, cz + 25, 0.3, false, false);
  B(acc, w, 'water', 50, 0.3, 50, cx, 0.15, cz, C(0.55, 0.85, 0.95));
  const rim = (x0, z0, x1, z1) => { const b = newBld(ctx, 'rim', x0, z0, x1, z1, 0.9); B(acc, b, 'stone', x1 - x0, 0.9, z1 - z0, (x0 + x1) / 2, 0.45, (z0 + z1) / 2, S); };
  rim(cx - 28, cz - 28, cx + 28, cz - 25); rim(cx - 28, cz + 25, cx + 28, cz + 28);
  rim(cx - 28, cz - 25, cx - 25, cz + 25); rim(cx + 25, cz - 25, cx + 28, cz + 25);
  const isle = newBld(ctx, 'temple', cx - 5, cz - 5, cx + 5, cz + 5, 4.5);
  B(acc, isle, 'stone', 10, 4.5, 10, cx, 2.25, cz, S);
  G(acc, isle, 'gold', new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), cx, 4.5, cz);
}

function denseBlock(ctx, rng, bx, bz) {
  const nx = 2 + Math.floor(rng() * 3), nz = 2 + Math.floor(rng() * 3), alley = 2.5;
  const lw = (BLOCK - (nx - 1) * alley) / nx, ld = (BLOCK - (nz - 1) * alley) / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x0 = bx + i * (lw + alley), z0 = bz + j * (ld + alley);
    denseBuilding(ctx, { x0, z0, x1: x0 + lw, z1: z0 + ld });
  }
}

// ---------- the city ----------
export class City {
  constructor(scene, T) {
    this.scene = scene;
    this.mats = makeMaterials(T);
    this.groundMat = new THREE.MeshStandardMaterial({ map: T.ground, roughness: 1 });
    this.chunks = new Map();
    this.hash = new Map();
    this.radius = 2;
  }

  update(px, pz, maxBuild = 1) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK), R = this.radius, need = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const k = (ccx + dx) + ',' + (ccz + dz);
      if (!this.chunks.has(k)) need.push([dx * dx + dz * dz, ccx + dx, ccz + dz]);
    }
    need.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(maxBuild, need.length); i++) this.build(need[i][1], need[i][2]);
    for (const [k, ch] of this.chunks) {
      if (Math.abs(ch.cx - ccx) > R + 1 || Math.abs(ch.cz - ccz) > R + 1) this.remove(k);
    }
  }

  build(cx, cz) {
    const rng = mulberry32(hash2(cx, cz) + 1234567);
    const ctx = { rng, acc: new Acc(), blds: [], nextId: 0, chunk: null };
    const chunk = { cx, cz, blds: ctx.blds, meshes: {}, ground: null };
    ctx.chunk = chunk;
    for (let bi = 0; bi < CB; bi++) for (let bj = 0; bj < CB; bj++) {
      const bx = (cx * CB + bi) * P + STREET / 2, bz = (cz * CB + bj) * P + STREET / 2, r = rng();
      if (r < 0.08) templeBlock(ctx, bx, bz);
      else if (r < 0.13) palaceBlock(ctx, bx, bz);
      else if (r < 0.20) marketBlock(ctx, rng, bx, bz);
      else if (r < 0.25) pondBlock(ctx, bx, bz);
      else denseBlock(ctx, rng, bx, bz);
    }
    const group = new THREE.Group();
    for (const key of Object.keys(ctx.acc.lists)) {
      const merged = mergeGeometries(ctx.acc.lists[key]);
      ctx.acc.lists[key].forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, this.mats[key]);
      mesh.castShadow = key !== 'water'; mesh.receiveShadow = true;
      group.add(mesh);
      chunk.meshes[key] = mesh;
    }
    const gg = new THREE.PlaneGeometry(CHUNK, CHUNK).rotateX(-Math.PI / 2);
    const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * CB, uv.getY(i) * CB);
    const ground = new THREE.Mesh(gg, this.groundMat);
    ground.position.set(cx * CHUNK + CHUNK / 2, 0, cz * CHUNK + CHUNK / 2);
    ground.receiveShadow = true;
    group.add(ground);
    chunk.ground = ground;
    this.scene.add(group);
    chunk.group = group;
    this.chunks.set(cx + ',' + cz, chunk);
    for (const b of chunk.blds) this.addToHash(b);
  }

  remove(key) {
    const ch = this.chunks.get(key); if (!ch) return;
    for (const b of ch.blds) this.removeFromHash(b);
    this.scene.remove(ch.group);
    ch.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.chunks.delete(key);
  }

  cells(b, fn) {
    for (let i = Math.floor(b.x0 / CELL); i <= Math.floor(b.x1 / CELL); i++) for (let j = Math.floor(b.z0 / CELL); j <= Math.floor(b.z1 / CELL); j++) fn(i + ',' + j);
  }
  addToHash(b) { this.cells(b, (k) => { let a = this.hash.get(k); if (!a) this.hash.set(k, (a = [])); a.push(b); }); }
  removeFromHash(b) { this.cells(b, (k) => { const a = this.hash.get(k); if (!a) return; const i = a.indexOf(b); if (i >= 0) a.splice(i, 1); if (!a.length) this.hash.delete(k); }); }

  // height of the highest walkable surface under (x, z); 0 = street level
  groundAt(x, z) {
    const a = this.hash.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    let h = 0;
    if (a) for (const b of a) if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.top > h) h = b.top;
    return h;
  }

  // a solid building that blocks a body of radius r at height y (null if free)
  solidAt(x, z, r, y) {
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
      const a = this.hash.get(i + ',' + j);
      if (a) for (const b of a) if (b.solid && b.top > y + 0.4 && x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return b;
    }
    return null;
  }

  stats() { let n = 0; for (const c of this.chunks.values()) n += c.blds.length; return { chunks: this.chunks.size, buildings: n }; }
}

export { FLAMMABLE };
