// Detail page: the team's research database in full. Tabs for material search, measurements, experiment contexts,
// sources, supporting statements, original NASA CSV rows, term definitions and data provenance. Selecting any record
// opens its evidence chain (measurement → experiment context → source, page and locator → statements → related
// records); every ID in the chain links to its own record. Nothing is rounded, summarised away or dropped for layout:
// all public columns are shown, missing values read "Not reported".
import { deliveryLabel, loadResearch, loadOriginal, joinedMeasurement, toCsv, download, MEASUREMENT_FIELDS, EXPERIMENT_FIELDS, SOURCE_FIELDS, STATEMENT_FIELDS } from './data.js';
import { definitions } from './glossary.js';
import { mountMaterialSearch } from '../material-search/ui.js?v=search-1';

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (v) => { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
const missing = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
const show = (v) => missing(v) ? '<span class="rdb-na">Not reported</span>' : esc(Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v);
const human = (k) => k.replaceAll('_', ' ').replace(/\bpct\b/, '%').replace(/\bkpa\b/, 'kPa').replace(/\bpsia\b/, 'psia').replace(/\bcm s\b/, 'cm/s').replace(/\bs$/, '(s)').replace(/\bid\b/, 'ID').replace(/^./, (c) => c.toUpperCase());
const TYPE_NAMES = { reported_experimental_limit_aggregate: 'Published limit', reported_fit_to_experimental_data: 'Fitted result', reported_experimental_summary: 'Reported summary', source_derived_from_limit_aggregates: 'Derived summary', model_derived_compensation_from_experiments: 'Model-derived' };
const TYPE_TERM = { reported_experimental_limit_aggregate: 'published', reported_fit_to_experimental_data: 'fitted', reported_experimental_summary: 'summary', source_derived_from_limit_aggregates: 'derived', model_derived_compensation_from_experiments: 'model' };
const typeName = (t) => TYPE_NAMES[t] || String(t ?? '').replaceAll('_', ' ');
const def = (key) => definitions[key] ? `${definitions[key].title}: ${definitions[key].description}` : '';
const termAttr = (key) => def(key) ? ` title="${esc(def(key))}" class="rdb-term"` : '';
const go = (kind, id, label = id, extra = '') => `<button type="button" class="rdb-link ${extra}" data-go="${kind}" data-id="${esc(id)}">${esc(label)}</button>`;
const PAGE = 15;
const TABS = [['search', 'Search'], ['measurements', 'Measurements'], ['experiments', 'Experiment contexts'], ['sources', 'Sources'], ['statements', 'Statements'], ['original', 'NASA original data'], ['terms', 'Terms'], ['about', 'About the data']];

export function mountResearchBrowser(host, { searchOptions }) {
  host.className = 'rdb';
  host.innerHTML = `<header class="rdb-head"><div><span class="rdb-eyebrow">SORAINE · Flame in Freefall research database</span><h2>Every record, with its conditions and source.</h2></div><p class="rdb-prov" role="status">Loading the research database…</p></header>
<nav class="rdb-tabs" aria-label="Research database sections">${TABS.map(([id, name]) => `<button type="button" data-tab="${id}" aria-pressed="${id === 'search'}">${name}<span data-count="${id}"></span></button>`).join('')}</nav>
<div class="rdb-body"><section class="rdb-view" data-view="search"><div class="rdb-search-host"></div></section>${TABS.slice(1).map(([id]) => `<section class="rdb-view" data-view="${id}" hidden></section>`).join('')}<aside class="rdb-record" aria-label="Evidence chain" hidden></aside></div>`;
  const $ = (s) => host.querySelector(s), views = Object.fromEntries(TABS.map(([id]) => [id, host.querySelector(`[data-view="${id}"]`)]));
  const recordEl = $('.rdb-record'), prov = $('.rdb-prov');
  // Search falls back to the same full database bundle (live BigQuery or the saved export) the other tabs use.
  const search = mountMaterialSearch($('.rdb-search-host'), { ...searchOptions, loadBundle: () => loadResearch().then((r) => r.data) });
  const st = { tab: 'search', record: null, trail: [], f: { measurements: { q: '', material: '', gravity: '', type: '', page: 0 }, experiments: { q: '', material: '', gravity: '', page: 0 }, sources: { q: '', type: '', used: false, page: 0 }, statements: { q: '', page: 0 }, original: { ds: null, q: '', kind: '', page: 0 } } };
  let R = null, O = null, db = null;

  // ---------- loading ----------
  const ready = loadResearch().then((r) => { R = r; db = r.db; renderProvenance(); counts(); renderTab(); return r; })
    .catch(() => { prov.textContent = 'The research database could not be loaded. Return to the dashboard and try again.'; return null; });
  function provenanceText() {
    const b = R.data, when = b.exportedAt ? new Date(b.exportedAt).toLocaleString('en-CA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC' : 'date not stated';
    if (R.via === 'saved') return `Saved BigQuery export of ${esc(b.dataset)} (${esc(b.project)}), exported ${when}. The live service could not be reached, so this is not a live query.`;
    const mode = b.delivery?.mode;
    if (mode === 'bigquery') return `Live BigQuery: ${esc(b.dataset)} (${esc(b.project)}), read ${when}; the server caches complete tables for ${b.delivery.refreshSeconds ?? 300} s.`;
    if (mode === 'cached-stale') return `BigQuery, last complete refresh ${when}. The latest refresh failed, so this is the previous complete result.`;
    return `Server snapshot of ${esc(b.dataset)}, exported ${when}. The server has not completed a live BigQuery read yet.`;
  }
  function renderProvenance() { prov.innerHTML = `<span class="rdb-dot ${R.via === 'live' && R.data.delivery?.mode === 'bigquery' ? 'live' : ''}"></span>${provenanceText()}`; }
  function counts() {
    const b = R.data, n = { measurements: b.measurements.length, experiments: b.experiments.length, sources: b.sources.length, statements: b.evidence.length, original: O ? O.data.datasets.reduce((a, d) => a + d.rows.length, 0) : '', terms: Object.keys(definitions).length };
    for (const [k, v] of Object.entries(n)) { const el = host.querySelector(`[data-count="${k}"]`); if (el) el.textContent = v === '' ? '' : String(v); }
  }

  // ---------- tabs ----------
  function setTab(tab) {
    if (st.record) closeRecord();
    st.tab = tab;
    host.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    for (const [id, el] of Object.entries(views)) el.hidden = id !== tab;
    if (tab === 'search') closeRecord();
    renderTab();
  }
  function renderTab() {
    const v = views[st.tab];
    if (st.tab === 'search') return;
    if (st.tab === 'terms') { v.innerHTML = termsView(); return; }
    if (!R) { v.innerHTML = '<p class="rdb-empty">Loading…</p>'; return; }
    if (st.tab === 'original') {
      if (!O) { v.innerHTML = '<p class="rdb-empty">Loading the original NASA CSV rows…</p>'; loadOriginal().then((o) => { O = o; counts(); if (st.tab === 'original') renderTab(); }).catch((e) => { v.innerHTML = `<p class="rdb-empty">Original data could not be loaded: ${esc(e.message || e)}</p>`; }); return; }
      v.innerHTML = originalView(); return;
    }
    v.innerHTML = { measurements: measurementsView, experiments: experimentsView, sources: sourcesView, statements: statementsView, about: aboutView }[st.tab]();
  }

  // ---------- list views ----------
  const options = (values, current, all) => `<option value="">${all}</option>` + [...new Set(values.filter((x) => !missing(x)))].sort().map((x) => `<option value="${esc(x)}" ${x === current ? 'selected' : ''}>${esc(TYPE_NAMES[x] || String(x).replaceAll('_', ' '))}</option>`).join('');
  const textHit = (q, parts) => { const t = q.trim().toLowerCase(); return !t || t.split(/\s+/).every((w) => parts.join(' ').toLowerCase().includes(w)); };
  function pager(key, total) {
    const f = st.f[key], pages = Math.max(1, Math.ceil(total / PAGE)); f.page = Math.min(f.page, pages - 1);
    return `<div class="rdb-pager"><span>${total ? `${f.page * PAGE + 1}–${Math.min((f.page + 1) * PAGE, total)} of ${total}` : '0 results'}</span><span><button type="button" data-page="${key}" data-d="-1" ${f.page ? '' : 'disabled'} aria-label="Previous page">←</button> ${f.page + 1} / ${pages} <button type="button" data-page="${key}" data-d="1" ${f.page < pages - 1 ? '' : 'disabled'} aria-label="Next page">→</button></span></div>`;
  }
  const slice = (key, rows) => rows.slice(st.f[key].page * PAGE, (st.f[key].page + 1) * PAGE);
  const sel = (kind, id) => st.record?.kind === kind && st.record.id === id ? ' aria-current="true"' : '';

  function filteredMeasurements() {
    const f = st.f.measurements;
    return R.data.measurements.filter((m) => { const e = db.experiments.get(m.experiment_id), s = db.sources.get(m.source_id);
      return (!f.material || e.material === f.material) && (!f.gravity || e.gravity_label === f.gravity) && (!f.type || m.evidence_type === f.type) &&
        textHit(f.q, [m.measurement_id, m.metric, m.value, m.unit, m.locator, e.material, e.gravity_label, e.platform, e.conditions, s?.title, m.source_id]); });
  }
  function measurementsView() {
    const f = st.f.measurements, rows = filteredMeasurements(), ex = R.data.experiments;
    return `<p class="rdb-intro">${R.data.measurements.length} extracted results. Each row is a reported or derived value with its experiment context; experiment contexts are not independent raw trials.</p>
<div class="rdb-filters" data-filters="measurements"><input type="search" name="q" value="${esc(f.q)}" placeholder="Search IDs, metrics, values, materials, sources" aria-label="Search measurements"><select name="material" aria-label="Material">${options(ex.map((e) => e.material), f.material, 'All materials')}</select><select name="gravity" aria-label="Gravity">${options(ex.map((e) => e.gravity_label), f.gravity, 'All gravity contexts')}</select><select name="type" aria-label="Evidence type">${options(R.data.measurements.map((m) => m.evidence_type), f.type, 'All evidence types')}</select>
<span class="rdb-export"><button type="button" data-export="csv">Export CSV</button><button type="button" data-export="json">Export JSON</button></span></div>
<div class="rdb-table-wrap"><table class="rdb-table"><thead><tr><th>Record</th><th>Material</th><th>Gravity</th><th>Metric</th><th class="num">Value</th><th>Evidence type</th><th>Source · page</th></tr></thead><tbody>${slice('measurements', rows).map((m) => { const e = db.experiments.get(m.experiment_id); return `<tr data-go="measurement" data-id="${esc(m.measurement_id)}" tabindex="0"${sel('measurement', m.measurement_id)}><td class="mono">${esc(m.measurement_id)}</td><td>${esc(e.material)}</td><td>${esc(e.gravity_label)}</td><td><span${termAttr(m.metric)}>${esc(m.metric)}</span></td><td class="num">${show(m.value)}<small>${show(m.unit)}</small></td><td><span class="rdb-chip ${String(m.evidence_type).startsWith('model') ? 'amber' : ''}"${termAttr(TYPE_TERM[m.evidence_type])}>${esc(typeName(m.evidence_type))}</span></td><td class="mono">${esc(m.source_id)}<small>PDF p. ${show(m.pdf_page)}</small></td></tr>`; }).join('')}</tbody></table></div>${pager('measurements', rows.length)}`;
  }
  function filteredExperiments() {
    const f = st.f.experiments;
    return R.data.experiments.filter((e) => (!f.material || e.material === f.material) && (!f.gravity || e.gravity_label === f.gravity) && textHit(f.q, [e.experiment_id, e.material, e.gravity_label, e.platform, e.conditions, e.comparability_group, e.source_id, e.flow_mode]));
  }
  function experimentsView() {
    const f = st.f.experiments, rows = filteredExperiments(), ex = R.data.experiments;
    return `<p class="rdb-intro">${ex.length} experiment contexts: the material, gravity basis, platform, atmosphere and flow under which results were reported.</p>
<div class="rdb-filters" data-filters="experiments"><input type="search" name="q" value="${esc(f.q)}" placeholder="Search contexts, platforms, specimens, groups" aria-label="Search experiment contexts"><select name="material" aria-label="Material">${options(ex.map((e) => e.material), f.material, 'All materials')}</select><select name="gravity" aria-label="Gravity">${options(ex.map((e) => e.gravity_label), f.gravity, 'All gravity contexts')}</select></div>
<div class="rdb-table-wrap"><table class="rdb-table"><thead><tr><th>Material</th><th>Gravity</th><th>Platform</th><th class="num">Pressure</th><th class="num">O₂</th><th>Flow</th><th class="num">Results</th></tr></thead><tbody>${slice('experiments', rows).map((e) => `<tr data-go="experiment" data-id="${esc(e.experiment_id)}" tabindex="0"${sel('experiment', e.experiment_id)}><td>${esc(e.material)}<small class="mono">${esc(e.experiment_id)}</small></td><td>${esc(e.gravity_label)}<small>${missing(e.gravity_nominal_g) ? '' : esc(e.gravity_nominal_g) + ' g nominal'}</small></td><td>${show(e.platform)}</td><td class="num">${missing(e.pressure_kpa) ? show(e.pressure_reported) : esc(e.pressure_kpa) + '<small>kPa</small>'}</td><td class="num">${missing(e.oxygen_pct) ? show(null) : esc(e.oxygen_pct) + '<small>%</small>'}</td><td>${missing(e.flow_speed_cm_s) ? show(e.flow_mode) : esc(e.flow_speed_cm_s) + ' cm/s'}</td><td class="num">${(db.measurementsByExperiment.get(e.experiment_id) || []).length}</td></tr>`).join('')}</tbody></table></div>${pager('experiments', rows.length)}`;
  }
  function filteredSources() {
    const f = st.f.sources, used = (s) => (db.measurementsBySource.get(s.source_id) || []).length;
    return R.data.sources.filter((s) => (!f.type || s.source_type === f.type) && (!f.used || used(s)) && textHit(f.q, [s.source_id, s.title, s.doi, s.source_authority, s.url]))
      .sort((a, b) => used(b) - used(a) || (db.statementsBySource.get(b.source_id)?.length || 0) - (db.statementsBySource.get(a.source_id)?.length || 0));
  }
  function sourcesView() {
    const f = st.f.sources, rows = filteredSources(), tc = R.data.tableCounts || {};
    return `<p class="rdb-intro">${R.data.sources.length} indexed sources, sorted by extracted results and then statements. Inclusion in the catalogue does not mean a document contributed a measurement${tc.raw_records ? `; the private catalogue also lists ${tc.raw_records} raw records and ${tc.files} file entries, which are not public` : ''}.</p>
<div class="rdb-filters" data-filters="sources"><input type="search" name="q" value="${esc(f.q)}" placeholder="Search titles, source IDs, DOI" aria-label="Search sources"><select name="type" aria-label="Collection">${options(R.data.sources.map((s) => s.source_type), f.type, 'All collections')}</select><label class="rdb-check"><input type="checkbox" name="used" ${f.used ? 'checked' : ''}> With extracted results only</label></div>
<div class="rdb-table-wrap"><table class="rdb-table"><thead><tr><th>Source</th><th>Collection</th><th>Date</th><th class="num">Results</th><th class="num">Statements</th></tr></thead><tbody>${slice('sources', rows).map((s) => `<tr data-go="source" data-id="${esc(s.source_id)}" tabindex="0"${sel('source', s.source_id)}><td>${show(s.title)}<small class="mono">${esc(s.source_id)}</small></td><td>${esc(String(s.source_type).replaceAll('_', ' '))}</td><td>${show(s.publication_date)}</td><td class="num">${(db.measurementsBySource.get(s.source_id) || []).length || '—'}</td><td class="num">${(db.statementsBySource.get(s.source_id) || []).length || '—'}</td></tr>`).join('')}</tbody></table></div>${pager('sources', rows.length)}`;
  }
  function filteredStatements() { const f = st.f.statements; return R.data.evidence.filter((e) => textHit(f.q, [e.evidence_id, e.statement, e.source_id, e.locator, e.evidence_type])); }
  function statementsView() {
    const rows = filteredStatements();
    return `<p class="rdb-intro">${R.data.evidence.length} supporting evidence statements recorded with their source, locator and reliability label.</p>
<div class="rdb-filters" data-filters="statements"><input type="search" name="q" value="${esc(st.f.statements.q)}" placeholder="Search statement text, IDs, sources" aria-label="Search statements"></div>
<div class="rdb-list">${slice('statements', rows).map((e) => `<button type="button" class="rdb-statement" data-go="statement" data-id="${esc(e.evidence_id)}"${sel('statement', e.evidence_id)}><span class="rdb-chip">${esc(String(e.evidence_type).replaceAll('_', ' '))}</span><span class="rdb-quote">${esc(String(e.statement).slice(0, 260))}${String(e.statement).length > 260 ? '…' : ''}</span><small class="mono">${esc(e.evidence_id)} · ${esc(e.source_id)} · ${show(e.locator)}${missing(e.pdf_page) ? '' : ' · PDF p. ' + esc(e.pdf_page)}</small></button>`).join('')}</div>${pager('statements', rows.length)}`;
  }

  // ---------- original NASA CSV ----------
  const rowKind = (k) => ({ source_record: 'Source record', test_record: 'Test record', source_note: 'Source note', pretest_reference: 'Pre-test reference' }[k] || k);
  function originalView() {
    const f = st.f.original, ds = O.data.datasets, cur = ds.find((d) => d.id === f.ds) || ds[0]; f.ds = cur.id;
    const rows = cur.rows.filter((r) => (!f.kind || r.rowKind === f.kind) && textHit(f.q, [r.id, ...r.cells]));
    const src = R && db.sources.get(cur.sourceId);
    return `<p class="rdb-intro">${ds.reduce((a, d) => a + d.rows.length, 0)} rows from ${ds.length} NASA PSI CSV files, ${deliveryLabel(O)}${O.data.exportedAt ? ` (${esc(O.data.exportedAt.slice(0, 10))})` : ''}. Headers, strings, blanks, approximations and notes are kept as published. Rows include test configurations, run logs and notes, so row counts are not independent trial counts.</p>
<div class="rdb-ds">${ds.map((d) => `<button type="button" data-ds="${esc(d.id)}" aria-pressed="${d.id === cur.id}">${esc(d.title)}<small>${d.rows.length} rows · ${d.columns.length} columns</small></button>`).join('')}</div>
<div class="rdb-file"><div><strong>${esc(cur.title)}</strong> <span class="mono">${esc(cur.sourceId)}</span>${src ? ' · ' + go('source', src.source_id, 'source record') : ''}</div><div class="mono rdb-hash">SHA-256 ${esc(cur.sha256 || 'not supplied')}</div>${safeUrl(cur.sourceUrl) ? `<a href="${safeUrl(cur.sourceUrl)}" target="_blank" rel="noopener noreferrer">Download the original CSV from NASA PSI ↗</a>` : ''}</div>
<div class="rdb-filters" data-filters="original"><input type="search" name="q" value="${esc(f.q)}" placeholder="Search every cell in ${esc(cur.title)}" aria-label="Search original rows"><select name="kind" aria-label="Row kind">${options(cur.rows.map((r) => r.rowKind), f.kind, 'All row kinds').replace(/>source_record</g, '>Source record<')}</select></div>
<div class="rdb-table-wrap rdb-wide"><table class="rdb-table rdb-csv"><thead><tr><th>CSV row</th>${cur.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${slice('original', rows).map((r) => `<tr data-go="original" data-id="${esc(cur.id + '|' + r.id)}" tabindex="0"${sel('original', cur.id + '|' + r.id)}><td class="mono">${esc(r.csvRecordNumber)}${r.rowKind !== 'source_record' ? `<small>${esc(rowKind(r.rowKind))}</small>` : ''}</td>${cur.columns.map((_, i) => `<td>${show(r.cells[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${pager('original', rows.length)}`;
  }

  // ---------- terms / about ----------
  function termsView() {
    return `<p class="rdb-intro">Definitions used across the research records, from the team dashboard glossary.</p><dl class="rdb-terms">${Object.entries(definitions).map(([k, d]) => `<div><dt>${esc(d.title)} <span class="mono">${esc(k)}</span></dt><dd>${esc(d.description)}</dd></div>`).join('')}</dl>`;
  }
  function aboutView() {
    const b = R.data, tc = b.tableCounts || {};
    return `<p class="rdb-intro">${provenanceText()}</p>${R.liveError ? `<p class="rdb-warn">Live request: ${esc(R.liveError)}</p>` : ''}
<dl class="rdb-fields">${[['Dataset', b.dataset], ['Project', b.project], ['Mode', b.mode], ['Delivery', b.delivery ? `${b.delivery.mode}${b.delivery.lastSuccess ? ' · last success ' + b.delivery.lastSuccess : ''}` : (R.via === 'saved' ? 'saved export in this app' : null)], ['Exported at', b.exportedAt], ['Catalogue counts as of', b.catalogueCountsAsOf], ['Schema version', b.schemaVersion]].map(([k, v]) => `<div><dt>${k}</dt><dd>${show(v)}</dd></div>`).join('')}</dl>
<h3 class="rdb-h">Table counts</h3><dl class="rdb-fields">${Object.entries(tc).map(([k, v]) => `<div><dt>${esc(human(k))}</dt><dd class="num">${esc(v)}${['raw_records', 'files', 'resource_links', 'download_events'].includes(k) ? ' <small>catalogue only, not in the public API</small>' : ''}</dd></div>`).join('')}</dl>
<h3 class="rdb-h">Notes from the export</h3>${(b.notes || []).map((n) => `<p class="rdb-note">${esc(n)}</p>`).join('')}
<p class="rdb-note">Public columns follow the team API: sources (${SOURCE_FIELDS.length}), experiments (${EXPERIMENT_FIELDS.length}), measurements (${MEASUREMENT_FIELDS.length}) and evidence statements (${STATEMENT_FIELDS.length}). No credentials, account identities, local paths, raw manifests or download logs are included.</p>`;
  }

  // ---------- evidence chain (record panel) ----------
  const fieldsDl = (obj, keys, links = {}) => `<dl class="rdb-fields">${keys.map((k) => `<div><dt>${esc(human(k))}</dt><dd>${links[k] && !missing(obj[k]) ? links[k](obj[k]) : show(obj[k])}</dd></div>`).join('')}</dl>`;
  const sourceBlock = (s, locator, page) => !s ? '<p class="rdb-na">Source record missing.</p>' : `<div class="rdb-src"><strong>${show(s.title)}</strong><span>${esc(String(s.source_type).replaceAll('_', ' '))} · ${show(s.source_authority)} · ${show(s.publication_date)}</span>${locator !== undefined ? `<span>Locator: ${show(locator)} · PDF page ${show(page)}</span>` : ''}${s.doi ? `<span>DOI ${esc(s.doi)}</span>` : ''}<span class="rdb-actions">${safeUrl(s.url) ? `<a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">Open original ↗</a>` : ''}${go('source', s.source_id, 'Source record ' + s.source_id)}</span></div>`;
  const statementCard = (e) => `<div class="rdb-excerpt"><p>${esc(e.statement)}</p><small>${esc(String(e.evidence_type).replaceAll('_', ' '))} · ${show(e.locator)}${missing(e.pdf_page) ? '' : ' · PDF p. ' + esc(e.pdf_page)} · ${show(e.reliability_label)}</small>${e.limitation ? `<small class="rdb-lim">${esc(e.limitation)}</small>` : ''}${go('statement', e.evidence_id, 'Statement ' + e.evidence_id)}</div>`;
  const mList = (ms) => ms.length ? `<ul class="rdb-mlist">${ms.map((m) => { const e = db.experiments.get(m.experiment_id); return `<li>${go('measurement', m.measurement_id)} <span>${esc(e?.material)} · ${esc(e?.gravity_label)} · <span${termAttr(m.metric)}>${esc(m.metric)}</span> ${show(m.value)} ${show(m.unit)}</span></li>`; }).join('')}</ul>` : '<p class="rdb-na">None.</p>';
  const links = { experiment_id: (v) => go('experiment', v), source_id: (v) => go('source', v), measurement_id: (v) => esc(v) };

  function measurementRecord(id) {
    const m = db.measurements.get(id); if (!m) return null;
    const e = db.experiments.get(m.experiment_id), s = db.sources.get(m.source_id);
    const direct = db.statementsFor(id), bySource = (db.statementsBySource.get(m.source_id) || []).filter((x) => !direct.includes(x));
    const siblings = (db.measurementsByExperiment.get(m.experiment_id) || []).filter((x) => x.measurement_id !== id);
    const group = (db.experimentsByGroup.get(e.comparability_group) || []).filter((x) => x.experiment_id !== e.experiment_id).flatMap((x) => db.measurementsByExperiment.get(x.experiment_id) || []);
    return `<span class="rdb-eyebrow">Measurement · ${esc(id)}</span><h3>${esc(e.material)} · ${esc(e.gravity_label)}</h3>
<div class="rdb-value"><span${termAttr(m.metric)}>${esc(m.metric)}</span><b>${show(m.value)}</b><small>${show(m.unit)}</small></div>
<p><span class="rdb-chip ${String(m.evidence_type).startsWith('model') ? 'amber' : ''}"${termAttr(TYPE_TERM[m.evidence_type])}>${esc(typeName(m.evidence_type))}</span> ${m.independent_raw_trial === true || m.independent_raw_trial === 'true' ? '<span class="rdb-chip">Independent raw trial</span>' : '<span class="rdb-chip">Not an independent raw trial</span>'}</p>
${m.limitation ? `<p class="rdb-lim"><b>How to read this result.</b> ${esc(m.limitation)}</p>` : ''}
<ol class="rdb-chain">
<li><h4>1 · Reported value</h4>${fieldsDl(m, MEASUREMENT_FIELDS.filter((k) => k !== 'limitation'), links)}</li>
<li><h4>2 · Experiment context</h4>${fieldsDl(e, EXPERIMENT_FIELDS, { experiment_id: (v) => go('experiment', v), source_id: (v) => go('source', v) })}</li>
<li><h4>3 · Source</h4>${sourceBlock(s, m.locator, m.pdf_page)}</li>
<li><h4>4 · Supporting statements</h4>${direct.length ? direct.map(statementCard).join('') : '<p class="rdb-na">No statement lists this measurement.</p>'}${bySource.length ? `<p class="rdb-sub">From the same source</p>${bySource.map(statementCard).join('')}` : ''}</li>
<li><h4>5 · Related results</h4><p class="rdb-sub">Same experiment context</p>${mList(siblings)}${group.length ? `<p class="rdb-sub">Same comparability group (${esc(e.comparability_group)})</p>${mList(group)}` : ''}</li></ol>
<div class="rdb-actions"><button type="button" data-dl="${esc(id)}">Download this record (JSON)</button></div>`;
  }
  function experimentRecord(id) {
    const e = db.experiments.get(id); if (!e) return null;
    return `<span class="rdb-eyebrow">Experiment context · ${esc(id)}</span><h3>${esc(e.material)} · ${esc(e.gravity_label)}</h3>${e.limitation ? `<p class="rdb-lim">${esc(e.limitation)}</p>` : ''}
<ol class="rdb-chain"><li><h4>Conditions</h4>${fieldsDl(e, EXPERIMENT_FIELDS.filter((k) => k !== 'limitation'), { source_id: (v) => go('source', v) })}</li>
<li><h4>Results in this context</h4>${mList(db.measurementsByExperiment.get(id) || [])}</li>
<li><h4>Source</h4>${sourceBlock(db.sources.get(e.source_id))}</li>
<li><h4>Other contexts in ${esc(e.comparability_group || 'this group')}</h4>${(db.experimentsByGroup.get(e.comparability_group) || []).filter((x) => x.experiment_id !== id).map((x) => `<p>${go('experiment', x.experiment_id, `${x.material} · ${x.gravity_label}`)}</p>`).join('') || '<p class="rdb-na">None.</p>'}</li></ol>`;
  }
  function sourceRecord(id) {
    const s = db.sources.get(id); if (!s) return null;
    const ms = db.measurementsBySource.get(id) || [], sts = db.statementsBySource.get(id) || [], exps = db.experimentsBySource.get(id) || [];
    const files = O ? O.data.datasets.filter((d) => d.sourceId === id) : [];
    return `<span class="rdb-eyebrow">Source · ${esc(id)}</span><h3>${show(s.title)}</h3>
<ol class="rdb-chain"><li><h4>Catalogue record</h4>${fieldsDl(s, SOURCE_FIELDS, { url: (v) => safeUrl(v) ? `<a href="${safeUrl(v)}" target="_blank" rel="noopener noreferrer">${esc(v)} ↗</a>` : esc(v) })}</li>
<li><h4>${ms.length} extracted results · ${exps.length} experiment contexts</h4>${mList(ms)}</li>
<li><h4>${sts.length} supporting statements</h4>${sts.map(statementCard).join('') || '<p class="rdb-na">None recorded.</p>'}</li>
${files.length ? `<li><h4>Original CSV</h4>${files.map((d) => `<p><button type="button" class="rdb-link" data-ds-open="${esc(d.id)}">${esc(d.title)} · ${d.rows.length} rows</button></p>`).join('')}</li>` : ''}</ol>
<p class="rdb-note">Inclusion in the source catalogue does not mean this document contributed a measurement.</p>`;
  }
  function statementRecord(id) {
    const e = db.statements.get(id); if (!e) return null;
    const rel = db.relatedIds(e).map((x) => db.measurements.get(x)).filter(Boolean);
    return `<span class="rdb-eyebrow">Statement · ${esc(id)}</span><blockquote class="rdb-block">${esc(e.statement)}</blockquote>
<ol class="rdb-chain"><li><h4>Record</h4>${fieldsDl(e, STATEMENT_FIELDS.filter((k) => k !== 'statement'), { source_id: (v) => go('source', v), related_measurement_ids: () => rel.map((m) => go('measurement', m.measurement_id)).join(' ') })}</li>
<li><h4>Source</h4>${sourceBlock(db.sources.get(e.source_id), e.locator, e.pdf_page)}</li>
<li><h4>Results from the same source</h4>${mList(db.measurementsBySource.get(e.source_id) || [])}</li></ol>`;
  }
  function originalRecord(key) {
    if (!O) return null;
    const [dsId, rowId] = key.split('|'), d = O.data.datasets.find((x) => x.id === dsId), r = d?.rows.find((x) => x.id === rowId); if (!r) return null;
    return `<span class="rdb-eyebrow">${esc(rowKind(r.rowKind))} · original CSV</span><h3>${esc(d.title)} · row ${esc(r.csvRecordNumber)}</h3>
<dl class="rdb-fields">${d.columns.map((c, i) => `<div><dt>${esc(c)}</dt><dd>${show(r.cells[i])}</dd></div>`).join('')}${r.cells.length > d.columns.length ? `<div><dt>Extra cells</dt><dd>${show(r.cells.slice(d.columns.length))}</dd></div>` : ''}</dl>
<dl class="rdb-fields"><div><dt>Record ID</dt><dd class="mono">${esc(r.id)}</dd></div><div><dt>CSV record number</dt><dd>${esc(r.csvRecordNumber)}</dd></div><div><dt>File SHA-256</dt><dd class="mono">${esc(d.sha256)}</dd></div><div><dt>Source</dt><dd>${R && db.sources.get(d.sourceId) ? go('source', d.sourceId) : esc(d.sourceId)}</dd></div></dl>
${safeUrl(d.sourceUrl) ? `<p><a href="${safeUrl(d.sourceUrl)}" target="_blank" rel="noopener noreferrer">Original CSV at NASA PSI ↗</a></p>` : ''}`;
  }
  const RECORDS = { measurement: ['measurements', measurementRecord], experiment: ['experiments', experimentRecord], source: ['sources', sourceRecord], statement: ['statements', statementRecord], original: ['original', originalRecord] };

  function openRecord(kind, id, { push = true } = {}) {
    if (!db) return;
    const [tab, render] = RECORDS[kind], html = render(id); if (!html) return;
    if (push && st.record && !(st.record.kind === kind && st.record.id === id)) st.trail.push(st.record);
    st.record = { kind, id };
    if (st.tab !== tab) { st.tab = tab; host.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab))); for (const [k, el] of Object.entries(views)) el.hidden = k !== tab; }
    renderTab();
    recordEl.hidden = false; host.classList.add('has-record');
    recordEl.innerHTML = `<div class="rdb-record-bar">${st.trail.length ? '<button type="button" data-back>← Back</button>' : '<span></span>'}<button type="button" data-close aria-label="Close record">×</button></div>${html}`;
    recordEl.scrollTop = 0; recordEl.querySelector('h3, blockquote')?.setAttribute('tabindex', '-1');
  }
  function closeRecord() { st.record = null; st.trail = []; recordEl.hidden = true; host.classList.remove('has-record'); if (st.tab !== 'search') renderTab(); }

  // ---------- events ----------
  host.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-tab],[data-go],[data-page],[data-ds],[data-ds-open],[data-export],[data-dl],[data-back],[data-close]');
    if (!t || !host.contains(t)) return;
    if (t.dataset.tab && views[t.dataset.tab]) setTab(t.dataset.tab);
    else if (t.dataset.go) ready.then(() => openRecord(t.dataset.go, t.dataset.id));
    else if (t.dataset.page) { st.f[t.dataset.page].page += +t.dataset.d; renderTab(); }
    else if (t.dataset.ds) { Object.assign(st.f.original, { ds: t.dataset.ds, page: 0, q: '', kind: '' }); renderTab(); }
    else if (t.dataset.dsOpen) { Object.assign(st.f.original, { ds: t.dataset.dsOpen, page: 0, q: '', kind: '' }); closeRecord(); setTab('original'); }
    else if (t.dataset.export) {
      const rows = filteredMeasurements().map((m) => joinedMeasurement(db, m)), stamp = (R.data.exportedAt || '').slice(0, 10);
      if (t.dataset.export === 'csv') download(`soraine-measurements-${stamp}.csv`, toCsv(rows), 'text/csv');
      else download(`soraine-measurements-${stamp}.json`, JSON.stringify({ dataset: R.data.dataset, project: R.data.project, exportedAt: R.data.exportedAt, delivery: R.via === 'saved' ? 'saved export' : R.data.delivery?.mode, rows }, null, 2), 'application/json');
    } else if (t.dataset.dl) { const m = db.measurements.get(t.dataset.dl); download(`${t.dataset.dl}.json`, JSON.stringify({ ...joinedMeasurement(db, m), supporting_statements: db.statementsFor(m.measurement_id) }, null, 2), 'application/json'); }
    else if (t.hasAttribute('data-back')) { const prev = st.trail.pop(); if (prev) openRecord(prev.kind, prev.id, { push: false }); }
    else if (t.hasAttribute('data-close')) closeRecord();
  });
  host.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('tr[data-go]')) { ev.preventDefault(); ev.target.click(); } if (ev.key === 'Escape' && st.record) { ev.stopPropagation(); closeRecord(); } });
  const onFilter = (ev) => {
    const box = ev.target.closest('[data-filters]'); if (!box) return;
    const f = st.f[box.dataset.filters], el = ev.target; f[el.name] = el.type === 'checkbox' ? el.checked : el.value; f.page = 0;
    const pos = el.selectionStart; renderTab();
    const again = views[st.tab].querySelector(`[data-filters] [name="${el.name}"]`); if (again && el.type === 'search') { again.focus(); try { again.setSelectionRange(pos, pos); } catch {} }
  };
  host.addEventListener('input', (ev) => { if (ev.target.type === 'search') onFilter(ev); });
  host.addEventListener('change', (ev) => { if (ev.target.type !== 'search') onFilter(ev); });

  return {
    show() { if (st.tab === 'search') search.show(); },
    hide() { search.hide(); },
    openRecord: (kind, id) => ready.then(() => openRecord(kind, id)),
    ready
  };
}
