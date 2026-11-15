const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n) => n == null ? 'Not reported' : Number(n).toLocaleString('en-US', {maximumFractionDigits:6});
const safeUrl = (url) => { try { const u = new URL(url); return u.protocol === 'https:' ? esc(u.href) : '#'; } catch { return '#'; } };
const gravityOrder = ['Microgravity','Moon','Mars','Earth'];
const gravityValues = {Microgravity:0,Moon:1/6,Mars:.38,Earth:1};
const environmentColor = {Microgravity:'#476779',Moon:'#9aa3ac',Mars:'#b65e3c',Earth:'#718a4e'};
const labels = {limits:'Material limits',spread:'Flame spread',model:'Model estimates',sources:'Source library'};
const titles = {limits:'What keeps a flame burning?',spread:'How does the flame move?',model:'Where evidence becomes an estimate.',sources:'Go back to the source.'};
const descriptions = {limits:'Explore how oxygen limits change across gravity environments.',spread:'Compare reported flame motion without losing the experimental context.',model:'Inspect the assumptions behind Earth-to-Moon compensation models.',sources:'Find the studies, experiments and resources behind the observations.'};
const metricNames = {flame_base_speed_fit:'Flame base · fitted speed',flame_tip_speed_fit:'Flame tip · fitted speed',flame_base_speed_reported:'Flame base · reported speed',lunar_compensation_delta_at_assumed_35_cm_s:'Lunar O₂ compensation',O2_vs_flow_best_fit_slope:'O₂ / flow · best-fit slope',O2_vs_flow_95pct_conservative_slope:'O₂ / flow · conservative slope'};
const evidenceLabel = (r) => r.evidence_type.startsWith('model_') ? 'MODEL ESTIMATE' : r.evidence_type.includes('source_derived') ? 'DERIVED SUMMARY' : r.evidence_type.includes('fit') ? 'EXPERIMENTAL FIT' : 'EXPERIMENT SUMMARY';
let data, sourceMap, viewRows = [], selected, toastTimer;
const params = new URLSearchParams(location.search);
const state = {mode:params.get('view') || 'limits', material:params.get('material') || 'Mylar G', metric:params.get('metric') || 'both', gravity:params.get('gravity') || 'Moon', kind:'ntrs'};
if (!labels[state.mode]) state.mode = 'limits';
if (!gravityOrder.includes(state.gravity)) state.gravity = 'Moon';

function planet(gravity) {
  const color = environmentColor[gravity];
  const shape = gravity === 'Microgravity'
    ? '<path d="m6 20 9-5 10 5-10 6z" fill="#d7dce0"/><path d="m15 15 0-7 10 5v7z" fill="#a4b3bd"/><path d="M2 12h9v6H2zm26 11h9v6h-9z" fill="#5f8296"/><path d="M3 13h7m-7 3h7m19 8h7m-7 3h7" stroke="#b9d5e2" stroke-width=".6"/><path d="M20 2v5M3 30v4M32 6v4m-2-2h4" stroke="#b4bcc4"/>'
    : `<path d="m20 2 13 6 6 13-7 13-13 5-13-8L1 18 7 7z" fill="${color}"/><path d="M20 2 7 7l5 13 12-7 9-5z" fill="#ffffff22"/><path d="m12 20 7 19 13-5-8-21z" fill="#00000015"/><path d="m1 18 11 2 7 19-13-8z" fill="#00000018"/>${gravity==='Earth'?'<path d="m7 7 8 2 2 6-6 5-5-7zm20 13 6 3-2 7-6-1-4-6z" fill="#ced09c"/>':gravity==='Moon'?'<path d="m24 7 6 5-2 5-7-1-2-4zm-12 18 5 2-2 5-5-2z" fill="#60697666"/>':'<path d="m7 21 11-5 7 7 10 1-4 7-13-3z" fill="#cd865a"/>'}`;
  return `<svg class="planet" viewBox="0 0 40 40" aria-hidden="true">${shape}</svg>`;
}

