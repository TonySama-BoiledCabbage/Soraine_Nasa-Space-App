import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMaterialSearch, searchBundles, validateRequest, summaryIsSupported, MATERIAL_IDS, LIMITS} from '../server/material-search.mjs';

const read = async name => JSON.parse((await readFile(new URL(`../dist/data/${name}`, import.meta.url), 'utf8')).replace(/^﻿/, ''));
const research = await read('research.json'), original = await read('original-data.json');
const run = (query, filters, limit) => searchBundles(validateRequest({query, filters, limit}), research, original);
const ids = response => response.results.map(result => result.materialId);
const liveBundle = (bundle, mode = 'bigquery') => async () => ({...bundle, delivery: {mode}});
const service = options => createMaterialSearch({loadResearch: liveBundle(research), loadOriginal: liveBundle(original),
  snapshots: {research, original}, ...options});

test('every returned record, source and original row resolves to the collections', () => {
  const measurements = new Map(research.measurements.map(m => [m.measurement_id, m]));
  const experiments = new Map(research.experiments.map(e => [e.experiment_id, e]));
  const sources = new Map(research.sources.map(s => [s.source_id, s]));
  for (const id of MATERIAL_IDS) {
    const [result] = run('records', {materialId: id}).results;
    assert.equal(result.materialId, id);
    assert.deepEqual(result.evidenceIds, result.evidence.map(record => record.measurementId));
    assert.ok(result.evidence.length <= LIMITS.evidence && result.totalEvidenceCount >= result.evidence.length);
    for (const record of result.evidence) {
      const m = measurements.get(record.measurementId), e = experiments.get(record.experimentId);
      assert.equal(m.experiment_id, record.experimentId);
      assert.equal(record.value, m.value); assert.equal(record.unit, m.unit);
      assert.equal(record.material, e.material); assert.equal(record.gravity, e.gravity_label);
      assert.equal(record.conditions.specimen, e.conditions); assert.equal(record.conditions.platform, e.platform);
      assert.ok(result.sources.some(source => source.sourceId === record.sourceId));
    }
    for (const source of result.sources) assert.equal(source.url, sources.get(source.sourceId).url);
    for (const reference of result.originalRecords) {
      const dataset = original.datasets.find(d => d.id === reference.datasetId);
      const row = dataset.rows.find(r => r.id === reference.recordId);
      assert.equal(row.csvRecordNumber, reference.rowIndex); assert.equal(dataset.sourceUrl, reference.sourceUrl);
      assert.doesNotMatch(reference.recordId, /^E\d+$/);
    }
  }
});

test('English names, broad words and Chinese objects find the agreed materials', () => {
  assert.deepEqual(ids(run('Find Nomex research')), ['nomex-ht90', 'nomex-velcro']);
  assert.deepEqual(ids(run('Nomex fabric')), ['nomex-ht90']);
  assert.deepEqual(ids(run('velcro')), ['nomex-velcro']);
  assert.deepEqual(ids(run('Find research about transparent plastics')), ['mylar-g', 'pmma', 'polycarbonate']);
  assert.deepEqual(ids(run('梳子')), ['ultem-1000']);
  assert.deepEqual(ids(run('胶带')), ['p213']);
  assert.deepEqual(ids(run('棉 T 恤')), ['beefy-t']);
  assert.deepEqual(ids(run('P-213')), ['p213']);
  assert.deepEqual(ids(run('pc')), ['polycarbonate']);
  assert.deepEqual(ids(run('spcs')), [], 'short aliases match whole words only');
  const nomex = run('Find Nomex research').results;
  assert.ok(nomex[0].evidence.every(record => record.material === 'Nomex HT90-40'));
  assert.ok(nomex[1].evidence.every(record => record.material === 'Nomex Velcro'));
});

