// Requires network + Chrome: node outputs/local-review/check-material-search-live.cjs
const assert = require('node:assert/strict'), path = require('node:path'), { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'C:/Users/Yuntao Lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
(async () => {
  const base = path.resolve('Flame_in_Freefall_2026/10_webapp'), port = 5193, url = `http://127.0.0.1:${port}`;
  const python = process.env.SEARCH_TEST_PYTHON || 'C:/Users/Yuntao Lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
  const server = spawn(python, ['-u', 'serve.py', String(port)], { cwd: base, windowsHide: true });
  let browser;
  try {
    await once(server.stdout, 'data');
    // Python prints just before binding; wait for the listening socket, not an arbitrary delay.
    for (let i = 0; ; i++) { try { await fetch(url); break; } catch (e) { if (i === 20) throw e; await new Promise(r => setTimeout(r, 100)); } }
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(url + '/?lite');
    await page.waitForFunction(() => window.__kitchen?.research.byId && __kitchen.shelf.items.size === 9, null, { timeout: 120000 });
    await page.click('#start'); await page.waitForSelector('#shop-open:visible'); await page.click('#shop-open');
    await page.evaluate(() => document.querySelector('.sh-hot[data-id="pmma"]').click());
    await page.click('#sh-rec-toggle');
    await page.waitForFunction(() => document.getElementById('sh-search-summary').dataset.loaded === 'true', null, { timeout: 20000 });
    const summary = await page.locator('#sh-search-summary').innerText();
    assert.match(summary, /Keyword search · (BigQuery|Server snapshot)/);
    assert.equal(await page.locator('#sh-d-rows > li').count(), 5);
    assert.equal(await page.locator('#sh-q, .sh-search').count(), 0);
    // No matches + invalid input pass through the same local proxy, with backend status/code intact.
    const result = await page.evaluate(async () => {
      const a = await __kitchen.research.search('护目镜 火星');
      let error; try { await __kitchen.research.search(''); } catch (e) { error = { status: e.status, code: e.code }; }
      return { results: a.results, error };
    });
    assert.deepEqual(result, { results: [], error: { status: 400, code: 'INVALID_QUERY' } });
    await page.route('**/api/material-search', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"SERVICE_UNAVAILABLE","message":"Offline"}}' }));
    await page.evaluate(() => document.querySelector('.sh-hot[data-id="beefy-t"]').click());
    await page.click('#sh-rec-toggle');
    await page.waitForFunction(() => document.getElementById('sh-search-summary').textContent.includes('Search unavailable'));
    assert.equal(await page.locator('#sh-d-rows > li').count(), 3);
    await page.click('.sh-mtabs [data-mat="Beefy-T (smolder)"]');
    assert.equal(await page.locator('#sh-d-rows > li').count(), 3);
    assert.deepEqual(errors, []);
    console.log('Live browser connection passed:', summary, '| offline fallback and local records preserved.');
  } finally { if (browser) await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