function drawEnvironments() {
  $('environments').innerHTML = gravityOrder.map((g) => `<button class="environment ${state.gravity===g?'selected':''}" data-gravity="${g}" aria-pressed="${state.gravity===g}">${planet(g)}<span><span class="environment-title">${g==='Microgravity'?'Microgravity':g}</span><span class="environment-g">${g==='Microgravity'?'≈ 0':g==='Moon'?'0.16':fmt(gravityValues[g])} g${g==='Microgravity'?' · low-g':''}</span></span><span class="env-mark" aria-hidden="true"></span></button>`).join('');
}

function rowsForMode() {
  return data.evidence.filter((r) => state.mode==='model' ? r.evidence_type.startsWith('model_') : state.mode==='spread' ? r.metric.includes('speed') : r.source_id==='NTRS-20130010991');
}

function options() {
  const base = rowsForMode();
  const materials = [...new Set(base.map((r) => r.material))];
  if (state.mode==='model') materials.unshift('All materials');
  if (!materials.includes(state.material)) state.material = state.mode==='model' ? 'All materials' : materials[0];
  $('material').innerHTML = materials.map((m) => `<option ${m===state.material?'selected':''}>${esc(m)}</option>`).join('');
  let metrics;
  if (state.mode==='limits') metrics = [['both','ULOI & MOC'],['uloi','ULOI / ULOI*'],['moc','MOC / MOC*'],['reported_delta_O2_vs_1g','Reported ΔO₂ vs 1g']];
  else metrics = [...new Set(base.filter((r) => state.material==='All materials'||r.material===state.material).map((r) => r.metric))].map((m) => [m,metricNames[m]]);
  if (!metrics.some(([key]) => key===state.metric)) state.metric = state.mode==='model' ? 'lunar_compensation_delta_at_assumed_35_cm_s' : metrics[0][0];
  $('metric').innerHTML = metrics.map(([key,label]) => `<option value="${key}" ${state.metric===key?'selected':''}>${esc(label)}</option>`).join('');
}

function filteredRows() {
  return rowsForMode().filter((r) => {
    if (state.material!=='All materials' && r.material!==state.material) return false;
    if (state.mode!=='limits') return r.metric===state.metric;
    if (state.metric==='both') return ['ULOI','MOC','ULOI*','MOC*'].includes(r.metric);
    if (state.metric==='uloi') return r.metric.startsWith('ULOI');
    if (state.metric==='moc') return r.metric.startsWith('MOC');
    return r.metric===state.metric;
  });
}

function pickDefault() {
  if (!viewRows.some((r) => r.measurement_id===selected)) selected = (state.mode==='model'?viewRows[0]:viewRows.find((r) => r.gravity_label===state.gravity))?.measurement_id;
}

