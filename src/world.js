import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- noise / terrain ----------
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function hash2(x, y) { return hash(x * 157.31 + y * 311.97); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
  let s = 0, a = 0.5;
  for (let i = 0; i < 4; i++) { s += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; }
  return s;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function terrainHeight(x, z) {
  const valley = smooth(70, 300, Math.abs(x));
  const n = fbm(x * 0.004 + 10, z * 0.004);
  const floor = (fbm(x * 0.012, z * 0.012) - 0.5) * 8;
  const d = (x - riverX(z)) / 15;
  const hills = Math.max(0, fbm(x * 0.008 + 3, z * 0.008) - 0.38) * 70 * smooth(34, 90, Math.abs(x - riverX(z)));
  return floor + valley * (20 + 320 * n * n) - 15 * Math.exp(-d * d) * (1 - valley) + hills * (1 - valley);
}
// Flowing line of rings the player follows
export const pathX = (z) => 38 * Math.sin(z * 0.0055) + 14 * Math.sin(z * 0.013);
export const pathY = (z) => 46 + 18 * Math.sin(z * 0.009 + 1);
export const riverX = (z) => 0.55 * pathX(z) + 10 * Math.sin(z * 0.021);
export const WATER_Y = -3.5;

// ---------- shared materials / geometry ----------
const stone = new THREE.MeshStandardMaterial({ color: 0xe6bb80, roughness: 0.9, emissive: 0x2a1500 });
const stoneDark = new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.95, emissive: 0x180c00 });
const goldM = new THREE.MeshStandardMaterial({ color: 0xffc44d, emissive: 0xff9a1a, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.5 });
const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.85, 0.25) });
const tU = { tGrass: { value: null }, tRock: { value: null } };
let ASSETS = null;
function applyTriplanar(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tGrass = tU.tGrass; sh.uniforms.tRock = tU.tRock;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(transpose(inverse(mat3(modelMatrix))) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN; uniform sampler2D tGrass; uniform sampler2D tRock;')
      .replace('#include <color_fragment>', `
        vec3 wn = normalize(vWN);
        vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 rk = texture2D(tRock, vWPos.zy * 0.03).rgb * bw.x + texture2D(tRock, vWPos.xy * 0.03).rgb * bw.z + texture2D(tRock, vWPos.xz * 0.03).rgb * bw.y;
        vec3 gr = texture2D(tGrass, vWPos.xz * 0.06).rgb * 0.7 + texture2D(tGrass, vWPos.xz * 0.011).rgb * 0.5;
        float up = smoothstep(0.5, 0.82, wn.y);
        vec3 tx = mix(rk, gr, up);
        diffuseColor.rgb = mix(tx, vColor, 0.5) * 0.95;`);
  };
}
const groundM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
applyTriplanar(groundM);
const ringM = new THREE.MeshStandardMaterial({ color: 0xffc94d, emissive: 0xffa21a, emissiveIntensity: 0.8, metalness: 0.35, roughness: 0.45 });

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.85, 1, 1, 14),
  cone: new THREE.ConeGeometry(1, 1, 8),
  sph: new THREE.SphereGeometry(1, 12, 10),
  ring: new THREE.TorusGeometry(9, 0.9, 12, 44),
};

function add(parent, geo, material, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

function makeTemple(rng, size) {
  const g = new THREE.Group();
  add(g, G.box, stoneDark, size * 1.9, 60, size * 1.9, 0, -25, 0);
  add(g, G.box, stone, size * 1.5, 6, size * 1.5, 0, 8, 0);
  // door glow on the terrace
  add(g, G.box, glowM, size * 0.16, size * 0.2, 0.5, 0, 12, size * 0.75 + 0.2);
  let w = size, y = 11;
  const tiers = 6 + Math.floor(rng() * 3);
  for (let i = 0; i < tiers; i++) {
    const h = 6.5;
    add(g, G.box, stone, w, h, w, 0, y + h / 2, 0);
    add(g, G.box, stoneDark, w * 1.08, 1.2, w * 1.08, 0, y + h + 0.6, 0);
    for (const s of [-1, 1]) {
      add(g, G.box, glowM, 1.3, 2.4, 0.4, -w * 0.25, y + h * 0.5, s * (w / 2 + 0.15));
      add(g, G.box, glowM, 1.3, 2.4, 0.4, w * 0.25, y + h * 0.5, s * (w / 2 + 0.15));
      add(g, G.box, glowM, 0.4, 2.4, 1.3, s * (w / 2 + 0.15), y + h * 0.5, 0);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      add(g, G.cone, stoneDark, 1.1, 2.6, 1.1, sx * w * 0.5, y + h + 2, sz * w * 0.5);
    y += h + 1.2;
    w *= 0.8;
  }
  add(g, G.cyl, goldM, 1.2, 3, 1.2, 0, y + 1.5, 0);
  add(g, G.sph, goldM, 1.6, 1.6, 1.6, 0, y + 3.6, 0);
  add(g, G.cone, goldM, 0.7, 4, 0.7, 0, y + 6, 0);
  return g;
}

function makeGate(span, H) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    add(g, G.cyl, stone, 2.4, H, 2.4, s * span / 2, H / 2, 0);
    add(g, G.box, stoneDark, 6, 2, 6, s * span / 2, 1, 0);
    add(g, G.box, stoneDark, 5.4, 1.6, 5.4, s * span / 2, H, 0);
  }
  add(g, G.box, stone, span + 9, 3, 4.5, 0, H + 2.4, 0);
  add(g, G.box, stoneDark, span + 2, 1.6, 3.2, 0, H - 4.5, 0);
  add(g, G.cyl, goldM, 0.9, 2.5, 0.9, 0, H + 5, 0);
  add(g, G.cone, goldM, 0.8, 3, 0.8, 0, H + 7.5, 0);
  return g;
}

export const WATER_LEVEL = -3.5;
const DOME = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const SHIKHARA = (() => {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const y = i / 40;
    const r = 0.5 * Math.pow(1 - y, 0.85) * (1 + 0.07 * Math.sin(y * 60));
    pts.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }
  return new THREE.LatheGeometry(pts, 20);
})();

const rockM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
applyTriplanar(rockM);
const leafM = new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 1, flatShading: true });
const poolM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.7, 0.75) });
export const FOGC = new THREE.Color(0xe8a56a);

export const wfM = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { time: { value: 0 }, fogColor: { value: FOGC } },
  vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader: `
    varying vec2 vUv; varying vec3 vP; uniform float time; uniform vec3 fogColor;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      float x = vUv.x, streak = 0.0;
      for (int i = 0; i < 3; i++) {
        float f = 6.0 + float(i) * 5.0;
        float cx = floor(x * f);
        float sp = 0.5 + h(vec2(cx, float(i))) * 0.8;
        float y = fract(vUv.y * (1.5 + float(i)) + time * sp + h(vec2(cx, 1.0)));
        streak += smoothstep(0.0, 0.5, y) * smoothstep(1.0, 0.5, y) * (0.4 + 0.6 * h(vec2(cx, 3.0 + float(i))));
      }
      float edge = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
      float a = clamp(0.55 + streak * 0.3, 0.0, 1.0) * edge * smoothstep(0.0, 0.14, vUv.y);
      vec3 c = vec3(1.25, 1.4, 1.55);
      float d = distance(cameraPosition, vP);
      c = mix(c, fogColor, smoothstep(120.0, 1150.0, d) * 0.8);
      gl_FragColor = vec4(c, a);
    }`,
});

