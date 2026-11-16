// Run from workspace root: node outputs/local-review/check-material-search.cjs
const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const src = fs.readFileSync('Flame_in_Freefall_2026/10_webapp/kitchen/research-source.js', 'utf8');
  const { research } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const originalFetch = global.fetch;
  const result = { query: '梳子', mode: 'keyword', dataSource: 'bigquery', summary: 'One material.',
    results: [{ materialId: 'ultem-1000', evidence: [{ measurementId: 'E002', value: '0.00022', conditions: { oxygenPct: null } }],
      sources: [{ sourceId: 'NASA', url: 'https://ntrs.nasa.gov/' }], originalRecords: [] }] };
  let calls = 0;
  try {
    global.fetch = async (url, options) => {
      calls++; assert.equal(url, '/api/material-search'); assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(options.body), { query: '梳子', filters: { materialId: 'ultem-1000' }, limit: 1 });
      return Response.json(result);
    };
    const options = { filters: { materialId: 'ultem-1000' }, limit: 1 };
    const [a, b] = await Promise.all([research.search('梳子', options), research.search('梳子', options)]);
    assert.equal(calls, 1); assert.equal(a, b); assert.deepEqual(a, result);
    assert.equal((await research.search('梳子', options)), a); assert.equal(calls, 1);
    global.fetch = async () => Response.json({ error: { code: 'RATE_LIMITED', message: 'Wait.' } }, { status: 429, headers: { 'Retry-After': '60' } });
    await assert.rejects(research.search('Nomex'), e => e.status === 429 && e.code === 'RATE_LIMITED' && e.retryAfter === '60');
    global.fetch = async () => { throw new TypeError('offline'); };
    await assert.rejects(research.search('Nomex'), /offline/);
    global.fetch = async () => Response.json({ ...result, results: [] });
    assert.deepEqual((await research.search('Nomex')).results, []); // errors do not poison the cache
    global.fetch = async () => Response.json({ results: [] });
    await assert.rejects(research.search('invalid response'), /Invalid material search response/);
    console.log('Material search client passed: contract, shared requests, cache, 429, offline recovery, empty results.');
  } finally { global.fetch = originalFetch; }
})().catch(e => { console.error(e); process.exitCode = 1; });
