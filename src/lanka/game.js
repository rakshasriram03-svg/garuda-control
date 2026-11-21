import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Controller } from '../input.js';
import { loadSkies } from '../assets.js';
import { makeTextures } from './textures.js';
import { City } from './city.js';
import { buildHanuman } from './hanuman.js';
import { Player } from './player.js';
import { Crowd } from './crowd.js';
import { Fire } from './fire.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- renderer + quality
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.62;
document.body.prepend(renderer.domElement);

const gpuName = (() => { try { const g = renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''; } catch (err) { return ''; } })();
const lowEnd = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || /SwiftShader|llvmpipe|Software|Basic Render/i.test(gpuName);
const midEnd = /Intel|UHD|Iris|Mali|Adreno|Vega/i.test(gpuName);
let quality = lowEnd ? 0 : midEnd ? 1 : 2;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2500);

// ---------------------------------------------------------------- sky + light
const skies = await loadSkies();
const sunDir = skies.sun.dir.clone().normalize();
scene.background = skies.hdr;
scene.environment = skies.hdr;
scene.environmentIntensity = 0.75;
scene.backgroundIntensity = 0.45;
const fogC = skies.horizon.clone();
fogC.multiplyScalar(0.3 / (0.2126 * fogC.r + 0.7152 * fogC.g + 0.0722 * fogC.b));
fogC.r = Math.min(fogC.r, 0.95); fogC.g = Math.min(fogC.g * 0.9, 0.55); fogC.b = Math.min(fogC.b * 0.75, 0.4);
scene.fog = new THREE.Fog(fogC, 160, 720);

scene.add(new THREE.HemisphereLight(0xffd9a0, 0x3a2a4a, 0.35));
const sun = new THREE.DirectionalLight(0xffc880, 2.4);
scene.add(sun, sun.target);
sun.castShadow = quality >= 1;
Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 1, far: 800 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
sun.shadow.mapSize.set(quality >= 2 ? 2048 : 1024, quality >= 2 ? 2048 : 1024);
renderer.shadowMap.enabled = quality >= 1;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------------------------------------------------------------- post-processing
let scale = quality === 0 ? 1 : quality === 1 ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.75);
const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: quality >= 2 ? 4 : quality === 1 ? 2 : 0 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.12, 0.5, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, texel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float time; uniform vec2 texel;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec3 nb = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb
              + texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
      c = max(c + (c - nb * 0.25) * 0.55, 0.0);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.25);
      c *= mix(vec3(0.96, 0.98, 1.06), vec3(1.06, 1.0, 0.92), l);
      c = max(c - 0.012, 0.0) / 0.988;
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);
      vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.8;
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
const grade = composer.passes[composer.passes.length - 1];

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(scale); renderer.setSize(w, h);
  composer.setPixelRatio(scale); composer.setSize(w, h);
  grade.uniforms.texel.value.set(1 / (w * scale), 1 / (h * scale));
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
function applyQuality(q, announce = true) {
  quality = q;
  scale = q === 0 ? 1 : q === 1 ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.75);
  renderer.shadowMap.enabled = q >= 1; sun.castShadow = q >= 1;
  sun.shadow.mapSize.set(q >= 2 ? 2048 : 1024, q >= 2 ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  bloom.enabled = q >= 1;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  resize();
  if (announce) flash('Quality: ' + ['Low', 'Medium', 'High'][q]);
}
function flash(text) {
  const el = $('toast'); el.textContent = text; el.classList.add('show');
  clearTimeout(flash.t); flash.t = setTimeout(() => el.classList.remove('show'), 1100);
}
resize();

// ---------------------------------------------------------------- the world
const textures = makeTextures();
const city = new City(scene, textures);
city.update(0, 0, 99);                       // build everything around the start

const crowd = new Crowd(scene);
const hanuman = buildHanuman();
scene.add(hanuman.root, hanuman.tailGroup);
const player = new Player(city);
const fire = new Fire(scene, city);
const ctl = new Controller();
ctl.onStatus = (m) => { $('status').textContent = m; if (/alibrat|ange|swapped|normal|etup/.test(m)) flash(m); };

