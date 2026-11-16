import {connectHost} from './host-connection.mjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fitPropModel } from './prop-models.js?v=model-swap-1';
import { ObjectInspector } from './inspect.js?v=object-inspect-1';
import { applySurfaceMaterials } from './materials.js?v=surface-textures-2';
import { Combustion } from './combustion.js?v=object-inspect-1';
import { WORLD, SWEEP, SWEEP_GLSL, SWEEP_FN, buildKitchen, buildFlame, buildSky, buildLights } from './scene.js?v=lab-controls-3';
import { buildStars } from './stars.js?v=lab-controls-3';
import { buildTerrain } from './terrain.js?v=lab-controls-3';
import { Props } from './props.js?v=basket-1';
import { WavePass, Wave } from './wave.js?v=object-inspect-1';
import { Pages } from './pages.js?v=basket-1';
import { research } from './research-source.js?v=basket-1';
import { Basket } from './basket.js?v=basket-1';
import { Shop } from './shop.js?v=basket-1';
import { PRODUCTS } from './catalog.js?v=basket-1';
import { Shelf } from './shelf3d.js?v=basket-1';

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const LITE = new URLSearchParams(location.search).has('lite');
// Adaptive resolution: start at 1.0, let the governor below move it between 0.6 and the screen's own ratio (max 1.5).
// Measured on an Intel UHD iGPU: render cost scales almost linearly with pixel count (37 ms at 1.5 -> 18 ms at 1.0).
const PR_MAX = LITE ? 1 : Math.min(devicePixelRatio, 1.5), PR_MIN = 0.6;
let pixelRatio = LITE ? 1 : Math.min(1, PR_MAX);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = !LITE; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the post pass
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe8e3d6, 30, 110);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);

const kitchen = buildKitchen(scene);
const flame = buildFlame(scene);
// No tufts on the kitchen footprint or where the camera rigs stand (world metres).
const KEEP_OUT = [[-1.85, -0.75, 0.85, 0.75], [0.6, -0.75, 2.85, 0.75], [-1.85, 0.3, -0.4, 2.1], [1.7, -0.9, 4.6, 4.2]];   // last: SORAINE store shelf and the shopper standing in front of it
const STANDS = [[0.35, 1.75, 0.9], [-2.6, 3.4, 1.1]];
const keepOut = (x, z) => KEEP_OUT.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1) || STANDS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);
const terrain = buildTerrain(scene, SWEEP, SWEEP_GLSL, SWEEP_FN, { keepOut });
const stars = buildStars(scene);
const sky = buildSky(scene);
const lights = buildLights(scene);
const pass = new WavePass(renderer);
const wave = new Wave(WORLD.flame);
const props = new Props(scene, camera, canvas, WORLD.flame, kitchen);
const combustion = new Combustion(scene,camera,canvas,WORLD.flame,props);
const modelLoader = new GLTFLoader();
const basket = new Basket({ scene, props, loader: modelLoader, getGravity: () => props.gNew, canAct: () => !wave.active });
const shelf = new Shelf(scene, modelLoader);