test('"all materials" lists the nine evidence-backed groups', () => {
  for (const query of ['all materials', 'All materials', '所有材料']) {
    assert.deepEqual(ids(run(query, undefined, 10)).sort(), [...MATERIAL_IDS].sort());
  }
  assert.equal(run('all materials').results.length, 5, 'the default limit still applies');
  assert.match(run('all materials').summary, /4 more matching materials/);
  assert.ok(run('all materials on Mars', undefined, 10).results.every(r => r.evidence.every(e => e.gravity === 'Mars')));
});

test('an exact name ranks above a broad candidate', () => {
  assert.deepEqual(ids(run('PMMA and other fabrics')).slice(0, 1), ['pmma']);
});

test('object and broad matches say they are not certain', () => {
  const glove = run('glove').results[0];
  assert.equal(glove.materialId, 'nomex-ht90');
  assert.match(glove.summary, /shelf object "glove".*test specimens, not the object/);
  assert.match(run('fabrics').results[0].summary, /fits several materials/);
  assert.equal(run('glove').appliedFilters.materialId, null);
});

test('gravity and material conditions combine and are never relaxed', () => {
  const moon = run('查找月球重力下的 Nomex 研究');
  assert.equal(moon.appliedFilters.gravity, 'moon');
  assert.ok(moon.results.flatMap(r => r.evidence).every(record => ['Moon', 'Earth-to-Moon model'].includes(record.gravity)));
  const mars = run('Polycarbonate on Mars');
  assert.deepEqual(mars.results, []); assert.match(mars.summary, /No matching records/);
  const limits = run('Compare Mylar oxygen limits across gravity').results[0];
  assert.ok(limits.evidence.every(record => /^(ULOI|MOC)\*?$/.test(record.metric)));
  assert.ok(new Set(limits.evidence.map(record => record.gravity)).size > 1);
});

test('explicit filters take precedence over the query', () => {
  const response = run('glove on Mars', {gravity: 'moon'});
  assert.equal(response.appliedFilters.gravity, 'moon');
  assert.ok(response.results[0].evidence.every(record => record.gravity === 'Moon'));
  assert.match(response.summary, /gravity filter was used/);
  const material = run('Ultem', {materialId: 'pmma'});
  assert.deepEqual(ids(material), ['pmma']); assert.match(material.summary, /material filter was used/);
});

test('microgravity is a category; the station is a platform', () => {
  const micro = run('Ultem', {gravity: 'iss'}).results[0];
  assert.ok(micro.evidence.length && micro.evidence.every(record => record.gravity === 'Microgravity'));
  assert.ok(micro.evidence.every(record => !/iss|station/i.test(record.conditions.platform || '')), 'platform labels are kept as recorded');
  assert.deepEqual(run('Ultem on the ISS').results, []);
});

test('flaming and smolder are conditions that keep their records apart', () => {
  const both = run('棉 T 恤有哪些明火和阴燃记录？').results[0];
  assert.deepEqual([...new Set(both.evidence.map(record => record.material))].sort(), ['Beefy-T (flaming)', 'Beefy-T (smolder)']);
  const smolder = run('Beefy-T smoldering').results[0];
  assert.ok(smolder.evidence.every(record => record.material === 'Beefy-T (smolder)'));
  assert.deepEqual(ids(run('flaming Ultem')), [], 'a mode word does not turn another material into cotton');
});

test('measured results are listed before model-derived values', () => {
  const types = run('PMMA').results[0].evidence.map(record => record.evidenceType);
  assert.ok(types.indexOf('model_derived_compensation_from_experiments') > types.indexOf('reported_fit_to_experimental_data'));
});

test('original rows are separate references and need the file to name the material', () => {
  const pmma = run('PMMA').results[0];
  assert.equal(pmma.originalRecords.length, LIMITS.originalRecords);
  assert.match(pmma.originalRecords[0].locator, /CSV record \d+; Fuel Sample Material: /);
  assert.deepEqual(run('Ultem').results[0].originalRecords, [], '"ultem sheet" does not state the grade');
  assert.deepEqual(run('PMMA on the Moon').results[0].originalRecords, [], 'rows carry no gravity field');
});

