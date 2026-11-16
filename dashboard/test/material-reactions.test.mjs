import test from 'node:test';
import assert from 'node:assert/strict';
import {MaterialReactions, SCHEMATIC} from '../dist/library/kitchen/material-reactions.mjs';
import {PROFILES, PRODUCT_IDS} from '../dist/library/kitchen/material-profiles.mjs';
import {MATERIAL_IDS} from '../server/material-search.mjs';

const heat = (id, intensity = 1, oxygenAvailability = 1, gravityMps2 = 9.81) => ({instanceId: id, intensity, oxygenAvailability, gravityMps2});
const run = (store, seconds, exposures = []) => { for (let t = 0; t < seconds * 60; t++) store.update(1 / 60, {exposures}); };
const allStates = store => store.getStates();

test('profiles cover exactly the nine shelf products and hold no research numbers', () => {
  assert.deepEqual([...PRODUCT_IDS].sort(), [...MATERIAL_IDS].sort());
  for (const id of PRODUCT_IDS) {
    const {capabilities, basis, support, specimen, notTested, productId} = PROFILES[id];
    assert.equal(productId, id);
    assert.deepEqual(Object.keys(capabilities).sort(), ['charring', 'flaming', 'melting', 'smoldering']);
    assert.ok(Object.values(capabilities).every(value => value === 'illustrative' || value === 'unsupported'));
    assert.equal(capabilities.melting, 'unsupported'); assert.equal(capabilities.charring, 'unsupported');
    assert.equal(capabilities.smoldering, id === 'beefy-t' ? 'illustrative' : 'unsupported');
    assert.doesNotMatch(JSON.stringify({capabilities, basis, support, specimen, notTested}), /\d/, 'no numeric values in a profile');
    assert.ok(['flame-spread records', 'oxygen-limit records', 'model-derived values only'].includes(support));
    assert.match(basis, /schematic/); assert.match(notTested, /everyday object was not tested/); assert.match(notTested, /not a prediction/);
  }
});

