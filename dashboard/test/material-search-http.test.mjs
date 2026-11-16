import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';

test('material search route accepts POST and leaves other routes unchanged', async t => {
  const priorPort = process.env.PORT; process.env.PORT = '0'; process.env.SEARCH_RATE_PER_MINUTE = '12';
  const {server} = await import('../server/index.mjs');
  if (priorPort === undefined) delete process.env.PORT; else process.env.PORT = priorPort;
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  if (!server.listening) await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {'Content-Type': 'application/json'}) =>
    fetch(url + '/api/material-search', {method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body)});

  const found = await post({query: '查找月球重力下的 Nomex 研究', filters: {gravity: 'moon', materialId: null}, limit: 5});
  assert.equal(found.status, 200); assert.match(found.headers.get('content-type'), /application\/json/);
  assert.equal(found.headers.get('cache-control'), 'no-store'); assert.equal(found.headers.get('x-content-type-options'), 'nosniff');
  const data = await found.json();
  assert.deepEqual(Object.keys(data), ['query', 'mode', 'dataSource', 'summary', 'appliedFilters', 'results']);
  assert.deepEqual([data.mode, data.dataSource], ['keyword', 'snapshot']);
  assert.deepEqual(data.results.map(result => result.materialId), ['nomex-ht90', 'nomex-velcro']);
  assert.deepEqual(Object.keys(data.results[0]), ['materialId', 'title', 'summary', 'evidenceIds', 'totalEvidenceCount', 'evidence', 'originalRecords', 'sources']);

  const empty = await post({query: 'unicorn'});
  assert.equal(empty.status, 200); assert.deepEqual((await empty.json()).results, []);
  const invalid = await post({query: ''});
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {error: {code: 'INVALID_QUERY', message: 'Enter a search between 1 and 500 characters.'}});
  assert.equal((await (await post('{not json')).json()).error.code, 'INVALID_BODY');
  assert.equal((await post({query: 'x'}, {'Content-Type': 'text/plain'})).status, 415);
  assert.equal((await post({query: 'x', pad: 'y'.repeat(5000)})).status, 413);
  const get = await fetch(url + '/api/material-search');
  assert.equal(get.status, 405); assert.equal(get.headers.get('allow'), 'POST, OPTIONS');

  const research = await fetch(url + '/api/research'); assert.equal(research.status, 200);
  const mutation = await fetch(url + '/api/research', {method: 'POST'});
  assert.equal(mutation.status, 405); assert.equal(mutation.headers.get('allow'), 'GET, HEAD');
  assert.equal((await fetch(url + '/api/original-data')).status, 200);

  let limited;
  for (let i = 0; i < 12; i++) limited = await post({query: 'PMMA'});
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
});
