// SORAINE material search on the lab's detail page. Behaviour follows the team dashboard's
// dashboard/dist/material-search-ui.mjs (7bf592e): same request, validation, result groups, evidence drawers,
// basket tab and saved-data fallback. Changes for the 3D lab: it is mounted inline in #detail instead of a modal
// dialog, and the dashboard-only launchers (global search box, header basket, evidence-table link) are removed.
import { materialById, GRAVITIES } from './catalog.js';
import { createSearchClient } from './client.js';
import { materialLibrary } from './bridge.js';

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (v) => { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) ? u.href : '#'; } catch { return '#'; } };
const TYPES = { reported_experimental_limit_aggregate: 'Published limit', reported_fit_to_experimental_data: 'Fitted result', reported_experimental_summary: 'Reported summary', source_derived_from_limit_aggregates: 'Derived summary', model_derived_compensation_from_experiments: 'Model-derived' };
const value = (v) => v == null || v === '' ? 'Not reported' : String(v);
const FABRIC = ['nomex-ht90', 'nomex-velcro', 'sibal', 'beefy-t'];
const EXAMPLES = `<div class="ms-examples"><button type="button" data-ms-example="Nomex on Moon">Nomex on Moon</button><button type="button" data-ms-example="梳子">梳子 / comb</button><button type="button" data-ms-example="all materials">All materials</button></div>`;

