import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ============================ procedural textures ============================
const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const mkTex = (c, rep = false) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

// A detailed feather: tapered leaf shape, barbs, centre quill and a soft edge. Tip is at the top.
function featherTex(top, mid, base) {
  const [c, x] = cvs(128, 512);
  const shape = new Path2D('M64 2 C100 40 124 140 120 300 C118 400 90 480 64 510 C38 480 10 400 8 300 C4 140 28 40 64 2 Z');
  x.save(); x.clip(shape);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, top); g.addColorStop(0.45, mid); g.addColorStop(1, base);
  x.fillStyle = g; x.fillRect(0, 0, 128, 512);
  x.lineWidth = 1.5;
  for (let i = 0; i < 70; i++) {
    const y = 20 + i * 7;
    x.strokeStyle = i % 2 ? 'rgba(70,35,0,0.16)' : 'rgba(255,245,210,0.18)';
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(64, y); x.lineTo(64 + s * 62, y - 34); x.stroke(); }
  }
  const h = x.createLinearGradient(0, 0, 128, 0);
  h.addColorStop(0, 'rgba(0,0,0,.14)'); h.addColorStop(0.5, 'rgba(255,255,255,.10)'); h.addColorStop(1, 'rgba(0,0,0,.14)');
  x.fillStyle = h; x.fillRect(0, 0, 128, 512);
  x.strokeStyle = 'rgba(110,70,10,0.7)'; x.lineWidth = 2.5;
  x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 512); x.stroke();
  x.restore();
  x.strokeStyle = 'rgba(90,50,10,.5)'; x.lineWidth = 2.5; x.stroke(shape);
  return mkTex(c);
}

// Engraved gold with scrollwork and little gems.
function goldTexture() {
  const [c, x] = cvs(256, 256);
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#ffe58a'); g.addColorStop(0.5, '#d9a02a'); g.addColorStop(1, '#a8701a');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(80,40,0,.55)'; x.lineWidth = 3;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const cx = 32 + i * 64, cy = 32 + j * 64;
    x.beginPath(); x.arc(cx, cy, 22, 0, 6.283); x.stroke();
    x.beginPath(); x.arc(cx, cy, 10, 0, 6.283); x.stroke();
    for (let k = 0; k < 8; k++) {
      const a = k * 0.785;
      x.beginPath(); x.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10); x.lineTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22); x.stroke();
    }
    if ((i + j) % 2 === 0) { x.fillStyle = (i + j) % 4 === 0 ? '#c8102e' : '#1f56b8'; x.beginPath(); x.arc(cx, cy, 5, 0, 6.283); x.fill(); }
  }
  return mkTex(c, true);
}

function mandalaTexture() {
  const [c, x] = cvs(512, 512);
  x.translate(256, 256);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff';
  for (const [r, w] of [[250, 3], [230, 1.5], [200, 2], [150, 1.5], [110, 2], [70, 1.5]]) { x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, 6.283); x.stroke(); }
  for (let i = 0; i < 48; i++) { const a = (i / 48) * 6.283; x.beginPath(); x.arc(Math.cos(a) * 215, Math.sin(a) * 215, 3.2, 0, 6.283); x.fill(); }
  for (let i = 0; i < 24; i++) {
    x.save(); x.rotate((i / 24) * 6.283); x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(0, -112); x.quadraticCurveTo(26, -150, 0, -196); x.quadraticCurveTo(-26, -150, 0, -112); x.stroke();
    x.beginPath(); x.moveTo(0, -70); x.lineTo(0, -108); x.stroke();
    x.restore();
  }
  for (let i = 0; i < 12; i++) { x.save(); x.rotate((i / 12) * 6.283); x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, -232); x.lineTo(0, -248); x.stroke(); x.restore(); }
  x.lineWidth = 1.4;
  for (const n of [8, 12]) {
    x.beginPath();
    for (let i = 0; i <= n; i++) { const a = (i / n) * 6.283; x.lineTo(Math.cos(a) * 160, Math.sin(a) * 160); }
    x.stroke();
  }
  return mkTex(c);
}

