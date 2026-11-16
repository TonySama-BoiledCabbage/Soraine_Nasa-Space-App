// Team Soraine research database for the detail page. Same public tables and columns as the team dashboard's
// Cloud Run API (dashboard/server/research.mjs): sources, experiments, measurements, evidence statements, plus the
// original NASA CSV rows (server/original-data.mjs). Live first through the same-origin routes that serve.py and
// vercel.json forward to Cloud Run; if that fails the dashboard's dated BigQuery export bundled in data/research-db/ is
// used, and the UI says which one it is showing. Values are kept exactly as delivered (decimal strings stay strings).

const LIVE = { research: '/api/research', original: '/api/original-data' };
const SAVED = { research: new URL('../../../data/research.json', import.meta.url).href, original: new URL('../../../data/original-data.json', import.meta.url).href };
const TIMEOUT_MS = 12000;

// A successful HTTP response may still contain a snapshot or a stale cached result.
export function deliveryLabel(result) {
  if (result.via === 'saved') return 'from the saved export';
  if (result.data.delivery?.mode === 'bigquery') return 'from BigQuery (server-cached)';
  if (result.data.delivery?.mode === 'cached-stale') return 'from the last complete BigQuery refresh; the latest refresh failed';
  return 'from the server snapshot';
}

async function getJson(url, ms = TIMEOUT_MS) {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
  if (!/json/.test(r.headers.get('Content-Type') || '')) throw new Error(`${url} did not return JSON`);
  return r.json();
}

// Fail closed: every measurement must resolve to its experiment and source, IDs must be unique.
export function validateResearch(b) {
  for (const t of ['sources', 'experiments', 'measurements', 'evidence']) if (!Array.isArray(b?.[t])) throw new Error(`Research table missing: ${t}`);
  const uniq = (rows, k) => { const s = new Set(rows.map(r => r[k])); if (s.size !== rows.length) throw new Error(`Duplicate ${k}`); return s; };
  const src = uniq(b.sources, 'source_id'), exp = uniq(b.experiments, 'experiment_id');
  uniq(b.measurements, 'measurement_id'); uniq(b.evidence, 'evidence_id');
  if (b.measurements.some(m => !src.has(m.source_id) || !exp.has(m.experiment_id))) throw new Error('Research references are incomplete');
  return b;
}
export function validateOriginal(b) {
  if (!Array.isArray(b?.datasets) || !b.datasets.length) throw new Error('Original data missing');
  for (const d of b.datasets) if (!d.id || !Array.isArray(d.columns) || !Array.isArray(d.rows) || d.rows.some(r => !Array.isArray(r.cells))) throw new Error('Original dataset unreadable: ' + d.id);
  return b;
}

async function liveOrSaved(kind, validate) {
  try { return { data: validate(await getJson(LIVE[kind])), via: 'live' }; }
  catch (liveError) {
    const data = validate(await getJson(SAVED[kind], 30000));
    return { data, via: 'saved', liveError: String(liveError.message || liveError) };
  }
}

// Joined indexes for the browser: every cross-reference in the chain is a Map lookup.
function index(b) {
  const sources = new Map(b.sources.map(s => [s.source_id, s]));
  const experiments = new Map(b.experiments.map(e => [e.experiment_id, e]));
  const measurements = new Map(b.measurements.map(m => [m.measurement_id, m]));
  const statements = new Map(b.evidence.map(e => [e.evidence_id, e]));
  const relatedIds = (st) => Array.isArray(st.related_measurement_ids) ? st.related_measurement_ids : String(st.related_measurement_ids || '').split(/[,;\s]+/).filter(Boolean);
  const statementsFor = new Map();
  for (const st of b.evidence) for (const id of relatedIds(st)) { if (!statementsFor.has(id)) statementsFor.set(id, []); statementsFor.get(id).push(st); }
  const by = (rows, key) => { const m = new Map(); for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  return {
    bundle: b, sources, experiments, measurements, statements, relatedIds,
    statementsFor: (id) => statementsFor.get(id) || [],
    measurementsByExperiment: by(b.measurements, 'experiment_id'),
    measurementsBySource: by(b.measurements, 'source_id'),
    experimentsBySource: by(b.experiments, 'source_id'),
    statementsBySource: by(b.evidence, 'source_id'),
    experimentsByGroup: by(b.experiments, 'comparability_group')
  };
}

let researchJob = null, originalJob = null;
export function loadResearch() {
  researchJob ??= liveOrSaved('research', validateResearch).then(r => ({ ...r, db: index(r.data) })).catch(e => { researchJob = null; throw e; });
  return researchJob;
}
export function loadOriginal() {
  originalJob ??= liveOrSaved('original', validateOriginal).catch(e => { originalJob = null; throw e; });
  return originalJob;
}

// Flat export of measurements with their full experiment context and source, as the dashboard's CSV does but with
// every public column (nothing dropped for layout).
export const MEASUREMENT_FIELDS = ['measurement_id', 'experiment_id', 'source_id', 'metric', 'value', 'unit', 'normalized_value', 'normalized_unit', 'conversion', 'evidence_type', 'independent_raw_trial', 'pdf_page', 'locator', 'reliability_label', 'uncertainty_value', 'uncertainty_unit', 'uncertainty_status', 'limitation'];
export const EXPERIMENT_FIELDS = ['experiment_id', 'source_id', 'context_type', 'material', 'gravity_label', 'gravity_nominal_g', 'gravity_basis', 'platform', 'pressure_psia', 'pressure_kpa', 'pressure_reported', 'oxygen_pct', 'flow_speed_cm_s', 'flow_mode', 'duration_s', 'conditions', 'comparability_group', 'limitation'];
export const SOURCE_FIELDS = ['source_id', 'source_type', 'title', 'url', 'doi', 'publication_date', 'source_authority'];
export const STATEMENT_FIELDS = ['evidence_id', 'source_id', 'statement', 'language', 'evidence_type', 'locator', 'pdf_page', 'related_measurement_ids', 'reliability_label', 'limitation'];

export function joinedMeasurement(db, m) {
  const e = db.experiments.get(m.experiment_id) || {}, s = db.sources.get(m.source_id) || {};
  const out = {};
  for (const k of MEASUREMENT_FIELDS) out[k] = m[k] ?? null;
  for (const k of EXPERIMENT_FIELDS) if (!(k in out)) out['experiment_' + k] = e[k] ?? null;
  for (const k of SOURCE_FIELDS) if (k !== 'source_id') out['source_' + k] = s[k] ?? null;
  out.supporting_statement_ids = db.statementsFor(m.measurement_id).map(st => st.evidence_id).join(';') || null;
  return out;
}
export function toCsv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const cell = (v) => { let t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); if (/^[=+@\t\r-]/.test(t) && isNaN(Number(t))) t = "'" + t; return '"' + t.replaceAll('"', '""') + '"'; };
  return [keys.join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\r\n');
}
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
