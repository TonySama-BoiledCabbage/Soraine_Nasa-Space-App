// Writes soraine-core/tests/golden.json: what the current JavaScript modules
// return for the published data. The Rust port must reproduce it exactly.
//   node tools/make-golden.mjs      (run from dashboard/rust)
import {readFile, writeFile} from 'node:fs/promises';
import {MATERIALS, WORLDS, TYPES, joinResearch, getLimits, filterRows, csv, comparisonRows, number, esc, safeUrl} from '../../dist/data.mjs';
import {sourcesByResults, originalFilesByRelevance} from '../../dist/discovery.mjs';
import {readingSummary, comparisonContext} from '../../dist/reading.mjs';
import {researchUrl} from '../../dist/scene-link.mjs';
const read = async path => JSON.parse((await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^﻿/, ''));
const bundle = await read('../../dist/data/research.json'), original = await read('../../dist/data/original-data.json');
const rows = joinResearch(bundle), id = r => r?.measurement_id ?? null;
const filters = [{}, {query: 'Ultem Moon MOC'}, {query: '  MOON   uloi* '}, {query: 'ntrs'}, {query: 'kPa'}, {query: '21'}, {query: 'published limit'}, {query: 'zzz'}, {query: 'NOMEX'},
  ...WORLDS.flatMap(world => ['All', ...MATERIALS].map(material => ({world, material}))), ...Object.keys(TYPES).map(kind => ({kind})),
  {world: 'Moon', material: 'Ultem 1000', kind: 'reported_experimental_limit_aggregate'}, {world: 'Moon', kind: 'model_derived_compensation_from_experiments'}, {world: 'Venus'}];
const links = [[{}], [{world: 'Lunar', material: 'Nomex HT90-40', record: 'E014', view: 'evidence'}], [{world: 'Mars'}, 'http://localhost:5180/dashboard/dist/?old=1#overview'],
  [{world: 'ISS', material: 'Mylar G', view: 'sources'}], [{world: 'MARTIAN', view: 'experiments', record: 'E1234'}], [{world: 'venus'}], [{material: 'spoon'}], [{view: 'admin'}],
  [{record: '<script>'}], [{record: 'E01'}], [{record: 'E014 '}], [{}, 'javascript:alert(1)'], [{}, 'not a url'], [{world: 'moon'}, 'https://example.org/a b/?x=1']];
const numbers = [[null], [''], ['0'], ['0.000016', 6], ['1234567.891'], ['1234567.891', 2], ['2.5', 0], ['1.5', 0], ['0.5', 0], ['0.05'], ['-0.04'], ['-1234.5', 0], ['19.95'], ['1.005', 2],
  ['21.1'], ['999.95'], ['0.125', 2], ['abc'], ['1e21'], ['70.3'], [' 42 '], ['1.1000000000000014'], ['1000'], ['-0.06']];
const golden = {
  rowCount: rows.length,
  joined: rows.map(r => [r.measurement_id, r.kind.name, r.kind.color, r.experiment?.experiment_id ?? null, r.source?.source_id ?? null]),
  limits: MATERIALS.flatMap(material => WORLDS.map(world => { const l = getLimits(rows, material, world); return [material, world, id(l.uloi), id(l.moc)]; })),
  comparison: MATERIALS.map(material => comparisonRows(rows, material).map(c => [c.world, id(c.uloi), id(c.moc)])),
  filters: filters.map(filter => ({filter, ids: filterRows(rows, filter).map(id)})),
  csv: csv(rows),
  reading: MATERIALS.flatMap(material => WORLDS.map(world => [material, world, readingSummary(rows, material, world)])),
  context: MATERIALS.map(material => [material, comparisonContext(material)]),
  sources: sourcesByResults(bundle.sources, bundle.measurements).map(s => s.source_id),
  files: originalFilesByRelevance(original.datasets).map(d => d.id),
  links: links.map(([args, base]) => { try { return {args, base: base ?? null, out: base ? researchUrl(args, base) : researchUrl(args)}; } catch (error) { return {args, base: base ?? null, error: error.message}; } }),
  numbers: numbers.map(([value, digits]) => [value, digits ?? null, digits === undefined ? number(value) : number(value, digits)]),
  esc: ['', 'plain', `<a href="x">Tom & 'Jerry'</a>`, 'é ✓ 月'].map(s => [s, esc(s)]),
  safeUrl: ['https://ntrs.nasa.gov/citations/20130010991', 'http://example.org/a b', 'javascript:alert(1)', 'data:text/html,x', 'ftp://example.org/', '/relative', '', 'HTTPS://EXAMPLE.org'].map(s => [s, safeUrl(s)]),
};
await writeFile(new URL('../soraine-core/tests/golden.json', import.meta.url), JSON.stringify(golden, null, 1) + '\n');
console.log('golden.json:', rows.length, 'rows,', golden.filters.length, 'filters,', golden.links.length, 'links,', golden.sources.length, 'sources');