// Replace only the visual placeholders; the existing physics bodies and controls stay in place.
async function replacePropVisuals() {
  const base = 'models/soraine_props/';
  const jobs = [
    ['pan', 'Mesh_42', .34, 0, model => {
      kitchen.pan.clear();
      kitchen.pan.add(model);
    }],
    ['mug', 'Mesh_64', .09, -.0475, model => {
      const target = props.bodies.find(b => b.name === 'mug')?.mesh;
      if (!target) return;
      target.clear();
      target.geometry.dispose();
      target.geometry = new THREE.BufferGeometry();
      target.add(model);
    }],
    ['bottle', 'OilBody', .07, -.11, model => {
      const target = props.bodies.find(b => b.name === 'oil')?.mesh;
      if (!target) return;
      target.clear();
      target.geometry.dispose();
      target.geometry = new THREE.BufferGeometry();
      target.add(model);
      // Follow the edited nozzle when dragging or tipping the bottle.
      target.updateWorldMatrix(true, true);
      const spout = model.getObjectByName('OilSpout');
      if (spout) {
        const bounds = new THREE.Box3().setFromObject(spout);
        const tip = bounds.getCenter(new THREE.Vector3());
        tip.y = bounds.max.y;
        const nozzle = new THREE.Object3D();
        nozzle.name = 'oilNozzle';
        nozzle.position.copy(target.worldToLocal(tip));
        target.add(nozzle);
      }
    }],
    ['egg', 'Mesh_45', .17, .008, model => {
      const target = props.bodies.find(b => b.name === 'friedEgg')?.mesh;
      if (!target) return;
      target.clear();
      target.add(model);
    }]
  ];
  return Promise.all(jobs.map(async ([name, part, width, bottom, replace]) => {
    try {
      // Replacing a file in place must not reuse a cached GLB response.
      const response = await fetch(`${base}soraine_${name}_repaired.glb`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { scene: model } = await modelLoader.parseAsync(await response.arrayBuffer(), new URL(base, location.href).href);
      const visual = fitPropModel(model, name, part, width, bottom, name === 'mug' ? .095 : undefined);
      replace(visual);
      return { name, loaded: true, ...visual.userData.modelFit };
    } catch (error) {
      console.error(`Unable to load ${name} model`, error);
      return { name, loaded: false, error: String(error) };
    }
  }));
}
const propVisualsReady = replacePropVisuals();
const surfaceMaterialsReady = propVisualsReady.then(() => applySurfaceMaterials(props, renderer));
const chamber = new THREE.Group();
const labShell = new THREE.Group();
scene.add(labShell);
labShell.name='Lab shell';
let oxygenCap=null, oxygenCapRest=0;
scene.add(chamber);
const orbital = new THREE.Group();
orbital.visible=false;
scene.add(orbital);

// Scan-line handling for whole model groups (same rule as terrain.js): uRole 1 = old state, drawn only outside the
// scan front; 2 = new state, drawn only inside it; 3 = steady. Lets the orbital cabin appear/disappear with the wave
// instead of popping in when ISS is picked.
const orbitalRole = { value: 3 }, shellRole = { value: 3 };
function clipBySweep(root, roleU) {
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m || m.userData.sweepClip) continue;
      m.userData.sweepClip = true;
      const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey && m.customProgramCacheKey.bind(m);
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev.call(m, sh, r);
        Object.assign(sh.uniforms, SWEEP); sh.uniforms.uRole = roleU;
        sh.vertexShader = SWEEP_GLSL + '\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vSweepW = (modelMatrix * vec4(transformed,1.)).xyz;');
        sh.fragmentShader = SWEEP_GLSL + '\n' + SWEEP_FN + '\nuniform float uRole;\n' + sh.fragmentShader.replace('void main() {', `void main() {
          float swC = sweepMix(vSweepW);
          if ((uRole < 1.5 && swC > 0.5) || (uRole > 1.5 && uRole < 2.5 && swC < 0.5)) discard;`);
      };
      m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|sweepclip';
      m.needsUpdate = true;
    }
  });
}
const isSpace = (s) => !!s && s.slug === 'iss';
// Which environment groups exist for the old (a) and new (b) state, and how the scan clips them.
function setSpaceEnv(a, b) {
  const inA = isSpace(a), inB = isSpace(b);
  orbital.visible = (inA || inB) && !chamber.visible;
  labShell.visible = chamber.visible || orbital.visible;
  orbitalRole.value = inA && inB ? 3 : inB ? 2 : inA ? 1 : 3;
  shellRole.value = chamber.visible ? 3 : orbitalRole.value;
}
const loadPart = async (name, parent) => {
  const { scene: model } = await modelLoader.loadAsync('models/landing/' + name + '.glb');
  parent.add(model);
  if (name==='orbital-cabin') model.traverse(o=>{
    if (o.isMesh && o.name.startsWith('Distant_Earth')) {
      o.material=new THREE.MeshBasicMaterial({vertexColors:true});
    }
  });
  if (name==='oxygen-control') {
    combustion.control=model;
    oxygenCap=model.getObjectByName('O2_press_cap');
    if (oxygenCap) oxygenCapRest=oxygenCap.position.y;
  }
  if (name==='oxygen-arm') combustion.mountArm(model);
  // after any material swaps above (Distant_Earth gets a new MeshBasicMaterial), so the clip lands on the final material
  if (parent === orbital) clipBySweep(model, orbitalRole);
  if (parent === labShell) clipBySweep(model, shellRole);
};
const landingModels = Promise.allSettled([
  loadPart('test-chamber', labShell),
  loadPart('lab-rear', chamber),
  loadPart('orbital-cabin', orbital),
  loadPart('range-cabinet', scene),
  loadPart('oxygen-control', scene),
  loadPart('oxygen-arm', scene)
]).then(results => {
  for (const result of results) if (result.status === 'rejected') console.error(result.reason);
});

