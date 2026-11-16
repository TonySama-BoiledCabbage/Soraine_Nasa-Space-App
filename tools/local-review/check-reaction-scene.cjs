// Scene integration and resource check; stages released samples so gravity/checkout timing does not mask reactions.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Yuntao Lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const base = path.resolve('Flame_in_Freefall_2026/10_webapp');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()); let file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
      if (file === base) file = path.join(base, 'index.html');
      if (url.hostname !== 'fixture.test' || !file.startsWith(base + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      await route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto('http://fixture.test/?lite');
    await page.waitForFunction(() => window.__kitchen?.env().current === 'earth' && __kitchen.shelf.items.size === 9 && __kitchen.research.byId, null, { timeout: 120000 });
    await page.click('#start'); await page.waitForSelector('#shop-open:visible'); await page.click('#shop-open');
    const ids = await page.evaluate(async () => {
      const k = __kitchen, { PRODUCTS } = await import('./kitchen/catalog.js?v=basket-1');
      const p = PRODUCTS.find(p => p.id === 'beefy-t');
      window.nearSample = await k.basket.add(p); window.farSample = await k.basket.add(p);
      window.stageSample = (r, x, y, z) => {
        r.state = 'released'; r.locked = false; r.noRecover = true; r.body.type = 4; // keep the staged exposure still
        r.body.position.set(x, y, z); r.body.velocity.setZero(); r.body.angularVelocity.setZero();
        r.body.quaternion.set(0, 0, 0, 1); r.mesh.position.copy(r.body.position); r.mesh.quaternion.copy(r.body.quaternion);
      };
      stageSample(nearSample, .05, 1.04, .08); stageSample(farSample, 1.2, 1.04, .2);
      k.pages.show('observe');
      window.advanceReaction = sec => { for (let i = 0; i < Math.round(sec * 10); i++) k.reactionSystem.update(.1, { burn: 1, oxygenAvailability: 1 }); };
      advanceReaction(10);
      return [nearSample.instanceId, farSample.instanceId];
    });
    assert.notEqual(ids[0], ids[1]);
    const independent = await page.evaluate(() => {
      const k = __kitchen, a = k.reactionSystem.reactions.getState(nearSample.instanceId), b = k.reactionSystem.reactions.getState(farSample.instanceId);
      const va = k.reactionSystem.visuals.get(nearSample.instanceId), vb = k.reactionSystem.visuals.get(farSample.instanceId);
      return { a, b, ownMaterial: !!va.materials && !vb.materials, copies: va.copies.size };
    });
    assert.equal(independent.a.combustionState, 'flaming'); assert.equal(independent.b.heatLevel, 0); assert.ok(independent.ownMaterial);
    // Use the actual click dispatcher: the inspector stays in the lab and retains this exact instance.
    await page.evaluate(() => __kitchen.props.onInspect(nearSample));
    await page.waitForSelector('#sample-reaction:visible');
    assert.equal(await page.locator('#object-number').textContent(), ids[0]);
    assert.match(await page.locator('#reaction-status').textContent(), /Flaming/);
    assert.equal(await page.evaluate(() => __kitchen.pages.page), 'observe');
    const frozen = await page.evaluate(() => ({ state: __kitchen.reactionSystem.reactions.getState(nearSample.instanceId), fuel: __kitchen.combustion.fuel, oxygen: __kitchen.combustion.oxygen, pos: nearSample.body.position.toArray() }));
    await page.waitForTimeout(350);
    assert.deepEqual(await page.evaluate(() => ({ state: __kitchen.reactionSystem.reactions.getState(nearSample.instanceId), fuel: __kitchen.combustion.fuel, oxygen: __kitchen.combustion.oxygen, pos: nearSample.body.position.toArray() })), frozen);
    await page.waitForFunction(() => __kitchen.camera.position.distanceTo(__kitchen.inspector.targetRig.pos) < .001 && __kitchen.pass.uniforms.uDof.value > .97);
    await page.screenshot({ path: 'outputs/local-review/reaction-sample-desktop.png' });
    await page.keyboard.press('Escape');
    await page.evaluate(() => __kitchen.snap(__kitchen.RIG.bench));
    await page.waitForFunction(() => __kitchen.camera.position.distanceTo(__kitchen.RIG.bench.pos) < .025);
    const point = await page.evaluate(async () => {
      const THREE = await import('three');
      farSample.mesh.updateWorldMatrix(true, true);
      const p = new THREE.Box3().setFromObject(farSample.mesh).getCenter(new THREE.Vector3()).project(__kitchen.camera);
      return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForSelector('#sample-reaction:visible');
    assert.equal(await page.locator('#object-number').textContent(), ids[1]);
    await page.keyboard.press('Escape');
    await page.click('#objects-toggle'); await page.click(`[data-object="${ids[1]}"]`);
    assert.equal(await page.locator('#object-number').textContent(), ids[1]);
    assert.match(await page.locator('#reaction-damage').textContent(), /No lasting change/);
    await page.keyboard.press('Escape');
    const cooling = await page.evaluate(() => {
      const k = __kitchen; stageSample(nearSample, 1.0, 1.04, .2);
      const before = k.reactionSystem.reactions.getState(nearSample.instanceId);
      for (let i = 0; i < 150; i++) k.reactionSystem.update(.1, { burn: 0, oxygenAvailability: 0 });
      return { before, after: k.reactionSystem.reactions.getState(nearSample.instanceId) };
    });
    assert.equal(cooling.after.combustionState, 'extinguished'); assert.ok(cooling.after.heatLevel < cooling.before.heatLevel);
    assert.ok(cooling.after.damage.charred >= cooling.before.damage.charred);
    await page.evaluate(() => { __kitchen.reactionSystem.reactions.reset(nearSample.instanceId); __kitchen.reactionSystem.update(.1, { burn: 0, oxygenAvailability: 0 }); });
    assert.equal(await page.evaluate(() => __kitchen.reactionSystem.visuals.get(nearSample.instanceId).materials), null);
    // All nine profiles within the existing 12-sample limit; compare the same scene before and after effects.
    const perf = await page.evaluate(async () => {
      const k = __kitchen, { PRODUCTS } = await import('./kitchen/catalog.js?v=basket-1');
      k.basket.hold(k.shop.anchor);
      for (let i = 0; i < 10; i++) { const rec = await k.basket.add(PRODUCTS[i % PRODUCTS.length]); stageSample(rec, .05, 1.04, .08); }
      k.basket.park();
      const render = () => { const reset = k.renderer.info.autoReset; k.renderer.info.autoReset = false; k.renderer.info.reset(); k.pass.render(k.scene, k.camera); const calls = k.renderer.info.render.calls; k.renderer.info.autoReset = reset; return calls; };
      const before = { calls: render(), textures: k.renderer.info.memory.textures, geometries: k.renderer.info.memory.geometries };
      const t = performance.now(); for (let i = 0; i < 200; i++) k.reactionSystem.update(.1, { burn: 1, oxygenAvailability: 1 });
      const ms = (performance.now() - t) / 200;
      const after = { calls: render(), textures: k.renderer.info.memory.textures, geometries: k.renderer.info.memory.geometries };
      let copies = 0, disposed = 0;
      for (const v of k.reactionSystem.visuals.values()) for (const { material } of v.copies?.values() || []) { copies++; material.addEventListener('dispose', () => disposed++); }
      const oldId = nearSample.instanceId;
      k.basket.clearReleased();
      const remaining = { states: k.reactionSystem.reactions.states.size, visuals: k.reactionSystem.visuals.size, samples: k.basket.items.length };
      k.basket.hold(k.shop.anchor); const fresh = await k.basket.add(PRODUCTS.find(p => p.id === 'beefy-t'));
      const newId = fresh.instanceId; k.basket.clearCart();
      return { before, after, adapterMs: ms, copies, disposed, remaining, freshId: newId !== oldId };
    });
    assert.equal(perf.before.calls, perf.after.calls); assert.equal(perf.before.textures, perf.after.textures);
    assert.equal(perf.before.geometries, perf.after.geometries); assert.equal(perf.copies, perf.disposed);
    assert.deepEqual(perf.remaining, { states: 0, visuals: 0, samples: 0 }); assert.ok(perf.freshId);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      const k = __kitchen, { PRODUCTS } = await import('./kitchen/catalog.js?v=basket-1');
      k.basket.hold(k.shop.anchor); const r = await k.basket.add(PRODUCTS.find(p => p.id === 'pmma'));
      stageSample(r, 1, 1.04, .2); k.basket.park(); k.props.onInspect(r);
    });
    await page.waitForSelector('#sample-reaction:visible');
    await page.waitForFunction(() => __kitchen.camera.position.distanceTo(__kitchen.inspector.targetRig.pos) < .001 && __kitchen.pass.uniforms.uDof.value > .97);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({ path: 'outputs/local-review/reaction-sample-mobile.png' });
    await page.click('#object-close'); await page.evaluate(() => __kitchen.basket.clearReleased());
    assert.deepEqual(errors, []);
    console.log('Reaction scene passed:', JSON.stringify(perf));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
