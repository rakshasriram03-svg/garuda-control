import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Controller } from './input.js';
import { buildGaruda } from './garuda.js';
import { World, terrainHeight, dustTex, FOGC } from './world.js';
import { loadAssets } from './assets.js';
import { Fauna } from './fauna.js';

const $ = (id) => document.getElementById(id);
const FOG = 0xe8a56a;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping; // keeps colours true instead of washing them out
renderer.toneMappingExposure = 0.62;
document.body.prepend(renderer.domElement);

// pick a starting quality from the GPU; it is lowered automatically if the game runs slowly
const gpuName = (() => { try { const g = renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''; } catch (err) { return ''; } })();
const lowEnd = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || /SwiftShader|llvmpipe|Software|Basic Render/i.test(gpuName);
const midEnd = /Intel|UHD|Iris|Mali|Adreno|Vega/i.test(gpuName);
let quality = lowEnd ? 0 : midEnd ? 1 : 2;   // 0 low, 1 medium, 2 high

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG, 220, 1600);
const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 4500);

const hemi = new THREE.HemisphereLight(0xffd9a0, 0x3a2a4a, 0.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc880, 2.2);
scene.add(sun, sun.target);
renderer.shadowMap.enabled = quality >= 1;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sun.castShadow = quality >= 1;
sun.shadow.mapSize.set(quality >= 2 ? 2048 : 1024, quality >= 2 ? 2048 : 1024);
Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 1, far: 1000 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
const fill = new THREE.DirectionalLight(0xffe2b0, 0.5); // soft front light so Garuda reads against the sun
fill.position.set(-20, 40, 120);
scene.add(fill);
const glowLight = new THREE.PointLight(0xffa850, 0, 70, 2); // warm lamplight bouncing up onto Garuda at night
scene.add(glowLight);

const assets = await loadAssets();
const world = new World(scene, assets);
scene.fog.color.copy(FOGC);
scene.environmentIntensity = 0.7;
scene.backgroundIntensity = 0.42;
sun.position.copy(world.sunDir).multiplyScalar(500);

const fauna = new Fauna(scene);
const garuda = buildGaruda();
scene.add(garuda.root);
garuda.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(4.5, 20),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
scene.add(shadow);