function chart() {
  const isLimits = state.mode==='limits';
  const isModel = state.mode==='model';
  const isDelta = state.metric==='reported_delta_O2_vs_1g';
  const x0=58, x1=618, y0=44, y1=258;
  const vals = viewRows.map((r) => r.normalized_value);
  let max = isLimits&&!isDelta ? 30 : Math.max(...vals,0)*1.3;
  if (!isLimits && max>0) { const scale=10**Math.floor(Math.log10(max)); max=Math.ceil(max/scale)*scale; }
  let min = Math.min(...vals,0);
  if (isDelta) { min = Math.floor(min-1); max = Math.max(1,max); }
  if (!(max>min)) max=min+1;
  const y = (v) => y1-(v-min)/(max-min)*(y1-y0);
  const groups = isLimits ? gravityOrder : isModel ? [...new Set(viewRows.map((r) => r.material))] : [...new Set(viewRows.map((r) => r.platform+'|'+r.gravity_label))];
  const x = (r) => isLimits ? x0+(x1-x0)*gravityValues[r.gravity_label] : groups.length===1 ? (x0+x1)/2 : x0+22+groups.indexOf(isModel?r.material:r.platform+'|'+r.gravity_label)*(x1-x0-44)/(groups.length-1);
  const unit = isLimits ? isDelta?'O₂ percentage points':'O₂ molar %' : viewRows[0]?.normalized_unit || '';
  let svg = `<svg viewBox="0 0 660 318" role="group" aria-label="${esc($('chart-title').textContent)}. Select a point or use the table below."><text x="8" y="18" class="axis-title">${esc(unit)}</text>`;
  if (isLimits) {
    const gx = x0+(x1-x0)*gravityValues[state.gravity];
    svg += `<rect x="${gx-25}" y="${y0-8}" width="50" height="${y1-y0+16}" rx="6" fill="#f6eadb"/>`;
  }
  for (let i=0;i<=4;i++) {
    const value = min+(max-min)*i/4;
    svg += `<line x1="${x0}" x2="${x1}" y1="${y(value)}" y2="${y(value)}" stroke="#e7e2d8" stroke-dasharray="${i===0?'0':'3 4'}"/><text x="${x0-14}" y="${y(value)+4}" text-anchor="end">${fmt(value)}</text>`;
  }
  groups.forEach((g,i) => {
    const px = isLimits?x0+(x1-x0)*gravityValues[g]:groups.length===1?(x0+x1)/2:x0+22+i*(x1-x0-44)/(groups.length-1);
    const parts = isLimits ? [g==='Microgravity'?'Microgravity':g,g==='Microgravity'?'≈ 0 g':g==='Moon'?'0.16 g':fmt(gravityValues[g])+' g'] : isModel ? [g.replace(/ \(.+\)/,''),g.includes('(')?g.match(/\((.+)\)/)[1]:''] : [g.split('|')[1],g.split('|')[0]==='drop tower centrifuge'?'Drop tower':g.split('|')[0]==='parabolic aircraft'?'Aircraft':g.split('|')[0].includes('rocket')?'LUCI flight':'Ground'];
    svg += `<text x="${px}" y="282" text-anchor="middle" class="axis-label">${esc(parts[0])}</text><text x="${px}" y="299" text-anchor="middle" style="font-size:9px">${esc(parts[1])}</text>`;
  });
  viewRows.forEach((r) => {
    const moc = r.metric.startsWith('MOC');
    const dual = isLimits&&state.metric==='both';
    const px = x(r)+(dual?(moc?7:-7):0), py=y(r.normalized_value);
    const active = r.measurement_id===selected;
    const color = moc?'#28687e':isModel?'#8a6546':'#c85b20';
    const shape = moc ? `<path d="m0-5 5 5-5 5-5-5z" fill="${color}"/>` : `<circle r="5" fill="${color}"/>`;
    svg += `<g role="button" tabindex="0" data-record="${esc(r.measurement_id)}" aria-label="${esc(r.material+'; '+r.gravity_label+'; '+r.metric+' '+fmt(r.value)+' '+r.unit)}" aria-pressed="${active}" transform="translate(${px},${py})"><title>${esc(r.gravity_label+' · '+r.metric+': '+fmt(r.value)+' '+r.unit)}</title><circle r="22" fill="transparent"/><circle class="focus-ring" r="12" fill="none" stroke="${color}" stroke-width="1.5" opacity="${active?1:0}"/>${active?`<circle r="9" fill="${color}" opacity=".13"/>`:''}${shape}<text class="point-value" x="${dual?(moc?9:-8):0}" y="${dual&&moc?23:-15}" text-anchor="${dual?(moc?'start':'end'):'middle'}">${fmt(r.normalized_value)}</text></g>`;
  });
  $('chart').innerHTML = svg+'</svg>';
  $('legend').innerHTML = isLimits&&!isDelta ? '<span><i></i>ULOI / ULOI*</span><span><i class="moc"></i>MOC / MOC*</span>' : `<span><i></i>${esc(isModel?'Model-derived estimate':isDelta?'Derived from limit summaries':'Reported value · normalized to cm/s')}</span>`;
  $('chart-note').textContent = isLimits ? isDelta?'Mean low-g limits minus mean 1g limits. Not fire probability.':'Individual source values. No interpolation between gravity levels.' : isModel?'Model output, not a measured lunar oxygen limit.':'Separate conditions; plotted together for inspection, not pooling.';
  $('chart-source').href = sourceMap.get(viewRows[0]?.source_id)?.url || '#';
}

