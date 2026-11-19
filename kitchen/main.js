import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fitPropModel } from './prop-models.js?v=model-swap-1';
import { ObjectInspector } from './inspect.js?v=roof-1';
import { applySurfaceMaterials } from './materials.js?v=surface-textures-2';
import { Combustion } from './combustion.js?v=o2-15';
import { CameraMotion } from './motion.js?v=motion-1';
import { WORLD, SWEEP, SWEEP_GLSL, SWEEP_FN, buildKitchen, buildFlame, buildSky, buildLights } from './scene.js?v=noknobs-1';
import { buildStars } from './stars.js?v=lab-controls-3';
import { buildTerrain } from './terrain.js?v=flat-1';
import { Props } from './props.js?v=basket-1';
import { WavePass, Wave } from './wave.js?v=object-inspect-1';
import { Pages } from './pages.js?v=basket-1';
import { research } from './research-source.js?v=basket-1';
import { Basket } from './basket.js?v=feet-1';
import { Shop } from './shop.js?v=loot-1';
import { mountResearchBrowser } from './research-db/browser.js?v=lazy-1';
import { sfx, HIT_TAKES } from './sfx.js?v=sfx-10';
import { mountSoundToggle } from './sound-toggle.js?v=sfx-8';
import { registerMaterialLibrary } from './material-search/bridge.js';   // same URL as ui.js imports: one basket bridge
import { PRODUCTS } from './catalog.js?v=basket-1';
import { Shelf } from './shelf3d.js?v=loot-1';
import { DistantEarth } from './distant-earth.js?v=scan-6';
import { ReactionSystem } from './reaction-visuals.js';

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
// A tuft is a ~1 m wide, ~1.2 m tall card that leans in the wind, so a blade reaches ~0.7 m from the spot it is rooted at:
// the zones are grown by GRASS_REACH so no blade pokes through the cabinets, the shelf or the basket.
const GRASS_REACH = 0.7;
const keepOut = (x, z) => KEEP_OUT.some(([x0, z0, x1, z1]) => x > x0 - GRASS_REACH && x < x1 + GRASS_REACH && z > z0 - GRASS_REACH && z < z1 + GRASS_REACH) || STANDS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + GRASS_REACH * 0.6);
// The Mars / Moon meshes carry rocks: level them inside the store rectangle so none cuts through the shelf or hides its tags.
const terrain = buildTerrain(scene, SWEEP, SWEEP_GLSL, SWEEP_FN, { keepOut, flatten: { rect: [1.7, -0.9, 4.6, 4.2], floor: { rect: [1.9, -0.9, 4.4, 0.7], y: -0.02 } } });
const stars = buildStars(scene);
const sky = buildSky(scene);
const lights = buildLights(scene);
const pass = new WavePass(renderer);
const wave = new Wave(WORLD.flame);
const props = new Props(scene, camera, canvas, WORLD.flame, kitchen);
const combustion = new Combustion(scene,camera,canvas,WORLD.flame,props);
const modelLoader = new GLTFLoader();
const basket = new Basket({ scene, props, loader: modelLoader, getGravity: () => props.gNew, canAct: () => !wave.active });
const reactionSystem = new ReactionSystem({ basket, props, origin: WORLD.flame });
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
const distantEarth = new DistantEarth(scene, WORLD.flame);   // the Earth outside the orbital cabin: global scan, drawn on the globe itself
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
  let earthMesh = null;
  if (name==='orbital-cabin') model.traverse(o=>{
    if (o.isMesh && o.name.startsWith('Distant_Earth')) earthMesh = o;
  });
  if (earthMesh) distantEarth.adopt(earthMesh);   // own material + scan; moved out of the orbital group's clip
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
  work:    { pos: new THREE.Vector3(.48, 2.95, 1.45), look: new THREE.Vector3(.15, .98, .08), fov: 58 },
  detail:  { pos: new THREE.Vector3(0.42, 1.18, 0.55), look: new THREE.Vector3(0.05, 0.94, 0.08), fov: 34 },
  about:   { pos: new THREE.Vector3(-2.6, 1.5, 3.4), look: new THREE.Vector3(0.6, 0.8, 0.2), fov: 44 },
  // SORAINE: the worktop the basket is tipped onto (flame stays in frame). Shelf, product and basket views: shelf3d.js.
  bench:   { pos: new THREE.Vector3(1.55, 1.78, 2.25), look: new THREE.Vector3(0.82, 0.96, 0.32), fov: 46 }
};
// Arc moves that keep their speed when a new goTo() interrupts them (motion.js).
const cam = new CameraMotion(THREE, RIG.landing);
const snap = (rig) => cam.snap(rig);
const goTo = (rig, dur = 1.6) => cam.goTo(rig, dur);
const workView = { active: false, requested: false, lastInput: 0, idleMs: 7000 };
const workRay = new THREE.Raycaster(), workPointer = new THREE.Vector2(), workHit = new THREE.Vector3();
const workPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.98);
function restRig() { return isSpace(target) && !chamber.visible ? RIG.orbital : RIG.cook; }
// Narrow screens need more width: widen the lens first (up to 75°), then pull back for the rest. Inside the lab /
// orbital cabin the pull-back stops below the ceiling (shell top 4.13 m); pulling 2x on a phone put the camera
// outside the cabin, which rendered as an empty dark screen.
const WORK_ASPECT = .95, WORK_FOV_MAX = 75, WORK_CEILING = 3.75;
function workRig() {
  const half = (deg) => Math.tan(THREE.MathUtils.degToRad(deg) / 2);
  const need = half(RIG.work.fov) * WORK_ASPECT / Math.max(.2, camera.aspect);           // tan(vfov/2) that keeps the width
  const fov = Math.min(WORK_FOV_MAX, Math.max(RIG.work.fov, THREE.MathUtils.radToDeg(2 * Math.atan(need))));
  const offset = RIG.work.pos.clone().sub(RIG.work.look);
  const roof = labShell.visible ? (WORK_CEILING - RIG.work.look.y) / offset.y : 2.2;
  const scale = Math.max(1, Math.min(roof, need / half(fov)));
  return { pos: RIG.work.look.clone().add(offset.multiplyScalar(scale)), look: RIG.work.look, fov };
}
function resetWorkView() { workView.active = workView.requested = false; }
function requestWorkView() {
  if (pages.page !== 'observe' || inspector.active || wave.active || inspector.motion.matches) return;
  workView.lastInput = performance.now();
  if (!workView.active) workView.requested = true;
}
function updateWorkView() {
  if (pages.page !== 'observe' || wave.active) { resetWorkView(); return; }
  if (inspector.active) { workView.requested = false; workView.lastInput = performance.now(); return; }
  if (inspector.motion.matches) { if (workView.active) { resetWorkView(); snap(restRig()); } return; }
  if (props.held || props.pending) { workView.lastInput = performance.now(); return; }
  if (workView.requested) { workView.requested = false; workView.active = true; goTo(workRig(), .9); }
  else if (workView.active && cam.moving) workView.lastInput = performance.now();
  else if (workView.active && performance.now() - workView.lastInput >= workView.idleMs) { resetWorkView(); goTo(restRig(), 1.4); }
}

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
  resetWorkView();
  if (immediate || !current) { current = target = s; blend = 1; Object.assign(flameTarget, s.flame); Object.assign(flameState, s.flame); applyEnv(s, s, 1); setTerrain(s, s); SWEEP.uRadius.value = 1e5; props.setGravity(s.g, s.g, -1); }
  else { if (wave.active) { current = mixScenario(current, target, blend); } target = s; blend = 0; Object.assign(flameTarget, s.flame); flameSwept = false; setTerrain(current, target); wave.fire(); sfx.play('planet-switch', { delay: .15 }); props.fire(current.g, target.g); }
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
    document.documentElement.dataset.page = p;   // sound toggle moves beside ↩ in the store
    resetWorkView();
    inspector?.close({ restore: false });
    if (p === 'shop') shop.enter();
    else { if (shop?.active) shop.exit(); goTo(RIG[p] || (isSpace(target) ? RIG.orbital : RIG.cook), 1.5); }
    shopOpen.hidden = p !== 'observe';
    if (p === 'detail') materialSearch?.show(); else materialSearch?.hide();
    document.getElementById('combustion-status').hidden = p === 'shop';
    pass.uniforms.uDof.value = 0;
  },
  onScenario: (slug) => selectScenario(slug)
});
// The flame is not a physics body: an invisible, unscaled pick volume makes it hoverable and clickable.
const flamePick = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .2, 12), new THREE.MeshBasicMaterial({ visible: false }));
flamePick.position.y = .09; flame.group.add(flamePick);
const pct = v => `${Math.round(v * 100)}% · demo scale`;
const flameExtra = { name: 'flame', mesh: flame.group, extra: true, hint: () => ({
  fields: { state: burn > .01 ? (flameState.sphere > .5 ? 'Burning · rounded' : 'Burning') : 'Out',
    heat: pct(combustion.fuel), temperature: 'Not modelled', thermal: pct(combustion.oxygen),
    change: `${Math.round(flameState.height * 100)}% height · ${Math.round(flameState.width * 100)}% width` },
  labels: { heat: 'Fuel', thermal: 'Oxygen', change: 'Shape vs Earth' },
  note: 'Mechanism demo · not a combustion simulation' }) };