export function mountMaterialSearch(host, { loadBundle, onOpenShelf }) {
  const search = createSearchClient({ loadBundle });
  host.classList.add('ms-panel');
  host.innerHTML = `<header class="ms-heading"><span class="ms-eyebrow">SORAINE · Material library</span><h2 id="ms-title">Find the material. Follow the evidence.</h2></header>
<form class="ms-form" role="search" aria-labelledby="ms-title"><label class="ms-query"><span>Material or question</span><input name="query" maxlength="500" required placeholder="Try ‘Nomex on Moon’ or ‘梳子’" autocomplete="off" enterkeyhint="search"></label><label class="ms-gravity"><span>Gravity</span><select name="gravity"><option value="">From question</option>${Object.entries(GRAVITIES).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></label><button class="ms-submit" type="submit">Search</button></form>
<div class="ms-tabs" role="group" aria-label="Material search sections"><button type="button" data-ms-tab="results" aria-pressed="true">Results</button><button type="button" data-ms-tab="basket" aria-pressed="false">Basket <span data-ms-count>0</span></button></div>
<p class="ms-status" role="status" aria-live="polite">Search materials by name or by an everyday object.</p>
<section class="ms-results" aria-label="Material search results"></section><section class="ms-basket" aria-label="Selected basket materials" hidden></section>`;
  const form = host.querySelector('form'), input = form.elements.query, gravity = form.elements.gravity;
  const status = host.querySelector('.ms-status'), results = host.querySelector('.ms-results'), basket = host.querySelector('.ms-basket');
  let response = null, selected = null, pending = null, sequence = 0;
  const setStatus = (m) => { status.textContent = m; };

  function chooseTab(next) {
    results.hidden = next !== 'results'; basket.hidden = next !== 'basket';
    host.querySelectorAll('[data-ms-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.msTab === next)));
    if (next === 'basket') renderBasket();
  }
  function renderBasket() {
    let ids;
    try { ids = materialLibrary.getBasket(); } catch { setStatus('The library basket could not be read.'); return; }
    host.querySelectorAll('[data-ms-count]').forEach((n) => { n.textContent = String(ids.length); });
    basket.innerHTML = `<div class="ms-basket-heading"><h3>Your research basket</h3><p>${materialLibrary.connected ? 'Connected to the 3D shelf. Removing here takes one sample out of the basket; samples on the worktop stay where they are.' : 'Your selection is kept while this page is open.'}</p><button type="button" data-open-shelf>Open the 3D shelf ↗</button></div>${ids.length ? ids.map((id) => { const m = materialById(id); return `<div class="ms-basket-row"><span><strong>${esc(m.title)}</strong><small>${esc(m.object)}</small></span><button type="button" data-ms-remove="${id}" ${materialLibrary.busy ? 'disabled' : ''}>Remove <span class="ms-sr">${esc(m.title)}</span></button></div>`; }).join('') : '<p class="ms-empty-line">Open a material result and add it to your basket.</p>'}<p class="ms-footnote">These are material selections. Object shapes and later animations do not establish how a finished product will burn.</p>`;
    host.querySelectorAll('[data-ms-add]').forEach((b) => { const inside = ids.includes(b.dataset.msAdd); b.disabled = inside || materialLibrary.busy; b.textContent = inside ? 'In your basket' : 'Add to basket ↗'; });
    host.querySelectorAll('[data-ms-locate]').forEach((b) => { b.hidden = !materialLibrary.connected; });
  }
  materialLibrary.subscribe(renderBasket);

  function evidenceHTML(e, group) {
    const source = group.sources.find((s) => s.sourceId === e.sourceId), c = e.conditions;
    const fields = [['Gravity', e.gravity], ['Pressure', c.pressureKpa == null ? null : c.pressureKpa + ' kPa absolute'], ['Oxygen', c.oxygenPct == null ? null : c.oxygenPct + ' molar %'], ['Airflow', c.flowSpeedCmS == null ? null : c.flowSpeedCmS + ' cm/s'], ['Duration', c.durationS == null ? null : c.durationS + ' s'], ['Platform', c.platform], ['Test specimen', c.specimen]];
    return `<details class="ms-evidence"><summary><span><strong>${esc(e.metric)}</strong><small>${esc(e.gravity || 'Gravity not reported')} · ${esc(e.measurementId)}</small></span><span class="ms-number">${esc(value(e.value))}<small>${esc(e.unit || 'Unit not reported')}</small></span></summary><div class="ms-evidence-body"><p class="ms-evidence-kind">${esc(TYPES[e.evidenceType] || e.evidenceType)}</p><p>${esc(e.material)}</p><dl>${fields.map(([label, v]) => `<div><dt>${label}</dt><dd>${esc(value(v))}</dd></div>`).join('')}</dl>${e.gravityBasis ? `<p class="ms-basis">Gravity basis: ${esc(e.gravityBasis)}</p>` : ''}${e.limitation ? `<p class="ms-limitation">${esc(e.limitation)}</p>` : ''}${source ? `<a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a>` : ''}<p class="ms-locator">${esc(e.locator || '')}${e.pdfPage != null ? ' · PDF page ' + esc(e.pdfPage) : ''}</p><button type="button" class="ms-chain" data-go="measurement" data-id="${esc(e.measurementId)}">Full evidence chain for ${esc(e.measurementId)} ↗</button></div></details>`;
  }
  function renderDetail(id) {
    selected = id;
    const group = response.results.find((g) => g.materialId === id), slot = results.querySelector('.ms-detail');
    if (!group || !slot) return;
    const m = materialById(id);
    results.querySelectorAll('[data-ms-material]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.msMaterial === id)));
    slot.innerHTML = `<span class="ms-eyebrow">Material in focus</span><h3 tabindex="-1">${esc(m.title)}</h3><p class="ms-object">${esc(m.object)} · material representation</p><p class="ms-specimen-note">The object is a visual reference. Results below apply to the reported research specimens and conditions.</p>${group.summary ? `<p class="ms-summary">${esc(group.summary)}</p>` : ''}<div class="ms-actions"><button type="button" data-ms-add="${id}">Add to basket ↗</button><button type="button" data-ms-locate="${id}" ${materialLibrary.connected ? '' : 'hidden'}>Locate on shelf ↗</button></div><h4>Reported evidence</h4>${group.evidence.length ? group.evidence.map((e) => evidenceHTML(e, group)).join('') : '<p>No numeric measurements in this result.</p>'}${group.totalEvidenceCount > group.evidence.length ? `<p class="ms-footnote">Showing ${group.evidence.length} of ${group.totalEvidenceCount} matching records.</p>` : ''}${group.originalRecords?.length ? `<h4>Original data references</h4>${group.originalRecords.map((r) => `<p class="ms-original"><a href="${safeUrl(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.datasetId)} ↗</a><span>${esc(r.recordId || '')}${r.rowIndex != null ? ' · Row ' + esc(r.rowIndex) : ''}${r.locator ? ' · ' + esc(r.locator) : ''}</span></p>`).join('')}` : ''}`;
    renderBasket();
  }
  function renderResults() {
    if (!response.results.length) { results.innerHTML = `<div class="ms-empty"><h3>No matching records.</h3><p>Try a material name or choose a broader gravity condition.</p><button type="button" data-ms-example="all materials">Browse materials with evidence</button></div>`; return; }
    results.innerHTML = `<div class="ms-result-list"><p>${response.results.length} material ${response.results.length === 1 ? 'match' : 'matches'}</p>${response.results.map((g) => { const m = materialById(g.materialId); return `<button type="button" data-ms-material="${g.materialId}" aria-pressed="false"><span class="ms-symbol" aria-hidden="true">${FABRIC.includes(m.id) ? '▦' : '◇'}</span><span><strong>${esc(m.title)}</strong><small>${esc(m.object)}</small><small>${g.totalEvidenceCount ?? g.evidence.length} reported records</small></span></button>`; }).join('')}</div><section class="ms-detail" aria-label="Selected material evidence"></section>`;
    renderDetail(response.results.some((g) => g.materialId === selected) ? selected : response.results[0].materialId);
  }
  async function submit(query) {
    pending?.abort(); pending = new AbortController(); const current = ++sequence;
    chooseTab('results'); setStatus('Searching the research collection…'); results.setAttribute('aria-busy', 'true');
    try {
      const { data, fallback } = await search({ query, filters: { gravity: gravity.value || null }, limit: 9 }, { signal: pending.signal });
      if (current !== sequence) return;
      response = data; renderResults();
      const provenance = data.dataSource === 'bigquery' ? 'BigQuery records' : 'Saved research';
      setStatus(`${fallback ? 'Search service unavailable. Browsing saved research. ' : provenance + ' · ' + (data.mode === 'ai' ? 'AI-assisted summary' : 'Keyword search') + '. '}${data.appliedFilters?.gravity ? 'Gravity filter: ' + (GRAVITIES[data.appliedFilters.gravity] || data.appliedFilters.gravity) + '. ' : ''}${data.summary || ''}`);
    } catch (error) {
      if (current !== sequence || pending.signal.aborted) return;
      response = null; results.innerHTML = '<div class="ms-empty"><h3>Search could not finish.</h3><p>The lab and the shelf are still available.</p><button type="button" data-ms-retry>Try again</button></div>'; setStatus(error.message || 'Please try again.');
    } finally { if (current === sequence) results.removeAttribute('aria-busy'); }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(input.value); });
  host.addEventListener('click', async (event) => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.msTab) chooseTab(b.dataset.msTab);
    else if (b.dataset.msMaterial) { renderDetail(b.dataset.msMaterial); if (matchMedia('(max-width:680px)').matches) results.querySelector('.ms-detail h3')?.focus(); }
    else if (b.dataset.msExample) { input.value = b.dataset.msExample; submit(input.value); }
    else if (b.hasAttribute('data-ms-retry')) submit(input.value);
    else if (b.hasAttribute('data-open-shelf')) onOpenShelf?.();
    else try {
      if (b.dataset.msAdd) { await materialLibrary.addToBasket(b.dataset.msAdd); setStatus(materialById(b.dataset.msAdd).title + ' added to your basket.'); }
      if (b.dataset.msRemove) { await materialLibrary.removeFromBasket(b.dataset.msRemove); setStatus('Material removed from your basket.'); }
      if (b.dataset.msLocate) await materialLibrary.selectMaterial(b.dataset.msLocate);
    } catch (error) { setStatus(error.message || 'The library action could not finish.'); }
  });

  results.innerHTML = `<div class="ms-empty"><h3>Start with a material or an object.</h3><p>Find published evidence without guessing which experiment to open.</p>${EXAMPLES}</div>`;
  renderBasket();
  return {
    // Called when the detail page opens.
    show() {
      if (!matchMedia('(pointer:coarse)').matches) input.focus({ preventScroll: true });
    },
    hide() { if (results.hasAttribute('aria-busy')) setStatus('Search stopped when you left the page. Search again to continue.'); pending?.abort(); sequence++; results.removeAttribute('aria-busy'); },
    open(query = '') { input.value = query; if (query.trim()) submit(query); }
  };
}