// ---------- camera rigs ----------
const RIG = {
  landing: { pos: WORLD.pan.clone().add(new THREE.Vector3(-.035,1.38,.046)), look: WORLD.pan.clone(), fov: 38 },
  orbital: { pos: new THREE.Vector3(.03,1.24,2.25), look: new THREE.Vector3(.04,1.46,0), fov: 52 },
  cook:    { pos: new THREE.Vector3(0.55, 1.40, 2.35), look: WORLD.flame.clone().add(new THREE.Vector3(0,.06,0)), fov: 48 },
  detail:  { pos: new THREE.Vector3(0.42, 1.18, 0.55), look: new THREE.Vector3(0.05, 0.94, 0.08), fov: 34 },
  about:   { pos: new THREE.Vector3(-2.6, 1.5, 3.4), look: new THREE.Vector3(0.6, 0.8, 0.2), fov: 44 },
  // SORAINE: the worktop the basket is tipped onto (flame stays in frame). Shelf, product and basket views: shelf3d.js.
  bench:   { pos: new THREE.Vector3(1.55, 1.78, 2.25), look: new THREE.Vector3(0.82, 0.96, 0.32), fov: 46 }
};
const cam = { pos: RIG.landing.pos.clone(), look: RIG.landing.look.clone(), fov: RIG.landing.fov, from: null, to: RIG.landing, t: 1, dur: 1 };
function snap(rig) { cam.pos.copy(rig.pos); cam.look.copy(rig.look); cam.fov = rig.fov; cam.t = 1; cam.to = rig; }
function goTo(rig, dur = 1.6) { cam.from = { pos: cam.pos.clone(), look: cam.look.clone(), fov: cam.fov }; cam.to = rig; cam.t = 0; cam.dur = dur; }
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ---------- scenarios / environment ----------
let scenarios = [], current = null, target = null, blend = 1;   // env blends when the wave reaches the camera
const env = { sky: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), elev: 48, az: 215 };
const flameState = { height: 1, width: 1, blue: 0, sphere: 0, flicker: 1 };
const flameTarget = { ...flameState };
let flameSwept = true;

