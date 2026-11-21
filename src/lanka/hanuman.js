import * as THREE from 'three';

// Placeholder Hanuman built from smooth primitives so the game plays now.
// It is replaced by the real model later; the interface (root, tailGroup, update) stays the same.
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
const M = {
  fur: std(0xd9822b), furDark: std(0xb5651c), face: std(0xf2c08a), cloth: std(0xc4201a, { side: THREE.DoubleSide }),
  gold: std(0xffc23a, { metalness: 0.7, roughness: 0.35, emissive: 0x3a2400 }), dark: std(0x1a1008),
  white: std(0xfff4e0), ember: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.2, 0.2) }),
};

const cap = (r, len, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
};
const sph = (r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
  return m;
};
const grp = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };

export function buildHanuman() {
  const root = new THREE.Group();            // feet on the ground, faces -z
  const lean = grp(0, 2.15, 0); root.add(lean);   // pivot at the hips: leans forward when flying
  const body = grp(); lean.add(body);

  // pelvis + loincloth
  body.add(sph(0.55, M.fur, 0, 0, 0, 1, 0.8, 1));
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.95, 0.75, 20, 1, true), M.cloth);
  cloth.position.y = -0.3; body.add(cloth);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 8, 24), M.gold); belt.rotation.x = Math.PI / 2; belt.position.y = 0.05; body.add(belt);

  // spine, chest, head
  const spine = grp(0, 0.2, 0); body.add(spine);
  spine.add(cap(0.5, 0.55, M.fur, 0, 0.55, 0));
  spine.add(sph(0.72, M.fur, 0, 1.15, -0.05, 1.05, 0.8, 0.85));
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 24), M.gold); sash.position.y = 1.1; sash.rotation.set(Math.PI / 2 - 0.5, 0.2, 0); spine.add(sash);
  const head = grp(0, 1.95, -0.05); spine.add(head);
  head.add(sph(0.5, M.face, 0, 0, 0, 1, 1.05, 1));
  head.add(sph(0.34, M.face, 0, -0.14, -0.38, 1, 0.8, 0.9));                 // muzzle
  head.add(sph(0.54, M.furDark, 0, 0.22, 0.1, 1, 0.65, 1));                    // hair
  for (const s of [-1, 1]) {
    head.add(sph(0.095, M.white, s * 0.2, 0.08, -0.43)); head.add(sph(0.05, M.dark, s * 0.2, 0.08, -0.5));
    head.add(sph(0.17, M.face, s * 0.52, 0.02, 0.05, 0.5, 1, 1));              // ears
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.1), M.dark); brow.position.set(s * 0.2, 0.2, -0.42); brow.rotation.z = -s * 0.25; head.add(brow);
  }
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.55, 14), M.gold); crown.position.set(0, 0.68, 0); head.add(crown);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 24), M.gold); band.rotation.x = Math.PI / 2; band.position.y = 0.38; head.add(band);

  // arms (pivot at the shoulder, hang down)
  const arm = (s) => {
    const sh = grp(s * 0.85, 1.35, 0); spine.add(sh);
    sh.add(sph(0.3, M.fur));
    sh.add(cap(0.22, 0.45, M.fur, 0, -0.45, 0));
    const el = grp(0, -0.9, 0); sh.add(el);
    el.add(cap(0.2, 0.4, M.fur, 0, -0.4, 0));
    const hand = sph(0.26, M.face, 0, -0.85, 0); el.add(hand);
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 16), M.gold); arm.rotation.x = Math.PI / 2; arm.position.y = -0.35; el.add(arm);
    return { sh, el, hand };
  };
  const aL = arm(-1), aR = arm(1);

  // mace (gada) in the right hand
  const mace = grp(0, -0.85, 0); aR.el.add(mace);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 10), M.dark); handle.position.y = -0.2; mace.add(handle);
  mace.add(sph(0.45, M.gold, 0, -1.2, 0));
  mace.rotation.x = -0.4;

  // legs (pivot at the hip, hang down)
  const leg = (s) => {
    const hip = grp(s * 0.38, -0.1, 0); body.add(hip);
    hip.add(cap(0.27, 0.6, M.fur, 0, -0.55, 0));
    const knee = grp(0, -1.05, 0); hip.add(knee);
    knee.add(cap(0.22, 0.55, M.fur, 0, -0.5, 0));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.75), M.furDark); foot.position.set(0, -1.06, -0.15); foot.castShadow = true; knee.add(foot);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 16), M.gold); ring.rotation.x = Math.PI / 2; ring.position.y = -0.85; knee.add(ring);
    return { hip, knee };
  };
  const lL = leg(-1), lR = leg(1);

  // ---- tail: a chain that trails behind him. It lives in world space so it swings with his motion. ----
  const tailGroup = new THREE.Group();
  const N = 15, SEG = 0.62, tailMeshes = [], tailPts = [];
  for (let i = 0; i < N; i++) {
    const r = 0.26 - (i / N) * 0.17;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), i === N - 1 ? M.ember : (i % 4 === 3 ? M.furDark : M.fur));
    m.castShadow = true; tailGroup.add(m); tailMeshes.push(m); tailPts.push(new THREE.Vector3());
  }
  let tailInit = false;

  // ---- poses ----
  const J = { hipL: lL.hip, hipR: lR.hip, kneeL: lL.knee, kneeR: lR.knee, shL: aL.sh, shR: aR.sh, elL: aL.el, elR: aR.el, spine, head, lean };
  const cur = {}; for (const k of Object.keys(J)) cur[k] = { x: 0, z: 0 };
  const tmp = new THREE.Vector3(), attach = new THREE.Vector3(), dir = new THREE.Vector3();
  let phase = 0;

  function pose(mode, t, speed) {
    const P = {};
    const set = (k, x, z = 0) => { P[k] = { x, z }; };
    if (mode === 'fly') {
      const f = Math.sin(t * 9) * 0.12;
      set('lean', -1.35); set('spine', 0.15); set('head', 1.05);
      set('hipL', 0.15 + f); set('hipR', 0.15 - f); set('kneeL', -0.5); set('kneeR', -0.35);
      set('shR', 3.14, 0.1); set('elR', 0.05); set('shL', 0.5, -0.25); set('elL', 0.7);
    } else if (mode === 'air') {
      set('lean', -0.12); set('spine', -0.15); set('head', 0.15);
      set('hipL', 1.0); set('hipR', -0.35); set('kneeL', -1.3); set('kneeR', -0.6);
      set('shL', 2.5, -0.35); set('shR', -0.7, 0.2); set('elL', 0.5); set('elR', 0.9);
    } else {
      const s = Math.sin(phase), run = Math.min(1, speed / 6);
      set('lean', -0.1 * run); set('spine', -0.28 * run); set('head', 0.2 * run);
      set('hipL', s * 1.0 * run); set('hipR', -s * 1.0 * run);
      set('kneeL', -(0.15 + 1.0 * Math.max(0, -s)) * run); set('kneeR', -(0.15 + 1.0 * Math.max(0, s)) * run);
      set('shL', -s * 0.95 * run, -0.12); set('shR', s * 0.95 * run, 0.12);
      set('elL', 0.3 + 0.8 * run); set('elR', 0.3 + 0.8 * run);
    }
    return P;
  }

  function update(dt, st) {
    // st: { mode, speed, yaw, x, y, z, t }
    root.position.set(st.x, st.y, st.z);
    root.rotation.y = -st.yaw;
    if (st.mode === 'run') phase += dt * (6 + st.speed * 0.55);
    const P = pose(st.mode, st.t, st.speed), k = 1 - Math.exp(-dt * 14);
    for (const name of Object.keys(J)) {
      const c = cur[name], p = P[name];
      c.x += (p.x - c.x) * k; c.z += (p.z - c.z) * k;
      J[name].rotation.x = c.x; J[name].rotation.z = c.z;
    }
    body.position.y = st.mode === 'run' ? Math.abs(Math.sin(phase)) * 0.14 : 0;

    // tail follows the rump
    root.updateMatrixWorld(true);
    attach.set(0, -0.15, 0.55); body.localToWorld(attach);
    if (!tailInit) { for (let i = 0; i < N; i++) tailPts[i].copy(attach).add(tmp.set(0, 0, i * SEG)); tailInit = true; }
    tailPts[0].copy(attach);
    const lift = st.mode === 'fly' ? 0.02 : 0.22;
    for (let i = 1; i < N; i++) {
      const prev = tailPts[i - 1], p = tailPts[i];
      dir.copy(p).sub(prev);
      dir.y += lift * (0.25 + i * 0.05) + Math.sin(st.t * 6 + i * 0.7) * 0.03 * (st.mode === 'run' ? 1 : 0.4);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(SEG);
      p.copy(prev).add(dir);
      const gy = st.groundAt ? st.groundAt(p.x, p.z) : 0;      // the tail rests on roofs too
      if (p.y < gy + 0.2) p.y = gy + 0.2;
    }
    for (let i = 0; i < N; i++) tailMeshes[i].position.copy(tailPts[i]);
  }

  // handy for the fire system: where the tail tip is
  const tailTip = () => tailPts[N - 1];
  return { root, tailGroup, update, tailTip, mace, tailPts };
}