inspector = new ObjectInspector({
  props, canvas, camera, reactions: reactionSystem.reactions, research, extras: [flameExtra],
  // Where Back to scene returns: the view the camera is settling on, never the pose it happens to be passing through.
  // Opening an object while the camera is still flying (into or out of the work view, back to the cabin rig) used to
  // store a half-way pose, and Back left the camera parked there.
  getRig: () => {
    const rig = pages.page !== 'observe' ? cam.to : workView.active ? workRig() : restRig();
    return { pos: rig.pos.clone(), look: rig.look.clone(), fov: rig.fov };
  },
  moveCamera: (rig, duration) => goTo(rig, duration),
  getScenario: () => target || current,
  canOpen: () => pages.page === 'observe' && !wave.active,
  isObserve: () => pages.page === 'observe',
  ceiling: () => labShell.visible ? WORK_CEILING : Infinity   // lab / orbital cabin roof (shell top 4.13 m)
});
shop = new Shop({
  basket, research, shelf, rigs: RIG, getScenario: () => target || current, isWorldBusy: () => wave.active,
  onView: (rig, dur) => { if (pages.page === 'shop' && rig) goTo(rig, dur ?? 1.3); },
  onExit: (note) => { pages.show('observe'); if (note) document.getElementById('combustion-status').textContent = note; }
});
// shelf display: tags carry record counts, so wait for the snapshot (it is small); the tag tilt aims at the shelf eye
research.load().catch(() => {}).then(() => shelf.ready).then(() => shelf.populate(PRODUCTS, (p) => basket.template(p),
  (p) => research.byId ? research.byIds(p.measurementIds).length : 0, shelf.shelfRig(16 / 10).pos)).catch(e => console.error('Shelf display failed', e));