function inspector() {
  const r = viewRows.find((r) => r.measurement_id===selected);
  if (!r) { $('inspector').innerHTML=`<span class="selected-label">DATA GAP</span><h3 style="margin-top:20px">No ${esc(state.gravity)} result in this selection.</h3><p style="margin-top:15px;font-size:12px;color:var(--muted)">Choose a plotted point to inspect another condition. Missing results are not estimated or replaced with zero.</p>`; return; }
  const s = sourceMap.get(r.source_id);
  const isModel = r.evidence_type.startsWith('model_');
  const condition = (label, value) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`;
  const pressure = r.pressure_psia!=null ? `${fmt(r.pressure_psia)} psia · ≈${Number(r.pressure_kpa).toFixed(2)} kPa` : r.pressure_reported || 'Not reported here';
  const env = isModel?'Earth → Moon model':r.gravity_label==='Moon'||r.gravity_label==='Mars'?r.gravity_label+' · simulated':r.gravity_label;
  $('inspector').innerHTML = `<div class="inspector-top"><span class="selected-label">SELECTED OBSERVATION</span><span class="record-id">${esc(r.measurement_id)} ↗</span></div><h3>${esc(r.material)}</h3><p class="type-label">${esc(evidenceLabel(r))}</p><div class="selected-value">${fmt(r.value)}</div><div class="selected-unit">${esc(r.unit)} · ${esc(metricNames[r.metric]||r.metric)}</div><dl class="conditions">${condition('Environment',env)}${condition('Platform',r.platform||'Model / derived context')}${condition('Pressure',pressure)}${condition('Flow',r.flow_speed_cm_s!=null?fmt(r.flow_speed_cm_s)+' cm/s':r.flow_mode||'Not reported here')}${condition('Duration',r.duration_s!=null?fmt(r.duration_s)+' s':'Not reported here')}</dl><details><summary>Conditions & limitations</summary><p>${esc(r.conditions||'See source for complete test conditions.')}</p><p>${esc(r.flow_mode||'')}</p><p>${esc(r.gravity_basis||'')}</p><p>${esc(r.limitation)}</p><p>Uncertainty: not extracted. ${r.reliability_label==='source_text_table_checked'?'Table values checked against saved NASA full text.':'Curated transcription; independent review remains necessary.'}</p>${r.unit!==r.normalized_unit?`<p>Chart conversion: ${esc(r.conversion)}.</p>`:''}</details><a class="source-link" href="${safeUrl(s?.url)}" target="_blank" rel="noopener noreferrer">${esc(s?.title||r.source_id)} ↗<span>PDF p. ${r.pdf_page} · ${esc(r.locator)}</span></a>`;
}

function table() {
  const query = $('search').value.toLowerCase().trim();
  const rows = viewRows.filter((r) => [r.material,r.gravity_label,r.platform,r.metric,r.source_id].join(' ').toLowerCase().includes(query));
  $('table-wrap').innerHTML = rows.length ? `<table><thead><tr><th>Environment</th><th>Metric</th><th>Value · original unit</th><th>Platform / basis</th><th>Evidence</th><th>Source</th></tr></thead><tbody>${rows.map((r) => `<tr data-record="${esc(r.measurement_id)}" class="${r.measurement_id===selected?'selected':''}"><td><button data-record="${esc(r.measurement_id)}" aria-label="Inspect ${esc(r.measurement_id+' '+r.gravity_label+' '+r.metric)}"><span class="mini-dot" style="background:${environmentColor[r.gravity_label]||'#8a6546'}"></span> ${esc(r.gravity_label)}</button></td><td>${esc(metricNames[r.metric]||r.metric)}</td><td class="number">${fmt(r.value)} <span class="table-tag">${esc(r.unit)}</span></td><td>${esc(r.platform||'Model / derived summary')}</td><td><span class="table-tag">${esc(evidenceLabel(r))}</span></td><td><a href="${safeUrl(sourceMap.get(r.source_id)?.url)}" target="_blank" rel="noopener noreferrer">PDF p. ${r.pdf_page} ↗</a></td></tr>`).join('')}</tbody></table>` : '<p class="empty">No results match your search. Try a metric or platform name.</p>';
  $('table-summary').textContent = `${rows.length} of ${viewRows.length} records in this view · Select a row to inspect its conditions. Records are summaries or fits, not independent raw trials.`;
}

function libraryRows() {
  const query = $('source-search').value.toLowerCase().trim();
  return (state.kind==='resources'?data.resources:data.sources.filter((s) => state.kind==='psi'?s.source_id.startsWith('PSI-'):s.source_id.startsWith('NTRS-'))).filter((s) => [s.title,s.doi,s.source_id].join(' ').toLowerCase().includes(query));
}
function library() {
  const items = libraryRows();
  $('source-count').textContent = `${items.length} ${state.kind==='resources'?'challenge resources':state.kind==='psi'?'investigations':'documents'} · source count does not equal independent study count`;
  $('source-list').innerHTML = items.length ? items.map((s,i) => `<article class="source-row"><span class="source-no">${String(i+1).padStart(2,'0')}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.source_id)} ${s.document_type?'· '+esc(s.document_type.replaceAll('_',' ').toLowerCase()):''} ${s.publication_date?'· '+esc(s.publication_date.slice(0,4)):''}${s.doi?' · DOI '+esc(s.doi):''}</p><p>${state.kind==='resources'?esc(s.note):state.kind==='psi'?'Repository investigation · raw data and metadata remain on NASA PSI.':'NASA-hosted record. Presentations and papers may describe the same study.'}</p></div><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a></article>`).join('') : '<p class="empty">No sources match this search.</p>';
}

function persist() {
  const p = new URLSearchParams({view:state.mode,material:state.material,metric:state.metric,gravity:state.gravity});
  history.replaceState(null,'','?'+p);
}

function render() {
  if (!data) return;
  $('crumb').textContent=labels[state.mode]; $('page-title').textContent=titles[state.mode]; $('page-description').textContent=descriptions[state.mode];
  document.querySelectorAll('[data-mode]').forEach((b) => { b.classList.toggle('active',b.dataset.mode===state.mode); b.setAttribute('aria-current',b.dataset.mode===state.mode?'page':'false'); });
  $('research').hidden=state.mode==='sources'; $('library').hidden=state.mode!=='sources';
  if (state.mode==='sources') { library(); persist(); return; }
  options(); viewRows=filteredRows(); pickDefault(); drawEnvironments();
  document.querySelector('.environment-section').hidden=state.mode==='model';
  $('chart-kicker').textContent = state.mode==='limits'?'MATERIAL FLAMMABILITY':state.mode==='spread'?'FLAME PROPAGATION':'EARTH-TO-MOON EXTRAPOLATION';
  $('chart-title').textContent = state.mode==='limits'?(state.metric==='reported_delta_O2_vs_1g'?'Reported oxygen-limit differences':'Oxygen limits across gravity'):state.mode==='spread'?'A closer look at flame motion':metricNames[state.metric];
  $('study-chip').textContent = state.mode==='model'?'MODEL ESTIMATE':state.mode==='spread'?'FITS & SUMMARIES':state.metric==='reported_delta_O2_vs_1g'?'DERIVED SUMMARY':'EXPERIMENT SUMMARY';
  $('study-chip').classList.toggle('model',state.mode==='model');
  $('result-count').textContent = viewRows.length+' source values';
  $('method-title').textContent = state.mode==='limits'?'Same material. Different test criteria.':state.mode==='spread'?'Flame motion is not one interchangeable metric.':'An estimate carries its assumptions.';
  $('method-text').textContent = state.mode==='limits'?'Normal-gravity ULOI/MOC and reduced-gravity ULOI*/MOC* use different definitions. Mylar’s 1g comparator uses a similar but distinct Melinex film. These are not equivalent safety certifications.':state.mode==='spread'?'Flame-tip motion, flame-base motion and the material’s pyrolysis front are different quantities. Platforms, duration and atmosphere also differ. No universal spread rate or hazard ranking is implied.':'These values come from fits and extrapolation. The compensation assumes a 35 cm/s buoyant 1g velocity and extrapolates to zero flow; lunar buoyant velocity is undetermined. This is not an approved qualification standard.';
  chart(); inspector(); table(); persist();
}

function selectRecord(id) {
  const r=viewRows.find((r) => r.measurement_id===id); if (!r) return;
  selected=id; if (gravityOrder.includes(r.gravity_label)) state.gravity=r.gravity_label;
  drawEnvironments(); chart(); inspector(); table(); persist();
}

document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click',() => {state.mode=b.dataset.mode; selected=null; $('search').value=''; render();}));
$('material').addEventListener('change',() => {state.material=$('material').value; selected=null; render();});
$('metric').addEventListener('change',() => {state.metric=$('metric').value; selected=null; render();});
$('environments').addEventListener('click',(e) => { const b=e.target.closest('[data-gravity]'); if (b) {state.gravity=b.dataset.gravity; selected=null; render();} });
$('chart').addEventListener('click',(e) => { const point=e.target.closest('[data-record]'); if(point)selectRecord(point.dataset.record); });
$('chart').addEventListener('keydown',(e) => { const point=e.target.closest('[data-record]'); if(point&&['Enter',' '].includes(e.key)){e.preventDefault();selectRecord(point.dataset.record);$('chart').querySelector(`[data-record="${point.dataset.record}"]`)?.focus();} });
$('table-wrap').addEventListener('click',(e) => {if(e.target.closest('a'))return; const row=e.target.closest('[data-record]'); if(row)selectRecord(row.dataset.record);});
$('search').addEventListener('input',table);
$('source-search').addEventListener('input',library);
document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click',() => {state.kind=b.dataset.kind;document.querySelectorAll('[data-kind]').forEach((el) => el.setAttribute('aria-pressed',el===b));library();}));
$('data-note-button').addEventListener('click',() => {$('data-note').hidden=!$('data-note').hidden;$('data-note-button').setAttribute('aria-expanded',!$('data-note').hidden);});
$('export').addEventListener('click',() => {
  const rows = state.mode==='sources'?libraryRows():viewRows.filter((r) => [r.material,r.gravity_label,r.platform,r.metric,r.source_id].join(' ').toLowerCase().includes($('search').value.toLowerCase().trim()));
  const fields = state.mode==='sources'?['source_id','title','url','doi','document_type']:['measurement_id','material','gravity_label','platform','metric','value','unit','normalized_value','normalized_unit','evidence_type','pressure_psia','flow_speed_cm_s','duration_s','pdf_page','locator','conditions','limitation','source_id','source_url'];
  const quote=(v) => {let s=String(v??''); if(/^[=+@\t\r]/.test(s)||(/^\-/.test(s)&&!Number.isFinite(Number(s))))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const csv=[fields.join(','),...rows.map((r) => fields.map((k) => quote(k==='source_url'?sourceMap.get(r.source_id)?.url:r[k])).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`flame-${state.mode}-${data.snapshot_date}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('toast').textContent=`Exported ${rows.length} records with source references.`;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);
});

try {
  const response=await fetch('data/research.json'); if(!response.ok)throw new Error('The research snapshot could not be loaded.');
  data=await response.json();
  if(!Array.isArray(data.evidence)||data.evidence.some((r)=>!Number.isFinite(r.value)||!r.source_id||!r.unit))throw new Error('The research snapshot has an invalid record.');
  sourceMap=new Map(data.sources.map((s)=>[s.source_id,s]));
  $('loading').hidden=true; render();
} catch(error) { $('loading').textContent=error.message+' Please reload or serve this page through the project preview server.'; $('loading').setAttribute('role','alert'); $('export').disabled=true; }
