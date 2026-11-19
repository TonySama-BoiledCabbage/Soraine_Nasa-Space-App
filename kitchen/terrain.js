// Ground for every scenario.
//   - Earth: Tony's tall-grass meadow (earth.glb + meadow.js wind/instancing), kind: 'meadow'
//   - space (void: true): no ground drawn at all
//   - planet terrains: Tony's Blender low-poly surfaces (models/planet_surfaces/*.glb), file material + COLOR_0 kept.
//     Each GLB is cut into ~8 m tiles at load so three.js frustum culling skips tiles outside the camera,
//     and a planet is only drawn while it is the scene's old or new state.
//   - flat ground: a large plane for Earth/ISS and as the fallback around a terrain's edges.
// During a scan the old state is drawn outside the front and the new state inside it (hard cut under the bright
// front line). Kitchen placement per planet comes from scenarios.json (terrain.offset).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { enableMeadowWind } from './meadow.js?v=flat-1';

const TILE = 8;                     // metres per culling tile
const LOCAL = { minX: -32, maxX: 32, minZ: -25, maxZ: 15 };   // GLB footprint (README: ~64 x 40 m)

// Opening (erode, then dilate) of the ground heights over a rectangle of the world: bumps narrower than 2 * radius (the
// Blender rocks) are levelled to the ground around them, wider relief keeps its slope. Heights fade back to the original
// over `fade` metres outside the rectangle. `floor` stops the store shelf from hanging above the ground where a rock stood.
// Works on a non-indexed geometry (local coordinates + group offset = world) and re-lights the changed faces.
function flattenPad(g, offset, { rect, fade = 0.8, radius = 0.8, floor = null }) {
  const P = g.attributes.position, N = g.attributes.normal, [ox, oy, oz] = offset, reach = radius * 2 + fade;
  const key = (x, z) => Math.round(x * 1000) + ',' + Math.round(z * 1000);
  const pts = new Map();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i) + ox, z = P.getZ(i) + oz;
    if (x < rect[0] - reach || x > rect[2] + reach || z < rect[1] - reach || z > rect[3] + reach) continue;
    const k = key(x, z); if (!pts.has(k)) pts.set(k, { x, z, y: P.getY(i) + oy, e: 0, o: 0 });
  }
  if (!pts.size) return;
  const cell = new Map(), list = [...pts.values()], ck = (x, z) => Math.floor(x / radius) + ',' + Math.floor(z / radius);
  for (const p of list) { const k = ck(p.x, p.z); (cell.get(k) || cell.set(k, []).get(k)).push(p); }
  const near = (p) => { const out = [], cx = Math.floor(p.x / radius), cz = Math.floor(p.z / radius);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of cell.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(q.x - p.x, q.z - p.z) <= radius) out.push(q);
    return out; };
  const nb = new Map(list.map(p => [p, near(p)]));
  for (const p of list) p.e = Math.min(...nb.get(p).map(q => q.y));
  for (const p of list) p.o = Math.max(...nb.get(p).map(q => q.e));
  const inRect = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  const moved = new Uint8Array(P.count);
  for (let i = 0; i < P.count; i++) {
    const p = pts.get(key(P.getX(i) + ox, P.getZ(i) + oz)); if (!p) continue;
    const dx = Math.max(rect[0] - p.x, p.x - rect[2], 0), dz = Math.max(rect[1] - p.z, p.z - rect[3], 0);
    const s = 1 - Math.min(1, Math.hypot(dx, dz) / fade), w = s * s * (3 - 2 * s);
    if (w <= 0) continue;
    const y = P.getY(i) + oy; let ground = p.o;
    if (floor && inRect(floor.rect, p.x, p.z)) ground = Math.max(ground, floor.y);
    const ny = y - w * Math.max(0, y - ground);
    if (y - ny > 1e-5) { P.setY(i, ny - oy); moved[i] = 1; }
  }
  P.needsUpdate = true;
  if (!N) return;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < P.count / 3; t++) {
    if (!(moved[3 * t] || moved[3 * t + 1] || moved[3 * t + 2])) continue;
    a.fromBufferAttribute(P, 3 * t); b.fromBufferAttribute(P, 3 * t + 1).sub(a); c.fromBufferAttribute(P, 3 * t + 2).sub(a);
    const n = b.cross(c).normalize(); if (n.y < 0) n.negate();
    for (let k = 0; k < 3; k++) N.setXYZ(3 * t + k, n.x, n.y, n.z);
  }
  N.needsUpdate = true;
}

