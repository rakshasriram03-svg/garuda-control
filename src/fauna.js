import * as THREE from 'three';
import { pathX, riverX, WATER_Y } from './world.js';

const wingTri = new THREE.BufferGeometry();
wingTri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, 0, 0, -0.35, 1.7, 0, 0.1], 3));
wingTri.computeVertexNormals();

function leaf(len, wid) {
  const s = new THREE.Shape();
  s.moveTo(0, -wid * 0.3);
  s.lineTo(len * 0.7, -wid * 0.5);
  s.quadraticCurveTo(len * 1.05, 0, len * 0.7, wid * 0.5);
  s.lineTo(0, wid * 0.3);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(-Math.PI / 2);
  return g;
}

const birdM = new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 1, side: THREE.DoubleSide });
const swanM = new THREE.MeshStandardMaterial({ color: 0xfaf3e6, roughness: 0.6, emissive: 0x4a3a28, side: THREE.DoubleSide });
const beakM = new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.5 });
const bodyG = new THREE.SphereGeometry(1, 10, 8);
const neckG = new THREE.CylinderGeometry(0.13, 0.19, 1.5, 8);
const beakG = new THREE.ConeGeometry(0.09, 0.45, 6);
const swanWingG = leaf(2.8, 1.4);

function makeBird() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(bodyG, birdM); b.scale.set(0.18, 0.16, 0.55); g.add(b);
  const wr = new THREE.Mesh(wingTri, birdM), wl = new THREE.Mesh(wingTri, birdM);
  wl.scale.x = -1; g.add(wr, wl);
  g.scale.setScalar(2.4);
  return { g, wr, wl, kind: 'bird', phase: Math.random() * 6 };
}

function makeSwan() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(bodyG, swanM); b.scale.set(0.7, 0.55, 1.5); g.add(b);
  const neck = new THREE.Mesh(neckG, swanM); neck.position.set(0, 0.85, -1.2); neck.rotation.x = -0.5; g.add(neck);
  const head = new THREE.Mesh(bodyG, swanM); head.scale.setScalar(0.22); head.position.set(0, 1.55, -1.55); g.add(head);
  const beak = new THREE.Mesh(beakG, beakM); beak.rotation.x = -Math.PI / 2; beak.position.set(0, 1.5, -1.9); g.add(beak);
  const tail = new THREE.Mesh(beakG, swanM); tail.scale.set(2, 2, 1); tail.rotation.x = Math.PI / 2; tail.position.set(0, 0.1, 1.7); g.add(tail);
  const wr = new THREE.Mesh(swanWingG, swanM); wr.position.set(0.5, 0.4, -0.1);
  const wl = new THREE.Mesh(swanWingG, swanM); wl.position.set(-0.5, 0.4, -0.1); wl.scale.x = -1;
  g.add(wr, wl);
  g.scale.setScalar(1.8);
  return { g, wr, wl, kind: 'swan', phase: Math.random() * 6 };
}

export class Fauna {
  constructor(scene) {
    this.flocks = [];
    this.t = 0;
    this.ready = false;
    const mk = (kind, n, speed) => {
      const root = new THREE.Group();
      const members = [];
      for (let i = 0; i < n; i++) {
        const m = kind === 'swan' ? makeSwan() : makeBird();
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        const sp = kind === 'swan' ? 6 : 4;
        m.g.position.set(i === 0 ? 0 : side * row * sp, 0, row * sp * 0.9);
        root.add(m.g);
        members.push(m);
      }
      scene.add(root);
      this.flocks.push({ root, members, kind, speed, phase: Math.random() * 6, lat: 0, alt: 0 });
    };
    for (let i = 0; i < 6; i++) mk('bird', 9, 16);
    for (let i = 0; i < 3; i++) mk('swan', 5, 10);
  }

  respawn(f, camZ, initial) {
    const z = camZ - (initial ? 150 : 600) - Math.random() * 800;
    f.root.position.z = z;
    f.lat = (Math.random() - 0.5) * (f.kind === 'swan' ? 14 : 110);
    f.alt = f.kind === 'swan' ? WATER_Y + 6 + Math.random() * 5 : 28 + Math.random() * 55;
  }

  update(dt, cam) {
    this.t += dt;
    for (const f of this.flocks) {
      if (!this.ready || f.root.position.z > cam.z + 140) this.respawn(f, cam.z, !this.ready);
      const z = (f.root.position.z -= f.speed * dt);
      const sway = Math.sin(this.t * 0.3 + f.phase) * (f.kind === 'swan' ? 3 : 12);
      f.root.position.x = (f.kind === 'swan' ? riverX(z) : pathX(z)) + f.lat + sway;
      f.root.position.y = f.alt + Math.sin(this.t * 0.7 + f.phase) * 2;
      const rate = f.kind === 'swan' ? 3.2 : 8;
      for (const m of f.members) {
        const a = Math.sin(this.t * rate + m.phase) * (f.kind === 'swan' ? 0.55 : 0.75);
        m.wr.rotation.z = a;
        m.wl.rotation.z = a;
      }
    }
    this.ready = true;
  }
}
