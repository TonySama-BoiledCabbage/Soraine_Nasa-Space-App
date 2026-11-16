import {MATERIAL_CATALOG,materialById,GRAVITIES} from './material-catalog.mjs';
import {createSearchClient} from './material-search-client.mjs';
import {materialLibrary} from './material-library-bridge.mjs';
import {esc,safeUrl,TYPES} from './data.mjs';

const search=createSearchClient(),dialog=document.createElement('dialog');
dialog.id='material-search-dialog';dialog.className='material-search-dialog';dialog.setAttribute('aria-labelledby','material-search-title');
dialog.innerHTML=`<header class="ms-heading"><div><span class="ms-eyebrow">SORAINE / MATERIAL LIBRARY</span><h2 id="material-search-title">Find the material. Follow the evidence.</h2></div><button type="button" data-ms-close aria-label="Close material search">×</button></header>
<form class="ms-form"><label class="ms-query"><span>Material or question</span><input name="query" maxlength="500" required placeholder="Try ‘Nomex on Moon’ or ‘梳子’" autocomplete="off"></label><label class="ms-gravity"><span>Gravity</span><select name="gravity"><option value="">From your question</option>${Object.entries(GRAVITIES).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label><button class="ms-submit" type="submit">Search <span aria-hidden="true">↗</span></button></form>
<div class="ms-tabs" role="group" aria-label="Material search sections"><button type="button" data-ms-tab="results" aria-pressed="true">Results</button><button type="button" data-ms-tab="basket" aria-pressed="false">Basket <span data-ms-count>0</span></button></div>
<p class="ms-status" role="status" aria-live="polite">Search materials by name or by an everyday object.</p>
<section class="ms-results" aria-label="Material search results"></section><section class="ms-basket" aria-label="Selected basket materials" hidden></section>`;
document.body.append(dialog);
const form=dialog.querySelector('form'),input=form.elements.query,gravity=form.elements.gravity,status=dialog.querySelector('.ms-status'),results=dialog.querySelector('.ms-results'),basket=dialog.querySelector('.ms-basket');
let response=null,selected=null,tab='results',pending=null,sequence=0,returnFocus=null;
const value=v=>v==null||v===''?'Not reported':String(v);
function setStatus(message){status.textContent=message;}
function open(){returnFocus=document.activeElement;if(!dialog.hasAttribute('open'))dialog.showModal();}
function chooseTab(next){tab=next;results.hidden=next!=='results';basket.hidden=next!=='basket';dialog.querySelectorAll('[data-ms-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.msTab===next)));if(next==='basket')renderBasket();}

function renderBasket() {
  let ids;
  try{ids=materialLibrary.getBasket();}catch{setStatus('The library basket could not be read.');return;}
  document.querySelectorAll('[data-ms-count]').forEach(n=>n.textContent=String(ids.length));
  basket.innerHTML=`<div class="ms-basket-heading"><h3>Your research basket</h3><button type="button" data-open-shelf>Open the 3D shelf ↗</button><p>${materialLibrary.connected?'Connected to the shelf. Removing here removes one basket sample; worktop samples stay in place.':'Your selection is kept while this page is open. It will transfer when the material shelf connects.'}</p></div>${ids.length?ids.map(id=>{const m=materialById(id);return `<div class="ms-basket-row"><span><strong>${esc(m.title)}</strong><small>${esc(m.object)}</small></span><button type="button" data-ms-remove="${id}" ${materialLibrary.busy?'disabled':''}>Remove <span class="ms-sr">${esc(m.title)}</span></button></div>`;}).join(''):'<p class="ms-empty">Open a material result and add it to your basket.</p>'}<p class="ms-footnote">These are material selections. Object shapes and later animations do not establish how a finished product will burn.</p>`;
  dialog.querySelectorAll('[data-ms-add]').forEach(b=>{const included=ids.includes(b.dataset.msAdd);b.disabled=included||materialLibrary.busy;b.textContent=included?'In your basket':'Add to basket';});
  dialog.querySelectorAll('[data-ms-locate]').forEach(b=>b.hidden=!materialLibrary.connected);
}
materialLibrary.subscribe(renderBasket);

function evidenceHTML(e,group) {
  const source=group.sources.find(s=>s.sourceId===e.sourceId),c=e.conditions;
  const fields=[['Gravity',e.gravity],['Pressure',c.pressureKpa==null?null:c.pressureKpa+' kPa absolute'],['Oxygen',c.oxygenPct==null?null:c.oxygenPct+' molar %'],['Airflow',c.flowSpeedCmS==null?null:c.flowSpeedCmS+' cm/s'],['Duration',c.durationS==null?null:c.durationS+' s'],['Platform',c.platform],['Test specimen',c.specimen]];
  return `<details class="ms-evidence"><summary><span><strong>${esc(e.metric)}</strong><small>${esc(e.gravity||'Gravity not reported')} · ${esc(e.measurementId)}</small></span><span class="ms-number">${esc(value(e.value))}<small>${esc(e.unit||'Unit not reported')}</small></span></summary><div class="ms-evidence-body"><p class="ms-evidence-kind">${esc(TYPES[e.evidenceType]?.name||e.evidenceType)}</p><p>${esc(e.material)}</p><dl>${fields.map(([label,v])=>`<div><dt>${label}</dt><dd>${esc(value(v))}</dd></div>`).join('')}</dl>${e.gravityBasis?`<p>Gravity basis: ${esc(e.gravityBasis)}</p>`:''}${e.limitation?`<p class="ms-limitation">${esc(e.limitation)}</p>`:''}<a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a><p class="ms-locator">${esc(e.locator||'')}${e.pdfPage!=null?' · PDF page '+esc(e.pdfPage):''}</p></div></details>`;
}
function renderDetail(id) {
  selected=id;const group=response.results.find(g=>g.materialId===id),host=results.querySelector('.ms-detail');
  if(!group||!host)return;
  const material=materialById(id);
  results.querySelectorAll('[data-ms-material]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.msMaterial===id)));
  host.innerHTML=`<span class="ms-eyebrow">MATERIAL IN FOCUS</span><h3 tabindex="-1">${esc(material.title)}</h3><p class="ms-object">${esc(material.object)} · material representation</p><p class="ms-specimen-note">The object is a visual reference. Results below apply to the reported research specimens and conditions.</p>${group.summary?`<p class="ms-summary">${esc(group.summary)}</p>`:''}<div class="ms-actions"><button type="button" data-ms-add="${id}">Add to basket</button><button type="button" data-ms-locate="${id}" ${materialLibrary.connected?'':'hidden'}>Locate on shelf ↗</button></div><h4>Reported evidence</h4>${group.evidence.length?group.evidence.map(e=>evidenceHTML(e,group)).join(''):'<p>No numeric measurements in this result.</p>'}${group.totalEvidenceCount>group.evidence.length?`<p class="ms-footnote">Showing ${group.evidence.length} of ${group.totalEvidenceCount} matching records. <button type="button" data-ms-all-evidence>Browse the full evidence table ↗</button></p>`:''}${group.originalRecords?.length?`<h4>Original data references</h4>${group.originalRecords.map(r=>`<p class="ms-original"><a href="${safeUrl(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.datasetId)} ↗</a><span>${esc(r.recordId||'')}${r.rowIndex!=null?' · Row '+esc(r.rowIndex):''}${r.locator?' · '+esc(r.locator):''}</span></p>`).join('')}`:''}`;
  renderBasket();
}
function renderResults() {
  if(!response.results.length){results.innerHTML='<div class="ms-empty"><h3>No matching records.</h3><p>Try a material name or choose a broader gravity condition.</p><button type="button" data-ms-example="all materials">Browse materials with evidence ↗</button></div>';return;}
  results.innerHTML=`<div class="ms-result-list"><p>${response.results.length} material ${response.results.length===1?'match':'matches'}</p>${response.results.map(g=>{const m=materialById(g.materialId);return `<button type="button" data-ms-material="${g.materialId}" aria-pressed="false"><span class="ms-material-symbol" aria-hidden="true">${['nomex-ht90','nomex-velcro','sibal','beefy-t'].includes(m.id)?'▦':'◇'}</span><span><strong>${esc(m.title)}</strong><small>${esc(m.object)}</small><small>${g.totalEvidenceCount??g.evidence.length} reported records</small></span><span aria-hidden="true">↗</span></button>`;}).join('')}</div><section class="ms-detail" aria-label="Selected material evidence"></section>`;
  renderDetail(response.results.some(g=>g.materialId===selected)?selected:response.results[0].materialId);
}
async function submit(query) {
  pending?.abort();pending=new AbortController();const current=++sequence;
  chooseTab('results');setStatus('Searching the research collection…');results.setAttribute('aria-busy','true');
  try {
    const {data,fallback}=await search({query,filters:{gravity:gravity.value||null},limit:9},{signal:pending.signal});
    if(current!==sequence||!dialog.hasAttribute('open'))return;
    response=data;renderResults();
    const provenance=data.dataSource==='bigquery'?'BigQuery records':'Saved research';
    setStatus(`${fallback?'Search service unavailable. Browsing saved research. ':provenance+' · '+(data.mode==='ai'?'AI-assisted summary':'Keyword search')+'. '}${data.appliedFilters?.gravity?'Gravity filter: '+(GRAVITIES[data.appliedFilters.gravity]||data.appliedFilters.gravity)+'. ':''}${data.summary||''}${fallback?' Original CSV rows remain in Original data.':''}`);
  } catch(error) {
    if(current!==sequence||pending.signal.aborted||!dialog.hasAttribute('open'))return;
    response=null;results.innerHTML='<div class="ms-empty"><h3>Search could not finish.</h3><p>Your existing dashboard and research views are still available.</p><button type="button" data-ms-retry>Try again</button></div>';setStatus(error.message||'Please try again.');
  } finally {if(current===sequence)results.removeAttribute('aria-busy');}
}
form.addEventListener('submit',event=>{event.preventDefault();submit(input.value);});
dialog.addEventListener('close',()=>{pending?.abort();sequence++;results.removeAttribute('aria-busy');if(returnFocus?.isConnected)returnFocus.focus();});
dialog.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-ms-close'))dialog.close();
  else if(button.dataset.msTab)chooseTab(button.dataset.msTab);
  else if(button.dataset.msMaterial){renderDetail(button.dataset.msMaterial);if(matchMedia('(max-width:680px)').matches)results.querySelector('.ms-detail h3').focus();}
  else if(button.dataset.msExample){input.value=button.dataset.msExample;submit(input.value);}
  else if(button.hasAttribute('data-ms-retry'))submit(input.value);
  else if(button.hasAttribute('data-ms-all-evidence')){dialog.close();document.querySelector('.main-nav [data-view="evidence"]')?.click();}
  else try {
    if(button.dataset.msAdd){await materialLibrary.addToBasket(button.dataset.msAdd);setStatus(materialById(button.dataset.msAdd).title+' added to your basket.');}
    if(button.dataset.msRemove){await materialLibrary.removeFromBasket(button.dataset.msRemove);setStatus('Material removed from your basket.');}
    if(button.dataset.msLocate&&await materialLibrary.selectMaterial(button.dataset.msLocate))dialog.close();
  } catch(error){setStatus(error.message||'The library action could not finish.');}
});

function start(query='') {open();chooseTab('results');input.value=query;input.focus();if(query.trim())submit(query);else if(!response)results.innerHTML='<div class="ms-empty"><h3>Start with a material or an object.</h3><p>Find published evidence without guessing which experiment to open.</p><div class="ms-examples"><button type="button" data-ms-example="Nomex on Moon">Nomex on Moon ↗</button><button type="button" data-ms-example="梳子">梳子 / comb ↗</button><button type="button" data-ms-example="all materials">All materials ↗</button></div></div>';}

const globalInput=document.querySelector('#global-search');
if(globalInput) {
  globalInput.maxLength=500;globalInput.setAttribute('aria-haspopup','dialog');globalInput.setAttribute('aria-controls',dialog.id);
  // Capture only submitted searches. Both the shipped Rust page and JS fallback
  // otherwise handle Enter on this input and would navigate/rebuild the model.
  document.addEventListener('keydown',event=>{if(event.target===globalInput&&event.key==='Enter'&&!event.isComposing){event.preventDefault();event.stopImmediatePropagation();start(globalInput.value);}},true);
  const launch=document.createElement('button');launch.type='button';launch.className='ms-launch';launch.textContent='Search materials ↗';launch.setAttribute('aria-haspopup','dialog');launch.setAttribute('aria-controls',dialog.id);launch.addEventListener('click',()=>start(globalInput.value));globalInput.closest('.workspace-intro').append(launch);
}
const basketButton=document.createElement('button');basketButton.type='button';basketButton.className='ms-basket-launch';basketButton.setAttribute('aria-haspopup','dialog');basketButton.innerHTML='Basket <span data-ms-count>0</span>';basketButton.addEventListener('click',()=>{open();chooseTab('basket');setStatus('Choose materials to explore together.');});document.querySelector('.header-actions')?.append(basketButton);
renderBasket();

// Public entry point for a future shelf search trigger; no private dashboard state access.
export {start as openMaterialSearch};