function fabricTexture() {
  const [c, x] = cvs(128, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#d8222a'); g.addColorStop(1, '#8a0b14');
  x.fillStyle = g; x.fillRect(0, 0, 128, 256);
  x.fillStyle = '#f2c14a';
  x.fillRect(4, 0, 6, 256); x.fillRect(118, 0, 6, 256);
  for (let i = 0; i < 16; i++) { x.beginPath(); x.arc(64, 12 + i * 16, 3.2, 0, 6.283); x.fill(); }
  x.strokeStyle = 'rgba(242,193,74,.7)'; x.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(24, 20 + i * 30); x.quadraticCurveTo(64, 4 + i * 30, 104, 20 + i * 30); x.stroke(); }
  return mkTex(c);
}

const T = {
  gold: goldTexture(),
  fabric: fabricTexture(),
  mandala: mandalaTexture(),
  cov: featherTex('#ffe9a8', '#fff3d6', '#fffaf0'),
  sec: featherTex('#f0a928', '#f8d172', '#fff0c8'),
  pri: featherTex('#d98a1c', '#f2b43c', '#ffe9a6'),
  tail: featherTex('#e9a21f', '#f6d27a', '#fff3d0'),
  chest: featherTex('#fff0cf', '#fff6e0', '#ffffff'),
};

const feathM = (map, extra = {}) => new THREE.MeshStandardMaterial({
  map, side: THREE.DoubleSide, alphaTest: 0.4, roughness: 0.78, metalness: 0.0, emissive: 0x2a1a05, emissiveMap: map, emissiveIntensity: 0.28, ...extra,
});

const M = {
  cov: feathM(T.cov), sec: feathM(T.sec), pri: feathM(T.pri, { emissiveIntensity: 0.45 }), tail: feathM(T.tail), chest: feathM(T.chest, { emissiveIntensity: 0.12 }),
  gold: new THREE.MeshStandardMaterial({ map: T.gold, metalness: 0.6, roughness: 0.45, emissive: 0x2a1400 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xfff1d4, roughness: 0.8, emissive: 0x2a2010 }),
  beak: new THREE.MeshStandardMaterial({ color: 0xf2ae12, roughness: 0.5, metalness: 0.1, emissive: 0x301c00 }),
  claw: new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.35, metalness: 0.3 }),
  red: new THREE.MeshStandardMaterial({ map: T.fabric, side: THREE.DoubleSide, roughness: 0.55, emissive: 0x300004 }),
  ruby: new THREE.MeshStandardMaterial({ color: 0xd0102a, emissive: 0x600010, roughness: 0.1, metalness: 0.3 }),
  sapphire: new THREE.MeshStandardMaterial({ color: 0x1a4aa8, emissive: 0x0a1a50, roughness: 0.1, metalness: 0.3 }),
  eye: new THREE.MeshStandardMaterial({ color: 0xffb62a, emissive: 0xff8a00, emissiveIntensity: 0.8, roughness: 0.2 }),
  black: new THREE.MeshBasicMaterial({ color: 0x050303 }),
};

// ================================ geometry ================================
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// a feather lying flat in the XZ plane: root at origin, tip along +x, drooping a little
function featherGeo(len, wid, curl = 0.12) {
  const g = new THREE.PlaneGeometry(wid, len, 2, 8);
  g.translate(0, len / 2, 0);
  g.rotateZ(-Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getX(i) / len; p.setY(i, p.getY(i) - curl * len * t * t); }
  g.computeVertexNormals();
  return g;
}
function place(geo, x, y, z, yaw, roll = 0, pitch = 0) {
  const g = geo.clone();
  _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s);
  g.applyMatrix4(_m4);
  return g;
}
const mk = (geos, mat, shadow = true) => { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = shadow; return m; };

// cone along -z with a downward hook (eagle beak)
function beakGeo(len, rad, bend, hook) {
  const g = new THREE.ConeGeometry(rad, len, 28, 14);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -len / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = -p.getZ(i) / len;
    let y = p.getY(i) * 0.85 - bend * t * t * len;
    y -= hook * Math.pow(Math.max(0, t - 0.78) / 0.22, 2) * len * 0.35;
    p.setY(i, y);
  }
  g.computeVertexNormals();
  return g;
}