// ---------------------------------------------------------------- UI
let started = false;
$('start').disabled = false; $('start').textContent = 'Begin';
$('start').onclick = () => { started = true; $('intro').classList.add('hide'); };
$('connect').onclick = async () => { await ctl.connect(); };
$('calib').onclick = () => ctl.calibrate();
if (!('serial' in navigator)) { $('connect').disabled = true; $('connect').textContent = 'USB controller: desktop Chrome / Edge only'; }
let showDbg = false;
addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !started) $('start').click();
  if (e.code === 'KeyQ') applyQuality((quality + 1) % 3);
  if (e.code === 'KeyG') { showDbg = !showDbg; $('dbg').style.display = showDbg ? 'block' : 'none'; }
});

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3(0, 8, 12), look = new THREE.Vector3();
let shake = 0;
function updateCamera(dt) {
  const p = player, fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw), fly = p.mode === 'fly';
  const back = fly ? 15 : 11, up = fly ? 5.5 : 5.5;
  const want = new THREE.Vector3(p.x - fx * back, p.y + up + (fly ? p.vy * 0.12 : 0), p.z - fz * back);
  camPos.lerp(want, 1 - Math.exp(-dt * 5));
  const floor = city.groundAt(camPos.x, camPos.z) + 2.5;
  if (camPos.y < floor) camPos.y = floor;
  camera.position.copy(camPos);
  if (shake > 0) { shake = Math.max(0, shake - dt * 3); camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; }
  look.set(p.x + fx * 7, p.y + (fly ? 1.2 : 2.6), p.z + fz * 7);
  camera.lookAt(look);
  const fov = 62 + Math.min(18, p.speed * 0.3);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.08; camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------- loop
let last = performance.now(), clock = 0, fpsT = 0, fpsN = 0, lowWin = 0, lastDown = 0;
function loop(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
  last = now; clock += dt;
  if (started) {
    fpsT += raw; fpsN++;
    if (fpsT > 2.5) {
      const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
      lowWin = fps < 30 ? lowWin + 1 : 0;
      if (lowWin >= 2 && quality > 0 && now - lastDown > 5000) { lowWin = 0; lastDown = now; applyQuality(quality - 1, false); flash('Quality lowered for smoother play (Q changes it)'); }
    }
  }

  ctl.update(dt);
  if (started) {
    player.update(dt, { steer: ctl.roll, pitch: ctl.pitch, up: -ctl.pitch, boost: ctl.boost });
    for (const e of player.events.splice(0)) if (e === 'land') shake = Math.min(0.6, shake + 0.25);
  }
  city.update(player.x, player.z, 1);
  crowd.update(dt, player, fire.centers(player.x, player.z));
  hanuman.update(dt, { mode: player.mode, speed: player.animSpeed, yaw: player.yaw, x: player.x, y: player.y, z: player.z, t: clock, groundAt: (x, z) => city.groundAt(x, z) });
  city.uniforms.uTime.value = clock;
  fire.update(dt, hanuman.tailPts, renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360)));
  if (started && Math.abs(ctl.spinRate) > 1 && fire.whip(player.x, player.z, 16)) {     // spin the controller (or Z / X): tail whip
    const tip = hanuman.tailPts[hanuman.tailPts.length - 1];
    fire.burst(tip.x, tip.y, tip.z); shake = Math.min(0.8, shake + 0.4); flash('TAIL WHIP!');
  }
  updateCamera(dt);

  sun.position.set(player.x + sunDir.x * 350, player.y + sunDir.y * 350 + 60, player.z + sunDir.z * 350);
  sun.target.position.set(player.x, 0, player.z);
  $('mode').textContent = player.label;
  $('info').textContent = `BURNED ${fire.burned}  ·  SCORE ${fire.score}  ·  CITIZENS FLEEING ${crowd.fleeing}`;
  $('ctl').textContent = ctl.source === 'ESP32' ? 'ESP32 • live' : ctl.source;
  $('ctl').className = ctl.source === 'ESP32' ? 'ok' : '';
  if (showDbg) {
    const r = ctl.raw, o = ctl.offset;
    $('dbg').textContent = ctl.live
      ? `ROLL   ${(r.roll - o.roll).toFixed(1).padStart(6)}°  ->  ${(ctl.roll * 100).toFixed(0)}%\nPITCH  ${(r.pitch - o.pitch).toFixed(1).padStart(6)}°  ->  ${(ctl.pitch * 100).toFixed(0)}%\nSPIN   ${(r.spin - o.spin).toFixed(0).padStart(6)}°/s\nBUTTON ${r.btn ? 'pressed' : 'released'}`
      : 'Controller not connected - using the keyboard';
  }
  composer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.__lanka = { player, city, crowd, ctl, hanuman, camera, renderer, fire };
