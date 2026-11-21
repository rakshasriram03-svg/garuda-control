import * as THREE from 'three';
import { CELL, FLAMMABLE } from './city.js';

// ------------------------------------------------------------------ particles (one draw call each)
const VS = `
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  varying float vA; varying vec3 vC; uniform float uScale;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.5, -mv.z);
    vA = aAlpha; vC = aColor;
  }`;
const FS = `
  varying float vA; varying vec3 vC;
  void main(){
    vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0;
    if (r > 1.0) discard;
    float a = 1.0 - r; a *= a;
    gl_FragColor = vec4(vC, a * vA);
  }`;

class Particles {
  constructor(scene, n, additive) {
    this.n = n; this.head = 0;
    const f3 = () => new Float32Array(n * 3), f1 = () => new Float32Array(n);
    this.pos = f3(); this.vel = f3(); this.c0 = f3(); this.c1 = f3(); this.col = f3();
    this.age = f1().fill(1e9); this.life = f1().fill(1); this.s0 = f1(); this.s1 = f1(); this.a0 = f1(); this.size = f1(); this.alpha = f1();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.uniforms = { uScale: { value: 800 } };
    const m = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, a0, c0, c1) {
    const i = this.head++ % this.n, k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.c0[k] = c0[0]; this.c0[k + 1] = c0[1]; this.c0[k + 2] = c0[2];
    this.c1[k] = c1[0]; this.c1[k + 1] = c1[1]; this.c1[k + 2] = c1[2];
  }

  update(dt, accY, drag, uScale) {
    this.uniforms.uScale.value = uScale;
    const { pos, vel, age, life, size, alpha, col, c0, c1 } = this;
    for (let i = 0; i < this.n; i++) {
      if (age[i] >= life[i]) { size[i] = 0; alpha[i] = 0; continue; }
      age[i] += dt;
      const t = Math.min(1, age[i] / life[i]), k = i * 3, dm = Math.max(0, 1 - drag * dt);
      vel[k + 1] += accY * dt; vel[k] *= dm; vel[k + 1] *= dm; vel[k + 2] *= dm;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 8);
      col[k] = c0[k] + (c1[k] - c0[k]) * t; col[k + 1] = c0[k + 1] + (c1[k + 1] - c0[k + 1]) * t; col[k + 2] = c0[k + 2] + (c1[k + 2] - c0[k + 2]) * t;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aColor.needsUpdate = true;
  }
}

const FLAME0 = [1.6, 1.1, 0.35], FLAME1 = [1.2, 0.18, 0.0];
const EMBER0 = [2.4, 1.3, 0.3], EMBER1 = [1.0, 0.1, 0.0];
const SMOKE0 = [0.34, 0.32, 0.3], SMOKE1 = [0.12, 0.12, 0.12];

// ------------------------------------------------------------------ the fire system
// Rules: only wood, thatch and cloth burn. Stone, brick, plaster, roof tile, metal, gold and water never do.
// A building catches fire where Hanuman's burning tail touches it (or his tail whip reaches it), then fire
// spreads to flammable neighbours. Only the flammable parts of a building burn: a brick house loses its
// wooden door, cloth awnings and rooftop thatch, while a timber house burns almost completely.
export class Fire {
  constructor(scene, city) {
    this.city = city; this.scene = scene;
    this.flames = new Particles(scene, 2600, true);
    this.smoke = new Particles(scene, 1600, false);
    this.burning = [];
    this.burned = 0; this.score = 0; this.totalFuel = 0;
    this.light = new THREE.PointLight(0xff7a22, 0, 60, 2);
    scene.add(this.light);
    this.flush = 0; this.whipCool = 0; this.tailAcc = 0;
  }

