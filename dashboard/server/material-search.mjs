// POST /api/material-search: find shelf materials and their research records.
//
// Retrieval is deterministic. Every ID, value, unit and citation in a response
// is copied from the research bundle or the original-data bundle; nothing is
// computed, rounded or filled in. An optional summariser may reword the
// returned evidence, and its output is checked against that evidence.

// The nine shelf materials agreed with the team. `labels` are the exact
// material names used by the research records. `exact` names the material or
// grade, `aliases` are other names for the material, and `objects` are the
// shelf objects that stand in for it (navigation aids, not test specimens).
export const MATERIALS = Object.freeze([
  {id: 'mylar-g', title: 'Mylar G', labels: ['Mylar G'], exact: ['mylar g'],
    aliases: ['mylar', 'pet', 'polyester film', '聚酯薄膜'],
    objects: ['document sleeve', 'sleeve', '文件套', '文件袋']},
  {id: 'ultem-1000', title: 'Ultem 1000', labels: ['Ultem 1000'], exact: ['ultem 1000'],
    aliases: ['ultem', 'pei', 'polyetherimide', '聚醚酰亚胺'],
    objects: ['comb', '梳子']},
  {id: 'nomex-ht90', title: 'Nomex HT90-40', labels: ['Nomex HT90-40'],
    exact: ['nomex ht90 40', 'nomex ht90', 'ht90 40', 'ht90'],
    aliases: ['nomex fabric', 'aramid fabric', 'nomex布', '芳纶织物'],
    objects: ['glove', '手套']},
  {id: 'sibal', title: 'SIBAL', labels: ['SIBAL'], exact: ['sibal'],
    aliases: ['cotton glass blend', 'cotton fiberglass blend', '棉玻纤混纺', '棉玻纤'],
    objects: ['experimental fabric sample', 'fabric sample', '实验布', '织物片']},
  {id: 'pmma', title: 'PMMA', labels: ['PMMA'], exact: ['pmma'],
    aliases: ['acrylic', 'polymethyl methacrylate', '亚克力', '聚甲基丙烯酸甲酯'],
    objects: ['ruler', '直尺']},
  {id: 'polycarbonate', title: 'Polycarbonate', labels: ['Polycarbonate'], exact: ['polycarbonate'],
    aliases: ['pc', '聚碳酸酯'],
    objects: ['safety goggles', 'goggles', 'goggle', 'lens', '护目镜', '镜片']},
  {id: 'nomex-velcro', title: 'Nomex Velcro', labels: ['Nomex Velcro'], exact: ['nomex velcro'],
    aliases: ['velcro', 'hook and loop', '魔术贴'],
    objects: ['cable strap', 'strap', '理线带', '扣带']},
  {id: 'p213', title: 'P 213', labels: ['P 213'], exact: ['p 213', 'p213'],
    aliases: ['玻璃布胶带'],
    objects: ['tape', '胶带']},
  {id: 'beefy-t', title: 'Beefy-T', labels: ['Beefy-T (flaming)', 'Beefy-T (smolder)'],
    exact: ['beefy t', 'beefyt'],
    aliases: ['cotton fabric', '棉布'],
    objects: ['cotton t shirt', 't shirt', 'tshirt', '棉t恤', 't恤']}
]);
export const MATERIAL_IDS = Object.freeze(MATERIALS.map(material => material.id));

// Broad words that fit several materials. They return candidates, never a
// single confident match.
const GROUPS = Object.freeze([
  {terms: ['transparent plastic', 'clear plastic', '透明塑料'], ids: ['mylar-g', 'pmma', 'polycarbonate']},
  {terms: ['plastic', 'polymer', '塑料', '聚合物'], ids: ['mylar-g', 'ultem-1000', 'pmma', 'polycarbonate']},
  {terms: ['fabric', 'textile', 'cloth', '织物', '布料', '面料'], ids: ['nomex-ht90', 'sibal', 'beefy-t']},
  {terms: ['film', '薄膜'], ids: ['mylar-g', 'ultem-1000']},
  {terms: ['cotton', '棉'], ids: ['sibal', 'beefy-t']},
  {terms: ['nomex', 'aramid', '芳纶'], ids: ['nomex-ht90', 'nomex-velcro']}
]);

