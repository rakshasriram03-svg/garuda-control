import * as THREE from 'three';
import { P } from './city.js';

// A crowd of citizens walking along the streets. They flee from Hanuman when he comes close.
// Each person lives on a street line: axis 0 walks along z on a vertical street (x is fixed),
// axis 1 walks along x on a horizontal street (z is fixed).
const CLOTH = [0xf08a1d, 0xffffff, 0xd8302a, 0x2f8f4e, 0x2e5fc2, 0xf2c230, 0xb04aa0, 0xe8d8b8];
const SKIN = [0xc98a5e, 0xa86a42, 0xdaa174, 0x8a5634];

export class Crowd {
  constructor(scene, count = 2400, radius = 210) {
    this.n = count; this.radius = radius;
    this.axis = new Uint8Array(count);
    this.line = new Float32Array(count); this.s = new Float32Array(count); this.dir = new Float32Array(count);
    this.spd = new Float32Array(count); this.ph = new Float32Array(count); this.turnK = new Int32Array(count).fill(-9999);
    this.scared = new Float32Array(count);

    const bodyG = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8), headG = new THREE.SphereGeometry(0.24, 8, 6);
    this.bodies = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
    this.heads = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.bodies.setColorAt(i, c.setHex(CLOTH[Math.floor(Math.random() * CLOTH.length)]));
      this.heads.setColorAt(i, c.setHex(SKIN[Math.floor(Math.random() * SKIN.length)]));
      this.respawn(i, 0, 0, 10, radius);
    }
    this.bodies.frustumCulled = this.heads.frustumCulled = false;
    this.bodies.castShadow = false;
    scene.add(this.bodies, this.heads);
    this.o = new THREE.Object3D();
    this.fleeing = 0;
  }

  respawn(i, cx, cz, rMin, rMax) {
    const a = Math.random() * 6.283, r = rMin + Math.random() * (rMax - rMin);
    const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r, axis = Math.random() < 0.5 ? 0 : 1;
    const lane = (Math.random() - 0.5) * 10;
    this.axis[i] = axis;
    this.line[i] = Math.round((axis === 0 ? px : pz) / P) * P + lane;
    this.s[i] = axis === 0 ? pz : px;
    this.dir[i] = Math.random() < 0.5 ? -1 : 1;
    this.spd[i] = 1.3 + Math.random() * 1.1;
    this.ph[i] = Math.random() * 6.283;
    this.scared[i] = 0;
  }

  // player: {x, y, z}
  update(dt, player, fires) {
    const o = this.o, R2 = this.radius * this.radius * 1.3;
    const fearR = player.y > 6 ? 16 : 26;
    let fleeing = 0;
    for (let i = 0; i < this.n; i++) {
      const axis = this.axis[i];
      let x = axis === 0 ? this.line[i] : this.s[i], z = axis === 0 ? this.s[i] : this.line[i];
      const dx = x - player.x, dz = z - player.z, d2 = dx * dx + dz * dz;
      if (d2 > R2) { this.respawn(i, player.x, player.z, 60, this.radius); continue; }

      let speed = this.spd[i];
      let rx = dx, rz = dz, scare = d2 < fearR * fearR;      // scatter away from Hanuman...
      if (fires) for (let f = 0; f < fires.length; f += 2) {   // ...and from fires
        const fx = x - fires[f], fz = z - fires[f + 1];
        if (fx * fx + fz * fz < 400) { scare = true; rx = fx; rz = fz; break; }
      }
      if (scare) this.scared[i] = 3;
      if (this.scared[i] > 0) {
        this.scared[i] -= dt;
        const away = axis === 0 ? rz : rx;
        this.dir[i] = Math.abs(away) < 0.5 ? this.dir[i] : Math.sign(away);
        speed = 8.5;
        fleeing++;
      }
      this.s[i] += this.dir[i] * speed * dt;

      // at an intersection: sometimes turn onto the cross street
      const k = Math.round(this.s[i] / P), dk = Math.abs(this.s[i] - k * P);
      if (dk < 1.3 && this.turnK[i] !== k * 1000 + axis && Math.random() < (this.scared[i] > 0 ? 0.25 : 0.4) * dt * speed / 2.6) {
        this.turnK[i] = k * 1000 + axis;
        const oldLine = this.line[i];
        this.axis[i] = 1 - axis;
        this.line[i] = k * P + (Math.random() - 0.5) * 10;
        this.s[i] = oldLine;
        const away = this.axis[i] === 0 ? this.s[i] - player.z : this.s[i] - player.x;
        this.dir[i] = this.scared[i] > 0 ? (Math.abs(away) < 0.5 ? 1 : Math.sign(away)) : (Math.random() < 0.5 ? -1 : 1);
      }

      this.ph[i] += dt * speed * 2.6;
      const bob = Math.abs(Math.sin(this.ph[i])) * (speed > 5 ? 0.12 : 0.05);
      x = this.axis[i] === 0 ? this.line[i] : this.s[i]; z = this.axis[i] === 0 ? this.s[i] : this.line[i];
      const yaw = this.axis[i] === 0 ? (this.dir[i] > 0 ? 0 : Math.PI) : (this.dir[i] > 0 ? Math.PI / 2 : -Math.PI / 2);
      o.position.set(x, 0.72 + bob, z); o.rotation.set(speed > 5 ? 0.25 : 0, yaw, 0); o.scale.setScalar(1); o.updateMatrix();
      this.bodies.setMatrixAt(i, o.matrix);
      o.position.set(x, 1.5 + bob, z); o.rotation.set(0, yaw, 0); o.updateMatrix();
      this.heads.setMatrixAt(i, o.matrix);
    }
    this.bodies.instanceMatrix.needsUpdate = true; this.heads.instanceMatrix.needsUpdate = true;
    this.fleeing = fleeing;
  }
}