test('missing values stay null and decimal strings are kept', () => {
  const records = MATERIAL_IDS.flatMap(id => run('x', {materialId: id}).results[0].evidence);
  assert.ok(records.some(record => record.conditions.durationS === null));
  assert.ok(records.every(record => record.value !== 0 && record.conditions.pressureKpa !== 0));
  assert.ok(records.some(record => record.conditions.pressureKpa === '70.326524'));
});

test('limit caps material groups and the summary says more exist', () => {
  const response = run('transparent plastics', undefined, 1);
  assert.equal(response.results.length, 1); assert.match(response.summary, /2 more matching materials/);
});

test('invalid requests are rejected with a code', () => {
  const code = body => { try { validateRequest(body); } catch (error) { return `${error.status} ${error.code}`; } };
  assert.equal(code({query: '   '}), '400 INVALID_QUERY');
  assert.equal(code({query: 'x'.repeat(501)}), '400 INVALID_QUERY');
  assert.equal(code({query: 5}), '400 INVALID_QUERY');
  assert.equal(code({query: 'x', filters: {gravity: 'venus'}}), '400 INVALID_FILTER');
  assert.equal(code({query: 'x', filters: {materialId: 'gold'}}), '400 INVALID_FILTER');
  assert.equal(code({query: 'x', filters: []}), '400 INVALID_FILTER');
  for (const limit of [0, 11, 2.5, '3']) assert.equal(code({query: 'x', limit}), '400 INVALID_LIMIT');
  assert.equal(code([]), '400 INVALID_BODY');
  assert.equal(validateRequest({query: ' Nomex '}).limit, 5);
});

test('provenance: live only when both collections are live, otherwise the snapshots', async () => {
  assert.equal((await service().search({query: 'PMMA'})).dataSource, 'bigquery');
  assert.equal((await service({loadOriginal: liveBundle(original, 'snapshot')}).search({query: 'PMMA'})).dataSource, 'snapshot');
  assert.equal((await service({loadResearch: async () => { throw Error('down'); }}).search({query: 'PMMA'})).dataSource, 'snapshot');
  await assert.rejects(service({loadResearch: async () => { throw Error('down'); }, snapshots: {research: {}, original}}).search({query: 'PMMA'}),
    error => error.status === 503 && error.code === 'SERVICE_UNAVAILABLE');
  const none = await service().search({query: 'unicorn'});
  assert.deepEqual([none.results, none.mode, none.dataSource], [[], 'keyword', 'bigquery']);
});

test('a summary is used only when the records support it; otherwise keyword mode', async () => {
  const keyword = await service().search({query: 'PMMA'});
  assert.equal(keyword.mode, 'keyword');
  const value = keyword.results[0].evidence[0].value;
  const good = await service({summarise: async () => ({summary: `PMMA has a reported value of ${value}.`, materials: {pmma: 'PMMA rod and sheet tests.'}})}).search({query: 'PMMA'});
  assert.equal(good.mode, 'ai'); assert.match(good.summary, /reported value/); assert.equal(good.results[0].summary, 'PMMA rod and sheet tests.');
  assert.deepEqual(good.results[0].evidence, keyword.results[0].evidence);
  for (const summarise of [
    async () => ({summary: 'PMMA ignites at 451.7 degrees.'}),
    async () => ({summary: 'Fine.', materials: {gold: 'Not a result.'}}),
    async () => ({summary: 'See https://example.com'}),
    async () => 'not an object', async () => ({summary: 'x'.repeat(601)}),
    async () => { throw Error('provider down'); }
  ]) {
    const response = await service({summarise}).search({query: 'PMMA'});
    assert.equal(response.mode, 'keyword'); assert.equal(response.summary, keyword.summary);
  }
  assert.equal(summaryIsSupported('No numbers here.', keyword), true);
});

test('identical searches reuse the cached result', async () => {
  let calls = 0;
  const cached = service({summarise: async () => { calls += 1; return {summary: 'PMMA records.'}; }});
  await cached.search({query: 'PMMA'}); await cached.search({query: ' pmma '});
  assert.equal(calls, 1);
});