function sunVector(elev, az) { const e = THREE.MathUtils.degToRad(elev), a = THREE.MathUtils.degToRad(az); return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)); }
// Lighting / fog / sky lerp between two scenario states. The sky dome does its own horizon-first wipe from k.
function applyEnv(a, b, k) {
  env.sky.setRGB(...a.sky).lerp(new THREE.Color(...b.sky), k);
  env.hor.setRGB(...a.horizon).lerp(new THREE.Color(...b.horizon), k);
  env.sun.setRGB(...a.sun).lerp(new THREE.Color(...b.sun), k);
  env.elev = THREE.MathUtils.lerp(a.sunElev, b.sunElev, k);
  let dAz = ((b.sunAz - a.sunAz + 540) % 360) - 180; env.az = a.sunAz + dAz * k;   // shortest way round
  const U = sky.uniforms;
  U.uTopA.value.setRGB(...a.sky); U.uHorA.value.setRGB(...a.horizon); U.uSunColA.value.setRGB(...a.sun);
  stars.uniforms.uAlpha.value = (a.void ? 1 - k : 0) + (b.void ? k : 0);
  U.uTopB.value.setRGB(...b.sky); U.uHorB.value.setRGB(...b.horizon); U.uSunColB.value.setRGB(...b.sun); U.uK.value = k;
  const sv = sunVector(env.elev, env.az); U.uSunDir.value.copy(sv);
  lights.sun.position.copy(sv).multiplyScalar(18); lights.sun.color.copy(env.sun);
  const day = THREE.MathUtils.smoothstep(env.elev, 5, 35);
  lights.sun.intensity = 0.9 + 1.9 * day; lights.hemi.intensity = 0.25 + 0.35 * day;
  lights.hemi.color.copy(env.sky).lerp(new THREE.Color(1, 1, 1), 0.3); lights.hemi.groundColor.copy(env.hor).multiplyScalar(0.45);
  lights.fill.intensity = 0.15 + 0.25 * day;
  scene.fog.color.copy(env.hor); scene.fog.near = THREE.MathUtils.lerp(a.fogNear, b.fogNear, k); scene.fog.far = THREE.MathUtils.lerp(a.fogFar, b.fogFar, k); pass.uniforms.uExposure.value = 0.95 + 0.25 * day;
}
// Blended snapshot, used when a new scan starts before the previous one finished (no snap back).
function mixScenario(a, b, k) {
  const L = (x, y) => x + (y - x) * k, V = (x, y) => x.map((v, i) => L(v, y[i]));
  return { ...b, g: L(a.g, b.g), sky: V(a.sky, b.sky), horizon: V(a.horizon, b.horizon), sun: V(a.sun, b.sun),
    sunElev: L(a.sunElev, b.sunElev), sunAz: env.az, fogNear: L(a.fogNear, b.fogNear), fogFar: L(a.fogFar, b.fogFar), terrain: k < 0.5 ? a.terrain : b.terrain, ground: V(a.ground, b.ground), void: k < 0.5 ? a.void : b.void };
}
function setTerrain(a, b) {
  SWEEP.uGroundOld.value.setRGB(...a.ground); SWEEP.uGroundNew.value.setRGB(...b.ground);
  terrain.set(a, b);
  setSpaceEnv(a, b);
  if (chamber.visible || (isSpace(a) && isSpace(b))) {
    terrain.plane.visible = false;
    for (const planet of terrain.planets.values()) planet.group.visible = false;
  }
}
function selectScenario(slug, immediate = false) {
  const s = scenarios.find(x => x.slug === slug); if (!s || (current && s === current && !immediate)) return;
  inspector?.close({ restore: false });
  if (immediate || !current) { current = target = s; blend = 1; Object.assign(flameTarget, s.flame); Object.assign(flameState, s.flame); applyEnv(s, s, 1); setTerrain(s, s); SWEEP.uRadius.value = 1e5; props.setGravity(s.g, s.g, -1); }
  else { if (wave.active) { current = mixScenario(current, target, blend); } target = s; blend = 0; Object.assign(flameTarget, s.flame); flameSwept = false; setTerrain(current, target); wave.fire(); props.fire(current.g, target.g); }
  pages.setScenario(s);
  shop?.setScenario(s);
  if (pages.page==='observe') goTo(isSpace(s) && !chamber.visible ? RIG.orbital : RIG.cook,1.2);
  combustion.setSpace(s.slug==='iss');
  setTerrain(current,target);
}
wave.onSweep = () => { /* environment crossfade begins when the front reaches the camera */ };