shopOpen.addEventListener('click', () => pages.show('shop'));
// ---------- detail page: team research database + material search (kitchen/research-db/, kitchen/material-search/) ----------
const productById = (id) => PRODUCTS.find(p => p.id === id);
const until = (ok, ms) => new Promise((res, rej) => { const t0 = performance.now(); (function poll() { if (ok()) res(); else if (performance.now() - t0 > ms) rej(new Error('The basket is not ready yet.')); else setTimeout(poll, 50); })(); });
// The basket only takes samples while it is held at the shelf, so adding from search opens the product there and adds one.
async function showOnShelf(id) { pages.show('shop'); await shop.openProduct(productById(id)); }
const materialSearch = mountResearchBrowser(document.getElementById('material-search'), { searchOptions: { onOpenShelf: () => pages.show('shop') } });
registerMaterialLibrary({
  getBasket: () => [...new Set(basket.inCart().map(r => r.product.id))],
  addToBasket: async (id) => { await showOnShelf(id); await until(() => basket.mode === 'held', 4000); await shop.setQty(1); },
  removeFromBasket: (id) => { basket.removeOne(id); },
  selectMaterial: showOnShelf,
  subscribe: (fn) => basket.onChange(fn)
}).catch(e => console.error('Material search basket link failed', e));
props.canInteract = () => pages.page === 'observe' && !inspector.active;
combustion.canInteract = () => !inspector.active;
// Reframe before a manipulation; keep the lens fixed from pointer-down to pointer-up.
const onWorkPointer = e => {
  if (e.type === 'pointermove' && !(e.movementX || e.movementY) && !props.held) return;
  if (pages.page !== 'observe' || inspector.active || wave.active) return;
  const rect = canvas.getBoundingClientRect();
  workPointer.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
  workRay.setFromCamera(workPointer, camera);
  if (props.held || (workRay.ray.intersectPlane(workPlane, workHit) && workHit.x > -1.9 && workHit.x < 1.75 && Math.abs(workHit.z) < .8)) requestWorkView();
};
canvas.addEventListener('pointermove', onWorkPointer);
canvas.addEventListener('pointerup', onWorkPointer);
document.addEventListener('keydown', e => {
  if (!e.repeat && e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.metaKey && !e.altKey &&
      !e.target.closest('input, textarea, select, [contenteditable="true"]')) requestWorkView();
});

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
  if (workView.active && !inspector.active) workView.requested = true;
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
const clock = new THREE.Clock(); let time = 0, burn = 1, drift = 0;
// ---------- sound (kitchen/sfx.js) ----------
mountSoundToggle(sfx); let inspecting = false;
// Collisions. Each body's physics material picks a class; a pair sounds as its softest/hardest member:
// fabric absorbs (fabric wins), then metal rings, then wood, else hard. Loudness follows impact speed;
// a per-body cooldown and a global budget keep a landing from machine-gunning.
const HIT_CLASS = { wood: 'wood', counter: 'wood', steel: 'metal', castIron: 'metal', enamel: 'metal', glass: 'hard', ceramic: 'hard',
  plastic: 'hard', film: 'hard', eggshell: 'hard', fabric: 'fabric', tape: 'fabric', tomato: 'fabric', ground: 'fabric' };
