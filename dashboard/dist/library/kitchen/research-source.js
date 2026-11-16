// Research records for the material shelf. Every source returns the same flat row shape as the BigQuery view
// v_evidence_browser (measurement fields + experiment conditions), so the shelf never depends on where data came from.
//
//   snapshot (default) : dashboard/data/research.json, exported by 11_bigquery/export_dashboard.py
//   api (?data=api)    : /api/research (experiments + measurements joined on experiment_id).
//                       Falls back to the labelled snapshot on failure.
// BigQuery credentials stay on the server. Delivery metadata distinguishes live and saved records.

const SNAPSHOT_URL = 'dashboard/data/research.json';
const API_URL = () => '/api/research';

// value / normalized_value may arrive as number, numeric string, free text or null.
export function readValue(v) {
  if (v == null || v === '') return { num: null, text: null };
  if (typeof v === 'number') return { num: Number.isFinite(v) ? v : null, text: String(v) };
  const n = Number(String(v).trim());
  return { num: Number.isFinite(n) ? n : null, text: String(v) };
}

function fromSnapshot(d) {
  return {
    rows: d.evidence,
    sources: d.sources || [],
    meta: { origin: 'snapshot', mode: d.data_mode, date: d.snapshot_date, manifest: d.manifest_sha256 }
  };
}

// Join the public API by experiment ID; preserve delivery provenance separately from origin.
function fromApi(d) {
  const ctx = new Map((d.experiments || []).map(e => [e.experiment_id, e]));
  const rows = (d.measurements || []).map(m => ({ ...ctx.get(m.experiment_id), ...m }));
  return { rows, sources: d.sources || [], meta: { origin: 'api', delivery: d.delivery?.mode, mode: d.mode, date: d.exportedAt, project: d.project } };
}

function check(set) {
  const ids = new Set(set.rows.map(r => r.measurement_id));
  if (!set.rows.length || ids.size !== set.rows.length) throw new Error('Research rows missing or duplicated');
  return set;
}

class ResearchSource {
  constructor() { this.ready = null; this.rows = []; this.sources = new Map(); this.meta = null; this.error = null; }
  load() {
    if (this.ready) return this.ready;
    const want = new URLSearchParams(location.search).get('data');
    const snapshot = () => fetch(SNAPSHOT_URL).then(r => { if (!r.ok) throw new Error('Research snapshot HTTP ' + r.status); return r.json(); }).then(fromSnapshot);
    const job = want === 'api'
      ? fetch(API_URL(), {signal: AbortSignal.timeout(12000)}).then(r => { if (!r.ok) throw new Error('API HTTP ' + r.status); return r.json(); }).then(fromApi).then(check)
          .catch(e => { console.warn('Research API unavailable, using snapshot', e); return snapshot().then(s => ({ ...s, meta: { ...s.meta, fallbackFrom: 'api' } })); })
      : snapshot();
    this.ready = job.then(check).then(set => {
      this.rows = set.rows; this.meta = set.meta;
      this.byId = new Map(set.rows.map(r => [r.measurement_id, r]));
      this.sources = new Map(set.sources.map(s => [s.source_id, s]));
      return this;
    }).catch(e => { this.error = e; this.ready = null; throw e; });
    return this.ready;
  }
  byIds(ids) { return ids.map(id => this.byId?.get(id)).filter(Boolean); }
  byMaterial(name) { return this.rows.filter(r => r.material === name); }
  source(id) { return this.sources.get(id); }
}

export const research = new ResearchSource();

export function provenanceLabel(meta) {
  if (meta?.origin === 'api' && meta.delivery === 'bigquery') return 'BigQuery research records';
  if (meta?.origin === 'api' && meta.delivery === 'cached-stale') return 'Cached BigQuery records; refresh unavailable';
  return 'Saved research snapshot';
}