// post-processing
let scale = quality === 0 ? 1 : quality === 1 ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.75);
const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: quality >= 2 ? 4 : quality === 1 ? 2 : 0 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const rays = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, sun: { value: new THREE.Vector2(0.5, 0.5) }, strength: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 sun; uniform float strength;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 d = (sun - vUv) / 32.0, uv = vUv;
      vec3 acc = vec3(0.0); float w = 1.0;
      for (int i = 0; i < 32; i++) {
        uv += d;
        vec3 s = texture2D(tDiffuse, uv).rgb;
        s *= smoothstep(0.7, 1.6, dot(s, vec3(0.333)));
        acc += s * w; w *= 0.955;
      }
      gl_FragColor = vec4(base.rgb + acc / 32.0 * strength * vec3(1.0, 0.78, 0.5), base.a);
    }`,
});
composer.addPass(rays);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.09, 0.45, 1.7);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) }, texel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float time; uniform vec3 tint; uniform vec2 texel;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec3 nb = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb
              + texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
      c = max(c + (c - nb * 0.25) * 0.6, 0.0);                      // sharpen
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c *= tint;
      c = mix(vec3(l), c, 1.3);
      c *= mix(vec3(0.96, 0.98, 1.06), vec3(1.06, 1.0, 0.92), l);
      c = max(c - 0.012, 0.0) / 0.988;                 // true blacks for OLED
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.4);        // richer contrast
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.85;
      c += (fract(sin(dot(vUv * 800.0 + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.02;
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
const grade = composer.passes[composer.passes.length - 1];

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(scale);
  renderer.setSize(w, h);
  composer.setPixelRatio(scale);
  composer.setSize(w, h);
  grade.uniforms.texel.value.set(1 / (w * scale), 1 / (h * scale));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function applyQuality(q, announce = true) {
  quality = q;
  scale = q === 0 ? 1 : q === 1 ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.75);
  renderer.shadowMap.enabled = q >= 1;
  sun.castShadow = q >= 1;
  sun.shadow.mapSize.set(q >= 2 ? 2048 : 1024, q >= 2 ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  bloom.enabled = q >= 1; rays.enabled = q >= 1;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  resize();
  if (announce) flash('Quality: ' + ['Low', 'Medium', 'High'][q]);
}
applyQuality(quality, false);

// ---------- game state ----------
const ctl = new Controller();
const st = { x: 0, y: 55, z: 0, vx: 0, vy: 0, speed: 55, score: 0, combo: 0, best: 0, rings: 0, stamina: 1, started: false, dist: 0, spin: 0 };
const camPos = new THREE.Vector3(0, 60, 18);
let clock = 0, shake = 0;
let front = 0, frontT = 0, top = 0, topT = 0;
addEventListener('keydown', (e) => {
  if (e.code === 'KeyV') { frontT = frontT ? 0 : 1; topT = 0; }
  if (e.code === 'KeyT') { topT = topT ? 0 : 1; frontT = 0; }
});

// ember trail behind Garuda
const NE = 160;
const em = { p: new Float32Array(NE * 3), v: new Float32Array(NE * 3), life: new Float32Array(NE), col: new Float32Array(NE * 3), i: 0 };
for (let i = 0; i < NE; i++) em.p[i * 3 + 1] = -9999;
const emGeo = new THREE.BufferGeometry();
emGeo.setAttribute('position', new THREE.BufferAttribute(em.p, 3));
emGeo.setAttribute('color', new THREE.BufferAttribute(em.col, 3));
const embers = new THREE.Points(emGeo, new THREE.PointsMaterial({
  size: 0.55, map: dustTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
embers.frustumCulled = false;
scene.add(embers);
function updateEmbers(dt, boosting) {
  const n = boosting ? 5 : 2;
  for (let k = 0; k < n; k++) {
    const i = em.i++ % NE;
    const side = Math.random() < 0.5 ? -1 : 1;
    em.p[i * 3] = st.x + side * (3 + Math.random() * 3.5);
    em.p[i * 3 + 1] = st.y + 0.3 + Math.random() * 0.8;
    em.p[i * 3 + 2] = st.z + 2 + Math.random() * 2;
    em.v[i * 3] = side * Math.random() * 2; em.v[i * 3 + 1] = Math.random() * 2 - 0.5; em.v[i * 3 + 2] = 4 + Math.random() * 4;
    em.life[i] = 1;
  }
  for (let i = 0; i < NE; i++) {
    if (em.life[i] <= 0) { em.col[i * 3] = em.col[i * 3 + 1] = em.col[i * 3 + 2] = 0; continue; }
    em.life[i] -= dt * 1.3;
    em.p[i * 3] += em.v[i * 3] * dt; em.p[i * 3 + 1] += em.v[i * 3 + 1] * dt; em.p[i * 3 + 2] += em.v[i * 3 + 2] * dt;
    const l = Math.max(0, em.life[i]);
    em.col[i * 3] = 2.2 * l; em.col[i * 3 + 1] = 1.1 * l * l; em.col[i * 3 + 2] = 0.25 * l * l * l;
  }
  emGeo.attributes.position.needsUpdate = true;
  emGeo.attributes.color.needsUpdate = true;
}

ctl.onStatus = (m) => { $('status').textContent = m; if (/alibrat|ange|swapped|normal/.test(m)) flash(m); };
let showDbg = false;
addEventListener('keydown', (e) => { if (e.code === 'KeyG') { showDbg = !showDbg; $('dbg').style.display = showDbg ? 'block' : 'none'; } });
$('connect').onclick = async () => { await ctl.connect(); };
$('start').onclick = () => { st.started = true; $('intro').classList.add('hide'); };
$('calib').onclick = () => ctl.calibrate();
$('start').disabled = false;
$('start').textContent = 'Begin flight';
if (!('serial' in navigator)) {
  $('connect').disabled = true;
  $('connect').textContent = 'USB controller: desktop Chrome / Edge only';
  $('connect').style.cursor = 'not-allowed';
}
if (lowEnd) $('warn').textContent = 'Best on a desktop or laptop with a recent GPU. Quality has been set to Low.';
addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !st.started) $('start').click();
  if (e.code === 'KeyQ') applyQuality((quality + 1) % 3);
});

function flash(text, cls = '') {
  const el = $('toast');
  el.textContent = text; el.className = 'show ' + cls;
  clearTimeout(flash.t); flash.t = setTimeout(() => (el.className = ''), 900);
}

function step(dt) {
  ctl.viewFlip = front > 0.5;
  ctl.update(dt);
  if (showDbg) {
    const r = ctl.raw, o = ctl.offset, g = ctl.range;
    $('dbg').textContent = ctl.live
      ? `ROLL   ${(r.roll - o.roll).toFixed(1).padStart(6)}°  (full at ±${g.roll.toFixed(0)}°)  ->  ${(ctl.roll * 100).toFixed(0)}%