const hitClassOf = (body, rec) => rec?.name === 'friedEgg' ? 'fabric' : HIT_CLASS[(body.material?.name || '').split(':')[0]] || 'hard';
let hitBudget = 0;
function wireHits() {
  for (const rec of props.bodies) {
    if (rec.hitWired) continue; rec.hitWired = true; rec.lastHit = 0; rec.lastV = 0;
    rec.body.addEventListener('collide', (e) => {
      const other = e.body; if (other.mass > 0 && other.id < rec.body.id) return;   // a moving pair sounds once
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v < .35) return;
      // A harder hit gets through the cooldown and the budget a moment after a grazing one (egg nudged, then the board).
      const now = performance.now(); if (now - rec.lastHit < 90 && v < rec.lastV * 1.5) return;
      if (hitBudget < 1 && v < 1.2) return;
      rec.lastHit = now; rec.lastV = v; hitBudget = Math.max(0, hitBudget - 1);
      const a = hitClassOf(rec.body, rec), b = hitClassOf(other, other.mass > 0 ? props.bodies.find(r => r.body === other) : null);
      const cls = a === 'fabric' || b === 'fabric' ? 'fabric' : a === 'metal' || b === 'metal' ? 'metal' : a === 'wood' || b === 'wood' ? 'wood' : 'hard';
      const volume = Math.min(1, ((v - .35) / 2.2) ** .8 + .12) * Math.min(1, .45 + rec.body.mass * 1.5);   // light samples tap softer
      sfx.play(`hit-${cls}-${1 + Math.floor(Math.random() * HIT_TAKES[cls])}`, { volume, rate: .92 + Math.random() * .16 });
    });
  }
}
const fire = sfx.loop('fire-loop');
const sizzle = sfx.loop('pan-sizzle'); let sizzleKick = 0;
combustion.onDrop = () => sfx.play(sfx.pick('oil-drop-1', 'oil-drop-2'), { rate: 1.45 + Math.random() * .35, volume: .7 + Math.random() * .3 });   // sped-up drip
combustion.onDropReceived = () => { sizzleKick = Math.min(1.2, sizzleKick + .45); };
// Oxygen arm. The orbital cabin injects automatically every 15 s (combustion.autoInterval), so those repeats play softer.
combustion.onArm = (deploy, auto) => deploy
  ? sfx.play(sfx.pick('arm-deploy-1', 'arm-deploy-2', 'arm-deploy-3'), { volume: auto ? .6 : 1, rate: .97 + Math.random() * .06 })
  : sfx.play('arm-stow', { volume: auto ? .6 : 1 });