export const waterM = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, sunDir: { value: new THREE.Vector3(-0.22, 0.17, -1).normalize() }, fogColor: { value: FOGC }, envTex: { value: null }, envRot: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader: `
    varying vec3 vP; uniform float time; uniform vec3 sunDir; uniform vec3 fogColor; uniform sampler2D envTex; uniform float envRot;
    vec3 skyAt(vec3 d){ float az = atan(d.z, d.x) + envRot; vec2 uv = vec2(az * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5); return texture2D(envTex, uv).rgb; }
    float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec3 V = normalize(cameraPosition - vP);
      vec2 p = vP.xz * 0.22;
      float gx = vn(p + time * 0.3) - vn(p * 1.9 - time * 0.2);
      float gz = vn(p + vec2(5.0) + time * 0.25) - vn(p * 1.4 + time * 0.15);
      vec3 N = normalize(vec3(gx * 0.18, 1.0, gz * 0.18));
      float fres = clamp(0.06 + pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.9, 0.0, 1.0);
      vec3 R = reflect(-V, N);
      R.y = abs(R.y);
      vec3 sky = min(skyAt(R), vec3(3.5));
      vec3 deep = vec3(0.02, 0.16, 0.2);
      vec3 col = mix(deep, sky, fres);
      float d = distance(cameraPosition, vP);
      col = mix(col, fogColor, smoothstep(120.0, 1150.0, d));
      gl_FragColor = vec4(col, 1.0);
    }`,
});

const mesaK = (seed, a) => 1 + 0.3 * (vnoise(Math.cos(a) * 2.4 + seed, Math.sin(a) * 2.4 + seed) - 0.5);
const mesaGeos = [11.3, 47.1, 83.9].map((seed) => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 18, 10);
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    if (Math.hypot(x, z) > 0.001) {
      const k = mesaK(seed, a);
      x *= k; z *= k; p.setXYZ(i, x, y, z);
    }
    if (y > 0.499) col.setRGB(0.28 + 0.08 * vnoise(x * 3 + seed, z * 3), 0.42, 0.17);
    else {
      const n = vnoise(a * 3 + seed, y * 5);
      col.setRGB(0.55 + 0.15 * n, 0.42 + 0.1 * n, 0.3 + 0.08 * n);
      col.multiplyScalar((0.6 + 0.6 * (y + 0.5)) * (0.88 + 0.12 * Math.sin(y * 38 + n * 3)));
    }
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeVertexNormals();
  g.userData.seed = seed;
  return g;
});
const wfGeo = new THREE.PlaneGeometry(1, 1);
const poolGeo = new THREE.CircleGeometry(16, 28);
let mistMat = null;

function makePalace(rng, size) {
  const g = new THREE.Group();
  add(g, G.box, stoneDark, size * 1.6, 3, size * 1.6, 0, 1.5, 0);
  add(g, G.box, stone, size * 1.35, 3, size * 1.35, 0, 4.5, 0);
  const h = size * 1.25;
  add(g, G.box, stoneDark, size * 0.95, 4, size * 0.95, 0, 8, 0);
  add(g, SHIKHARA, stone, size * 0.72, h, size * 0.72, 0, 6, 0);
  add(g, G.cyl, goldM, 1.2, 3, 1.2, 0, 6 + h + 1, 0);
  add(g, G.sph, goldM, 1.5, 1.5, 1.5, 0, 6 + h + 3, 0);
  add(g, G.cone, goldM, 0.6, 5, 0.6, 0, 6 + h + 6, 0);
  add(g, G.box, glowM, size * 0.14, size * 0.2, 0.5, 0, 9.5, size * 0.475 + 0.2);
  const w = size * 0.24;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * size * 0.58, pz = sz * size * 0.58, dr = size * 0.15;
    add(g, G.box, stone, w, 5, w, px, 8.5, pz);
    add(g, G.box, glowM, 0.9, 2, 0.3, px, 9, pz + sz * (w / 2 + 0.1));
    add(g, DOME, goldM, dr, dr, dr, px, 11, pz);
    add(g, G.cone, goldM, 0.35, 3, 0.35, px, 11 + dr + 1.5, pz);
  }
  for (const sx of [-1, 1]) {
    add(g, G.box, stone, size * 0.3, 4, size * 0.3, sx * size * 0.58, 8, 0);
    add(g, SHIKHARA, stone, size * 0.3, size * 0.55, size * 0.3, sx * size * 0.58, 10, 0);
    add(g, G.cone, goldM, 0.4, 3, 0.4, sx * size * 0.58, 10 + size * 0.55 + 1.2, 0);
  }
  return g;
}

function makeMesa(rng, side, x, wz, lz, r, topY, pts) {
  const g = new THREE.Group();
  const base = terrainHeight(x, wz);
  g.position.set(x, base, lz);
  const H = topY - base + 40;
  const mg = mesaGeos[Math.floor(rng() * 3)];
  const rock = new THREE.Mesh(mg, rockM);
  rock.scale.set(r, H, r);
  rock.position.y = -40 + H / 2;
  g.add(rock);
  const top = topY - base;

  const palace = makePalace(rng, r * 0.85);
  palace.position.y = top;
  palace.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  g.add(palace);
  lampRing(g, 16, r * 0.85, top + 0.3, pts, x, base, lz);

  for (let i = 0; i < 9; i++) {
    const a = rng() * 6.28, rr = r * (0.62 + rng() * 0.3), s = 3 + rng() * 3;
    const tx = Math.cos(a) * rr, tz = Math.sin(a) * rr;
    add(g, G.cyl, trunkM, s * 0.2, s * 1.2, s * 0.2, tx, top + s * 0.6, tz);
    add(g, treeGeo, leafM, s * 1.2, s * 0.95, s * 1.2, tx, top + s * 1.7, tz);
  }

  // waterfall over the lip facing the flight path, with pool and mist
  const px = -side * (r * mesaK(mg.userData.seed, side > 0 ? Math.PI : 0) + 0.3);
  const bottom = terrainHeight(x + px, wz) - base + 0.4;
  const wH = top - bottom;
  const wW = 9 + rng() * 7;
  const wf = new THREE.Mesh(wfGeo, wfM);
  wf.scale.set(wW, wH, 1);
  wf.position.set(px, bottom + wH / 2, 0);
  wf.rotation.y = -side * Math.PI / 2;
  wf.renderOrder = 2;
  g.add(wf);
  const pool = new THREE.Mesh(poolGeo, poolM);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(px - side * 9, bottom + 0.2, 0);
  g.add(pool);
  if (!mistMat) mistMat = new THREE.SpriteMaterial({ map: dustTex(), color: new THREE.Color(1.3, 1.1, 0.95), transparent: true, opacity: 0.55, depthWrite: false, fog: true });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Sprite(mistMat);
    const sc = 28 + rng() * 22;
    m.scale.set(sc, sc * 0.6, 1);
    m.position.set(px - side * (3 + rng() * 14), bottom + 3 + rng() * 6, (rng() - 0.5) * 16);
    g.add(m);
  }
  return g;
}

