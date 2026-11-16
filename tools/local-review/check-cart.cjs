// SORAINE store regression (basket flow, 2026-11-15 sketch): 9 selected GLBs load and sit on the L01 shelf,
// E001-E059 map once, product view [− n +] keeps basket count = bodies = meshes, ◁ ▷ cycling, hover preview of the
// basket and return, ↩ checkout tips the basket onto the worktop under every gravity (no fall-through), only the
// basket button enters the store. Physics is fast-forwarded in the page, so a software GPU gives the same result.
//   node outputs/local-review/check-cart.cjs [--full] [--shots]
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'C:/Users/Yuntao Lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const base = path.resolve('Flame_in_Freefall_2026/10_webapp'), shots = process.argv.includes('--shots');
const out = path.resolve('outputs/local-review');
const IDS = ['mylar-g', 'ultem-1000', 'nomex-ht90', 'sibal', 'pmma', 'polycarbonate', 'nomex-velcro', 'p213', 'beefy-t'];

async function prepare(page, errors) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); let file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
    if (file === base) file = path.join(base, 'index.html');
    if (url.hostname !== 'fixture.test' || !file.startsWith(base + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    await route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /collider|unavailable|placeholder/i.test(m.text()))) errors.push(m.text()); });
  await page.goto('http://fixture.test/' + (process.argv.includes('--full') ? '' : '?lite'));
  await page.waitForFunction(() => window.__kitchen?.env().current === 'earth' && __kitchen.basket.modelStatus !== 'loading' && __kitchen.shelf.items.size === 9, null, { timeout: 180000 });
  await page.evaluate(() => {
    window.ff = (sec) => { const k = __kitchen; for (let t = 0; t < sec; t += 0.05) { k.basket.update(0.05); k.props.update(0.05, 0); } return k.props.simTime; };
    window.samples = () => __kitchen.props.bodies.filter(b => b.sample);
    window.inScene = () => { let n = 0; __kitchen.scene.traverse(o => { if (o.userData.sample) n++; }); return n; };
    window.inWorld = () => __kitchen.props.world.bodies.filter(b => samples().some(s => s.body === b)).length;
  });
  await page.click('#start');
  await page.waitForSelector('#shop-open:visible', { timeout: 60000 });
}
async function until(page, cond, maxSec = 40, label = 'condition') {
  for (let s = 0; s < maxSec; s += 1) { if (await page.evaluate(cond)) return; await page.evaluate(() => ff(1)); await page.waitForTimeout(30); }
  throw new Error('Timed out waiting for ' + label);
}
async function consistent(page, label) {
  const s = await page.evaluate(() => ({ inBasket: __kitchen.basket.inCart().length, items: __kitchen.basket.items.length, bodies: samples().length, world: inWorld(), scene: inScene() }));
  assert.equal(s.items, s.bodies, `${label}: basket records vs props bodies ${JSON.stringify(s)}`);
  assert.equal(s.bodies, s.world, `${label}: props bodies vs physics world ${JSON.stringify(s)}`);
  assert.equal(s.bodies, s.scene, `${label}: props bodies vs scene meshes ${JSON.stringify(s)}`);
  return s;
}
const open = (page, id) => page.evaluate(id => document.querySelector(`.sh-hot[data-id="${id}"]`).click(), id);
const qty = (page) => page.evaluate(() => +document.getElementById('sh-n').textContent);
async function plus(page, n = 1) { for (let i = 0; i < n; i++) { await page.click('#sh-qty [data-q="1"]:not([disabled])'); await page.evaluate(() => ff(0.4)); } }