// The request's gravity values and the record labels each one selects. The
// "Earth-to-Moon model" label marks values a model extrapolated to lunar
// gravity; they are returned for `moon`, keep their own label and sort last.
export const GRAVITY_LABELS = Object.freeze({
  earth: ['Earth'], moon: ['Moon', 'Earth-to-Moon model'], mars: ['Mars'], iss: ['Microgravity']
});
const GRAVITY_NAMES = {earth: 'Earth gravity', moon: 'lunar gravity', mars: 'Mars gravity', iss: 'microgravity'};
const GRAVITY_TERMS = [
  ['earth', ['earth', '1g', '1 g', 'normal gravity', '地球', '常重力']],
  ['moon', ['moon', 'lunar', '月球', '月面']],
  ['mars', ['mars', 'martian', '火星']],
  ['iss', ['microgravity', 'micro gravity', 'micro g', 'zero gravity', 'zero g', '0g', '0 g', 'weightless',
    '微重力', '失重', '零重力', 'iss', 'space station', '国际空间站', '空间站']]
];
// Asking for the station by name limits results to records whose platform says so.
const STATION_TERMS = ['iss', 'space station', '国际空间站', '空间站'];
const STATION_PLATFORM = /\biss\b|space station/i;
const MODE_TERMS = [
  ['flaming', ['flaming', 'open flame', '明火']],
  ['smolder', ['smoldering', 'smouldering', 'smolder', 'smoulder', '阴燃']]
];
const METRIC_TERMS = [
  ['oxygen limits', ['oxygen limit', 'oxygen threshold', 'oxygen index', 'uloi', 'moc', '氧极限', '极限氧', '氧指数'],
    metric => /^(ULOI|MOC)\*?$/.test(metric)],
  ['flame spread', ['flame spread', 'spread rate', 'flame speed', '火焰传播', '传播速度', '火焰蔓延'],
    metric => metric.startsWith('flame_')]
];
// Measured and reported results come before fitted, derived and modelled ones.
const EVIDENCE_ORDER = ['reported_experimental_summary', 'reported_experimental_limit_aggregate',
  'reported_fit_to_experimental_data', 'source_derived_from_limit_aggregates',
  'model_derived_compensation_from_experiments'];
const STOP_WORDS = new Set(('find show list give tell what which where when how have has does did are was were the and for with ' +
  'about from into that this these those research record records data result results study studies material materials ' +
  'compare across between any all please test tests tested').split(' '));

export const LIMITS = Object.freeze({query: 500, groups: 10, defaultGroups: 5, evidence: 10, originalRecords: 10,
  bodyBytes: 4096, summaryChars: 600, summaryMs: 6000, cacheEntries: 200});

const CJK = /[㐀-鿿豈-﫿]/;

// Lower case, punctuation to spaces, and no spaces beside Chinese characters,
// so "棉 T 恤" and "棉T恤" compare equal and "P-213" equals "p 213".
export function normalise(text) {
  return String(text).normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .replace(/ (?=[㐀-鿿豈-﫿])|(?<=[㐀-鿿豈-﫿]) /g, '');
}

// English terms match whole words (with a plural ending); Chinese terms match
// anywhere, since Chinese has no spaces between words.
function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return CJK.test(term) ? new RegExp(escaped, 'g')
    : new RegExp(`(?<![a-z0-9])${escaped}(?:es|s)?(?![a-z0-9])`, 'g');
}
const has = (text, terms) => terms.some(term => termPattern(term).test(text));

const MATERIAL_TERMS = [
  ...MATERIALS.flatMap(material => [
    ...material.exact.map(term => ({term, tier: 3, kind: 'material', ids: [material.id]})),
    ...material.aliases.map(term => ({term, tier: 2, kind: 'alias', ids: [material.id]})),
    ...material.objects.map(term => ({term, tier: 2, kind: 'object', ids: [material.id]}))]),
  ...GROUPS.flatMap(group => group.terms.map(term => ({term, tier: 1, kind: 'broad', ids: group.ids})))
].sort((a, b) => b.term.length - a.term.length);

