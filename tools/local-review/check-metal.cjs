const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Yuntao Lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const base = path.resolve('Flame_in_Freefall_2026/10_webapp');
const oldMaterials = fs.readFileSync('outputs/local-review/materials-before-metal.js');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  try {
    const errors = [];
    const captures = [];
    for (const before of [true, false]) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        let file = path.resolve(base, '.' + url.pathname);
        if (file === base) file = path.join(base, 'index.html');
        if (url.hostname !== 'fixture.test' || !file.startsWith(base + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        const body = before && url.pathname.endsWith('/materials.js') ? oldMaterials : fs.readFileSync(file);
        await route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream', body });
      });
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
      await page.goto('http://fixture.test/?lite');
      await page.waitForFunction(() => {
        if (window.__kitchen?.env().current !== 'earth') return false;
        let ready = false;
        __kitchen.kitchen.pan.traverse(o => { for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.name === 'Material_42' && m.roughnessMap) ready = true; });
        return ready;
      });
      await page.click('#start');
      await page.waitForSelector('#observe:visible');
      const materials = await page.evaluate(() => {
        const k = __kitchen, V = k.camera.position.constructor;
        for (const b of k.props.bodies) {
          b.body.position.copy(b.home); b.body.quaternion.copy(b.homeQ);
          b.body.velocity.setZero(); b.body.angularVelocity.setZero();
          b.mesh.position.copy(b.home); b.mesh.quaternion.copy(b.homeQ);
        }
        k.props.update = () => {};
        k.snap({ pos: new V(.42, 1.40, .65), look: new V(.20, 1.10, -.05), fov: 48 });
        const output = [];
        k.scene.traverse(o => { if (!o.isMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (['Material_42', 'Material_62'].includes(m.name)) output.push({ name: m.name, metalness: m.metalness, color: m.color.getHexString(), envMap: !!m.envMap, roughnessMap: !!m.roughnessMap, uv: !!o.geometry.getAttribute('uv') }); });
        return output;
      });
      if (!before) {
        assert(materials.length >= 2);
        assert(materials.every(m => m.metalness === 1 && m.envMap && m.roughnessMap && m.uv));
        await page.evaluate(() => {
          const k = __kitchen, oil = k.props.bodies.find(b => b.name === 'oil');
          oil.mesh.updateWorldMatrix(true, true);
          const tip = oil.mesh.getObjectByName('oilNozzle').getWorldPosition(k.camera.position.clone());
          k.combustion.release(oil, 9.81, false);
          if (k.combustion.drops.at(-1).mesh.position.distanceTo(tip) > 1e-6) throw Error('Nozzle regression');
        });
      }
      await page.waitForFunction(() => __kitchen.camera.position.y > 1.38 && __kitchen.camera.position.y < 1.42);
      const file = `outputs/local-review/metal-${before ? 'before' : 'after'}.png`;
      captures.push(await page.screenshot({ path: file }));
      console.log(JSON.stringify({ stage: before ? 'before' : 'after', materials }));
      await page.close();
    }
    assert.deepEqual(errors, []);
    const comparison = await browser.newPage({ viewport: { width: 1600, height: 670 }, deviceScaleFactor: 1 });
    await comparison.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;background:#171b21;color:#f6f5ef;font:20px Arial}header{padding:24px 28px 16px;font-size:25px;font-weight:600}.row{display:flex;gap:16px;padding:0 24px}.card{width:768px}p{margin:0;padding:8px 0 12px;font-size:17px;color:#b9c1cc}img{display:block;width:100%;border:1px solid #39414c;border-radius:8px}</style></head><body><header>Metal finish — same camera and scene</header><div class="row">${captures.map((b,i)=>`<div class="card"><p>${i ? 'AFTER · stainless steel + reflections' : 'BEFORE · roughness texture only'}</p><img src="data:image/png;base64,${b.toString('base64')}"></div>`).join('')}</div></body></html>`);
    await comparison.screenshot({ path: 'outputs/local-review/metal-comparison.png' });
    console.log('PASS visible metal setup, UVs, oil outlet, no browser errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