combustion.onButton = () => sfx.play('o2-button', { rate: .97 + Math.random() * .06 });
combustion.onInject = (auto) => sfx.play('oxygen-hiss', { volume: auto ? .6 : 1, rate: .95 + Math.random() * .1 });
// Ambience per world, following the air each place has: Earth grass + wind; Mars only a low, muffled wind (thin
// CO2 atmosphere: same recording slowed and low-passed); Moon silent (no atmosphere); orbital cabin: fan hum (ambience-cabin).
// Mixed with the same blend as the sky/fog, so it changes as the scan front passes the camera.
const amb = { grass: sfx.loop('ambience-grass'), wind: sfx.loop('ambience-wind'), marsWind: sfx.loop('ambience-wind', { rate: .62, lowpass: 520 }), cabin: sfx.loop('ambience-cabin') };
const AMB = { earth: { grass: 1, wind: .55 }, mars: { marsWind: 1 }, moon: {}, iss: { cabin: 1 } };
function updateAmbience() {
  const a = AMB[current?.slug] || {}, b = AMB[target?.slug] || {}, k = target === current ? 1 : blend;
  // Moon: no atmosphere, so the whole scene goes silent, fading with the scan front like the sky does.
  const moon = (current?.slug === 'moon' ? 1 : 0) * (1 - k) + (target?.slug === 'moon' ? 1 : 0) * k;
  sfx.setWorld(1 - moon);
  const page = chamber.visible ? 0 : ({ observe: 1, about: .8, shop: .7, detail: .3 }[pages.page] ?? 0);
  for (const [key, h] of Object.entries(amb)) { h.tick(); h.set(((a[key] || 0) * (1 - k) + (b[key] || 0) * k) * page * (inspector.active ? .7 : 1), .6); }
}
const viewShift = { x: 0, y: 0 };
const tmpUp = new THREE.Vector3(0, 1, 0);
const heldCameraPosition = new THREE.Vector3(); let holdingCamera = false;
function frame() {
  const rawDt = clock.getDelta(); govern(rawDt);
  const dt = Math.min(rawDt, 0.05); time += dt;
  updateWorkView();
  const holdCamera = !!(props.pending || props.held) && !inspector.active;
  if (holdCamera && !holdingCamera) heldCameraPosition.copy(camera.position);
  holdingCamera = holdCamera;
  // camera tween
  if (!holdCamera) cam.update(dt);
  // idle drift (breathing) in cook view, faded in and out so page changes never jump
  const driftTo = inspector.active || workView.active || holdCamera || pages.page === 'shop' ? 0 : pages.page === 'observe' ? 1 : 0.4;
  drift += (driftTo - drift) * (1 - Math.exp(-dt * 4)); if (!driftTo && drift < .02) drift = 0;   // still camera for inspector/shop
  camera.position.copy(cam.pos); camera.position.x += Math.sin(time * 0.45) * 0.012 * drift; camera.position.y += Math.sin(time * 0.7) * 0.008 * drift;
  if (holdCamera) camera.position.copy(heldCameraPosition);
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
  if (!paused) burn=combustion.update(dt);
  else combustion.frameArm();
  // Pan sizzle follows the burner; quieter away from the bench, and a short flare when oil reaches the flame.
  sizzleKick = Math.max(0, sizzleKick - dt * 1.8);
  const sizzlePage = { observe: 1, about: .6, detail: .35, shop: .3 }[pages.page] ?? 0;
  // Only while the pan sits over the burner (it rests 8 cm above the flame): fades out as it is lifted, moved off or floats away.
  const panBody = props.bodies.find(b => b.name === 'pan')?.body, fo = combustion.origin;
  const onBurner = !panBody ? 0 : (1 - THREE.MathUtils.smoothstep(Math.hypot(panBody.position.x - fo.x, panBody.position.z - fo.z), .06, .18))
    * (1 - THREE.MathUtils.smoothstep(Math.abs(panBody.position.y - fo.y - .08), .04, .22));
  sizzle.tick(); sizzle.set(Math.min(1, burn / 1.1) * onBurner * sizzlePage * (paused ? .55 : 1) * (1 + sizzleKick), .2);
  // Fire: a soft bed under the burner flame, much louder while any sample is burning.
  let flaming = 0; for (const s of reactionSystem.reactions?.states?.values?.() || []) if (s.combustionState === 'flaming') flaming++;
  fire.tick(); fire.set((Math.min(1, burn / 1.1) * .35 + Math.min(1, flaming / 2) * .8) * sizzlePage * (paused ? .55 : 1), .3);
  hitBudget = Math.min(4, hitBudget + dt * 12); wireHits();
  updateAmbience();
  if (inspector.active !== inspecting) { inspecting = !!inspector.active; document.documentElement.classList.toggle('inspecting', inspecting); }
  reactionSystem.update(dt, { paused, burn, oxygenAvailability: Math.min(1, combustion.oxygen) });
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
  distantEarth.update({ R: SWEEP.uRadius.value, trail: wave.trail(), spacing: pass.uniforms.uSpacing.value, role: orbitalRole.value, visible: orbital.visible });
  terrain.update(time, camera);
  stars.uniforms.uTime.value = time;
  lights.sun.target.position.set(0.3, 0.8, 0.2);
  if (isSpace(target) && isSpace(current)) {
    lights.hemi.intensity=.8; lights.fill.intensity=.8;
  }
  pass.render(scene, camera);
  requestAnimationFrame(frame);
}

Promise.all([fetch('data/scenarios.json').then(r => r.json()), landingModels]).then(([d]) => {
  scenarios = d.scenarios; terrain.preload(scenarios); pages.setScenarios(scenarios); selectScenario('earth', true); frame();
}).catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;left:12px;bottom:12px;color:#fff">${e}</pre>`); });

window.__kitchen = { distantEarth, sfx, sizzle, amb, fire, basket, shop, shelf, research, inspector, combustion, reactionSystem, workView, orbital, kitchen, flame, chamber, renderer, quality: () => ({ pixelRatio, PR_MIN, PR_MAX, ceiling: gov.ceiling }), terrain, props, pass, scene, camera, wave, selectScenario, goTo, snap, RIG, pages, env: () => ({ current: current?.slug, target: target?.slug, blend, R: wave.R }) };