test('each profile states the support level the research collection actually gives', async () => {
  const {readFile} = await import('node:fs/promises');
  const data = JSON.parse((await readFile(new URL('../dist/data/research.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
  const experiments = new Map(data.experiments.map(e => [e.experiment_id, e]));
  for (const id of PRODUCT_IDS) {
    const {material, support} = PROFILES[id];
    const rows = data.measurements.filter(m => experiments.get(m.experiment_id).material.startsWith(material));
    assert.ok(rows.length > 0, `${material} has records`);
    const measured = rows.filter(m => !m.evidence_type.startsWith('model_derived'));
    const expected = measured.some(m => m.metric.startsWith('flame_')) ? 'flame-spread records'
      : measured.some(m => /^(ULOI|MOC)/.test(m.metric)) ? 'oxygen-limit records' : 'model-derived values only';
    assert.equal(support, expected, material);
  }
});

test('a new sample starts ambient, undamaged and schematic; snapshots are copies', () => {
  const store = new MaterialReactions();
  const first = store.register({instanceId: 'sample-1', productId: 'pmma'});
  assert.deepEqual(first, {instanceId: 'sample-1', productId: 'pmma', thermalState: 'ambient', combustionState: 'none', heatLevel: 0,
    damage: {melted: 0, charred: 0, consumed: 0}, gravityMps2: null, capabilities: {...PROFILES.pmma.capabilities},
    support: 'flame-spread records', evidenceMode: 'schematic'});
  first.heatLevel = 9; first.damage.consumed = 9; first.capabilities.melting = 'illustrative';
  assert.equal(store.getState('sample-1').heatLevel, 0); assert.equal(store.getState('sample-1').damage.consumed, 0);
  assert.equal(store.getState('sample-1').capabilities.melting, 'unsupported');
  assert.equal(store.getState('missing'), null);
});

test('registration rejects duplicates, unknown products and bad ids', () => {
  const store = new MaterialReactions();
  store.register({instanceId: 'sample-1', productId: 'pmma'});
  assert.throws(() => store.register({instanceId: 'sample-1', productId: 'sibal'}), /already registered/);
  assert.throws(() => store.register({instanceId: 'sample-2', productId: 'gold'}), RangeError);
  assert.throws(() => store.register({instanceId: '', productId: 'pmma'}), TypeError);
  assert.throws(() => store.register(), TypeError);
});

test('two samples of the same product keep independent state and damage', () => {
  const store = new MaterialReactions();
  store.register({instanceId: 'sample-1', productId: 'pmma'}); store.register({instanceId: 'sample-2', productId: 'pmma'});
  run(store, 6, [heat('sample-1')]);
  const a = store.getState('sample-1'), b = store.getState('sample-2');
  assert.equal(a.combustionState, 'flaming'); assert.ok(a.heatLevel > 0.7 && a.damage.consumed > 0);
  assert.deepEqual([b.heatLevel, b.thermalState, b.combustionState, b.damage.consumed], [0, 'ambient', 'none', 0]);
});

test('no exposure means no external heating; the sample cools and keeps its damage', () => {
  const store = new MaterialReactions();
  store.register({instanceId: 'sample-1', productId: 'sibal'});
  run(store, 2, []); assert.equal(store.getState('sample-1').heatLevel, 0);
  run(store, 6, [heat('sample-1')]);
  const hot = store.getState('sample-1'); assert.equal(hot.thermalState, 'heating'); assert.equal(hot.combustionState, 'flaming');
  run(store, 1, [heat('sample-1', 0, 0)]);
  const out = store.getState('sample-1'); assert.equal(out.combustionState, 'extinguished');
  run(store, 40, []);
  const cold = store.getState('sample-1');
  assert.equal(cold.thermalState, 'ambient'); assert.equal(cold.combustionState, 'extinguished');
  assert.equal(cold.damage.consumed, out.damage.consumed, 'cooling does not undo damage'); assert.ok(cold.damage.consumed > 0);
});

test('heat alone does not start combustion without reported oxygen, and unsupported behaviour stays off', () => {
  const store = new MaterialReactions();
  store.register({instanceId: 'sample-1', productId: 'ultem-1000'}); store.register({instanceId: 'sample-2', productId: 'beefy-t'});
  run(store, 8, [heat('sample-1', 1, 0), heat('sample-2', 1, 0.3)]);
  const ultem = store.getState('sample-1'), cotton = store.getState('sample-2');
  assert.equal(ultem.combustionState, 'none'); assert.equal(ultem.damage.consumed, 0);
  assert.equal(cotton.combustionState, 'smoldering', 'only Beefy-T may smolder'); assert.ok(cotton.damage.consumed > 0);
  for (const state of [ultem, cotton]) { assert.equal(state.damage.melted, 0); assert.equal(state.damage.charred, 0); }
  const other = new MaterialReactions(); other.register({instanceId: 's', productId: 'ultem-1000'});
  run(other, 8, [heat('s', 1, 0.3)]); assert.equal(other.getState('s').combustionState, 'none', 'Ultem has no smoldering capability');
});

test('a fully consumed sample stops burning and every value stays finite within 0..1', () => {
  const store = new MaterialReactions();
  for (const [index, productId] of PRODUCT_IDS.entries()) store.register({instanceId: `sample-${index + 1}`, productId});
  const exposures = PRODUCT_IDS.map((_, index) => heat(`sample-${index + 1}`, 5, 7, 0));   // out-of-range inputs are clamped
  for (let second = 0; second < 60; second++) {
    run(store, 1, exposures);
    for (const state of allStates(store)) for (const value of [state.heatLevel, ...Object.values(state.damage)]) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
  for (const state of allStates(store)) { assert.equal(state.damage.consumed, 1); assert.equal(state.combustionState, 'extinguished'); assert.equal(state.gravityMps2, 0); }
});

test('paused freezes time and state', () => {
  const store = new MaterialReactions(); store.register({instanceId: 'sample-1', productId: 'pmma'});
  run(store, 3, [heat('sample-1')]);
  const before = store.getState('sample-1'); let events = 0; store.onChange(() => { events += 1; });
  for (let i = 0; i < 600; i++) assert.equal(store.update(1 / 60, {paused: true, exposures: [heat('sample-1')]}), 0);
  assert.deepEqual(store.getState('sample-1'), before); assert.equal(events, 0);
});

test('invalid dt and malformed exposures are rejected; long frames are capped; unknown samples are ignored', () => {
  const store = new MaterialReactions(); store.register({instanceId: 'sample-1', productId: 'pmma'});
  for (const dt of [-0.1, NaN, Infinity, -Infinity, '0.1', undefined]) assert.throws(() => store.update(dt), RangeError);
  assert.throws(() => store.update(0.1, {exposures: [heat('sample-1', NaN)]}), TypeError);
  assert.throws(() => store.update(0.1, {exposures: [heat('sample-1', 1, 1, -1)]}), RangeError);
  assert.throws(() => store.update(0.1, {exposures: 'x'}), TypeError);
  assert.equal(store.getState('sample-1').heatLevel, 0, 'a rejected update changes nothing');
  assert.equal(store.update(0), 0);
  assert.equal(store.update(3600, {exposures: [heat('sample-1')]}), Math.round(SCHEMATIC.MAX_FRAME_SECONDS / SCHEMATIC.STEP_SECONDS));
  assert.doesNotThrow(() => store.update(0.1, {exposures: [heat('ghost')]}));
});

test('the result does not depend on how a duration is split into frames', () => {
  const stores = [0.1, 0.01, 1 / 60, 0.037].map(frame => {
    const store = new MaterialReactions(); store.register({instanceId: 'sample-1', productId: 'nomex-ht90'});
    let steps = 0; for (let t = 0; t < Math.round(3.7 / frame); t++) steps += store.update(frame, {exposures: [heat('sample-1', 0.8)]});
    return {steps, state: store.getState('sample-1')};
  });
  for (const {steps, state} of stores.slice(1)) {
    assert.ok(Math.abs(steps - stores[0].steps) <= 1, `${steps} vs ${stores[0].steps} steps`);
    assert.ok(Math.abs(state.heatLevel - stores[0].state.heatLevel) < 0.01);
    assert.equal(state.combustionState, stores[0].state.combustionState);
  }
});

test('reset and remove act on one sample only; repeated removal is safe', () => {
  const store = new MaterialReactions();
  store.register({instanceId: 'sample-1', productId: 'pmma'}); store.register({instanceId: 'sample-2', productId: 'pmma'});
  run(store, 6, [heat('sample-1'), heat('sample-2')]);
  const kept = store.getState('sample-2');
  const reset = store.reset('sample-1');
  assert.deepEqual([reset.heatLevel, reset.combustionState, reset.damage.consumed, reset.instanceId, reset.productId], [0, 'none', 0, 'sample-1', 'pmma']);
  assert.deepEqual(store.getState('sample-2'), kept);
  assert.throws(() => store.reset('ghost'), RangeError);
  assert.equal(store.remove('sample-1'), true); assert.equal(store.remove('sample-1'), false); assert.equal(store.getState('sample-1'), null);
  assert.deepEqual(store.getState('sample-2'), kept);
  assert.doesNotThrow(() => store.register({instanceId: 'sample-3', productId: 'pmma'}));
  assert.equal(store.getState('sample-3').damage.consumed, 0, 'a repurchase starts clean');
});

test('listeners hear display changes only, can unsubscribe, and dispose cleans up', () => {
  const store = new MaterialReactions(); const events = [];
  const off = store.onChange(event => events.push(event));
  store.register({instanceId: 'sample-1', productId: 'pmma'});
  assert.deepEqual(events.map(e => e.type), ['registered']);
  run(store, 5, []); assert.equal(events.length, 1, 'an unchanged ambient sample is silent');
  run(store, 6, [heat('sample-1')]);
  const changed = events.filter(e => e.type === 'changed');
  assert.ok(changed.length > 5 && changed.length < 360, `${changed.length} notifications for 360 steps`);
  assert.ok(changed.some(e => e.state.combustionState === 'flaming'));
  changed[0].state.damage.consumed = 5; assert.ok(store.getState('sample-1').damage.consumed <= 1);
  store.reset('sample-1'); store.remove('sample-1');
  assert.deepEqual(events.slice(-2).map(e => [e.type, e.state === null]), [['reset', false], ['removed', true]]);
  const count = events.length; off(); store.register({instanceId: 'sample-2', productId: 'sibal'}); assert.equal(events.length, count);
  store.dispose();
  for (const call of [() => store.update(0.1), () => store.getState('sample-2'), () => store.register({instanceId: 'x', productId: 'pmma'}), () => store.onChange(() => {})]) assert.throws(call, /disposed/);
});