  // ---- ignition ----
  ignite(b) {
    if (b.state !== 0 || !(b.fuel > 0) || b.chunk.removed) return false;
    b.state = 1; b.progress = 0.02;
    b.dur = 7 + b.fuel * 14 + Math.random() * 3;
    b.nextSpread = Math.random() * 0.4; b.emit = 0;
    // pick points on the flammable parts where the flames will come from
    const rs = b.ranges.filter((r) => FLAMMABLE[r.key]), total = rs.reduce((a, r) => a + r.count, 0), pts = [];
    for (let k = 0; k < 20; k++) {
      let pick = Math.random() * total, r = rs[0];
      for (const q of rs) { if (pick < q.count) { r = q; break; } pick -= q.count; }
      const pa = b.chunk.meshes[r.key].geometry.attributes.position, i = r.start + Math.floor(Math.random() * r.count);
      pts.push(pa.getX(i), pa.getY(i), pa.getZ(i));
    }
    b.firePts = pts;
    this.burning.push(b);
    this.city.setBurn(b, b.progress);
    return true;
  }

  // everything flammable within r (horizontally) of p catches fire
  touch(px, py, pz, r) {
    const c = this.city;
    for (let i = Math.floor((px - r) / CELL); i <= Math.floor((px + r) / CELL); i++) for (let j = Math.floor((pz - r) / CELL); j <= Math.floor((pz + r) / CELL); j++) {
      const a = c.hash.get(i + ',' + j);
      if (a) for (const b of a) if (b.state === 0 && b.fuel > 0 && px > b.x0 - r && px < b.x1 + r && pz > b.z0 - r && pz < b.z1 + r && py < b.top + r + 0.5) this.ignite(b);
    }
  }

  whip(x, z, radius) {
    if (this.whipCool > 0) return false;
    this.whipCool = 1.0;
    const c = this.city;
    for (let i = Math.floor((x - radius) / CELL); i <= Math.floor((x + radius) / CELL); i++) for (let j = Math.floor((z - radius) / CELL); j <= Math.floor((z + radius) / CELL); j++) {
      const a = c.hash.get(i + ',' + j);
      if (a) for (const b of a) {
        if (b.state !== 0 || !(b.fuel > 0)) continue;
        const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
        if (dx * dx + dz * dz < radius * radius) this.ignite(b);
      }
    }
    return true;
  }

