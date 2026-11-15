// Writes soraine-core/tests/golden.json: what the current JavaScript modules
// return for the published data. The Rust port must reproduce it exactly.
//   node tools/make-golden.mjs      (run from dashboard/rust)
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {MATERIALS, WORLDS, TYPES, joinResearch, getLimits, filterRows, csv, comparisonRows, number, esc, safeUrl} from '../../dist/data.mjs';
import {sourcesByResults, originalFilesByRelevance} from '../../dist/discovery.mjs';
import {readingSummary, comparisonContext} from '../../dist/reading.mjs';
import {researchUrl} from '../../dist/scene-link.mjs';
import {specimenHTML} from '../../dist/specimen.mjs';
import {definitions, term} from '../../dist/glossary.mjs';
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
// app.mjs keeps its view functions private and touches the page when it loads.
// Load the part that defines them against a stand-in document and export them.
async function loadApp(bundle) {
  const dist = new URL('../../dist/', import.meta.url);
  const source = (await readFile(new URL('app.mjs', dist), 'utf8')).split('\n');
  const end = source.findIndex(line => line.startsWith('function showAbout('));
  const body = source.slice(0, end + 1).filter(line => line !== 'initGlossary();').join('\n').replaceAll("from './", `from '${dist.href}`) +
    '\nexport const __app={paths,icon,state,worldInfo,sampleText,materialDescription,unitLabel,evidenceLabel,fieldLabel,materialPanel,chart,chartPanel,overview,metricName,compare,option,evidence,renderEvidenceRows,sourceView,renderSources,setData(b){bundle=b;rows=joinResearch(b)}};\n';
  const element = new Proxy(function () {}, {get: (_, key) => key === 'forEach' ? () => {} : element, apply: () => element});
  // Elements the render functions write into keep what was assigned, so it can be read back.
  const sinks = {};
  const sink = () => { const store = {}; return new Proxy(function () {}, {get: (_, key) => key in store ? store[key] : element, set: (_, key, value) => { store[key] = value; return true; }, apply: () => element}); };
  globalThis.document = new Proxy({}, {get: (_, key) => key === 'querySelectorAll' ? () => [] : key === 'querySelector' ? selector => (sinks[selector] ??= sink()) : () => element});
  globalThis.__sinks = sinks;
  await mkdir(new URL('../target/', import.meta.url), {recursive: true});
  const file = new URL('../target/app-under-test.mjs', import.meta.url);
  await writeFile(file, body);
  const {__app} = await import(file.href);
  __app.setData(bundle);
  return __app;
}
const app = await loadApp(bundle);
const viewStates = MATERIALS.flatMap(material => WORLDS.map(world => ({material, world})));
const views = viewStates.map(({material, world}) => { Object.assign(app.state, {material, world}); const overview = app.overview(); return {material, world, materialPanel: app.materialPanel(), chart: app.chart(false), chartLarge: app.chart(true), chartPanel: app.chartPanel(false), chartPanelLarge: app.chartPanel(true), overview, specimenInstance: Number(/specimen-(\d+)/.exec(overview)[1])}; });
const compares = MATERIALS.flatMap(material => ['Earth', 'Moon'].map(world => { Object.assign(app.state, {material, world}); return {material, world, html: app.compare()}; }));
const evidenceFilters = [{}, {query: 'Ultem Moon MOC'}, {query: '<b> "x"'}, {world: 'Moon'}, {world: 'Earth-to-Moon model'}, {material: 'Nomex HT90-40', kind: 'reported_experimental_limit_aggregate'}, {kind: 'model_derived_compensation_from_experiments'}, {query: 'zzz'}, {world: 'Mars', material: 'Mylar G'}];
const evidenceCases = evidenceFilters.flatMap(filter => [0, 1, 5, 99].map(page => {
  Object.assign(app.state, {query: filter.query ?? '', filterWorld: filter.world ?? 'All', filterMaterial: filter.material ?? 'All', filterKind: filter.kind ?? 'All', page});
  const frame = app.evidence(); app.renderEvidenceRows();
  return {filter, page, frame, results: globalThis.__sinks['#evidence-results'].innerHTML, shownPage: app.state.page};
}));
const sourceTypes = ['All', ...new Set(bundle.sources.map(s => s.source_type))];
const sourceCases = ['', 'saffire', 'zzz', 'NTRS-2013', '  Flame ', '"<'].flatMap(query => sourceTypes.flatMap(type => [0, 3, 999].map(page => {
  Object.assign(app.state, {sourceQuery: query, sourceType: type, sourcePage: page});
  const frame = app.sourceView(); app.renderSources();
  return {query, type, page, frame, results: globalThis.__sinks['#source-results'].innerHTML, shownPage: app.state.sourcePage};
})));
const metricNames = [...new Set(rows.map(r => r.metric)), 'ULOI', 'unknown <metric>'].map(metric => [metric, app.metricName(metric)]);
const specimens = [];
let specimenCase = 0;
for (const material of [...MATERIALS, 'Kapton', `<b>&"x"'`, '']) for (const world of [...WORLDS, '']) {
  for (const [uloi, moc, recordId] of [[null, null, null], ['23.5', '23', 'E002'], [21, 19.9, ''], ['', 'abc', 'E014'], [35, -1, null], ['0.125', 30, '<E>'], [30.004, 0, 'E100'], [' 7.5 ', '29.999', undefined]]) {
    if (specimenCase++ % 3) continue;   // a spread of cases, not the full product
    const html = specimenHTML({material, world, uloi, moc, recordId});
    specimens.push({material, world, uloi, moc, recordId: recordId ?? null, instance: Number(/specimen-(\d+)/.exec(html)[1]), html});
  }
}
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
  specimens,
  icons: Object.entries(app.paths),
  iconMarkup: [...Object.keys(app.paths), 'missing'].map(name => [name, app.icon(name)]),
  worldInfo: app.worldInfo,
  helpers: {
    sampleText: ['10 mil PEI film', 'PET (PETG) and PMMA_x', 'SPEIGHT PEI-2 <PET>', 'pei', ''].map(v => [v, app.sampleText(v)]),
    materialDescription: [...MATERIALS, 'Kapton'].map(v => [v, app.materialDescription(v)]),
    unitLabel: ['O2 molar percent', 'O2 percentage points', 'cm/s', 'kPa', '<x>'].map(v => [v, app.unitLabel(v)]),
    fieldLabel: ['Test pressure', 'Oxygen', 'Airflow', 'Gravity category', 'A & B'].map(v => [v, app.fieldLabel(v)]),
    evidenceLabel: rows.map(r => [r.measurement_id, app.evidenceLabel(r)]),
  },
  views,
  compares,
  evidenceCases,
  sourceCases,
  metricNames,
  options: [['All', 'All evidence', 'All'], ['a"b', '<x>', 'c'], ['Moon', 'Moon', 'Moon']].map(args => [...args, app.option(...args)]),
  glossary: Object.entries(definitions).map(([key, d]) => [key, d.title, d.description]),
  terms: [...Object.keys(definitions), 'not a term', '<b>'].flatMap(key => [[key, key, false, term(key)], [key, `${key} & "label"`, false, term(key, `${key} & "label"`)], [key, 'in a button', true, term(key, 'in a button', {passive: true})]]),
  numbers: numbers.map(([value, digits]) => [value, digits ?? null, digits === undefined ? number(value) : number(value, digits)]),
  esc: ['', 'plain', `<a href="x">Tom & 'Jerry'</a>`, 'é ✓ 月'].map(s => [s, esc(s)]),
  safeUrl: ['https://ntrs.nasa.gov/citations/20130010991', 'http://example.org/a b', 'javascript:alert(1)', 'data:text/html,x', 'ftp://example.org/', '/relative', '', 'HTTPS://EXAMPLE.org'].map(s => [s, safeUrl(s)]),
};
await writeFile(new URL('../soraine-core/tests/golden.json', import.meta.url), JSON.stringify(golden, null, 1) + '\n');
console.log('golden.json:', rows.length, 'rows,', golden.filters.length, 'filters,', golden.links.length, 'links,', golden.sources.length, 'sources');