const NT = 260;
const treeGeo = new THREE.IcosahedronGeometry(1, 0);
const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 1, 5);
const canopyM = new THREE.MeshStandardMaterial({ map: leafTexture(), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 1, emissive: 0x0a1405 });
const trunkM = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 });
function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  let sd = 7; const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let i = 0; i < 80; i++) {
    const l = 150 + Math.floor(r() * 105);
    x.save(); x.translate(r() * 256, r() * 256); x.rotate(r() * 6.283);
    const len = 20 + r() * 20, w = 7 + r() * 6;
    x.fillStyle = `rgb(${l},${l},${l})`;
    x.beginPath(); x.ellipse(0, 0, len, w, 0, 0, 6.283); x.fill();
    x.strokeStyle = 'rgba(70,70,70,.7)'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(-len, 0); x.lineTo(len, 0); x.stroke();
    x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const leafyGeo = (() => {
  const geos = [], r = mulberry32(5), q4 = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4();
  for (let i = 0; i < 55; i++) {
    const q = new THREE.PlaneGeometry(0.9, 0.9);
    const dir = new THREE.Vector3(r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1).normalize();
    const rad = 0.3 + r() * 0.7, s = 0.7 + r() * 0.5;
    q4.setFromEuler(e.set(r() * 6.28, r() * 6.28, r() * 6.28));
    m.compose(dir.clone().multiplyScalar(rad), q4, new THREE.Vector3(s, s, s));
    q.applyMatrix4(m);
    const n = q.attributes.normal;
    for (let j = 0; j < n.count; j++) n.setXYZ(j, dir.x, dir.y, dir.z);
    geos.push(q);
  }
  return mergeGeometries(geos);
})();
const _o = new THREE.Object3D();
const _c = new THREE.Color();

const NL = 36;
const padGeo = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
const padM = new THREE.MeshStandardMaterial({ color: 0x3f8a46, roughness: 0.8, side: THREE.DoubleSide });
const bloomGeo = new THREE.ConeGeometry(0.6, 0.9, 8).translate(0, 0.45, 0);
const bloomM = new THREE.MeshStandardMaterial({ color: 0xff7fb0, emissive: 0xff4f90, emissiveIntensity: 0.5, roughness: 0.6 });
let mist2M = null;
const MIST_DAY = new THREE.Color(1.3, 1.05, 0.85), MIST_NIGHT = new THREE.Color(0.28, 0.36, 0.7);

const floatGeos = [3.7, 21.3].map((seed) => {
  const g = new THREE.ConeGeometry(1, 1, 28, 12);
  g.rotateX(Math.PI); g.translate(0, -0.5, 0);
  const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    if (Math.hypot(x, z) > 0.001) { const k = mesaK(seed, a) * (1 + 0.08 * vnoise(a * 3 + seed, y * 6)); x *= k; z *= k; p.setXYZ(i, x, y, z); }
    if (y > -0.02) col.setRGB(0.3, 0.44, 0.18);
    else { const n = vnoise(a * 3 + seed, y * 5); col.setRGB(0.5 + 0.15 * n, 0.38 + 0.1 * n, 0.28 + 0.08 * n); col.multiplyScalar(0.45 + 0.7 * (1 + y)); }
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeVertexNormals();
  g.userData.seed = seed;
  return g;
});

function mistSprites(g, rng, x, y, z, n, size) {
  if (!mistMat) mistMat = new THREE.SpriteMaterial({ map: dustTex(), color: new THREE.Color(1.3, 1.1, 0.95), transparent: true, opacity: 0.55, depthWrite: false, fog: true });
  for (let i = 0; i < n; i++) {
    const m = new THREE.Sprite(mistMat), sc = size * (0.7 + rng() * 0.6);
    m.scale.set(sc, sc * 0.6, 1);
    m.position.set(x + (rng() - 0.5) * size * 0.5, y + rng() * 4, z + (rng() - 0.5) * 12);
    g.add(m);
  }
}

function makeFloater(rng, r, ox, oy, oz, pts) {
  const g = new THREE.Group();
  const fg = floatGeos[rng() < 0.5 ? 0 : 1];
  const rock = new THREE.Mesh(fg, rockM);
  rock.scale.set(r, r * 1.5, r);
  g.add(rock);
  const palace = makePalace(rng, r * 0.7);
  palace.rotation.y = rng() * 6.28;
  g.add(palace);
  lampRing(g, 14, r * 0.8, 0.3, pts, ox, oy, oz);
  for (let i = 0; i < 6; i++) {
    const a = rng() * 6.28, rr = r * (0.55 + rng() * 0.3), s = 2.5 + rng() * 2;
    add(g, G.cyl, trunkM, s * 0.2, s * 1.2, s * 0.2, Math.cos(a) * rr, s * 0.6, Math.sin(a) * rr);
    add(g, treeGeo, leafM, s * 1.1, s * 0.9, s * 1.1, Math.cos(a) * rr, s * 1.6, Math.sin(a) * rr);
  }
  const fx = rng() < 0.5 ? -1 : 1;
  const px = fx * (r * mesaK(fg.userData.seed, fx > 0 ? 0 : Math.PI) + 0.3);
  const L2 = 50 + rng() * 30;
  const wf = new THREE.Mesh(wfGeo, wfM);
  wf.scale.set(6 + rng() * 5, L2, 1);
  wf.position.set(px, -L2 / 2, 0);
  wf.rotation.y = fx * Math.PI / 2;
  wf.renderOrder = 2;
  g.add(wf);
  mistSprites(g, rng, px, -L2, 0, 3, 34);
  return g;
}

function makeBridge(span, pts, ox, oz) {
  const g = new THREE.Group();
  add(g, G.box, stone, span, 1.2, 7, 0, 2.2, 0);
  for (const s of [-1, 1]) add(g, G.box, stoneDark, span, 1.0, 0.8, 0, 3.3, s * 3.1);
  const n = Math.floor(span / 6.5);
  for (let i = 0; i <= n; i++) {
    const x = -span / 2 + i * (span / n);
    for (const s of [-1, 1]) {
      add(g, G.box, stone, 0.9, 2.2, 0.9, x, 3.6, s * 3.1);
      add(g, DOME, goldM, 0.8, 0.8, 0.8, x, 4.7, s * 3.1);
      add(g, G.sph, glowM, 0.3, 0.3, 0.3, x, 5.5, s * 3.1);
      pts.push(ox + x, 5.7, oz + s * 3.1);
    }
  }
  for (let i = 0; i < 5; i++) add(g, G.cyl, stoneDark, 1.5, 22, 1.5, -span / 2 + (i + 0.5) * span / 5, -8.5, 0);
  return g;
}

// warm glow sprites around every lamp (one draw call per chunk), only shown at night
const haloM = new THREE.PointsMaterial({ map: dustTex(), color: new THREE.Color(4.5, 2.2, 0.7), size: 16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
haloM.visible = false;

function addLamp(g, x, y, z, pts, ox, oy, oz) {
  add(g, G.cyl, stone, 0.3, 3.6, 0.3, x, y + 1.8, z);
  add(g, G.cyl, goldM, 0.6, 0.4, 0.6, x, y + 3.8, z);
  add(g, G.sph, glowM, 0.38, 0.7, 0.38, x, y + 4.4, z);
  pts.push(ox + x, oy + y + 4.5, oz + z);
}
function lampRing(g, n, radius, y, pts, ox, oy, oz) {
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; addLamp(g, Math.cos(a) * radius, y, Math.sin(a) * radius, pts, ox, oy, oz); }
}

const NGR = 2200, NFL = 320;
function meadowTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  if (kind === 'grass') {
    for (let i = 0; i < 16; i++) {
      const bx = 14 + (i / 15) * 100, h = 60 + Math.random() * 62, l = 170 + Math.floor(Math.random() * 85);
      x.fillStyle = `rgb(${l},${l},${l})`;
      x.beginPath(); x.moveTo(bx - 4, 128); x.quadraticCurveTo(bx + (Math.random() - 0.5) * 20, 128 - h * 0.6, bx + (Math.random() - 0.5) * 24, 128 - h); x.quadraticCurveTo(bx + 2, 128 - h * 0.5, bx + 4, 128); x.fill();
    }
  } else {
    x.fillStyle = '#fff';
    for (let k = 0; k < 6; k++) { x.save(); x.translate(64, 64); x.rotate(k * 1.047); x.beginPath(); x.ellipse(0, -24, 13, 24, 0, 0, 6.283); x.fill(); x.restore(); }
    x.fillStyle = '#c8c8c8'; x.beginPath(); x.arc(64, 64, 10, 0, 6.283); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function crossQuad(w, h) {
  const a = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
  const g = mergeGeometries([a, a.clone().rotateY(Math.PI / 2)]);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
const grassGeo = crossQuad(1.6, 1.3), flowerGeo = crossQuad(0.9, 0.9).translate(0, 0.35, 0);
const grassM = new THREE.MeshStandardMaterial({ map: meadowTex('grass'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
const flowerM = new THREE.MeshStandardMaterial({ map: meadowTex('flower'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x201008 });
let cloudBankM = null;

// layered, snow-capped mountain ranges on the far horizon
function buildFarMountains() {
  const geos = [], r = mulberry32(77);
  const layers = [
    { R: 2300, h: [380, 620], n: 26, haze: 0.5 },
    { R: 2900, h: [520, 860], n: 32, haze: 0.68 },
  ];
  const HAZE = new THREE.Color(0.78, 0.5, 0.4), ROCK = new THREE.Color(0.36, 0.3, 0.4), SNOW = new THREE.Color(1.0, 0.86, 0.72), col = new THREE.Color();
  for (const L2 of layers) {
    for (let i = 0; i < L2.n; i++) {
      const ang = -Math.PI / 2 + (i / (L2.n - 1) - 0.5) * Math.PI * 1.75 + (r() - 0.5) * 0.08;
      const h = L2.h[0] + r() * (L2.h[1] - L2.h[0]), rad = h * (0.85 + r() * 0.5), seed = r() * 100;
      const g = new THREE.ConeGeometry(rad, h, 14, 10);
      g.translate(0, h / 2 - 60, 0);
      const p = g.attributes.position, c = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k++) {
        let x = p.getX(k), y = p.getY(k), z = p.getZ(k);
        const t = Math.min(1, Math.max(0, (y + 60) / h));
        const a2 = Math.atan2(z, x), nz = vnoise(a2 * 2.5 + seed, t * 5 + seed) - 0.5;
        const rr = Math.hypot(x, z) * (1 + nz * 0.55);
        x = Math.cos(a2) * rr + (r() - 0.5) * 8; z = Math.sin(a2) * rr + (r() - 0.5) * 8;
        y += nz * h * 0.12 * t;
        p.setXYZ(k, x, y, z);
        col.copy(ROCK).lerp(HAZE, L2.haze * (1.1 - t * 0.5));
        col.lerp(SNOW, smooth(0.5, 0.72, t + nz * 0.25) * (1 - L2.haze * 0.35));
        c[k * 3] = col.r; c[k * 3 + 1] = col.g; c[k * 3 + 2] = col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const m = new THREE.Matrix4().makeTranslation(Math.cos(ang) * L2.R, 0, Math.sin(ang) * L2.R);
      g.applyMatrix4(m);
      geos.push(g);
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  return mesh;
}

// ---------- chunks ----------
const L = 240;      // chunk length
const NCH = 7;      // chunks alive
const W = 1400;     // chunk width
const SX = 140, SZ = 30;
const col = new THREE.Color();
const cFloorA = new THREE.Color(0x5f7a35), cFloorB = new THREE.Color(0x9a9250);
const cSand = new THREE.Color(0xc9ad7a), cSnow = new THREE.Color(0xf4eff6);
const cRock = new THREE.Color(0x7d5e4a), cHigh = new THREE.Color(0x9a8296);

class Chunk {
  constructor() {
    this.group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(W, L + 2, SX, SZ);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.ground = new THREE.Mesh(geo, groundM);
    this.ground.castShadow = this.ground.receiveShadow = true;
    this.group.add(this.ground);
    this.props = new THREE.Group();
    this.group.add(this.props);
    this.canopy = new THREE.InstancedMesh(leafyGeo, canopyM, NT);
    this.trunks = new THREE.InstancedMesh(trunkGeo, trunkM, NT);
    this.canopy.setColorAt(0, _c.set(0x335522));
    this.group.add(this.canopy, this.trunks);
    this.canopy.castShadow = true;
    this.pads = new THREE.InstancedMesh(padGeo, padM, NL);
    this.blooms = new THREE.InstancedMesh(bloomGeo, bloomM, NL);
    this.group.add(this.pads, this.blooms);
    this.grass = new THREE.InstancedMesh(grassGeo, grassM, NGR);
    this.flowers = new THREE.InstancedMesh(flowerGeo, flowerM, NFL);
    this.grass.setColorAt(0, _c.set(0x335522)); this.flowers.setColorAt(0, _c.set(0xffffff));
    this.group.add(this.grass, this.flowers);
    this.lampPts = [];
    this.halos = new THREE.Points(new THREE.BufferGeometry(), haloM);
    this.halos.frustumCulled = false;
    this.group.add(this.halos);
    this.rockSets = [];
    const rm = ASSETS && ASSETS.models;
    if (rm) {
      for (const [m, n] of [[rm.boulder, 3], [rm.rockFace, 3], [rm.cliff2, 1]]) {
        if (!m) continue;
        const im = new THREE.InstancedMesh(m.geo, m.mat, n);
        im.castShadow = this.rockSets.length > 0; im.receiveShadow = true;
        this.group.add(im);
        this.rockSets.push({ im, m, n });
      }
    }
    this.rings = [];
    this.merged = [];
    this.zc = 0;
  }

  addMeadow(rng, zc, foot) {
    const spots = [0.95, 0.12, 0.15, 0.0, 0.76, 0.02];
    const fill = (im, n, kind) => {
      for (let i = 0; i < n; i++) {
        const lz = (rng() - 0.5) * L, wz = zc + lz;
        const x = riverX(wz) + (rng() - 0.5) * (rng() < 0.6 ? 130 : 440);
        const y = terrainHeight(x, wz);
        const clear = y > -1.2 && y < 45 && foot.every((f) => Math.hypot(f.x - x, f.lz - lz) > f.r);
        const s = clear ? (kind === 'g' ? 1.6 + rng() * 2.2 : 0.9 + rng() * 1.2) : 0;
        _o.rotation.set(0, rng() * 6.28, 0);
        _o.position.set(x, y - 0.1, lz);
        _o.scale.set(s, s * (0.8 + rng() * 0.5), s);
        _o.updateMatrix();
        im.setMatrixAt(i, _o.matrix);
        if (kind === 'g') _c.setHSL(0.17 + rng() * 0.13, 0.5 + rng() * 0.2, 0.28 + rng() * 0.2);
        else { const h = spots[Math.floor(rng() * spots.length)]; _c.setHSL(h, h === 0 ? 0 : 0.85, h === 0 ? 0.92 : 0.58); }
        im.setColorAt(i, _c);
      }
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    };
    fill(this.grass, NGR, 'g');
    fill(this.flowers, NFL, 'f');
    // cloud banks drifting around the floating islands
    if (!cloudBankM) cloudBankM = new THREE.SpriteMaterial({ map: dustTex(), color: new THREE.Color(1.5, 1.15, 1.1), transparent: true, opacity: 0.32, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(cloudBankM), w = 220 + rng() * 260;
      sp.scale.set(w, w * 0.32, 1);
      sp.position.set((rng() - 0.5) * 520, 85 + rng() * 95, (rng() - 0.5) * L);
      this.props.add(sp);
    }
  }

  addScenery(rng, zc, foot) {
    // floating islands
    const nF = rng() < 0.75 ? (rng() < 0.4 ? 2 : 1) : 0;
    for (let i = 0; i < nF; i++) {
      const fx0 = (rng() < 0.5 ? -1 : 1) * (30 + rng() * 140), fy0 = 105 + rng() * 60, fz0 = (rng() - 0.5) * L * 0.8;
      const f = makeFloater(rng, 14 + rng() * 12, fx0, fy0, fz0, this.lampPts);
      f.position.set(fx0, fy0, fz0);
      this.props.add(f);
    }
    // stone bridge over the river
    if (rng() < 0.7) {
      const lz = (rng() - 0.5) * L * 0.7;
      const b = makeBridge(50, this.lampPts, riverX(zc + lz), lz);
      b.position.set(riverX(zc + lz), 0, lz);
      this.props.add(b);
    }
    // mist banks along the river
    if (!mist2M) mist2M = new THREE.SpriteMaterial({ map: dustTex(), color: MIST_DAY.clone(), transparent: true, opacity: 0.3, depthWrite: false });
    for (let i = 0; i < 7; i++) {
      const lz = (rng() - 0.5) * L, sp = new THREE.Sprite(mist2M), sc = 90 + rng() * 80;
      sp.scale.set(sc, sc * 0.28, 1);
      sp.position.set(riverX(zc + lz) + (rng() - 0.5) * 60, 2 + rng() * 9, lz);
      this.props.add(sp);
    }
    // lotus flowers on the water
    for (let i = 0; i < NL; i++) {
      const lz = (rng() - 0.5) * L, wz = zc + lz;
      const x = riverX(wz) + (rng() < 0.5 ? -1 : 1) * (2 + rng() * 13);
      const ok = terrainHeight(x, wz) < WATER_Y - 0.4;
      const s = ok ? 1.1 + rng() * 1.3 : 0;
      _o.rotation.set(0, rng() * 6, 0);
      _o.position.set(x, WATER_Y + 0.08, lz); _o.scale.set(s, 1, s); _o.updateMatrix();
      this.pads.setMatrixAt(i, _o.matrix);
      _o.position.y = WATER_Y + 0.12; _o.scale.setScalar(rng() < 0.5 ? s * 0.8 : 0); _o.updateMatrix();
      this.blooms.setMatrixAt(i, _o.matrix);
    }
    this.pads.instanceMatrix.needsUpdate = this.blooms.instanceMatrix.needsUpdate = true;
    this.pads.computeBoundingSphere(); this.blooms.computeBoundingSphere();
  }

  mergeProps() {
    this.halos.geometry.dispose();
    this.halos.geometry = new THREE.BufferGeometry();
    this.halos.geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.lampPts, 3));
    for (const m of this.merged) { m.geometry.dispose(); this.group.remove(m); }
    this.merged.length = 0;
    this.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.props.matrixWorld).invert();
    const byMat = new Map(), used = [];
    this.props.traverse((o) => {
      if (!o.isMesh || o.userData.keep || o.material.isShaderMaterial) return;
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g);
      used.push(o);
    });
    for (const [mat, geos] of byMat) {
      const mg = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!mg) continue;
      const mesh = new THREE.Mesh(mg, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      this.merged.push(mesh);
    }
    for (const o of used) o.parent.remove(o);
  }

  build(index) {
    const zc = -(index + 0.5) * L;
    this.zc = zc;
    this.group.position.z = zc;
    const rng = mulberry32(index * 9973 + 17);

    // terrain
    const pos = this.ground.geometry.attributes.position;
    const colA = this.ground.geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i) + zc;
      const y = terrainHeight(x, z);
      pos.setY(i, y);
      col.copy(cFloorA).lerp(cFloorB, vnoise(x * 0.02, z * 0.02));
      col.lerp(cRock, smooth(30, 100, y));
      col.lerp(cHigh, smooth(90, 230, y));
      col.lerp(cSnow, smooth(125, 205, y));
      col.lerp(cSand, 1 - smooth(-4, 2.5, y));
      colA.setXYZ(i, col.r, col.g, col.b);
    }
    pos.needsUpdate = true;
    colA.needsUpdate = true;
    this.ground.geometry.computeVertexNormals();
    this.ground.geometry.computeBoundingSphere();

    // props
    this.props.clear();
    this.lampPts.length = 0;
    this.rings.length = 0;
    const zMin = zc - L / 2, zMax = zc + L / 2;

    const foot = [];
    // cliff islands carrying palaces, with waterfalls
    const nMesa = rng() < 0.8 ? (rng() < 0.4 ? 2 : 1) : 0;
    for (let i = 0; i < nMesa; i++) {
      const side = i === 0 ? (rng() < 0.5 ? -1 : 1) : -foot[0].side;
      const x = side * (95 + rng() * 50);
      const lz = (rng() - 0.5) * L * 0.7;
      const r = 26 + rng() * 12;
      this.props.add(makeMesa(rng, side, x, zc + lz, lz, r, 55 + rng() * 40, this.lampPts));
      foot.push({ x, lz, r: r * 1.35, side });
    }
    // temples
    const nTemples = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < nTemples; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const x = side * (75 + rng() * 70);
      const lz = (rng() - 0.5) * L * 0.8;
      const size = 26 + rng() * 18;
      if (foot.some((f) => Math.hypot(f.x - x, f.lz - lz) < f.r + size)) continue;
      const t = makeTemple(rng, size);
      t.position.set(x, terrainHeight(x, zc + lz), lz);
      t.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      foot.push({ x, lz, r: size * 1.35 });
      this.props.add(t);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * 6.283, lx = x + Math.cos(a) * size * 1.08, lzz = lz + Math.sin(a) * size * 1.08;
        addLamp(this.props, lx, terrainHeight(lx, zc + lzz), lzz, this.lampPts, 0, 0, 0);
      }
    }

    // avenue of lamp pillars
    if (rng() < 0.45) {
      for (let lz = -L / 2 + 15; lz < L / 2; lz += 30) {
        for (const s of [-1, 1]) {
          const x = s * 26;
          const y0 = terrainHeight(x, zc + lz);
          const p = new THREE.Group();
          add(p, G.cyl, stone, 1.6, 22, 1.6, 0, 11, 0);
          add(p, G.box, stoneDark, 3.6, 1.2, 3.6, 0, 0.6, 0);
          add(p, G.box, stoneDark, 3.2, 1.4, 3.2, 0, 22, 0);
          const dm = ASSETS && ASSETS.models.diya;
          if (dm) {
            const d = new THREE.Mesh(dm.geo, dm.mat);
            d.scale.setScalar(dm.unit * 2.6); d.position.y = 22.7; d.castShadow = true;
            p.add(d);
            add(p, G.sph, glowM, 0.55, 0.9, 0.55, 0, 25.0, 0);
          } else add(p, G.sph, glowM, 1.3, 1.0, 1.3, 0, 23.6, 0);
          p.position.set(x, y0, lz);
          this.props.add(p);
          this.lampPts.push(x, y0 + 25.2, lz);
        }
      }
    }

    // groves of trees on the valley floor, kept clear of temples
    const trng = mulberry32(index * 7919 + 5);
    for (let i = 0; i < NT; i++) {
      const side = trng() < 0.5 ? -1 : 1;
      const x = side * (30 + trng() * 200);
      const lz = (trng() - 0.5) * L;
      const y = terrainHeight(x, zc + lz);
      const clear = foot.every((f) => Math.hypot(f.x - x, f.lz - lz) > f.r);
      const sc = clear && y < 55 && y > -1 && Math.abs(x - pathX(zc + lz)) > 6 ? 3 + trng() * 4.5 : 0;
      _o.rotation.set(0, trng() * 6, 0);
      _o.position.set(x, y + sc * 0.6, lz);
      _o.scale.set(sc * 0.35, sc * 1.2, sc * 0.35);
      _o.updateMatrix();
      this.trunks.setMatrixAt(i, _o.matrix);
      _o.position.set(x, y + sc * 1.7, lz);
      _o.scale.set(sc * 0.95, sc * 0.75, sc * 0.95);
      _o.updateMatrix();
      this.canopy.setMatrixAt(i, _o.matrix);
      const pr = trng();
      if (pr < 0.68) _c.setHSL(0.22 + trng() * 0.08, 0.5, 0.34 + trng() * 0.14);
      else if (pr < 0.88) _c.setHSL(0.86 + trng() * 0.08, 0.55, 0.62 + trng() * 0.1);
      else _c.setHSL(0.08 + trng() * 0.05, 0.75, 0.5 + trng() * 0.1);
      this.canopy.setColorAt(i, _c);
    }
    this.canopy.instanceMatrix.needsUpdate = this.trunks.instanceMatrix.needsUpdate = true;
    this.canopy.instanceColor.needsUpdate = true;
    this.canopy.computeBoundingSphere();
    this.trunks.computeBoundingSphere();

    this.addScenery(rng, zc, foot);
    this.addMeadow(rng, zc, foot);
    for (let lz = -L / 2 + 6; lz < L / 2; lz += 8) {
      for (const s of [-1, 1]) {
        const wz = zc + lz, x = riverX(wz) + s * (17 + (rng() - 0.5) * 3), y = terrainHeight(x, wz);
        if (y > -1) addLamp(this.props, x, y, lz, this.lampPts, 0, 0, 0);
      }
    }

    // real rock models: boulders on the river banks, rock faces and cliffs on the valley walls
    const rrng = mulberry32(index * 4423 + 9);
    this.rockSets.forEach(({ im, m, n }, k) => {
      for (let i = 0; i < n; i++) {
        let x, hgt;
        const side = rrng() < 0.5 ? -1 : 1;
        const lz = (rrng() - 0.5) * L;
        if (k === 0) { x = riverX(zc + lz) + (rrng() < 0.5 ? -1 : 1) * (9 + rrng() * 22); hgt = 2.5 + rrng() * 6; }
        else if (k === 1) { x = side * (62 + rrng() * 40); hgt = 25 + rrng() * 30; }
        else { x = side * (120 + rrng() * 70); hgt = 70 + rrng() * 50; }
        const y = terrainHeight(x, zc + lz);
        const ok = foot.every((f) => Math.hypot(f.x - x, f.lz - lz) > f.r + hgt * 0.3);
        const sc = ok ? hgt * m.unit : 0;
        _o.position.set(x, y - hgt * 0.12, lz);
        _o.rotation.set(0, side > 0 && k > 0 ? Math.PI / 2 + (rrng() - 0.5) : rrng() * 6.28, 0);
        _o.scale.setScalar(sc);
        _o.updateMatrix();
        im.setMatrixAt(i, _o.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    });

    // ruined columns & blocks
    for (let i = 0; i < 16; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const x = side * (32 + rng() * 70);
      const lz = (rng() - 0.5) * L;
      const y0 = terrainHeight(x, zc + lz);
      if (y0 < -1) continue;
      const h = 4 + rng() * 14;
      const c = add(this.props, G.cyl, stone, 1.3 + rng(), h, 1.3 + rng(), x, y0 + h / 2 - 1, lz);
      c.rotation.set((rng() - 0.5) * 0.25, rng() * 3, (rng() - 0.5) * 0.25);
      if (rng() < 0.5) add(this.props, G.box, stoneDark, 3 + rng() * 3, 2 + rng() * 2, 3 + rng() * 3, x + 5, y0 + 1, lz + 4).rotation.y = rng() * 3;
    }

    // rings + gates along the flight path
    const STEP = 60;
    const mFrom = Math.ceil(-zMax / STEP), mTo = Math.floor(-zMin / STEP);
    for (let m = mFrom; m <= mTo; m++) {
      if (m < 2) continue;
      const wz = -m * STEP;
      const jx = (hash(m * 3.1) - 0.5) * 14, jy = (hash(m * 7.7) - 0.5) * 12;
      const x = pathX(wz) + jx, y = Math.max(terrainHeight(x, wz) + 16, pathY(wz) + jy);
      const ring = new THREE.Mesh(G.ring, ringM);
      ring.userData.keep = true;
      ring.position.set(x, y, wz - zc);
      this.props.add(ring);
      this.rings.push({ mesh: ring, lz: wz - zc, x, y, collected: false, t: 0 });

      if (m % 4 === 0) {
        const gy = terrainHeight(x, wz);
        const gate = makeGate(34, y + 15 - gy);
        gate.position.set(x, gy, wz - zc);
        this.props.add(gate);
      }
    }
  }
}

export function dustTex() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

// ---------- world ----------
export class World {
  constructor(scene, assets) {
    this.scene = scene;
    ASSETS = assets;
    tU.tGrass.value = assets.tex.grass;
    tU.tRock.value = assets.tex.rock;
    // orient the HDR so the sun sits ahead of the player (-z), a little to the left
    const phiT = Math.atan2(-1, -0.2);
    const rot = assets.sun.phi - phiT;
    const th = Math.asin(assets.sun.dir.y);
    this.hdrRot = rot;
    scene.background = assets.hdr;
    scene.environment = assets.hdr;
    scene.backgroundRotation.set(0, rot, 0);
    scene.environmentRotation.set(0, rot, 0);
    waterM.uniforms.envTex.value = assets.hdr;
    waterM.uniforms.envRot.value = rot;
    const hc = assets.horizon.clone();
    hc.multiplyScalar(0.26 / (0.2126 * hc.r + 0.7152 * hc.g + 0.0722 * hc.b));
    hc.r = Math.min(hc.r, 0.9); hc.g = Math.min(hc.g * 0.9, 0.5); hc.b = Math.min(hc.b * 0.75, 0.36);
    FOGC.copy(hc);
    this.chunks = [];
    for (let i = 0; i < NCH; i++) {
      const c = new Chunk();
      c.build(i - 1);
      c.mergeProps();
      scene.add(c.group);
      this.chunks.push(c);
    }
    this.maxIndex = NCH - 2;

    // sky dome with sun
    this.sunDir = new THREE.Vector3(Math.cos(phiT) * Math.cos(th), Math.sin(th), Math.sin(phiT) * Math.cos(th));
    waterM.uniforms.sunDir.value.copy(this.sunDir);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { sunDir: { value: this.sunDir } },
        vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: `
          varying vec3 vD; uniform vec3 sunDir;
          void main(){
            vec3 d = normalize(vD);
            float h = max(d.y, 0.0);
            vec3 horizon = vec3(0.95, 0.62, 0.36);
            vec3 mid = vec3(0.55, 0.32, 0.42);
            vec3 zenith = vec3(0.08, 0.10, 0.30);
            vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
            c = mix(c, zenith, smoothstep(0.15, 0.8, h));
            float s = max(dot(d, normalize(sunDir)), 0.0);
            c += vec3(1.0, 0.6, 0.3) * pow(s, 6.0) * 0.35;
            c += vec3(1.0, 0.8, 0.5) * pow(s, 60.0) * 0.6;
            c += vec3(1.0, 0.92, 0.75) * pow(s, 1800.0) * 6.0;
            gl_FragColor = vec4(c, 1.0);
          }`,
      })
    );
    this.sky.renderOrder = -10;
    // (sky dome replaced by the HDR background)

    // river / lakes
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2), waterM);
    this.water.position.y = WATER_Y;
    this.water.frustumCulled = false;
    scene.add(this.water);

    // clouds lit by the low sun
    const cc = document.createElement('canvas'); cc.width = 256; cc.height = 96;
    const cx = cc.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const x = 50 + Math.random() * 156, y = 38 + (Math.random() - 0.5) * 26, r = 22 + Math.random() * 26;
      const g = cx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, 256, 96);
    }
    const cloudTex = new THREE.CanvasTexture(cc);
    this.clouds = [];
    const tints = [new THREE.Color(1.5, 0.95, 0.7), new THREE.Color(1.2, 0.8, 0.75), new THREE.Color(0.9, 0.65, 0.75)];
    for (let i = 0; i < 44; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, color: tints[i % 3], fog: false, transparent: true, opacity: 0.5 + Math.random() * 0.3, depthWrite: false,
      }));
      const w = 500 + Math.random() * 600;
      sp.scale.set(w, w * 0.3, 1);
      sp.position.set((Math.random() - 0.5) * 3200, 150 + Math.random() * 260, -Math.random() * 2800 + 400);
      this.clouds.push(sp);
    }

    // drifting golden dust
    const n = 500;
    this.dustOff = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.dustOff[i * 3] = (Math.random() - 0.5) * 120;
      this.dustOff[i * 3 + 1] = (Math.random() - 0.5) * 70;
      this.dustOff[i * 3 + 2] = -Math.random() * 220 + 20;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({
      color: new THREE.Color(1.6, 1.1, 0.6), size: 0.45, map: dustTex(), alphaTest: 0.01, transparent: true, opacity: 0.6,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    this.far = buildFarMountains();
    scene.add(this.far);

    // drifting blossom petals
    const NP = 180;
    this.petalOff = new Float32Array(NP * 3);
    for (let i = 0; i < NP; i++) { this.petalOff[i * 3] = (Math.random() - 0.5) * 140; this.petalOff[i * 3 + 1] = (Math.random() - 0.5) * 90; this.petalOff[i * 3 + 2] = -Math.random() * 260 + 30; }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 3), 3));
    this.petals = new THREE.Points(pg, new THREE.PointsMaterial({ color: new THREE.Color(2.2, 0.9, 1.3), size: 0.65, map: dustTex(), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.petals.frustumCulled = false;
    scene.add(this.petals);

    // rising sky lanterns (night only)
    const NLN = 150;
    this.lanternOff = new Float32Array(NLN * 3);
    for (let i = 0; i < NLN; i++) { this.lanternOff[i * 3] = (Math.random() - 0.5) * 230; this.lanternOff[i * 3 + 1] = -30 + Math.random() * 120; this.lanternOff[i * 3 + 2] = -Math.random() * 330 + 30; }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NLN * 3), 3));
    this.lanterns = new THREE.Points(lg, new THREE.PointsMaterial({ color: new THREE.Color(3.4, 1.7, 0.55), size: 5, map: dustTex(), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lanterns.frustumCulled = false;
    this.lanterns.visible = false;
    scene.add(this.lanterns);
    this.initModes(assets);
  }

  initModes(a) {
    const phiT = Math.atan2(-1, -0.2);
    const mk = (s, fog) => {
      const th = Math.asin(s.sun.dir.y);
      return { hdr: s.hdr, rot: s.sun.phi - phiT, fog, dir: new THREE.Vector3(Math.cos(phiT) * Math.cos(th), Math.sin(th), Math.sin(phiT) * Math.cos(th)) };
    };
    this.modes = { day: mk({ hdr: a.hdr, sun: a.sun }, FOGC.clone()), night: mk(a.night, new THREE.Color(0.05, 0.07, 0.16)) };
    const nd = new THREE.Vector3(-0.3, 0.5, -0.85).normalize();
    this.modes.night.dir.copy(nd);
    this.modes.night.rot = 0;
    this.moon = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(70, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 2.8, 3.2), fog: false, depthWrite: false }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex(), color: new THREE.Color(0.7, 0.8, 1.4), transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    glow.scale.set(900, 900, 1);
    this.moon.add(disc, glow);
    this.moon.visible = false;
    this.scene.add(this.moon);
    this.mode = 'day';
  }

  setMode(m) {
    const o = this.modes[m], night = m === 'night';
    this.mode = m;
    this.moon.visible = night;
    haloM.visible = night;
    this.lanterns.visible = night;
    this.petals.visible = !night;
    this.far.material.color.setRGB(...(night ? [0.16, 0.2, 0.42] : [1, 1, 1]));
    if (cloudBankM) cloudBankM.color.setRGB(...(night ? [0.3, 0.38, 0.75] : [1.5, 1.15, 1.1]));
    const sc = this.scene;
    sc.background = o.hdr; sc.environment = o.hdr;
    sc.backgroundRotation.set(0, o.rot, 0); sc.environmentRotation.set(0, o.rot, 0);
    waterM.uniforms.envTex.value = o.hdr; waterM.uniforms.envRot.value = o.rot;
    waterM.uniforms.sunDir.value.copy(o.dir);
    this.sunDir.copy(o.dir);
    FOGC.copy(o.fog);
    if (sc.fog) sc.fog.color.copy(o.fog);
    glowM.color.setRGB(...(night ? [4.5, 2.4, 0.7] : [1.6, 0.85, 0.25]));
    ringM.emissiveIntensity = night ? 2.2 : 0.8;
    goldM.emissiveIntensity = night ? 1.0 : 0.4;
    bloomM.emissiveIntensity = night ? 1.3 : 0.5;
    this.dust.material.color.setRGB(...(night ? [2.6, 2.2, 0.6] : [1.6, 1.1, 0.6]));
    this.dust.material.size = night ? 0.8 : 0.45;
    if (mist2M) mist2M.color.copy(night ? MIST_NIGHT : MIST_DAY);
    if (mistMat) mistMat.color.setRGB(...(night ? [0.5, 0.6, 1.0] : [1.3, 1.1, 0.95]));
  }

  update(dt, camPos, speed) {
    for (const c of this.chunks) {
      const near = Math.abs(camPos.z - c.zc) < 800;
      for (const rs of c.rockSets) rs.im.visible = near;
      if (c.zc - camPos.z > L * 1.6) { this.maxIndex += 1; c.build(this.maxIndex); c.mergeProps(); }
      for (const r of c.rings) {
        if (r.collected && r.t < 1) {
          r.t = Math.min(1, r.t + dt * 2.2);
          r.mesh.scale.setScalar(1 + r.t * 1.8);
          r.mesh.visible = r.t < 1;
        } else if (!r.collected) r.mesh.rotation.z += dt * 0.6;
      }
    }
    this.sky.position.copy(camPos);
    this.far.position.set(camPos.x, 0, camPos.z);
    {
      const o = this.petalOff, p = this.petals.geometry.attributes.position, t = performance.now() / 1000;
      for (let i = 0; i < o.length; i += 3) {
        o[i + 2] += speed * dt * 0.8; o[i] += Math.sin(t * 0.8 + i) * dt * 4; o[i + 1] -= dt * 2;
        if (o[i + 2] > 30) o[i + 2] -= 290;
        if (o[i + 1] < -45) o[i + 1] += 90;
        p.setXYZ(i / 3, camPos.x + o[i], camPos.y + o[i + 1], camPos.z + o[i + 2]);
      }
      p.needsUpdate = true;
    }
    if (this.lanterns.visible) {
      const o = this.lanternOff, p = this.lanterns.geometry.attributes.position, tt = performance.now() / 1000;
      for (let i = 0; i < o.length; i += 3) {
        o[i + 1] += dt * 2.4; o[i + 2] += speed * dt * 0.9; o[i] += Math.sin(tt * 0.4 + i) * dt * 1.5;
        if (o[i + 2] > 30) o[i + 2] -= 360;
        if (o[i + 1] > 90) o[i + 1] -= 120;
        p.setXYZ(i / 3, camPos.x + o[i], camPos.y + o[i + 1], camPos.z + o[i + 2]);
      }
      p.needsUpdate = true;
    }
    if (this.mode === 'night') { this.moon.position.copy(camPos).addScaledVector(this.sunDir, 2800); this.moon.children[0].lookAt(camPos); }
    this.water.position.set(camPos.x, WATER_Y, camPos.z);
    waterM.uniforms.time.value += dt;
    wfM.uniforms.time.value += dt;
    for (const c of this.clouds) {
      if (c.position.z > camPos.z + 500) { c.position.z -= 3000 + Math.random() * 300; c.position.x = camPos.x + (Math.random() - 0.5) * 3200; }
    }

    const p = this.dust.geometry.attributes.position, o = this.dustOff;
    for (let i = 0; i < o.length; i += 3) {
      o[i + 2] += speed * dt;
      if (o[i + 2] > 30) o[i + 2] -= 250;
      p.setXYZ(i / 3, camPos.x + o[i], camPos.y + o[i + 1], camPos.z + o[i + 2]);
    }
    p.needsUpdate = true;
  }

  // returns {hit, miss} counts for rings crossed between prevZ and pos.z
  checkRings(prevZ, pos, radius) {
    let hit = 0, miss = 0;
    for (const c of this.chunks) for (const r of c.rings) {
      if (r.collected || r.missed) continue;
      const wz = c.zc + r.lz;
      if (prevZ >= wz && pos.z < wz) {
        if (Math.hypot(pos.x - r.x, pos.y - r.y) < radius) { r.collected = true; hit++; }
        else { r.missed = true; miss++; }
      }
    }
    return { hit, miss };
  }
}