  burst(x, y, z, n = 70) {                         // ring of fire for the whip
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283, s = 10 + Math.random() * 8;
      this.flames.emit(x, y + 1, z, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, 0.5 + Math.random() * 0.4, 3.5, 1, 1, EMBER0, EMBER1);
    }
  }

  // positions of the nearest fires (x, z pairs) so the crowd can run from them
  centers(px, pz, max = 16) {
    const list = this.burning.filter((b) => b.state === 1).map((b) => [Math.hypot((b.x0 + b.x1) / 2 - px, (b.z0 + b.z1) / 2 - pz), (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]);
    list.sort((a, b) => a[0] - b[0]);
    const out = new Float32Array(Math.min(max, list.length) * 2);
    for (let i = 0; i < out.length / 2; i++) { out[i * 2] = list[i][1]; out[i * 2 + 1] = list[i][2]; }
    return out;
  }

  // ---- per-frame update ----
  // tail: array of Vector3 (tail chain, last item = tip), uScale: pixels per world unit at distance 1
  update(dt, tail, uScale) {
    this.whipCool = Math.max(0, this.whipCool - dt);
    const tip = tail[tail.length - 1], c = this.city;

    // the tail ignites whatever flammable thing it touches
    for (let i = tail.length - 5; i < tail.length; i++) this.touch(tail[i].x, tail[i].y, tail[i].z, 2.0);

    // burning buildings: progress, spread, flames, smoke
    let alive = 0;
    const throttle = this.burning.length > 60 ? 0.5 : 1;
    for (let k = 0; k < this.burning.length; k++) {
      const b = this.burning[k];
      if (b.chunk.removed) continue;
      if (b.state === 1) b.progress += dt / b.dur;
      if (b.state === 1 && b.progress >= 1) {
        b.state = 2; b.progress = 1; this.burned++; this.score += Math.round(b.fuel * 120);
        c.burnt.add(b.key); c.setBurn(b, 1); b.smokeT = 5;
      } else if (b.state === 1) {
        c.setBurn(b, b.progress);
        b.nextSpread -= dt;
        if (b.nextSpread <= 0) { b.nextSpread = 0.4; this.spread(b); }
        const size = Math.sqrt((b.x1 - b.x0) * (b.z1 - b.z0));
        b.emit += (6 + size * 0.9) * Math.sin(Math.PI * Math.min(1, b.progress * 1.1)) * dt * throttle;
        while (b.emit >= 1) {
          b.emit -= 1;
          const p = b.firePts, i = Math.floor(Math.random() * (p.length / 3)) * 3;
          this.flames.emit(p[i] + (Math.random() - 0.5), p[i + 1] + 0.2, p[i + 2] + (Math.random() - 0.5), (Math.random() - 0.5) * 1.5, 3 + Math.random() * 4, (Math.random() - 0.5) * 1.5, 0.7 + Math.random() * 0.6, 2.6, 0.5, 0.9, FLAME0, FLAME1);
          if (Math.random() < 0.35) this.smoke.emit(p[i], p[i + 1] + 1, p[i + 2], (Math.random() - 0.5) * 2 + 1.5, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 2, 4 + Math.random() * 3, 2.5, 11, 0.38, SMOKE0, SMOKE1);
        }
      }
      if (b.state === 2 && b.smokeT > 0) {
        b.smokeT -= dt;
        if (Math.random() < dt * 5) { const p = b.firePts, i = Math.floor(Math.random() * (p.length / 3)) * 3; this.smoke.emit(p[i], p[i + 1] + 0.5, p[i + 2], 1.2, 2.2, 0.3, 4.5, 2, 9, 0.3, SMOKE0, SMOKE1); }
      }
      if (b.state === 1 || b.smokeT > 0) alive++;
    }
    if (alive < this.burning.length) this.burning = this.burning.filter((b) => !b.chunk.removed && (b.state === 1 || b.smokeT > 0));

    // push changed burn values to the GPU about 10 times a second
    this.flush -= dt;
    if (this.flush <= 0) { this.flush = 0.1; for (const a of c.dirty) a.needsUpdate = true; c.dirty.clear(); }

    // Hanuman's tail is always on fire
    this.tailAcc += dt * 70;
    while (this.tailAcc >= 1) {
      this.tailAcc -= 1;
      const s = tail[tail.length - 1 - Math.floor(Math.random() * 5)];
      this.flames.emit(s.x + (Math.random() - 0.5) * 0.4, s.y + 0.2, s.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.2, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.2, 0.45 + Math.random() * 0.35, 1.7, 0.4, 0.95, FLAME0, FLAME1);
      if (Math.random() < 0.3) this.smoke.emit(s.x, s.y + 0.8, s.z, 0.5, 1.5, 0.3, 2.5, 1.2, 5, 0.25, SMOKE0, SMOKE1);
    }
    this.light.position.set(tip.x, tip.y + 1, tip.z);
    this.light.intensity = 90 + Math.sin(performance.now() * 0.03) * 25 + Math.min(1, this.burning.length / 8) * 60;

    this.flames.update(dt, 2.5, 0.6, uScale);
    this.smoke.update(dt, 0.8, 0.3, uScale);
  }

  // fire jumps to flammable neighbours: strongly across alleys, rarely across a street
  spread(b) {
    const c = this.city, R = 22, fb = b.fuel > 0.25 ? 1 : 0.35;
    for (let i = Math.floor((b.x0 - R) / CELL); i <= Math.floor((b.x1 + R) / CELL); i++) for (let j = Math.floor((b.z0 - R) / CELL); j <= Math.floor((b.z1 + R) / CELL); j++) {
      const a = c.hash.get(i + ',' + j);
      if (!a) continue;
      for (const n of a) {
        if (n === b || n.state !== 0 || !(n.fuel > 0)) continue;
        const gx = Math.max(0, n.x0 - b.x1, b.x0 - n.x1), gz = Math.max(0, n.z0 - b.z1, b.z0 - n.z1), d = Math.hypot(gx, gz);
        if (d > R) continue;
        const fn = n.fuel > 0.25 ? 1 : 0.3;
        const p = (d < 5 ? 0.16 : d < 14 ? 0.018 : 0.004) * fb * fn;
        if (Math.random() < p) this.ignite(n);
      }
    }
  }
}
