// node outputs/local-review/check-workview.cjs — camera intent, fixed lens while dragging, truthful live hover data.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Yuntao Lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const base = path.resolve('Flame_in_Freefall_2026/10_webapp');
async function prepare(page, errors) {
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); let file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
    if (file === base) file = path.join(base, 'index.html');
    if (url.hostname !== 'fixture.test' || !file.startsWith(base + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    await route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.goto('http://fixture.test/?lite');
  await page.waitForFunction(() => window.__kitchen?.env().current === 'earth' && __kitchen.shelf.items.size === 9, null, { timeout: 120000 });
  await page.click('#start'); await page.waitForSelector('#shop-open:visible');
}
async function point(page, id) {
  return page.evaluate(async id => {
    const THREE = await import('three'), k = __kitchen;
    const body = k.props.bodies.find(b => (b.instanceId || b.name) === id), box = new THREE.Box3().setFromObject(body.mesh);
    const ray = new THREE.Raycaster();
    for (const x of [.5, .25, .75, .1, .9]) for (const z of [.5, .25, .75, .1, .9]) {
      const p = new THREE.Vector3(THREE.MathUtils.lerp(box.min.x, box.max.x, x), box.max.y, THREE.MathUtils.lerp(box.min.z, box.max.z, z)).project(k.camera);
      ray.setFromCamera(new THREE.Vector2(p.x, p.y), k.camera);
      const hit = ray.intersectObjects(k.props.bodies.map(b => b.mesh), true)[0];
      if (hit && (body.mesh === hit.object || body.mesh.getObjectById(hit.object.id))) {
        const s = { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
        if (document.elementFromPoint(s.x, s.y)?.id === 'gl') return s;
      }
    }
    const center = box.getCenter(new THREE.Vector3()).project(k.camera);
    throw new Error('No exposed screen point for ' + id + ' ' + JSON.stringify({box,center,camera:k.camera.position,top:document.elementFromPoint((center.x+1)*innerWidth/2,(1-center.y)*innerHeight/2)?.outerHTML.slice(0,150)}));
  }, id);
}
const workSettled = page => page.waitForFunction(() => __kitchen.workView.active && __kitchen.camera.position.y > 2.8 && __kitchen.camera.position.distanceTo(__kitchen.RIG.work.pos) < .03);
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  try {
    const errors = [];
    if (!process.argv.includes('--mobile-only')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await prepare(page, errors); await page.click('#shop-open');
    const id = await page.evaluate(async () => {
      const k = __kitchen, { PRODUCTS } = await import('./kitchen/catalog.js?v=basket-1');
      const rec = window.workSample = await k.basket.add(PRODUCTS.find(p => p.id === 'ultem-1000'));
      rec.state = 'released'; rec.locked = false; rec.noRecover = true; rec.body.type = 4; rec.body.mass = 0; rec.body.updateMassProperties();
      rec.body.position.set(1.05, 1.12, .35); rec.body.velocity.setZero(); rec.body.angularVelocity.setZero(); rec.body.quaternion.set(0, 0, 0, 1);
      rec.mesh.position.copy(rec.body.position); rec.mesh.quaternion.copy(rec.body.quaternion);
      k.pages.show('observe'); return rec.instanceId;
    });
    await page.waitForFunction(() => __kitchen.camera.position.distanceTo(__kitchen.RIG.cook.pos) < .03);
    const desk = await page.evaluate(async () => { const THREE = await import('three'); const p = new THREE.Vector3(.6, .98, .3).project(__kitchen.camera); return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 }; });
    await page.mouse.move(desk.x, desk.y, { steps: 4 }); await workSettled(page);
    let p = await point(page, id); await page.mouse.move(p.x, p.y);
    await page.waitForFunction(id => document.getElementById('object-hover').dataset.instance === id && !document.getElementById('object-hover').hidden, id);
    assert.equal(await page.locator('[data-field="temperature"]').textContent(), 'Not modelled');
    assert.match(await page.locator('[data-label="thermal"]').textContent(), /Glass transition/);
    assert.match(await page.locator('[data-field="thermal"]').textContent(), /217 °C/);
    const before = await page.locator('[data-field="heat"]').textContent();
    await page.evaluate(() => __kitchen.reactionSystem.reactions.update(1, { exposures: [{ instanceId: workSample.instanceId, intensity: 1, oxygenAvailability: 1 }] }));
    await page.waitForFunction(v => document.querySelector('[data-field="heat"]').textContent !== v, before);
    const bounds = await page.locator('#object-hover').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1280 && bounds.y + bounds.height <= 800);
    await page.screenshot({ path: 'outputs/local-review/workview-tooltip-desktop.png' });
    // A mouse-down during a camera transition freezes the lens, including breathing drift.
    await page.mouse.down(); await page.mouse.move(p.x + 35, p.y + 10, { steps: 4 });
    await page.waitForFunction(() => !!__kitchen.props.held); await page.waitForTimeout(150);
    const fixed = await page.evaluate(() => __kitchen.camera.position.toArray());
    await page.evaluate(() => { __kitchen.workView.lastInput = 0; }); await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => __kitchen.camera.position.toArray()), fixed);
    assert.equal(await page.evaluate(() => __kitchen.workView.active), true);
    await page.mouse.up();
    await page.evaluate(() => { __kitchen.workView.lastInput = performance.now() - __kitchen.workView.idleMs - 1; });
    await page.waitForFunction(() => !__kitchen.workView.active && __kitchen.camera.position.distanceTo(__kitchen.RIG.cook.pos) < .03);
    await page.mouse.move(20, 20); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => __kitchen.workView.active), false);
    // Detail navigation takes priority over idle return; touch users get the same metadata in the inspector.
    await page.click('#objects-toggle'); await page.click(`[data-object="${id}"]`);
    await page.evaluate(() => { __kitchen.workView.lastInput = 0; }); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => __kitchen.inspector.active.instanceId), id);
    assert.match(await page.locator('#reaction-thermal-label').textContent(), /Glass transition/);
    assert.match(await page.locator('#reaction-thermal-source').getAttribute('href'), /sabic/);
    await page.click('#object-close');
    await page.click('#shop-open'); assert.equal(await page.evaluate(() => __kitchen.workView.active), false);
    await page.evaluate(() => __kitchen.pages.show('observe'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => __kitchen.camera.position.distanceTo(__kitchen.RIG.cook.pos) < .03);
    const reduced = await point(page, 'oil'); await page.mouse.move(reduced.x, reduced.y);
    await page.waitForTimeout(150); assert.equal(await page.evaluate(() => __kitchen.workView.active), false);
    console.log('Desktop work view passed: intent, idle return, stable drag, live status, sourced Tg, detail/shop isolation, reduced motion.');
    }
    // Narrow viewport: a tap on the clear worktop enters a wider overhead rig; idle returns to normal.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await prepare(mobile, errors);
    await mobile.waitForFunction(() => __kitchen.camera.position.distanceTo(__kitchen.RIG.cook.pos) < .03);
    const tap = await mobile.evaluate(async () => { const THREE = await import('three'); const p = new THREE.Vector3(.05, .98, .4).project(__kitchen.camera); return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 }; });
    assert.ok(tap.x > 0 && tap.x < 390 && tap.y > 0 && tap.y < 844);
    await mobile.touchscreen.tap(tap.x, tap.y);
    await mobile.waitForFunction(() => __kitchen.workView.active && __kitchen.camera.position.y > 4.5);
    await mobile.screenshot({ path: 'outputs/local-review/workview-mobile.png' });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
    assert.deepEqual(errors, []);
    console.log('Mobile work view passed: on-screen worktop tap, overhead framing, no horizontal overflow.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
