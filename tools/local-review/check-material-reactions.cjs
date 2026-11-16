const fs = require('node:fs'), assert = require('node:assert/strict');
const load = file => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('Flame_in_Freefall_2026/10_webapp/kitchen/' + file, 'utf8')).toString('base64'));
(async () => {
  const { MaterialReactions } = await load('material-reactions.js'), { MATERIAL_PROFILES: profiles } = await load('material-profiles.js');
  const r = new MaterialReactions(profiles), hot = id => ({ instanceId: id, intensity: 1, oxygenAvailability: 1, gravityMps2: 9.81 });
  r.register({ instanceId: 'near', productId: 'beefy-t' }); r.register({ instanceId: 'far', productId: 'beefy-t' });
  assert.throws(() => r.register({ instanceId: 'near', productId: 'pmma' }), /duplicate/);
  let notifications = 0; const off = r.onChange(() => notifications++);
  r.update(10, { exposures: [hot('near')] });
  assert.equal(r.getState('near').combustionState, 'flaming'); assert.equal(r.getState('far').heatLevel, 0);
  assert.ok(r.getState('near').damage.charred > 0);
  const before = r.getState('near'); r.update(3, { paused: true, exposures: [hot('near')] }); assert.deepEqual(r.getState('near'), before);
  const edited = r.getState('near'); edited.damage.charred = 0; assert.deepEqual(r.getState('near'), before);
  r.update(1, { exposures: [{ ...hot('near'), intensity: 0, oxygenAvailability: 0.15 }] });
  assert.equal(r.getState('near').combustionState, 'smoldering');
  r.update(15); assert.equal(r.getState('near').combustionState, 'extinguished');
  assert.ok(r.getState('near').heatLevel < before.heatLevel); assert.ok(r.getState('near').damage.charred >= before.damage.charred);
  assert.ok(notifications < 260); off(); assert.equal(r.listeners.size, 0);
  r.reset('near'); assert.deepEqual(r.getState('near').damage, { melted: 0, charred: 0, consumed: 0 });
  const long = new MaterialReactions(profiles), split = new MaterialReactions(profiles);
  for (const system of [long, split]) system.register({ instanceId: 'a', productId: 'pmma' });
  long.update(7.3, { exposures: [hot('a')] });
  for (let i = 0; i < 438; i++) split.update(1 / 60, { exposures: [hot('a')] });
  assert.deepEqual(split.getState('a'), long.getState('a'));
  for (const dt of [-1, NaN, Infinity]) assert.throws(() => r.update(dt), /dt/);
  assert.throws(() => r.update(1, { exposures: [{ ...hot('near'), intensity: NaN }] }), /exposure/);
  for (const productId of [...Object.keys(profiles), 'unknown-grade']) {
    const id = productId; r.register({ instanceId: id, productId }); r.update(3, { exposures: [hot(id)] });
    const state = r.getState(id); assert.ok(Number.isFinite(state.heatLevel));
    assert.ok(Object.values(state.damage).every(v => v >= 0 && v <= 1));
    if (productId === 'p213' || productId === 'unknown-grade') assert.deepEqual(state.damage, { melted: 0, charred: 0, consumed: 0 });
  }
  long.update(100, { exposures: [hot('a')] }); assert.equal(long.getState('a').damage.consumed, 1);
  assert.equal(long.getState('a').combustionState, 'extinguished');
  assert.equal(r.remove('near'), true); assert.equal(r.remove('near'), false);
  r.dispose(); assert.equal(r.states.size, 0); assert.equal(r.listeners.size, 0);
  // Same device, same plain-JS workload: 12 simultaneous instances, including every catalog profile.
  const bench = new MaterialReactions(profiles), ids = Object.keys(profiles);
  for (let i = 0; i < 12; i++) bench.register({ instanceId: String(i), productId: ids[i % ids.length] });
  const exposures = Array.from({ length: 12 }, (_, i) => hot(String(i))), start = performance.now();
  for (let i = 0; i < 1000; i++) bench.update(0.1, { exposures });
  console.log(`Reaction core passed: independent samples, residual reaction, pause, timestep, gaps, cleanup. 12 samples: ${((performance.now() - start) / 1000).toFixed(3)} ms/update.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