// Longest terms claim their words first, so "Nomex fabric" is one alias and
// not also the broad words "nomex" and "fabric".
function matchMaterials(text) {
  const taken = [], matches = new Map();
  for (const entry of MATERIAL_TERMS) {
    for (const found of text.matchAll(termPattern(entry.term))) {
      const start = found.index, end = start + found[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      for (const id of entry.ids) {
        const current = matches.get(id);
        if (!current || entry.tier > current.tier) matches.set(id, {tier: entry.tier, kind: entry.kind, term: entry.term});
      }
    }
  }
  return {matches, taken};
}

function parseConditions(text) {
  const gravities = GRAVITY_TERMS.filter(([, terms]) => has(text, terms)).map(([id]) => id);
  const modes = MODE_TERMS.filter(([, terms]) => has(text, terms)).map(([id]) => id);
  const metric = METRIC_TERMS.find(([, terms]) => has(text, terms));
  return {gravities, station: has(text, STATION_TERMS), modes,
    metric: metric ? {name: metric[0], test: metric[2]} : null};
}

export class SearchError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const invalid = (code, message) => new SearchError(400, code, message);

// Returns the request with defaults applied, or throws a 400.
export function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('INVALID_BODY', 'Send a JSON object with a query.');
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > LIMITS.query) throw invalid('INVALID_QUERY', `Enter a search between 1 and ${LIMITS.query} characters.`);
  const filters = body.filters ?? {};
  if (typeof filters !== 'object' || Array.isArray(filters)) throw invalid('INVALID_FILTER', 'Filters must be an object.');
  const gravity = filters.gravity ?? null, materialId = filters.materialId ?? null;
  if (gravity !== null && !Object.hasOwn(GRAVITY_LABELS, gravity)) throw invalid('INVALID_FILTER', 'Gravity must be earth, moon, mars, iss or null.');
  if (materialId !== null && !MATERIAL_IDS.includes(materialId)) throw invalid('INVALID_FILTER', 'Material must be one of the shelf material IDs or null.');
  const limit = body.limit ?? LIMITS.defaultGroups;
  if (!Number.isInteger(limit) || limit < 1 || limit > LIMITS.groups) throw invalid('INVALID_LIMIT', `Limit must be a whole number from 1 to ${LIMITS.groups}.`);
  return {query, filters: {gravity, materialId}, limit};
}

const orNull = value => value === undefined || value === '' ? null : value;

function evidenceRecord(measurement, experiment) {
  return {
    measurementId: measurement.measurement_id, experimentId: measurement.experiment_id, sourceId: measurement.source_id,
    material: experiment.material, gravity: orNull(experiment.gravity_label), gravityBasis: orNull(experiment.gravity_basis),
    metric: measurement.metric, value: orNull(measurement.value), unit: orNull(measurement.unit),
    evidenceType: measurement.evidence_type,
    conditions: {
      pressureKpa: orNull(experiment.pressure_kpa), oxygenPct: orNull(experiment.oxygen_pct),
      flowSpeedCmS: orNull(experiment.flow_speed_cm_s), durationS: orNull(experiment.duration_s),
      platform: orNull(experiment.platform), specimen: orNull(experiment.conditions)
    },
    limitation: orNull(measurement.limitation) ?? orNull(experiment.limitation),
    pdfPage: orNull(measurement.pdf_page), locator: orNull(measurement.locator)
  };
}

// Original CSV rows are attached only when the file's own material column
// names the research material. Rows that say "Nomex blend" or "ultem sheet"
// do not state the grade, so they are left to the original-data view.
const ORIGINAL_NAMES = {pmma: 'pmma', sibal: 'sibal'};
const MATERIAL_COLUMNS = new Set(['fuel sample material', 'material']);
const TEST_ROWS = new Set(['source_record', 'test_record']);

