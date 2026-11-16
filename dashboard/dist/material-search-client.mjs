import {MATERIAL_CATALOG,materialById,GRAVITIES,parseLocalQuery} from './material-catalog.mjs';

export function validateRequest({query,filters={},limit=5}={}) {
  if(typeof query!=='string'||!query.trim()||query.trim().length>500) throw Error('Enter a search between 1 and 500 characters.');
  if(!filters||typeof filters!=='object'||Array.isArray(filters)) throw Error('Choose valid search filters.');
  if(filters.gravity!=null&&!Object.hasOwn(GRAVITIES,filters.gravity)) throw Error('Choose a supported gravity setting.');
  if(filters.materialId!=null&&!materialById(filters.materialId)) throw Error('Choose a material from the library.');
  if(!Number.isInteger(limit)||limit<1||limit>10) throw Error('Choose between 1 and 10 material groups.');
  return {query:query.trim(),filters:{gravity:filters.gravity??null,materialId:filters.materialId??null},limit};
}
const textOrNull=value=>value==null?null:String(value);
export function searchSnapshot(bundle,input) {
  const request=validateRequest(input),intent=parseLocalQuery(request.query);
  if(!Array.isArray(bundle?.experiments)||!Array.isArray(bundle?.measurements)||!Array.isArray(bundle?.sources)) throw Error('The saved research collection could not be read.');
  const experiments=new Map(bundle.experiments.map(e=>[e.experiment_id,e])),sources=new Map(bundle.sources.map(s=>[s.source_id,s]));
  const candidates=request.filters.materialId?[materialById(request.filters.materialId)]:intent.materials.length?intent.materials:intent.worlds.length||intent.modes.length||intent.all?MATERIAL_CATALOG:[];
  const worlds=request.filters.gravity?[request.filters.gravity]:intent.worlds;
  const results=[];
  for(const material of candidates) {
    const matches=bundle.measurements.filter(m=>{
      const e=experiments.get(m.experiment_id);
      return e&&sources.has(m.source_id)&&material.names.includes(e.material)
        &&(!worlds.length||worlds.some(w=>GRAVITIES[w]===e.gravity_label))
        &&(!intent.issOnly||request.filters.gravity&&request.filters.gravity!=='iss'||/\bISS\b|international space station/i.test(e.platform||''))
        &&(!intent.modes.length||intent.modes.some(mode=>new RegExp(mode==='smolder'?'smolder|smoulder':'flaming','i').test(e.material+' '+m.metric)));
    });
    if(!matches.length) continue;
    const evidence=matches.slice(0,10).map(m=>{
      const e=experiments.get(m.experiment_id);
      return {measurementId:m.measurement_id,experimentId:m.experiment_id,sourceId:m.source_id,material:e.material,gravity:e.gravity_label??null,gravityBasis:e.gravity_basis??null,metric:m.metric,value:m.value??null,unit:m.unit??null,evidenceType:m.evidence_type,conditions:{pressureKpa:e.pressure_kpa??null,oxygenPct:e.oxygen_pct??null,flowSpeedCmS:e.flow_speed_cm_s??null,durationS:e.duration_s??null,platform:e.platform??null,specimen:e.conditions??null},limitation:m.limitation??e.limitation??null,pdfPage:m.pdf_page??null,locator:m.locator??null};
    });
    results.push({materialId:material.id,title:material.title,summary:null,evidenceIds:evidence.map(e=>e.measurementId),totalEvidenceCount:matches.length,evidence,originalRecords:[],sources:[...new Set(evidence.map(e=>e.sourceId))].map(id=>{const s=sources.get(id);return {sourceId:id,title:s.title,url:s.url};})});
  }
  return {query:request.query,mode:'keyword',dataSource:'snapshot',summary:null,appliedFilters:request.filters,results:results.slice(0,request.limit)};
}

// Fail closed on missing joins and mismatched IDs. Never render untrusted markup.
export function validateResponse(data) {
  if(!data||!['ai','keyword'].includes(data.mode)||!['bigquery','snapshot'].includes(data.dataSource)||!Array.isArray(data.results)||data.results.length>10) throw Error('The search service returned an unreadable response.');
  const ids=new Set();
  for(const group of data.results) {
    const material=materialById(group.materialId);
    if(!material||ids.has(group.materialId)||!Array.isArray(group.evidence)||group.evidence.length>100||!Array.isArray(group.evidenceIds)||!Array.isArray(group.sources)) throw Error('The search results contain an invalid material group.');
    ids.add(group.materialId);
    const sources=new Set(group.sources.map(s=>s.sourceId)),measurements=new Set();
    for(const e of group.evidence) {
      if(typeof e.measurementId!=='string'||!e.measurementId||measurements.has(e.measurementId)||!e.experimentId||!sources.has(e.sourceId)||!material.names.includes(e.material)||typeof e.metric!=='string'||typeof e.evidenceType!=='string'||!e.conditions) throw Error('A search result is missing its material, conditions or source.');
      if(e.value!=null&&!['string','number'].includes(typeof e.value)) throw Error('A result contains an invalid value.');
      measurements.add(e.measurementId);
    }
    if(group.evidenceIds.length!==measurements.size||new Set(group.evidenceIds).size!==measurements.size||!group.evidenceIds.every(id=>measurements.has(id))) throw Error('Evidence references do not match the returned records.');
    if(group.totalEvidenceCount!=null&&(!Number.isInteger(group.totalEvidenceCount)||group.totalEvidenceCount<group.evidence.length)) throw Error('The evidence count is inconsistent.');
    if(group.originalRecords!=null&&(!Array.isArray(group.originalRecords)||group.originalRecords.length>100||group.originalRecords.some(r=>!r.datasetId||typeof r.sourceUrl!=='string'))) throw Error('Original record references could not be read.');
  }
  return {...data,summary:textOrNull(data.summary)};
}

export function createSearchClient({fetcher=globalThis.fetch,endpoint=new URL('./api/material-search',import.meta.url).href,snapshotUrl=new URL('./data/research.json',import.meta.url).href,timeoutMs=12000}={}) {
  let cachedSnapshot;
  return async function search(input,{signal}={}) {
    const request=validateRequest(input),controller=new AbortController();
    const abort=()=>controller.abort(signal?.reason);if(signal?.aborted) abort();else signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(request),signal:controller.signal});
      if(response.status===400) throw Object.assign(Error('Check your query and filters, then try again.'),{inputError:true});
      if(!response.ok) throw Error('Search service unavailable.');
      return {data:validateResponse(await response.json()),fallback:false};
    } catch(error) {
      if(signal?.aborted) throw error;
      if(error.inputError) throw error;
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    const fallbackController=new AbortController(),cancel=()=>fallbackController.abort(signal?.reason);
    if(signal?.aborted) cancel();else signal?.addEventListener('abort',cancel,{once:true});
    const fallbackTimer=setTimeout(()=>fallbackController.abort(),timeoutMs);
    try {
      if(!cachedSnapshot) {
        const response=await fetcher(snapshotUrl,{signal:fallbackController.signal,headers:{Accept:'application/json'}});
        if(!response.ok) throw Error('Search is unavailable and the saved research could not be loaded.');
        const bundle=await response.json();searchSnapshot(bundle,request);cachedSnapshot=bundle;
      }
      if(signal?.aborted) throw Error('Search cancelled.');
      return {data:validateResponse(searchSnapshot(cachedSnapshot,request)),fallback:true};
    } finally {clearTimeout(fallbackTimer);signal?.removeEventListener('abort',cancel);}
  };
}
