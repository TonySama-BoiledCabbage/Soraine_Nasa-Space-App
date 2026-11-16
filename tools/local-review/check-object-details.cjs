const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Yuntao Lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const base = path.resolve('Flame_in_Freefall_2026/10_webapp');
async function prepare(page, errors) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); let file = path.resolve(base, '.' + url.pathname);
    if (file === base) file = path.join(base, 'index.html');
    if (url.hostname !== 'fixture.test' || !file.startsWith(base + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    await route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.goto('http://fixture.test/' + (process.argv.includes('--full') ? '' : '?lite'));
  await page.waitForFunction(() => window.__kitchen?.env().current === 'earth' && __kitchen.props.bodies.find(b => b.name === 'board').mesh.material.map && __kitchen.props.bodies.find(b => b.name === 'mug').mesh.children.some(o => o.userData.modelFit));
  await page.click('#start'); await page.waitForSelector('#objects-toggle:visible');
  await page.evaluate(() => __kitchen.snap(__kitchen.RIG.cook));
  await page.waitForFunction(() => __kitchen.camera.position.distanceTo(__kitchen.RIG.cook.pos) < .025);
}
async function point(page, name) {
  return page.evaluate(async name => {
    const THREE = await import('three'), k = __kitchen, mesh = k.props.bodies.find(b => b.name === name).mesh;
    mesh.updateWorldMatrix(true, true);
    const p = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).project(k.camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  }, name);
}
async function settled(page) {
  await page.waitForFunction(() => __kitchen.inspector.active && __kitchen.pass.uniforms.uDof.value > .97 && __kitchen.camera.position.distanceTo(__kitchen.inspector.targetRig.pos) < .001);
  await page.waitForTimeout(300);
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  try {
    const errors = [], page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await prepare(page, errors);
    const p = await point(page, 'oil');
    await page.mouse.move(p.x, p.y);
    await page.waitForSelector('#object-hover:visible');
    assert.equal(await page.locator('#object-hover strong').textContent(), 'Oil dispenser');
    const dropsBefore = await page.evaluate(() => __kitchen.combustion.drops.length);
    await page.mouse.down(); await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => __kitchen.props.held), null);
    await page.mouse.up(); await settled(page);
    assert.equal(await page.locator('#object-title').textContent(), 'Oil dispenser');
    assert.equal(await page.evaluate(() => __kitchen.combustion.drops.length), dropsBefore);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'object-close');
    const paused = await page.evaluate(() => ({ fuel: __kitchen.combustion.fuel, positions: __kitchen.props.bodies.map(b => b.body.position.toArray()), oxygen: __kitchen.combustion.manualCount }));
    assert(await page.evaluate(() => __kitchen.scene.overrideMaterial === null && __kitchen.camera.layers.mask === 1 && __kitchen.pass.uniforms.uHasFocusMask.value === 1 && __kitchen.renderer.shadowMap.autoUpdate));
    await page.keyboard.press('o'); await page.waitForTimeout(350);
    assert.deepEqual(await page.evaluate(() => ({ fuel: __kitchen.combustion.fuel, positions: __kitchen.props.bodies.map(b => b.body.position.toArray()), oxygen: __kitchen.combustion.manualCount })), paused);
    await page.screenshot({ path: 'outputs/local-review/object-detail-oil-desktop.png' });
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#object-title').textContent(), 'Cutting board');
    assert.equal(await page.evaluate(() => __kitchen.pages.page), 'observe');
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => !!document.activeElement.closest('#object-inspector')));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#object-inspector', { state: 'hidden' });
    await page.waitForFunction(() => __kitchen.camera.position.distanceTo(__kitchen.RIG.cook.pos) < .025 && __kitchen.pass.uniforms.uDof.value < .02);
    const drag = await point(page, 'oil');
    await page.mouse.move(drag.x, drag.y); await page.mouse.down();
    await page.mouse.move(drag.x - 40, drag.y - 30, { steps: 4 });
    await page.waitForFunction(() => __kitchen.props.held?.name === 'oil' && __kitchen.combustion.drops.length > 0);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => __kitchen.inspector.active), null);
    await page.evaluate(() => {
      for (const b of __kitchen.props.bodies) { b.body.position.copy(b.home); b.body.quaternion.copy(b.homeQ); b.body.velocity.setZero(); b.body.angularVelocity.setZero(); }
    });
    await page.click('#objects-toggle');
    await page.click('[data-object="mug"]'); await settled(page);
    await page.screenshot({ path: 'outputs/local-review/object-detail-mug-desktop.png' });
    const objects = await page.evaluate(() => __kitchen.inspector.objects.map(b => b.name));
    for (const name of objects) {
      const fit = await page.evaluate(name => {
        const k = __kitchen;
        k.inspector.open(k.props.bodies.find(b => b.name === name));
        const rig = k.inspector.getRig();
        return { title: document.querySelector('#object-title').textContent, focusRange: k.inspector.focusRange, finite: k.inspector.focus.toArray().every(Number.isFinite) && rig.pos.toArray().every(Number.isFinite) };
      }, name);
      assert(fit.finite && fit.focusRange > 0 && fit.title);
    }
    await page.evaluate(() => __kitchen.selectScenario('iss', true));
    assert.equal(await page.evaluate(() => __kitchen.inspector.active), null);
    assert.equal(await page.evaluate(() => __kitchen.camera.near), .1);
    await page.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await prepare(mobile, errors);
    await mobile.tap('#objects-toggle'); await mobile.tap('[data-object="oil"]'); await settled(mobile);
    const layout = await mobile.evaluate(async () => {
      const THREE = await import('three'), k = __kitchen;
      const box = new THREE.Box3().setFromObject(k.inspector.active.mesh);
      const points = [];
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) points.push(new THREE.Vector3(x,y,z).project(k.camera));
      return { panelTop: document.querySelector('.object-copy').getBoundingClientRect().top, objectBottom: Math.max(...points.map(p => (1-p.y)*innerHeight/2)), width: innerWidth, documentWidth: document.documentElement.scrollWidth };
    });
    assert.equal(layout.width, layout.documentWidth); assert(layout.objectBottom < layout.panelTop + 8);
    await mobile.screenshot({ path: 'outputs/local-review/object-detail-oil-mobile.png' });
    await mobile.tap('#object-next'); assert.equal(await mobile.locator('#object-title').textContent(), 'Cutting board');
    await mobile.tap('#object-close');
    await mobile.waitForFunction(() => __kitchen.camera.position.distanceTo(__kitchen.RIG.cook.pos) < .025);
    await mobile.emulateMedia({ reducedMotion: 'reduce' });
    const tap = await point(mobile, 'oil');
    assert(tap.x > 0 && tap.x < 390 && tap.y > 0 && tap.y < 844, JSON.stringify(tap));
    await mobile.touchscreen.tap(tap.x, tap.y);
    await mobile.waitForSelector('#object-inspector:visible');
    assert.equal(await mobile.locator('#object-title').textContent(), 'Oil dispenser');
    assert.equal(await mobile.locator('.object-copy').evaluate(e => getComputedStyle(e).animationName), 'none');
    await mobile.tap('#object-close');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'PASS', objects, clickWithoutPouring: true, dragStillPours: true, pausedPhysicsAndFuel: true, keyboardAndFocus: true, mobileLayout: layout, mobileTouch: true, reducedMotion: true, browserErrors: errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