// overlapping feathers covering an ellipsoid, swept toward +z
function coat(center, radii, count, size, mat, rng) {
  const geo = featherGeo(1, 0.5, 0.2);
  const im = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  let k = 0, guard = 0;
  while (k < count && guard++ < count * 40) {
    const u = rng() * 6.283, v = Math.acos(1 - 2 * rng());
    n.set((Math.sin(v) * Math.cos(u)) / radii.x, Math.cos(v) / radii.y, (Math.sin(v) * Math.sin(u)) / radii.z).normalize();
    p.set(Math.sin(v) * Math.cos(u) * radii.x, Math.cos(v) * radii.y, Math.sin(v) * Math.sin(u) * radii.z);
    t.set(0, 0, 1).addScaledVector(n, -n.z);
    if (t.lengthSq() < 1e-4) continue;
    t.normalize(); b.crossVectors(t, n);
    const s = size * (0.75 + rng() * 0.5);
    m.makeBasis(t, n, b); m.scale(_v.set(s, s, s));
    m.setPosition(p.x + center.x + n.x * 0.03, p.y + center.y + n.y * 0.03, p.z + center.z + n.z * 0.03);
    im.setMatrixAt(k, m);
    col.setHSL(0.11, 0.5, 0.88 + rng() * 0.12);
    im.setColorAt(k, col);
    k++;
  }
  im.count = k;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false;
  return im;
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function ringAlong(curve, t, r, tube, mat) {
  const pt = curve.getPointAt(t), tan = curve.getTangentAt(t);
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 28), mat);
  m.position.copy(pt);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
  return m;
}
function arm(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, radius, 12), M.cream));
  const edge = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1] + radius * 0.95, p[2] - 0.02)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(edge, 18, 0.07, 8), M.gold));
  for (const t of [0.12, 0.5, 0.9]) g.add(ringAlong(curve, t, radius + 0.04, 0.045, M.gold));
  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), M.ruby);
  gem.position.copy(curve.getPointAt(0.5)).add(new THREE.Vector3(0, radius + 0.1, 0));
  g.add(gem);
  return g;
}

function buildWing() {
  const wing = new THREE.Group(), inner = new THREE.Group(), outer = new THREE.Group();
  wing.add(inner); inner.add(outer);
  outer.position.set(2.6, 0.5, -0.3);

  const I = { cov: [], sec: [] }, O = { cov: [], sec: [], pri: [] };
  const Y = -Math.PI / 2;
  for (let i = 0; i < 14; i++) { const t = i / 13; I.sec.push(place(featherGeo(3.1 + t * 0.8, 1.2, 0.14), 0.15 + t * 2.4, 0.02, 0.12 - t * 0.28, Y + 0.02 + t * 0.3, 0.05 + t * 0.1)); }
  for (let i = 0; i < 16; i++) { const t = i / 15; I.cov.push(place(featherGeo(1.9 + t * 0.4, 0.85, 0.1), 0.05 + t * 2.5, 0.07, -0.05 - t * 0.25, Y + 0.06 + t * 0.32, 0.05 + t * 0.1)); }
  for (let i = 0; i < 14; i++) { const t = i / 13; I.cov.push(place(featherGeo(1.1, 0.65, 0.08), t * 2.5, 0.12, -0.15 - t * 0.2, Y + 0.1 + t * 0.3, 0.05)); }
  for (let i = 0; i < 12; i++) { const t = i / 11; O.sec.push(place(featherGeo(3.5 + t * 0.7, 1.25, 0.14), t * 2.4, 0.02, 0.1 - t * 0.15, Y + 0.28 + t * 0.3, 0.1 + t * 0.12)); }
  for (let i = 0; i < 12; i++) { const t = i / 11; O.pri.push(place(featherGeo(4.2 + Math.sin(t * Math.PI) * 2.2, 1.3, 0.2), 2.4, -0.04 + 0.015 * i, -0.25, -1.25 + t * 1.5, 0.12 + Math.sin(t * Math.PI) * 0.22)); }
  for (let i = 0; i < 14; i++) { const t = i / 13; O.cov.push(place(featherGeo(2.0, 0.8, 0.1), 0.1 + t * 2.5, 0.07, -0.1 - t * 0.15, Y + 0.3 + t * 0.3, 0.1)); }
  for (let i = 0; i < 12; i++) { const t = i / 11; O.cov.push(place(featherGeo(2.6, 0.95, 0.14), 2.4, 0.06 + 0.01 * i, -0.3, -1.2 + t * 1.4, 0.14 + Math.sin(t * Math.PI) * 0.18)); }

  inner.add(mk(I.sec, M.sec), mk(I.cov, M.cov), arm([[0, 0, 0], [1.3, 0.35, -0.1], [2.6, 0.5, -0.3]], 0.21));
  outer.add(mk(O.sec, M.sec), mk(O.pri, M.pri), mk(O.cov, M.cov), arm([[0, 0, 0], [1.2, -0.15, -0.2], [2.4, -0.1, -0.35]], 0.17));

  const pauld = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.gold);
  pauld.scale.set(1.1, 0.8, 1.3); pauld.position.set(0.1, 0.12, -0.1);
  inner.add(pauld);
  const pg = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), M.ruby);
  pg.position.set(0.1, 0.55, -0.1);
  inner.add(pg);
  return { wing, inner, outer };
}