// ---------- pages ----------
let inspector = null, shop = null;
const shopOpen = document.getElementById('shop-open');
const pages = new Pages({
  onPage: (p) => {
    inspector?.close({ restore: false });
    if (p === 'shop') shop.enter();
    else { if (shop?.active) shop.exit(); goTo(RIG[p] || (isSpace(target) ? RIG.orbital : RIG.cook), 1.5); }
    shopOpen.hidden = p !== 'observe';
    document.getElementById('combustion-status').hidden = p === 'shop';
    pass.uniforms.uDof.value = 0;
  },
  onScenario: (slug) => selectScenario(slug)
});
inspector = new ObjectInspector({
  props, canvas, camera,
  getRig: () => ({ pos: cam.pos.clone(), look: cam.look.clone(), fov: cam.fov }),
  moveCamera: (rig, duration) => goTo(rig, duration),
  getScenario: () => target || current,
  canOpen: () => pages.page === 'observe' && !wave.active,
  isObserve: () => pages.page === 'observe'
});
shop = new Shop({
  basket, research, shelf, rigs: RIG, getScenario: () => target || current, isWorldBusy: () => wave.active,
  onView: (rig, dur) => { if (pages.page === 'shop' && rig) goTo(rig, dur ?? 1.3); },
  onExit: () => pages.show('observe')
});
// shelf display: tags carry record counts, so wait for the snapshot (it is small); the tag tilt aims at the shelf eye
const shelfReady = research.load().catch(() => {}).then(() => shelf.ready).then(() => shelf.populate(PRODUCTS, (p) => basket.template(p),
  (p) => research.byId ? research.byIds(p.measurementIds).length : 0, shelf.shelfRig(16 / 10).pos)).catch(e => console.error('Shelf display failed', e));
shopOpen.addEventListener('click', () => pages.show('shop'));
props.canInteract = () => pages.page === 'observe' && !inspector.active;
// Released SORAINE samples open their product view at the shelf instead of the object inspector.
const openObject = props.onInspect;
props.onInspect = (b) => { if (!b.sample) return openObject(b); pages.show('shop'); shop.openSample(b); };
combustion.canInteract = () => !inspector.active;

document.getElementById('start').addEventListener('click', () => {
  chamber.visible = false;
  document.getElementById('combustion-status').hidden=false;
  terrain.plane.visible = true;
  if (current) setTerrain(current, target);
  document.getElementById('landing').classList.add('gone');
  goTo(RIG.cook, 2.4);
  setTimeout(() => { document.getElementById('dots').hidden = false; pages.show(new URLSearchParams(location.search).has('shop') ? 'shop' : 'observe'); }, 900);
});

// ---------- resize ----------
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  const s = renderer.getDrawingBufferSize(new THREE.Vector2()); pass.setSize(s.x, s.y);
}
addEventListener('resize', resize); resize();
// governor: average real frame time over ~1.5 s windows. Down a step when slower than ~45 fps,
// up a small step only after three windows pinned at vsync (rAF never reports faster than the display).
const gov = { acc: 0, n: 0, good: 0, ceiling: PR_MAX };   // ceiling: never climb back to a ratio that was too slow
function govern(rawDt) {
  if (document.hidden || rawDt > 0.25) return;            // ignore tab switches and stalls
  gov.acc += rawDt; gov.n++;
  if (gov.acc < 1.5) return;
  const avg = gov.acc / gov.n * 1000; gov.acc = 0; gov.n = 0;
  let next = pixelRatio;
  if (avg > 22) { gov.ceiling = Math.max(PR_MIN, pixelRatio - 0.05); next = Math.max(PR_MIN, pixelRatio - 0.15); gov.good = 0; }
  else if (avg < 17.8) { if (++gov.good >= 3 && pixelRatio < gov.ceiling) { next = Math.min(gov.ceiling, pixelRatio + 0.1); gov.good = 0; } }
  else gov.good = 0;
  if (Math.abs(next - pixelRatio) > 0.01) { pixelRatio = next; renderer.setPixelRatio(pixelRatio); resize(); }
}

