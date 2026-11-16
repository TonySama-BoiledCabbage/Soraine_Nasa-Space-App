const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Yuntao Lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const base = path.resolve('Flame_in_Freefall_2026/10_webapp');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }), errors = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()); let file = path.resolve(base, '.' + url.pathname);
      if (file === base) file = path.join(base, 'index.html');
      if (url.hostname !== 'fixture.test' || !file.startsWith(base + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      await route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    await page.goto('http://fixture.test/?lite');
    await page.waitForFunction(() => {
      if (window.__kitchen?.env().current !== 'earth') return false;
      return ['pan', 'mug', 'friedEgg', 'oil'].every(name => __kitchen.props.bodies.find(b => b.name === name).mesh.children.some(o => o.userData.modelFit)) && __kitchen.props.bodies.find(b => b.name === 'board').mesh.material.map;
    });
    const result = await page.evaluate(async () => {
      const k = __kitchen, THREE = await import('three');
      const { fitPropModel } = await import('/kitchen/prop-models.js?v=model-swap-1');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const mug = k.props.bodies.find(b => b.name === 'mug').mesh;
      const visual = mug.children.find(o => o.userData.modelFit);
      if (visual.userData.modelFit.root !== 'mug' || visual.userData.modelFit.axis !== 'y') throw Error('Did not select merged mug');
      if (visual.getObjectByName('stove') || visual.getObjectByName('pan') || visual.getObjectByName('egg') || visual.getObjectByName('bottle') || visual.getObjectByName('Cube')) throw Error('Unrelated full-scene objects leaked into mug');
      const sizeOf = object => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
      const clone = visual.clone(true); clone.updateMatrixWorld(true);
      const size = sizeOf(clone);
      if (Math.abs(size.y - .095) > 1e-5 || size.x < .09 || size.x > .16) throw Error('Incorrect merged cup dimensions ' + size.toArray());
      const generic = new THREE.Scene(), custom = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .11, 24), new THREE.MeshStandardMaterial());
      custom.name = 'RenamedCup'; custom.position.set(8, 4, -3); generic.add(custom);
      const genericFit = fitPropModel(generic, 'mug', 'Mesh_64', .09, -.0475, .095);
      genericFit.updateMatrixWorld(true);
      const genericBox = new THREE.Box3().setFromObject(genericFit);
      if (Math.abs(genericBox.min.y + .0475) > 1e-5 || Math.abs(sizeOf(genericFit).y - .095) > 1e-5) throw Error('Standalone renamed export did not fit');
      const { scene: legacy } = await new GLTFLoader().loadAsync('models/soraine_props/soraine_arranged_repaired.glb');
      const legacyFit = fitPropModel(legacy, 'mug', 'Mesh_64', .09, -.0475, .095);
      if (legacyFit.userData.modelFit.axis !== 'x' || !legacyFit.getObjectByName('Mesh_64') || !legacyFit.getObjectByName('Mesh_65') || legacyFit.getObjectByName('stove')) throw Error('Legacy cup export regression');
      let rejectedEmpty = false;
      try { fitPropModel(new THREE.Scene(), 'mug', 'Mesh_64', .09, -.0475, .095); } catch { rejectedEmpty = true; }
      if (!rejectedEmpty) throw Error('Empty model accepted');
      const loaded = k.props.bodies.filter(b => ['pan', 'mug', 'oil', 'friedEgg'].includes(b.name)).map(b => ({ name: b.name, fit: b.mesh.children.find(o => o.userData.modelFit).userData.modelFit }));
      return { currentMug: { size: size.toArray(), fit: visual.userData.modelFit }, legacy: legacyFit.userData.modelFit, standalone: genericFit.userData.modelFit, rejectedEmpty, loaded };
    });
    await page.click('#start'); await page.waitForSelector('#observe:visible');
    await page.evaluate(() => {
      const k = __kitchen, V = k.camera.position.constructor;
      for (const b of k.props.bodies) { b.mesh.position.copy(b.home); b.mesh.quaternion.copy(b.homeQ); }
      k.props.update = () => {};
      k.snap({ pos: new V(.78, 1.55, .40), look: new V(.84, 1.02, -.27), fov: 35 });
    });
    await page.waitForFunction(() => __kitchen.camera.position.y > 1.53);
    await page.screenshot({ path: 'outputs/local-review/mug-replacement-fixed.png' });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: 'PASS', ...result, browserErrors: errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