function originalRecords(original, materialId) {
  const name = ORIGINAL_NAMES[materialId], records = [];
  if (!name) return records;
  for (const dataset of original.datasets) {
    const column = dataset.columns.findIndex(header => MATERIAL_COLUMNS.has(normalise(header)));
    if (column < 0) continue;
    for (const row of dataset.rows) {
      if (!TEST_ROWS.has(row.rowKind) || !termPattern(name).test(normalise(row.cells[column] ?? ''))) continue;
      records.push({datasetId: dataset.id, recordId: orNull(row.id), rowIndex: row.csvRecordNumber ?? null,
        sourceUrl: dataset.sourceUrl,
        locator: `${dataset.title} CSV record ${row.csvRecordNumber}; ${dataset.columns[column].trim()}: ${row.cells[column].trim()}`});
      if (records.length === LIMITS.originalRecords) return records;
    }
  }
  return records;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// The deterministic search. `research` and `original` are complete bundles.
export function searchBundles({query, filters, limit}, research, original) {
  const text = normalise(query);
  const {matches} = matchMaterials(text);
  const parsed = parseConditions(text);

  // An explicit filter replaces whatever the query says about that condition.
  const gravities = filters.gravity ? [filters.gravity] : parsed.gravities;
  const station = !filters.gravity && parsed.station;
  const overridden = Boolean(filters.gravity) && parsed.gravities.some(gravity => gravity !== filters.gravity);
  const labels = new Set(gravities.flatMap(gravity => GRAVITY_LABELS[gravity]));
  const conditioned = gravities.length > 0 || station || parsed.modes.length > 0 || Boolean(parsed.metric);

  let candidates = matches, words = [];
  if (filters.materialId) candidates = new Map([[filters.materialId, matches.get(filters.materialId) || {tier: 3, kind: 'filter', term: null}]]);
  else if (!matches.size) {
    candidates = new Map(MATERIAL_IDS.map(id => [id, {tier: 0, kind: 'condition', term: null}]));
    // With no material and no condition, fall back to plain words in the records.
    if (!conditioned) {
      words = text.split(' ').filter((word, index, all) => /^[a-z0-9]{3,}$/.test(word) && !STOP_WORDS.has(word) && all.indexOf(word) === index);
      if (!words.length) candidates = new Map();
    }
  }

  const experiments = new Map(research.experiments.map(experiment => [experiment.experiment_id, experiment]));
  const sources = new Map(research.sources.map(source => [source.source_id, source]));
  const groups = [];
  for (const material of MATERIALS) {
    const match = candidates.get(material.id);
    if (!match) continue;
    const evidence = [];
    for (const measurement of research.measurements) {
      const experiment = experiments.get(measurement.experiment_id);
      if (!experiment || !material.labels.includes(experiment.material)) continue;
      if (labels.size && !labels.has(experiment.gravity_label)) continue;
      if (station && !STATION_PLATFORM.test(experiment.platform || '')) continue;
      if (parsed.metric && !parsed.metric.test(measurement.metric)) continue;
      if (parsed.modes.length && !parsed.modes.some(mode => experiment.material.toLowerCase().includes(`(${mode})`))) continue;
      if (words.length) {
        const haystack = normalise([experiment.material, experiment.conditions, experiment.platform, experiment.flow_mode,
          measurement.metric, measurement.locator, sources.get(measurement.source_id)?.title].filter(Boolean).join(' '));
        if (!words.some(word => termPattern(word).test(haystack))) continue;
      }
      evidence.push(evidenceRecord(measurement, experiment));
    }
    // Original rows carry no gravity, platform or combustion-mode fields, so
    // they are offered only when the search sets none of those conditions.
    const originals = conditioned || words.length ? [] : originalRecords(original, material.id);
    if (!evidence.length && !originals.length) continue;
    const order = record => { const at = EVIDENCE_ORDER.indexOf(record.evidenceType); return at < 0 ? EVIDENCE_ORDER.length : at; };
    evidence.sort((a, b) => order(a) - order(b) || a.measurementId.localeCompare(b.measurementId, 'en', {numeric: true}));
    const shown = evidence.slice(0, LIMITS.evidence);
    const sourceIds = [...new Set(shown.map(record => record.sourceId))];

    const notes = [`${shown.length} of ${plural(evidence.length, 'matching record')} shown.`];
    if (match.kind === 'object') notes.push(`Matched through the shelf object "${match.term}". The object helps find the material; the records describe ${material.title} test specimens, not the object.`);
    if (match.kind === 'broad') notes.push(`"${match.term}" fits several materials; this is one candidate.`);
    if (shown.some(record => record.gravity === 'Earth-to-Moon model')) notes.push('Earth-to-Moon model values are model estimates, not lunar tests.');
    groups.push({
      measured: evidence.some(record => order(record) < 2), tier: match.tier,
      result: {materialId: material.id, title: material.title, summary: notes.join(' '),
        evidenceIds: shown.map(record => record.measurementId), totalEvidenceCount: evidence.length,
        evidence: shown, originalRecords: originals,
        sources: sourceIds.map(id => ({sourceId: id, title: sources.get(id)?.title ?? id, url: sources.get(id)?.url ?? null}))}
    });
  }
  // Exact names first, then other names, then broad candidates. Materials
  // with measured results come before those with only derived values.
  groups.sort((a, b) => b.tier - a.tier || Number(b.measured) - Number(a.measured));
  const results = groups.slice(0, limit).map(group => group.result);

  const applied = [];
  if (gravities.length) applied.push(gravities.map(gravity => GRAVITY_NAMES[gravity]).join(' or ') + (filters.gravity ? ' (filter)' : ''));
  if (station) applied.push('platform named as the space station');
  if (parsed.metric) applied.push(parsed.metric.name);
  if (parsed.modes.length) applied.push(parsed.modes.join(' or ') + ' records');
  if (filters.materialId) applied.push(`material ${filters.materialId} (filter)`);
  const sentences = [results.length
    ? `Found ${plural(results.length, 'material')} with ${plural(results.reduce((sum, result) => sum + result.totalEvidenceCount, 0), 'matching record')}.`
    : 'No matching records. Try a material name such as Nomex or PMMA, or a broader condition.'];
  if (groups.length > results.length) sentences.push(`${groups.length - results.length} more matching ${groups.length - results.length === 1 ? 'material is' : 'materials are'} beyond the limit.`);
  if (applied.length) sentences.push(`Conditions applied: ${applied.join('; ')}.`);
  if (filters.materialId && [...matches.keys()].some(id => id !== filters.materialId)) sentences.push('The material filter was used instead of the material named in the search.');
  if (overridden) sentences.push('The gravity filter was used instead of the gravity named in the search.');

  return {
    query, mode: 'keyword', dataSource: null, summary: sentences.join(' '),
    appliedFilters: {gravity: filters.gravity ?? (gravities.length === 1 ? gravities[0] : null),
      materialId: filters.materialId},
    results
  };
}

// A summary may only use numbers that appear in the returned records.
export function summaryIsSupported(summary, response) {
  if (typeof summary !== 'string' || !summary.trim() || summary.length > LIMITS.summaryChars) return false;
  if (/https?:|www\./i.test(summary)) return false;
  const allowed = new Set(String(response.results.length).match(/\d+/g));
  const collect = value => { for (const number of String(value ?? '').match(/\d+(?:\.\d+)?/g) || []) allowed.add(number); };
  for (const result of response.results) {
    collect(result.title); collect(result.totalEvidenceCount); collect(result.evidence.length);
    for (const record of result.evidence) {
      for (const value of [record.material, record.gravity, record.metric, record.value, record.unit, record.pdfPage,
        ...Object.values(record.conditions)]) collect(value);
    }
  }
  return (summary.match(/\d+(?:\.\d+)?/g) || []).every(number => allowed.has(number));
}

const usable = (research, original) => Array.isArray(research?.experiments) && Array.isArray(research?.measurements) &&
  Array.isArray(research?.sources) && Array.isArray(original?.datasets) &&
  original.datasets.every(dataset => Array.isArray(dataset.columns) && Array.isArray(dataset.rows));
const live = bundle => ['bigquery', 'cached-stale'].includes(bundle?.delivery?.mode);

// `loadResearch` and `loadOriginal` are the server's existing cached readers.
// `summarise`, when supplied, receives {query, results} and returns
// {summary, materials?: {[materialId]: string}}; anything else means keyword mode.
export function createMaterialSearch({loadResearch, loadOriginal, snapshots, summarise = null,
  ratePerMinute = 30, allowedOrigins = [], now = Date.now}) {
  const cache = new Map(), hits = new Map();

  async function bundles() {
    let research, original;
    try { [research, original] = await Promise.all([loadResearch(), loadOriginal()]); } catch { /* use the snapshots */ }
    // One provenance per response: both collections live, or both from the saved snapshots.
    if (live(research) && live(original) && usable(research, original)) return {research, original, dataSource: 'bigquery'};
    if (usable(snapshots?.research, snapshots?.original)) return {research: snapshots.research, original: snapshots.original, dataSource: 'snapshot'};
    throw new SearchError(503, 'SERVICE_UNAVAILABLE', 'Search is unavailable right now. Try again shortly.');
  }

  async function search(body) {
    const request = validateRequest(body);
    const {research, original, dataSource} = await bundles();
    const key = JSON.stringify([normalise(request.query), request.filters, request.limit, dataSource, research.exportedAt, original.exportedAt]);
    if (cache.has(key)) return {...cache.get(key), query: request.query};
    const response = {...searchBundles(request, research, original), dataSource};
    if (summarise && response.results.length) {
      try {
        let timer;
        const written = await Promise.race([summarise({query: request.query, results: response.results}),
          new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Summary timed out')), LIMITS.summaryMs); })]).finally(() => clearTimeout(timer));
        const perMaterial = written?.materials ?? {};
        const ids = new Set(response.results.map(result => result.materialId));
        if (summaryIsSupported(written?.summary, response) && typeof perMaterial === 'object' &&
            Object.entries(perMaterial).every(([id, text]) => ids.has(id) && summaryIsSupported(text, response))) {
          response.mode = 'ai'; response.summary = written.summary.trim();
          for (const result of response.results) if (perMaterial[result.materialId]) result.summary = perMaterial[result.materialId].trim();
        }
      } catch (error) { console.warn('Material search summary:', error.message); }
    }
    if (cache.size >= LIMITS.cacheEntries) cache.delete(cache.keys().next().value);
    cache.set(key, response);
    return response;
  }

  function limited(client) {
    const minute = Math.floor(now() / 60000);
    for (const [key, entry] of hits) if (entry.minute !== minute) hits.delete(key);
    const entry = hits.get(client) || {minute, count: 0};
    entry.count += 1; hits.set(client, entry);
    return entry.count > ratePerMinute;
  }

  // Node http handler for the route. Other routes are untouched.
  async function handle(req, res) {
    const send = (status, body, headers = {}) => {
      res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers});
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const fail = (status, code, message, headers) => send(status, {error: {code, message}}, headers);
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, {Allow: 'POST, OPTIONS'}).end(); return; }
    if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST for material search.', {Allow: 'POST, OPTIONS'});
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the search as application/json.');
    const client = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (limited(client)) return fail(429, 'RATE_LIMITED', 'Too many searches. Try again in a minute.', {'Retry-After': '60'});
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > LIMITS.bodyBytes) return fail(413, 'BODY_TOO_LARGE', 'The search request is too large.', {Connection: 'close'});
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw invalid('INVALID_BODY', 'Send a JSON object with a query.'); }
      send(200, await search(body));
    } catch (error) {
      if (error instanceof SearchError) return fail(error.status, error.code, error.message);
      console.warn('Material search failed:', error.message);
      fail(503, 'SERVICE_UNAVAILABLE', 'Search is unavailable right now. Try again shortly.');
    }
  }

  return {search, handle};
}