// ---------- loop ----------
let hostActive = parent === window;
const clock = new THREE.Clock(); let time = 0, burn = 1;
const viewShift = { x: 0, y: 0 };
const tmpUp = new THREE.Vector3(0, 1, 0);
function frame() {
  if (!hostActive || document.hidden) { clock.getDelta(); requestAnimationFrame(frame); return; }
  const rawDt = clock.getDelta(); govern(rawDt);
  const dt = Math.min(rawDt, 0.05); time += dt;
  // camera tween
  if (cam.t < 1) {
    cam.t = Math.min(1, cam.t + dt / cam.dur); const k = ease(cam.t);
    cam.pos.lerpVectors(cam.from.pos, cam.to.pos, k); cam.look.lerpVectors(cam.from.look, cam.to.look, k); cam.fov = THREE.MathUtils.lerp(cam.from.fov, cam.to.fov, k);
  }
  // idle drift (breathing) in cook view
  const drift = inspector.active || pages.page === 'shop' ? 0 : pages.page === 'observe' ? 1 : 0.4;   // shop: hotspots track a still camera
  camera.position.copy(cam.pos); camera.position.x += Math.sin(time * 0.45) * 0.012 * drift; camera.position.y += Math.sin(time * 0.7) * 0.008 * drift;
  camera.fov = cam.fov;
  // Store on a phone: shift the projection so the product sits above the text panel.
  const ins = shop.insets(), sv = viewShift;
  sv.x += ((ins.left - ins.right) / 2 - sv.x) * (1 - Math.exp(-dt * 6)); sv.y += ((ins.top - ins.bottom) / 2 - sv.y) * (1 - Math.exp(-dt * 6));
  if (Math.abs(sv.x) + Math.abs(sv.y) > 0.5) {
    const W = innerWidth + 2 * Math.abs(sv.x), H = innerHeight + 2 * Math.abs(sv.y);
    camera.aspect = W / H; camera.setViewOffset(W, H, sv.x > 0 ? 0 : 2 * -sv.x, sv.y > 0 ? 0 : 2 * -sv.y, innerWidth, innerHeight);
  } else if (camera.view?.enabled) { camera.clearViewOffset(); camera.aspect = innerWidth / innerHeight; }
  camera.updateProjectionMatrix();
  camera.lookAt(cam.look);
  // wave + shake
  if (!inspector.active) wave.update(dt, camera.position);
  const sh = inspector.active ? null : wave.shake(camera.position, time);
  if (sh) { camera.position.add(new THREE.Vector3(sh.x, sh.y, 0).applyQuaternion(camera.quaternion)); camera.rotateZ(sh.roll); }
  SWEEP.uRadius.value = wave.active ? wave.R : 1e5; SWEEP.uSweepW.value = wave.trail() * 0.8; props.R = wave.active ? wave.R : 1e5;
  const paused = inspector.active || shop.paused;
  if (!paused) { basket.update(dt); props.update(dt, time); } else basket.sync();
  pass.uniforms.uRadius.value = wave.R; pass.uniforms.uStrength.value = wave.strength(); pass.uniforms.uCenter.value.copy(wave.center);
  pass.uniforms.uTrail.value = wave.trail(); pass.uniforms.uSpacing.value = 0.25 + Math.max(wave.R, 0) * 0.045;   // lines ride with the front, so spacing can grow
  // flame morphs as soon as the wave leaves it (it is the origin)
  if (!flameSwept && wave.active) flameSwept = true;
  const fk = 1 - Math.exp(-dt * 2.2);
  for (const key in flameState) flameState[key] += (flameTarget[key] - flameState[key]) * fk;
  if (!inspector.active) burn=combustion.update(dt);
  else combustion.frameArm();
  if (oxygenCap) oxygenCap.position.y=oxygenCapRest-(combustion.buttonTravel>0?.004:0);
  flame.group.visible=burn>.01;
  flame.uniforms.uTime.value = time; flame.uniforms.uBlue.value = flameState.blue; flame.uniforms.uSphere.value = flameState.sphere; flame.uniforms.uFlicker.value = flameState.flicker;
  flame.mesh.scale.set(flameState.width, flameState.height, flameState.width); flame.inner.scale.set(flameState.width * 0.5, flameState.height * 0.65, flameState.width * 0.5);
  flame.mesh.scale.multiplyScalar(burn);
  flame.inner.scale.multiplyScalar(burn);
  flame.light.color.setRGB(1, 0.63, 0.25).lerp(new THREE.Color(0.45, 0.6, 1), flameState.blue);
  flame.light.intensity = burn*(0.26 + 0.08 * Math.sin(time * 17) * flameState.flicker) * (0.45 + 0.55 * flameState.height);
  // environment crossfade once the front has passed the camera
  if (target && current !== target) {
    const dCam = camera.position.distanceTo(WORLD.flame);
    blend = wave.active ? THREE.MathUtils.smoothstep(wave.R, dCam * 0.6, 60) : 1;
    applyEnv(current, target, blend);
    if (!wave.active) { current = target; setTerrain(current, current); }
  }
  // detail page DoF
  const wantDof = inspector.active || pages.page === 'detail' ? 1 : 0; pass.uniforms.uDof.value += (wantDof - pass.uniforms.uDof.value) * (1 - Math.exp(-dt * 5));
  const focusPoint = inspector.active ? inspector.focus : WORLD.pan;
  pass.uniforms.uFocus.value = Math.max(.02, focusPoint.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())));
  pass.uniforms.uFocusRange.value = inspector.active ? inspector.focusRange : .02;
  pass.uniforms.uBlurRadius.value = inspector.active ? 22 : 9;
  pass.focusObject = inspector.active?.mesh || null;
  inspector.update();
  shop.update(dt, camera);
  terrain.update(time, camera);
  stars.uniforms.uTime.value = time;
  lights.sun.target.position.set(0.3, 0.8, 0.2);
  if (isSpace(target) && isSpace(current)) {
    lights.hemi.intensity=.8; lights.fill.intensity=.8;
  }
  pass.render(scene, camera);
  requestAnimationFrame(frame);
}