// ================================= Garuda =================================
export function buildGaruda() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rng = mulberry(2024);

  // torso + feather coat
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), M.cream);
  torso.scale.set(0.95, 0.85, 1.9);
  body.add(torso);
  body.add(coat(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.97, 0.87, 1.92), 620, 0.75, M.chest, rng));

  // neck
  const neck = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), M.cream);
  neck.scale.set(0.52, 0.72, 0.52); neck.position.set(0, 0.55, -1.7);
  body.add(neck);
  body.add(coat(new THREE.Vector3(0, 0.55, -1.7), new THREE.Vector3(0.54, 0.74, 0.54), 150, 0.5, M.chest, rng));

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.12, -2.3);
  body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.52, 28, 20), M.cream);
  skull.scale.set(0.95, 1.0, 1.15);
  head.add(skull);
  head.add(coat(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.52, 0.52, 0.6), 110, 0.38, M.chest, rng));

  const upper = new THREE.Mesh(beakGeo(1.15, 0.3, 0.32, 0.9), M.beak);
  upper.position.set(0, -0.1, -0.45);
  const lower = new THREE.Mesh(beakGeo(0.85, 0.22, 0.05, 0), M.beak);
  lower.position.set(0, -0.3, -0.42); lower.rotation.x = 0.16;
  head.add(upper, lower);

  for (const s of [-1, 1]) {
    const eyeBall = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), M.eye);
    eyeBall.scale.set(0.75, 0.9, 0.8);
    eyeBall.position.set(s * 0.3, 0.12, -0.4);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.black);
    pupil.position.set(s * 0.37, 0.12, -0.45);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.075, 0.3), M.cream);
    brow.position.set(s * 0.3, 0.27, -0.4); brow.rotation.set(0.1, 0, -s * 0.5);
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20), M.gold);
    ear.position.set(s * 0.52, 0.0, 0.12); ear.rotation.z = Math.PI / 2;
    const earGem = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.ruby);
    earGem.position.set(s * 0.56, 0.0, 0.12);
    head.add(eyeBall, pupil, brow, ear, earGem);
  }

  // crown
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 12, 44), M.gold);
  band.position.set(0, 0.3, -0.05); band.rotation.x = Math.PI / 2 - 0.35;
  head.add(band);
  for (let i = -2; i <= 2; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5 - Math.abs(i) * 0.08, 10), M.gold);
    sp.position.set(Math.sin(i * 0.4) * 0.46, 0.52 + (2 - Math.abs(i)) * 0.03, 0.05 - Math.abs(i) * 0.05);
    sp.rotation.set(-0.5, 0, -i * 0.28);
    head.add(sp);
  }
  const crest0 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 12), M.gold);
  crest0.position.set(0, 0.7, -0.22); crest0.rotation.x = -0.25;
  const crestGem = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), M.ruby);
  crestGem.position.set(0, 0.36, -0.42);
  head.add(crest0, crestGem);

  // swept golden crest plumes
  const crestG = new THREE.Group();
  crestG.position.set(0, 0.3, 0.25);
  const plumes = [];
  for (let i = 0; i < 9; i++) {
    const t = (i - 4) / 4;
    plumes.push(place(featherGeo(2.4 + (1 - Math.abs(t)) * 1.1, 0.55, 0.3), 0, 0, 0, -Math.PI / 2 + t * 0.55, t * 0.3, 0.55 - Math.abs(t) * 0.2));
  }
  crestG.add(mk(plumes, M.pri, false));
  head.add(crestG);

  // jewelled collar + medallion
  const collar = new THREE.Group();
  collar.position.set(0, 0.45, -1.6); collar.rotation.x = Math.PI / 2 - 0.5;
  for (const [r, tb] of [[0.62, 0.08], [0.8, 0.09], [1.0, 0.1]]) collar.add(new THREE.Mesh(new THREE.TorusGeometry(r, tb, 12, 48), M.gold));
  for (let i = 0; i < 16; i++) {
    const a = Math.PI + 0.3 + (i / 15) * (Math.PI - 0.6);
    const pend = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 8), M.gold);
    pend.position.set(Math.cos(a) * 1.0, Math.sin(a) * 1.0 - 0.15, 0); pend.rotation.z = Math.PI;
    const pg = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), i % 2 ? M.ruby : M.sapphire);
    pg.position.set(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0);
    collar.add(pend, pg);
  }
  body.add(collar);
  const medal = new THREE.Group();
  medal.position.set(0, -0.05, -1.88); medal.rotation.x = Math.PI / 2 + 0.2;
  medal.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 28), M.gold));
  const mr = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 10, 28), M.gold); mr.rotation.x = Math.PI / 2; mr.position.y = 0.03; medal.add(mr);
  const mg = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), M.ruby); mg.position.y = 0.09; medal.add(mg);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283;
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.sapphire);
    g.position.set(Math.cos(a) * 0.28, 0.05, Math.sin(a) * 0.28); medal.add(g);
  }
  body.add(medal);

  // wings
  const R = buildWing(); R.wing.position.set(0.85, 0.65, -0.35);
  const L = buildWing(); L.wing.position.set(-0.85, 0.65, -0.35); L.wing.scale.x = -1;
  body.add(R.wing, L.wing);

  // tail fan
  const tailGeos = [];
  for (let i = -4; i <= 4; i++) tailGeos.push(place(featherGeo(3.6 + (1 - Math.abs(i) / 4) * 1.0, 0.8, 0.1), 0, 0, 0, -Math.PI / 2 + i * 0.15, 0, -0.1));
  const tail = new THREE.Group(); tail.position.set(0, 0.05, 1.7);
  tail.add(mk(tailGeos, M.tail));
  body.add(tail);

  // legs with gold bracers and black talons
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.5, -0.55, 0.2);
    const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), M.cream); thigh.scale.set(0.85, 1.2, 0.95); thigh.position.y = -0.1;
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.1, 14), M.gold); shin.position.set(0, -0.55, -0.35); shin.rotation.x = -0.75;
    const ank = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 8, 18), M.gold); ank.position.set(0, -0.9, -0.72); ank.rotation.x = Math.PI / 2 - 0.75;
    leg.add(thigh, shin, ank);
    for (let k = -1; k <= 1; k++) {
      const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 8), M.gold);
      toe.position.set(k * 0.14, -1.0, -1.0); toe.rotation.set(-1.5, 0, k * 0.2);
      const claw = new THREE.Mesh(beakGeo(0.42, 0.06, 0.9, 0.8), M.claw);
      claw.position.set(k * 0.18, -1.05, -1.25); claw.rotation.x = 0.6;
      leg.add(toe, claw);
    }
    body.add(leg);
  }

  // waist cloth (animated skirt) + trailing sashes
  const skirtG = new THREE.CylinderGeometry(0.95, 1.5, 1.3, 28, 6, true);
  const skirt = new THREE.Mesh(skirtG, M.red);
  skirt.position.set(0, -0.35, 0.5); skirt.rotation.x = 0.35;
  body.add(skirt);
  const skirtBase = skirtG.attributes.position.array.slice();
  const sashes = [];
  for (const sd of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(0.95, 6.5, 1, 16);
    geo.translate(0, 3.25, 0); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, M.red); m.position.set(sd * 0.4, 0.15, 0.9);
    body.add(m);
    sashes.push({ geo, base: geo.attributes.position.array.slice(), sd, len: 6.5 });
  }

  // mandala halo
  const halo = new THREE.Group();
  halo.position.set(0, 1.1, -3.4);
  body.add(halo);
  const glow = new THREE.Color(2.4, 1.5, 0.45);
  const mandala = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({
    map: T.mandala, color: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  halo.add(mandala);
  halo.add(new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.035, 8, 80), new THREE.MeshBasicMaterial({ color: glow })));
  halo.add(new THREE.Mesh(new THREE.CircleGeometry(2.9, 48), new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.1, 0.65, 0.2), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })));

  root.scale.setScalar(0.8);

  const setFront = (f) => { halo.position.z = THREE.MathUtils.lerp(-3.4, -1.0, f); };

  // The flap phase is accumulated each frame. Using t * rate made the wings jump (a double flap)
  // whenever the rate changed, for example when climbing.
  let phase = 0, lastT = null, rateS = 5;
  function update(t, roll, pitch, boost, spin = 0) {
    const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    const rateT = 5.0 + boost * 5 + Math.max(0, -pitch) * 1.2;
    rateS += (rateT - rateS) * Math.min(1, dt * 4);
    phase += rateS * dt;
    const ph = phase;
    const a = 0.5 + boost * 0.15;
    const f1 = Math.sin(ph) * a + 0.32 + Math.max(0, pitch) * 0.25;
    const f2 = Math.sin(ph - 0.9) * a * 0.9 - 0.02;
    for (const W of [R, L]) {
      W.inner.rotation.z = f1;
      W.outer.rotation.z = f2;
      W.inner.rotation.y = Math.sin(ph - 0.5) * 0.1;
    }
    body.position.y = Math.sin(ph - 0.3) * 0.14;
    head.rotation.y = -roll * 0.35;
    head.rotation.x = -pitch * 0.2;
    crestG.rotation.x = Math.sin(t * 3) * 0.06 - 0.05;
    tail.rotation.x = -pitch * 0.3;
    tail.rotation.y = roll * 0.3;
    body.rotation.z = -roll * 0.9 + spin;   // spin = barrel roll from twisting the controller
    body.rotation.x = -pitch * 0.45;
    body.rotation.y = -roll * 0.3;
    mandala.rotation.z = t * 0.15;

    for (const sc of sashes) {
      const arr = sc.geo.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const r = sc.base[i + 2] / sc.len;
        arr[i] = sc.base[i] + Math.sin(t * 5 - r * 7 + sc.sd) * 0.6 * r;
        arr[i + 1] = sc.base[i + 1] + Math.cos(t * 4 - r * 5) * 0.4 * r;
      }
      sc.geo.attributes.position.needsUpdate = true;
    }
    const sa = skirtG.attributes.position.array;
    for (let i = 0; i < sa.length; i += 3) {
      const h = (skirtBase[i + 1] + 0.65) / 1.3, ang = Math.atan2(skirtBase[i + 2], skirtBase[i]);
      const w = Math.sin(t * 4 + ang * 3 - h * 4) * 0.07 * (1 - h);
      sa[i] = skirtBase[i] * (1 + w); sa[i + 2] = skirtBase[i + 2] * (1 + w);
    }
    skirtG.attributes.position.needsUpdate = true;
  }

  return { root, update, setFront };
}