export function buildTerrain(scene, SWEEP, SWEEP_GLSL, SWEEP_FN, { keepOut, flatten } = {}) {
  const loader = new GLTFLoader();
  const planets = new Map();        // url -> { group, roleU, foot, ready }

  // ---------- flat plane ----------
  const PU = { uVoidOld: { value: 0 }, uVoidNew: { value: 0 }, uHasOld: { value: 0 }, uHasNew: { value: 0 }, uFootOld: { value: new THREE.Vector4() }, uFootNew: { value: new THREE.Vector4() } };
  const pm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  pm.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SWEEP, PU);
    sh.vertexShader = SWEEP_GLSL + '\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vSweepW = (modelMatrix * vec4(transformed,1.)).xyz;');
    sh.fragmentShader = SWEEP_GLSL + '\n' + SWEEP_FN + `
      uniform vec3 uGroundOld, uGroundNew; uniform float uHasOld, uHasNew, uVoidOld, uVoidNew; uniform vec4 uFootOld, uFootNew;
      bool inFoot(vec2 p, vec4 f){ return p.x > f.x && p.y > f.y && p.x < f.z && p.y < f.w; }\n` +
      sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float sw = sweepMix(vSweepW);
        bool isNew = sw > 0.5;
        if (isNew ? uVoidNew > 0.5 : uVoidOld > 0.5) discard;            // space: no ground at all
        if (isNew ? (uHasNew > 0.5 && inFoot(vSweepW.xz, uFootNew)) : (uHasOld > 0.5 && inFoot(vSweepW.xz, uFootOld))) discard;
        diffuseColor.rgb = mix(uGroundOld, uGroundNew, sw);`);
  };
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), pm);
  plane.receiveShadow = true; plane.frustumCulled = false; scene.add(plane);

  // ---------- planet terrains ----------
  function tileGeometry(src, offset) {
    // non-indexed triangles -> buckets by centroid; keeps POSITION / NORMAL / COLOR_0 as they are
    const g = src.index ? src.toNonIndexed() : src;
    if (flatten) flattenPad(g, offset, flatten);
    const P = g.attributes.position, names = Object.keys(g.attributes);
    const buckets = new Map();
    for (let t = 0; t < P.count / 3; t++) {
      const cx = (P.getX(3 * t) + P.getX(3 * t + 1) + P.getX(3 * t + 2)) / 3, cz = (P.getZ(3 * t) + P.getZ(3 * t + 1) + P.getZ(3 * t + 2)) / 3;
      const key = Math.floor(cx / TILE) + ',' + Math.floor(cz / TILE);
      (buckets.get(key) || buckets.set(key, []).get(key)).push(t);
    }
    const out = [];
    for (const tris of buckets.values()) {
      const geo = new THREE.BufferGeometry();
      for (const n of names) {
        const a = g.attributes[n], s = a.itemSize, arr = new a.array.constructor(tris.length * 3 * s);
        tris.forEach((t, i) => arr.set(a.array.subarray(t * 3 * s, t * 3 * s + 3 * s), i * 3 * s));
        geo.setAttribute(n, new THREE.BufferAttribute(arr, s, a.normalized));
      }
      geo.computeBoundingSphere(); geo.computeBoundingBox(); out.push(geo);
    }
    return out;
  }

  function loadPlanet(T) {
    if (planets.has(T.model)) return planets.get(T.model);
    const rec = { group: new THREE.Group(), roleU: { value: 0 }, ready: false, foot: new THREE.Vector4() };
    rec.group.position.set(...T.offset); rec.group.visible = false; scene.add(rec.group);
    const o = T.offset;
    rec.foot.set(LOCAL.minX + o[0] + 0.4, LOCAL.minZ + o[2] + 0.4, LOCAL.maxX + o[0] - 0.4, LOCAL.maxZ + o[2] - 0.4);
    planets.set(T.model, rec);
    loader.load(T.model, (gltf) => {
      if (T.kind === 'meadow') {
        rec.group.add(gltf.scene);
        rec.wind = enableMeadowWind(gltf.scene, { SWEEP, SWEEP_GLSL, SWEEP_FN, roleU: rec.roleU, keepOut, flatten });
        rec.ready = true; rec.tiles = 'camera-following'; return;
      }
      let src = null; gltf.scene.traverse(o => { if (o.isMesh && !src) src = o; });
      const mat = src.material.clone();
      mat.vertexColors = true; mat.metalness = 0; mat.roughness = 1;
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, SWEEP); sh.uniforms.uRole = rec.roleU;
        sh.vertexShader = SWEEP_GLSL + '\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vSweepW = (modelMatrix * vec4(transformed,1.)).xyz;');
        sh.fragmentShader = SWEEP_GLSL + '\n' + SWEEP_FN + '\nuniform float uRole;\n' + sh.fragmentShader.replace('void main() {', `void main() {
          // uRole: 1 = old state (outside the front), 2 = new state (inside), 3 = steady
          float swT = sweepMix(vSweepW);
          if ((uRole < 1.5 && swT > 0.5) || (uRole > 1.5 && uRole < 2.5 && swT < 0.5)) discard;`);
      };
      for (const geo of tileGeometry(src.geometry, T.offset)) {
        const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = false; rec.group.add(m);
      }
      rec.ready = true; rec.tiles = rec.group.children.length;
    }, undefined, (e) => console.error('terrain load failed', T.model, e));
    return rec;
  }

  // a = state before the sweep, b = state after it (a === b when steady)
  function set(a, b) {
    for (const r of planets.values()) { r.group.visible = false; r.roleU.value = 0; }
    const steady = a === b || (a.terrain && b.terrain && a.terrain.model === b.terrain.model);
    PU.uHasOld.value = a.terrain ? 1 : 0; PU.uHasNew.value = b.terrain ? 1 : 0;
    PU.uVoidOld.value = a.void ? 1 : 0; PU.uVoidNew.value = b.void ? 1 : 0;
    if (a.terrain) { const r = loadPlanet(a.terrain); r.group.visible = true; r.roleU.value = steady ? 3 : 1; PU.uFootOld.value.copy(r.foot); }
    if (b.terrain) { const r = loadPlanet(b.terrain); r.group.visible = true; r.roleU.value = steady ? 3 : 2; PU.uFootNew.value.copy(r.foot); }
  }
  function update(seconds, camera) { for (const r of planets.values()) if (r.wind && r.group.visible) r.wind.update(seconds, camera); }
  function preload(list) { for (const s of list) if (s.terrain) loadPlanet(s.terrain); }
  return { plane, planets, set, preload, update };
}