const appReady = Promise.all([fetch('data/scenarios.json').then(r => r.json()), landingModels]).then(([d]) => {
  scenarios = d.scenarios; terrain.preload(scenarios); pages.setScenarios(scenarios); selectScenario('earth', true); frame();
}).catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;left:12px;bottom:12px;color:#fff">${e}</pre>`); });

window.__kitchen = { basket, shop, shelf, research, inspector, combustion, orbital, kitchen, flame, chamber, renderer, quality: () => ({ pixelRatio, PR_MIN, PR_MAX, ceiling: gov.ceiling }), terrain, props, pass, scene, camera, wave, selectScenario, goTo, snap, RIG, pages, env: () => ({ current: current?.slug, target: target?.slug, blend, R: wave.R }) };


const readyForHost = Promise.all([appReady, shelfReady, basket.ready, propVisualsReady, surfaceMaterialsReady]);
connectHost({ready:readyForHost,basket,shop,products:PRODUCTS,setActive:active=>{hostActive=active;},
  openShelf:async({allowBusy=false}={})=>{
    await readyForHost;
    if(!current)throw Error('The scene is not ready.');
    if(wave.active || basket.busy){
      if(allowBusy)return; // Reopening resumes the existing animation without changing its page or basket.
      throw Error('Wait for the current scene animation to finish.');
    }
    chamber.visible=false;terrain.plane.visible=true;setTerrain(current,target);
    document.getElementById('landing').classList.add('gone');
    document.getElementById('dots').hidden=false;pages.show('shop');
    if(!shop.active)shop.enter();
  }
});
