import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { sampleExposure, sampleDescription } from '../dist/library/kitchen/sample-exposure.mjs';

// Exercise the actual Three.js adapter without a GPU. Production keeps its import map.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../dist/library/vendor/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../dist/library/vendor/addons/' + specifier.slice('three/addons/'.length), import.meta.url).href, shortCircuit: true };
  if (specifier === 'cannon-es') return { url: new URL('../dist/library/vendor/cannon-es.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { SampleController } = await import('../dist/library/kitchen/sample-controller.js');
const { Basket } = await import('../dist/library/kitchen/basket.js');

function fixture() {
  const shared = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const geometry = new THREE.BoxGeometry(.1, .1, .1);
  const scene = new THREE.Scene(), listeners = new Set();
  const basket = { items: [], onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const signal = () => { for (const fn of listeners) fn(); };
  const controller = new SampleController({ basket, props: { gOf: () => 1.62 }, scene, origin: new THREE.Vector3() });
  function add(id, x) {
    const mesh = new THREE.Mesh(geometry, shared); mesh.position.x = x; scene.add(mesh);
    const rec = { instanceId: id, sample: true, state: 'released', mesh, body: { position: mesh.position },
      product: { id: 'ultem-1000', name: 'Amber comb', label: 'Amber comb', materials: ['Ultem 1000'], form: 'Comb', specimen: 'Tested as film.', collider: { dims: [.1, .1, .1] } } };
    basket.items.push(rec); signal(); return rec;
  }
  return { shared, geometry, scene, basket, controller, signal, add, listeners };
}

test('sample exposure keeps atmosphere independent of gravity and ignores carried items', () => {
  const base = { instanceId: 's', released: true, distance: 0, burnerIntensity: 1, oxygenSupplied: true, gravityMps2: 1.62 };
  assert.equal(sampleExposure(base).intensity, 1);
  assert.equal(sampleExposure({ ...base, gravityMps2: 3.71 }).oxygenAvailability, 1);
  assert.equal(sampleExposure({ ...base, oxygenSupplied: false }).oxygenAvailability, 0);
  assert.equal(sampleExposure({ ...base, released: false }).intensity, 0);
  assert.equal(sampleExposure({ ...base, distance: 2 }).intensity, 0);
  assert.equal(sampleExposure({ ...base, burnerIntensity: 0 }).intensity, 0);
  assert.ok(Object.values(sampleExposure({ ...base, distance: NaN, gravityMps2: NaN })).every(v => typeof v !== 'number' || Number.isFinite(v)));
});

test('same-product samples retain independent state and visual material ownership', () => {
  const f = fixture(), hot = f.add('sample-1', 0), cold = f.add('sample-2', 2);
  for (let i = 0; i < 160; i++) f.controller.update(.05, { paused: false, burnerIntensity: 1 });
  assert.ok(f.controller.getState(hot).heatLevel > .7);
  assert.equal(f.controller.getState(cold).heatLevel, 0);
  assert.notEqual(hot.mesh.material, f.shared);
  assert.equal(cold.mesh.material, f.shared);
  assert.equal(f.shared.color.getHex(), 0xffffff);
  const before = f.controller.getState(hot), time = f.controller.time;
  f.controller.update(5, { paused: true, burnerIntensity: 1 });
  assert.deepEqual(f.controller.getState(hot), before);
  assert.equal(f.controller.time, time);
  hot.mesh.position.x = 2; f.controller.oxygenSupplied = false;
  for (let i = 0; i < 40; i++) f.controller.update(.05, { paused: false, burnerIntensity: 1 });
  assert.equal(f.controller.getState(hot).combustionState, 'extinguished');
  assert.ok(f.controller.getState(hot).heatLevel < before.heatLevel);
  assert.ok(f.controller.getState(hot).damage.consumed >= before.damage.consumed);
  const coldBefore = f.controller.getState(cold);
  f.controller.reset(hot);
  assert.equal(f.controller.getState(hot).damage.consumed, 0);
  assert.deepEqual(f.controller.getState(cold), coldBefore);
  assert.equal(hot.mesh.material.color.getHex(), 0xffffff);
  f.controller.dispose(); assert.equal(f.listeners.size, 0);
});

test('removed samples release only owned materials and overlays; replacements start fresh', () => {
  const f = fixture(), rec = f.add('sample-1', 0);
  for (let i = 0; i < 160; i++) f.controller.update(.05, { paused: false, burnerIntensity: 1 });
  let ownedDisposed = 0, sharedDisposed = 0, geometryDisposed = 0;
  rec.mesh.material.addEventListener('dispose', () => ownedDisposed++);
  f.shared.addEventListener('dispose', () => sharedDisposed++);
  f.geometry.addEventListener('dispose', () => geometryDisposed++);
  f.basket.items = []; f.signal(); f.signal();
  assert.equal(f.controller.getState(rec), null);
  assert.equal(ownedDisposed, 1); assert.equal(sharedDisposed, 0); assert.equal(geometryDisposed, 0);
  assert.equal(f.controller.visuals.items.size, 0);
  assert.equal(rec.mesh.material, f.shared);
  const replacement = f.add('sample-2', 0);
  assert.equal(f.controller.getState(replacement).damage.consumed, 0);
  f.controller.dispose();
});

test('inspector content identifies the physical sample and separates cues from measurements', () => {
  const f = fixture(), a = f.add('sample-1', 0), b = f.add('sample-2', 2);
  assert.match(sampleDescription(a, f.controller.getState(a)).kind, /sample-1/);
  assert.match(sampleDescription(b, f.controller.getState(b)).kind, /sample-2/);
  assert.match(sampleDescription(a).observe, /do not predict/);
  assert.match(sampleDescription(a).note, /Tested as film/);
  assert.equal(sampleDescription(a, f.controller.getState(a)).support, 'oxygen-limit records');
  assert.match(sampleDescription(a).note, /everyday object was not tested/);
  const modelOnly = { ...a, product: { ...a.product, id: 'polycarbonate' } };
  assert.equal(sampleDescription(modelOnly).support, 'model-derived values only');
  f.controller.dispose();
});

test('basket allocates stable, unreused IDs and bounds total scene samples', async () => {
  const product = { id: 'ultem-1000', phys: { mass: .02, surface: 'plastic' }, collider: { dims: [.1, .1, .1] } };
  const basket = { mode: 'held', items: [], canAct: () => true, template: async () => new THREE.Group(),
    getGravity: () => 1.62, colliders: () => ({ kind: 'box', list: [] }), spawnPoint: () => new THREE.Vector3(),
    props: { addBody: ({ mesh, extra }) => ({ mesh, ...extra }) }, emit() {} };
  const a = await Basket.prototype.add.call(basket, product);
  basket.items = [];
  const b = await Basket.prototype.add.call(basket, product);
  assert.notEqual(a.instanceId, b.instanceId);
  assert.match(b.instanceId, /^sample-\d+$/);
  basket.items = Array.from({ length: 12 }, () => ({ state: 'released' }));
  await assert.rejects(Basket.prototype.add.call(basket, product), /scene holds 12/i);
});