` +
        `PITCH  ${(r.pitch - o.pitch).toFixed(1).padStart(6)}°  (full at ±${g.pitch.toFixed(0)}°)  ->  ${(ctl.pitch * 100).toFixed(0)}%
` +
        `SPIN   ${(r.spin - o.spin).toFixed(0).padStart(6)}°/s
BUTTON ${r.btn ? 'pressed' : 'released'}
` +
        `raw roll ${r.roll.toFixed(1)}  pitch ${r.pitch.toFixed(1)}`
      : 'Controller not connected - using the keyboard';
  }
  {
    const sr = ctl.spinRate, TAU = Math.PI * 2;
    if (Math.abs(sr) > 1) st.spin += sr * Math.PI / 180 * dt;
    else { const tgt = Math.round(st.spin / TAU) * TAU; st.spin += (tgt - st.spin) * (1 - Math.exp(-dt * 6)); }
    if (Math.abs(st.spin) > 40) st.spin %= TAU;
  }
  const prevZ = st.z;

  if (st.started) {
    const boosting = ctl.boost && st.stamina > 0.03;
    st.stamina = Math.min(1, Math.max(0, st.stamina + (boosting ? -0.35 : 0.12) * dt));
    const base = 52 + Math.min(st.combo, 20) * 2;
    const targetSpeed = base * (boosting ? 1.5 : 1);
    st.speed += (targetSpeed - st.speed) * (1 - Math.exp(-dt * 2.5));

    st.vx += (ctl.roll * 48 - st.vx) * (1 - Math.exp(-dt * 4));
    st.vy += (-ctl.pitch * 34 - st.vy) * (1 - Math.exp(-dt * 4));
    st.x += st.vx * dt;
    st.y += st.vy * dt;
    st.z -= st.speed * dt;
    st.dist += st.speed * dt;

    // keep above ground & under the ceiling
    const floor = terrainHeight(st.x, st.z) + 7;
    if (st.y < floor) {
      st.y = floor; st.vy = Math.max(0, st.vy);
      if (st.combo > 0) { st.combo = 0; shake = 0.6; flash('Too low!', 'bad'); }
    }
    st.y = Math.min(st.y, 150);

    const { hit, miss } = world.checkRings(prevZ, { x: st.x, y: st.y, z: st.z }, 10.5);
    if (hit) {
      st.combo += hit; st.rings += hit; st.best = Math.max(st.best, st.combo);
      st.score += hit * 100 * (1 + Math.min(st.combo, 20) * 0.25);
      flash(st.combo > 1 ? `x${st.combo} Combo` : 'Ring!');
    }
    if (miss && st.combo > 0) { st.combo = 0; flash('Missed', 'bad'); }
  }

  clock += dt;
  garuda.root.position.set(st.x, st.y, st.z);
  garuda.update(clock, ctl.roll, ctl.pitch, ctl.boost && st.stamina > 0.03 ? 1 : 0, st.spin);

  const gh = terrainHeight(st.x, st.z);
  shadow.position.set(st.x, gh + 0.3, st.z);
  shadow.scale.setScalar(THREE.MathUtils.clamp(1.4 - (st.y - gh) / 140, 0.3, 1.3));

  // chase camera
  front += (frontT - front) * (1 - Math.exp(-dt * 2.5));
  top += (topT - top) * (1 - Math.exp(-dt * 2.5));
  garuda.setFront(front);
  const rearWant = new THREE.Vector3(st.x - st.vx * 0.12, st.y + 5 - st.vy * 0.06, st.z + 15);
  const frontWant = new THREE.Vector3(st.x + 4, st.y + 2.5, st.z - 15);
  camPos.lerp(rearWant, 1 - Math.exp(-dt * 4.5));
  const topWant = new THREE.Vector3(st.x, st.y + 34, st.z + 5);
  camera.position.copy(camPos).lerp(frontWant, front).lerp(topWant, top);
  if (shake > 0) { shake = Math.max(0, shake - dt * 2); camera.position.x += (Math.random() - 0.5) * shake * 2; camera.position.y += (Math.random() - 0.5) * shake * 2; }
  camera.up.set(-ctl.roll * 0.12, 1, 0).lerp(new THREE.Vector3(0, 0, -1), top).normalize();
  const look = new THREE.Vector3(THREE.MathUtils.lerp(st.x * 0.85, st.x, front), THREE.MathUtils.lerp(st.y + 2 + st.vy * 0.05, st.y + 1, front), THREE.MathUtils.lerp(st.z - 40, st.z, front));
  look.lerp(new THREE.Vector3(st.x, st.y, st.z - 2), top);
  camera.lookAt(look);
  {
    const sd = world.sunDir, fw = new THREE.Vector3();
    camera.getWorldDirection(fw);
    const sp = camera.position.clone().addScaledVector(sd, 1000).project(camera);
    rays.uniforms.sun.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    rays.uniforms.strength.value = THREE.MathUtils.clamp((fw.dot(sd) - 0.1) * 1.2, 0, 1) * (night ? 0.22 : 0.4) * (1 - top);
  }
  const fov = 65 + (st.speed - 52) * 0.25;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.1; camera.updateProjectionMatrix(); }

  world.update(dt, camera.position, st.speed);
  fauna.update(dt, camera.position);
  glowLight.position.set(st.x, st.y - 5, st.z - 2);
  const sd = world.sunDir;
  sun.position.set(st.x + sd.x * 450, st.y + sd.y * 450, st.z + sd.z * 450);
  sun.target.position.set(st.x, st.y, st.z);
  updateEmbers(dt, ctl.boost && st.stamina > 0.03);
  grade.uniforms.time.value = clock % 10;

  // HUD
  $('score').textContent = Math.floor(st.score).toLocaleString();
  $('combo').textContent = st.combo ? 'x' + st.combo : '';
  $('rings').textContent = st.rings;
  $('dist').textContent = Math.floor(st.dist) + ' m';
  $('stam').style.width = st.stamina * 100 + '%';
  $('ctl').textContent = ctl.source === 'ESP32' ? 'ESP32 • live' : ctl.source;
  $('ctl').className = ctl.live ? 'ok' : '';
}

let last = performance.now();
let fpsT = 0, fpsN = 0, lowWin = 0, lastDown = 0;
function loop(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  if (st.started) {   // lower the quality automatically if the game is running slowly
    fpsT += raw; fpsN++;
    if (fpsT > 2.5) {
      const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
      lowWin = fps < 30 ? lowWin + 1 : 0;
      if (lowWin >= 2 && quality > 0 && now - lastDown > 5000) { lowWin = 0; lastDown = now; applyQuality(quality - 1, false); flash('Quality lowered for smoother play (Q changes it)'); }
    }
  }
  step(dt);
  composer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

let night = false;
function applyMode() {
  world.setMode(night ? 'night' : 'day');
  sun.color.set(night ? 0x9bb4ff : 0xffc880); sun.intensity = night ? 0.9 : 2.2;
  fill.color.set(night ? 0x6f86c8 : 0xffe2b0); fill.intensity = night ? 0.25 : 0.5;
  hemi.color.set(night ? 0x5566aa : 0xffd9a0); hemi.intensity = night ? 0.18 : 0.3;
  glowLight.intensity = night ? 90 : 0;
  renderer.toneMappingExposure = night ? 0.85 : 0.62;
  grade.uniforms.tint.value.set(...(night ? [0.8, 0.88, 1.12] : [1, 1, 1]));
  bloom.strength = night ? 0.3 : 0.09;
  scene.environmentIntensity = night ? 1.0 : 0.7;
  scene.backgroundIntensity = night ? 0.7 : 0.42;
}
addEventListener('keydown', (e) => { if (e.code === 'KeyN') { night = !night; applyMode(); } });

window.__game = { applyMode, st, ctl, renderer, world, sun, composer }; // handy for debugging