async function trip(page, gravity) {
  await page.evaluate(g => { __kitchen.pages.show('observe'); __kitchen.selectScenario(g, true); }, gravity);
  await page.click('#shop-open');
  await page.waitForFunction(() => __kitchen.shop.view === 'shelf' && __kitchen.basket.mode === 'held');
  for (const id of ['beefy-t', 'p213', 'ultem-1000', 'pmma', 'sibal']) { await open(page, id); await page.waitForFunction(id => __kitchen.shop.focus?.id === id, id); await plus(page); }
  await until(page, () => __kitchen.basket.items.filter(r => r.state === 'loading').length === 0 && __kitchen.basket.inCart().length === 5, 20, 'samples settled');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => __kitchen.shop.view), 'shelf');
  await page.evaluate(() => document.getElementById('sh-back').click());   // ↩ with a full basket = checkout
  await until(page, () => __kitchen.pages.page === 'observe' && !__kitchen.basket.busy, 40, 'checkout finished');
  const g = await page.evaluate(() => __kitchen.props.gNew);
  await page.evaluate(g => ff(g > 0.5 ? 2 : 1), g);
  const st = await page.evaluate(() => __kitchen.basket.state());
  assert.equal(st.released + st.inCart, 5, `${gravity}: sample count changed at checkout ${JSON.stringify(st)}`);
  assert.equal(st.mode, 'parked', `${gravity}: basket should be put away after checkout`);
  if (g > 0.5) {
    const top = await page.evaluate(() => samples().filter(r => r.state === 'released' && r.body.position.y > 0.9).length);
    assert.ok(top >= 4, `${gravity}: only ${top}/5 samples on the worktop`);
    const below = await page.evaluate(async () => {
      const THREE = await import('three'); let worst = 9;
      for (const r of samples()) { const p = r.body.position; if (p.x > 0.66 && p.x < 1.5 && Math.abs(p.z) < 0.42) worst = Math.min(worst, new THREE.Box3().setFromObject(r.mesh).min.y - 0.96); }
      return worst;
    });
    assert.ok(below > -0.012, `${gravity}: a sample sank ${(-below * 1000).toFixed(1)} mm into the worktop`);
  } else {
    const v = await page.evaluate(() => samples().filter(r => r.state === 'released').map(r => r.body.velocity.length()));
    assert.ok(v.every(x => x > 0.005), 'microgravity: released samples should keep drifting from their set push');
  }
  if (shots) { await page.evaluate(() => __kitchen.snap(__kitchen.RIG.bench)); await page.waitForTimeout(2500); await page.screenshot({ path: path.join(out, `basket-poured-${gravity}.png`) }); }
  await consistent(page, gravity + ' after checkout');
  return st;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  try {
    const errors = [], page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await prepare(page, errors);
    // the store's only entry is the basket button; no search box or category bar
    assert.equal(await page.locator('#shop-open').count(), 1);
    assert.equal(await page.locator('#sh-q, .sh-cats, .sh-search').count(), 0);
    await page.click('#shop-open');
    await page.waitForFunction(() => __kitchen.shop.view === 'shelf' && __kitchen.research.byId && document.querySelectorAll('#sh-hots .sh-hot').length === 9);
    // all nine selected GLBs loaded (no placeholder), on the shelf in catalog order
    const src = await page.evaluate(async () => { const out = {}; for (const [id, it] of __kitchen.shelf.items) out[id] = (await __kitchen.basket.template(it.product)).userData.source || 'placeholder'; return out; });
    assert.deepEqual(Object.keys(src), IDS);
    assert.ok(Object.values(src).every(s => /^[MC]0\d$/.test(s)), 'placeholder used: ' + JSON.stringify(src));
    const map = await page.evaluate(async () => { const { PRODUCTS } = await import('./kitchen/catalog.js?v=basket-1'); return PRODUCTS.flatMap(p => p.measurementIds); });
    assert.equal(map.length, 59); assert.equal(new Set(map).size, 59);
    if (shots) { await page.evaluate(() => __kitchen.snap(__kitchen.shop.rig())); await page.waitForTimeout(3000); await page.screenshot({ path: path.join(out, 'shop-shelf-desktop.png') }); }

    // product view: research list, flaming / smolder tabs, ◁ ▷, Esc back
    await open(page, 'beefy-t');
    await page.waitForFunction(() => __kitchen.shop.view === 'product' && __kitchen.shop.focus?.id === 'beefy-t');
    await page.click('#sh-rec-toggle');
    assert.equal(await page.locator('#sh-d-rows > li').count(), 3);
    await page.click('.sh-mtabs [data-mat="Beefy-T (smolder)"]');
    assert.deepEqual(await page.locator('#sh-d-rows .sh-rec-id').allTextContents(), ['E057', 'E058', 'E059']);
    await page.click('#sh-next'); await page.waitForFunction(() => __kitchen.shop.focus?.id === 'mylar-g');
    await page.click('#sh-prev'); await page.waitForFunction(() => __kitchen.shop.focus?.id === 'beefy-t');

    // [− n +] = bodies in the basket
    await open(page, 'p213'); await page.waitForFunction(() => __kitchen.shop.focus?.id === 'p213');
    await plus(page, 3);
    await until(page, () => __kitchen.basket.items.filter(r => r.state === 'loading').length === 0, 10, 'adds settled');
    assert.equal(await qty(page), 3);
    let s = await consistent(page, 'after 3 adds'); assert.equal(s.inBasket, 3);
    await page.click('#sh-qty [data-q="-1"]'); assert.equal(await qty(page), 2);
    s = await consistent(page, 'after minus'); assert.equal(s.inBasket, 2);
    if (shots) { await page.evaluate(() => __kitchen.snap(__kitchen.shop.rig())); await page.waitForTimeout(3000); await page.screenshot({ path: path.join(out, 'shop-product-desktop.png') }); }

    // hover the basket strip: look down with a summary; move up: back to the shelf
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => __kitchen.shop.view === 'shelf');
    await page.mouse.move(640, 300); await page.waitForTimeout(700);
    const zone = await page.locator('#sh-basketzone').boundingBox();
    await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height - 30, { steps: 4 });
    await page.mouse.move(zone.x + zone.width / 2 + 12, zone.y + zone.height - 20, { steps: 3 });
    await page.waitForFunction(() => __kitchen.shop.view === 'basket', null, { timeout: 5000 });
    assert.match(await page.locator('#sh-summary').innerText(), /Cloth tape[\s\S]*×2/);
    if (shots) { await page.evaluate(() => __kitchen.snap(__kitchen.shop.rig())); await page.waitForTimeout(3000); await page.screenshot({ path: path.join(out, 'shop-basket-desktop.png') }); }
    await page.mouse.move(640, 60, { steps: 4 });
    await page.waitForFunction(() => __kitchen.shop.view === 'shelf', null, { timeout: 5000 });
    // leaving through the lab dots keeps the basket contents; coming back finds them
    await page.evaluate(() => __kitchen.pages.show('observe'));
    await page.click('#shop-open'); s = await consistent(page, 'page round trip'); assert.equal(s.inBasket, 2);
    await page.evaluate(() => __kitchen.basket.clearCart());
    s = await consistent(page, 'after clear'); assert.equal(s.bodies, 0);
    await page.evaluate(() => document.getElementById('sh-back').click());   // empty basket: plain exit
    await page.waitForFunction(() => __kitchen.pages.page === 'observe' && __kitchen.basket.mode === 'parked');

    const results = {};
    for (const g of ['earth', 'moon', 'mars', 'iss']) {
      results[g] = await trip(page, g);
      await page.evaluate(() => __kitchen.basket.clearReleased());
      await consistent(page, g + ' cleanup');
    }
    if (shots) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.click('#shop-open'); await page.waitForTimeout(800);
      await page.evaluate(() => __kitchen.snap(__kitchen.shop.rig())); await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(out, 'shop-shelf-mobile.png') });
      await open(page, 'nomex-ht90'); await page.waitForTimeout(500); await page.evaluate(() => __kitchen.snap(__kitchen.shop.rig())); await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(out, 'shop-product-mobile.png') });
    }
    assert.deepEqual(errors, []);
    console.log('store check passed', JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
