import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;   // './' so it also works from a sub-folder like github.io/garuda-control/
const HDR = BASE + 'hdri/qwantani_sunset_puresky_2k.hdr';

// Finds the sun (brightest spot) in an equirect HDR and the average horizon colour.
function analyseSky(tex) {
  const { data, width: w, height: h } = tex.image;
  const half = data instanceof Uint16Array;
  const px = (i) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const i = (y * w + x) * 4;
    const l = px(i) + px(i + 1) + px(i + 2);
    if (l > best) { best = l; bx = x; by = y; }
  }
  // refine: centroid of bright pixels around the peak
  let sx = 0, sy = 0, sw = 0;
  for (let y = Math.max(0, by - 12); y < Math.min(h, by + 12); y++) for (let x = bx - 12; x < bx + 12; x++) {
    const xx = (x + w) % w, i = (y * w + xx) * 4;
    const l = px(i) + px(i + 1) + px(i + 2);
    if (l > best * 0.5) { sx += x * l; sy += y * l; sw += l; }
  }
  const u = (sx / sw + 0.5) / w, v = (sy / sw + 0.5) / h;
  const phi = (u - 0.5) * 2 * Math.PI, th = (v - 0.5) * Math.PI;
  const dir = new THREE.Vector3(Math.cos(phi) * Math.cos(th), Math.sin(th), Math.sin(phi) * Math.cos(th));
  return { dir, phi, peak: best };
}

function horizonColor(tex, phiSun) {
  const { data, width: w, height: h } = tex.image;
  const half = data instanceof Uint16Array;
  const px = (i) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  const c = new THREE.Color(0, 0, 0);
  let n = 0;
  const row = Math.floor(h * 0.53);
  for (let x = 0; x < w; x += 4) {
    const i = (row * w + x) * 4;
    c.r += px(i); c.g += px(i + 1); c.b += px(i + 2); n++;
  }
  c.multiplyScalar(1 / n);
  return c;
}

function loadModel(loader, path, targetHeight) {
  return loader.loadAsync(path).then((g) => {
    let mesh = null;
    g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return null;
    const geo = mesh.geometry.clone();
    mesh.updateWorldMatrix(true, false);
    geo.applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    const height = b.max.y - b.min.y;
    return { geo, mat: mesh.material, unit: targetHeight / height, size: b.getSize(new THREE.Vector3()) };
  });
}

function loadTex(path, repeat = true) {
  const t = new THREE.TextureLoader().load(path);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

// Only the two sky HDRIs (the Hanuman level does not need the rock models).
export async function loadSkies() {
  const hdr = await new RGBELoader().loadAsync(HDR);
  hdr.mapping = THREE.EquirectangularReflectionMapping; hdr.colorSpace = THREE.LinearSRGBColorSpace;
  const nhdr = await new RGBELoader().loadAsync(BASE + 'hdri/qwantani_night_puresky_2k.hdr');
  nhdr.mapping = THREE.EquirectangularReflectionMapping; nhdr.colorSpace = THREE.LinearSRGBColorSpace;
  const sun = analyseSky(hdr);
  return { hdr, sun, horizon: horizonColor(hdr, sun.phi), night: { hdr: nhdr, sun: analyseSky(nhdr) } };
}

export async function loadAssets() {
  const hdr = await new RGBELoader().loadAsync(HDR);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  hdr.colorSpace = THREE.LinearSRGBColorSpace;
  const sun = analyseSky(hdr);
  const horizon = horizonColor(hdr, sun.phi);

  const nhdr = await new RGBELoader().loadAsync(BASE + 'hdri/qwantani_night_puresky_2k.hdr');
  nhdr.mapping = THREE.EquirectangularReflectionMapping;
  nhdr.colorSpace = THREE.LinearSRGBColorSpace;
  const night = { hdr: nhdr, sun: analyseSky(nhdr) };

  const gl = new GLTFLoader();
  const [rockFace, cliff2, boulder, diya] = await Promise.all([
    loadModel(gl, BASE + 'models/rock_face_01/rock_face_01_1k.gltf', 1),
    loadModel(gl, BASE + 'models/namaqualand_cliff_01/namaqualand_cliff_01_1k.gltf', 1),
    loadModel(gl, BASE + 'models/boulder_01/boulder_01_1k.gltf', 1),
    loadModel(gl, BASE + 'models/brass_diya_lantern/brass_diya_lantern_1k.gltf', 1),
  ].map((p) => p.catch((e) => { console.warn('model failed', e); return null; })));

  return {
    hdr, sun, horizon, night,
    models: { rockFace, cliff2, boulder, diya },
    tex: {
      grass: loadTex(BASE + 'textures/aerial_grass_rock/aerial_grass_rock_Diffuse_1k.jpg'),
      rock: loadTex(BASE + 'textures/cliff_side/cliff_side_Diffuse_1k.jpg'),
    },
  };
}
