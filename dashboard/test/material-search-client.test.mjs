import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {searchSnapshot,validateRequest,validateResponse,createSearchClient} from '../dist/material-search-client.mjs';
import {createLibraryBridge} from '../dist/material-library-bridge.mjs';
import {parseLocalQuery} from '../dist/material-catalog.mjs';
const bundle=JSON.parse(await readFile(new URL('../dist/data/research.json',import.meta.url),'utf8'));

test('Chinese object searches use fixed material IDs and retain the actual specimens',()=>{
  for(const [query,id] of [['梳子','ultem-1000'],['胶带','p213'],['棉 T 恤','beefy-t']]) {
    const data=validateResponse(searchSnapshot(bundle,{query}));
    assert.deepEqual(data.results.map(g=>g.materialId),[id]);
    for(const e of data.results[0].evidence) assert.equal(e.value,bundle.measurements.find(m=>m.measurement_id===e.measurementId).value);
  }
  assert.match(searchSnapshot(bundle,{query:'comb'}).results[0].evidence[0].conditions.specimen,/film/i);
});
test('Nomex names separate fabric from Velcro and short aliases use word boundaries',()=>{
  assert.deepEqual(searchSnapshot(bundle,{query:'Nomex'}).results.map(g=>g.materialId),['nomex-ht90','nomex-velcro']);
  assert.deepEqual(searchSnapshot(bundle,{query:'Nomex Velcro'}).results.map(g=>g.materialId),['nomex-velcro']);
  assert.equal(parseLocalQuery('spacecraft').materials.length,0);
  assert.equal(parseLocalQuery('PC').materials[0].id,'polycarbonate');
  assert.equal(parseLocalQuery('transparent plastic').materials.length,3);
});
test('explicit gravity takes precedence while a multi-gravity query preserves both contexts',()=>{
  const filtered=searchSnapshot(bundle,{query:'Ultem Moon',filters:{gravity:'mars'}});
  assert.ok(filtered.results[0].evidence.every(e=>e.gravity==='Mars'));
  const compared=searchSnapshot(bundle,{query:'Ultem Moon Mars'});
  assert.deepEqual(new Set(compared.results[0].evidence.map(e=>e.gravity)),new Set(['Moon','Mars']));
  const iss=searchSnapshot(bundle,{query:'Ultem ISS'});
  assert.ok(iss.results.every(g=>g.evidence.every(e=>/ISS|international space station/i.test(e.conditions.platform))));
});
test('Moon fallback retains labelled model estimates without relabelling them as measured tests',()=>{
  const data=searchSnapshot(bundle,{query:'Polycarbonate on Moon'});
  assert.equal(data.results.length,1);
  assert.ok(data.results[0].evidence.every(e=>e.gravity==='Earth-to-Moon model'));
  assert.match(data.results[0].summary,/estimates, not measured lunar tests/);
  assert.equal(searchSnapshot(bundle,{query:'Polycarbonate on Mars'}).results.length,0);
});

test('flaming and smoldering remain separate and no-match does not invent results',()=>{
  for(const mode of ['flaming','smolder']) {
    const data=searchSnapshot(bundle,{query:'Beefy-T '+mode});
    assert.ok(data.results.length>0);
    assert.ok(data.results[0].evidence.every(e=>e.material.endsWith('('+mode+')')));
  }
  assert.equal(searchSnapshot(bundle,{query:'titanium unicorn'}).results.length,0);
});
test('request and response validation rejects unknown filters, broken joins and duplicate IDs',()=>{
  for(const input of [{query:''},{query:'x'.repeat(501)},{query:'x',limit:1.5},{query:'x',limit:11},{query:'x',filters:{gravity:'venus'}},{query:'x',filters:[]},{query:'x',filters:{materialId:'made-up'}}]) assert.throws(()=>validateRequest(input));
  const data=searchSnapshot(bundle,{query:'Ultem Moon'});
  const broken=structuredClone(data);broken.results[0].sources=[];assert.throws(()=>validateResponse(broken));
  const duplicate=structuredClone(data);duplicate.results[0].evidenceIds.push(duplicate.results[0].evidenceIds[0]);assert.throws(()=>validateResponse(duplicate));
  const wrong=structuredClone(data);wrong.results[0].materialId='pmma';assert.throws(()=>validateResponse(wrong));
});
test('offline search preserves missing values, decimal strings, source links and caps evidence',()=>{
  const data=validateResponse(searchSnapshot(bundle,{query:'all materials',limit:9}));
  assert.equal(data.results.length,9);
  for(const group of data.results) {
    assert.ok(group.evidence.length<=10);assert.ok(group.totalEvidenceCount>=group.evidence.length);
    for(const e of group.evidence){const m=bundle.measurements.find(m=>m.measurement_id===e.measurementId);assert.equal(e.value,m.value);assert.equal(e.pdfPage,m.pdf_page);assert.equal(e.evidenceType,m.evidence_type);assert.equal(group.sources.find(s=>s.sourceId===e.sourceId).url,bundle.sources.find(s=>s.source_id===e.sourceId).url);}
  }
});
test('client handles unavailable endpoint with cached snapshot and labels it honestly',async()=>{
  let snapshotReads=0;
  const client=createSearchClient({endpoint:'/search',snapshotUrl:'/saved',fetcher:async url=>url==='/search'?{ok:false,status:405}:{ok:true,json:async()=>{snapshotReads++;return bundle;}}});
  for(const query of ['Nomex','Ultem']){const result=await client({query});assert.equal(result.fallback,true);assert.equal(result.data.mode,'keyword');assert.equal(result.data.dataSource,'snapshot');}
  assert.equal(snapshotReads,1);
});
test('client uses successful service output without replacing it and respects cancellation',async()=>{
  const data={...searchSnapshot(bundle,{query:'Ultem'}),dataSource:'bigquery',mode:'ai',summary:'Published results for Ultem.'};
  const client=createSearchClient({fetcher:async()=>({ok:true,json:async()=>data})});
  assert.equal((await client({query:'Ultem'})).fallback,false);
  let calls=0;const controller=new AbortController();controller.abort();
  const cancelled=createSearchClient({fetcher:async(url,{signal})=>{calls++;if(signal.aborted)throw Error('aborted');throw Error('unexpected');}});
  await assert.rejects(cancelled({query:'Ultem'},{signal:controller.signal}));assert.equal(calls,1);
});
test('client timeout falls back and a rejected request does not mask validation errors',async()=>{
  let count=0;
  const client=createSearchClient({timeoutMs:5,fetcher:async(url,{signal})=>{if(count++===0)return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}));return {ok:true,json:async()=>bundle};}});
  assert.equal((await client({query:'Ultem'})).fallback,true);
  const invalid=createSearchClient({fetcher:async()=>({ok:false,status:400})});await assert.rejects(invalid({query:'Ultem'}),/Check your query/);
});
test('basket transfers once into shelf authority and external changes stay authoritative',async()=>{
  const bridge=createLibraryBridge();await bridge.addToBasket('ultem-1000');await bridge.addToBasket('ultem-1000');assert.deepEqual(bridge.getBasket(),['ultem-1000']);
  let shelf=['pmma'],listener,selection;
  const disconnect=await bridge.register({getBasket:()=>shelf,addToBasket:async id=>shelf.push(id),removeFromBasket:async id=>{shelf=shelf.filter(v=>v!==id);},selectMaterial:async id=>{selection=id;},subscribe:fn=>{listener=fn;return ()=>{};}});
  assert.deepEqual(bridge.getBasket(),['pmma','ultem-1000']);
  await bridge.selectMaterial('pmma');assert.equal(selection,'pmma');await bridge.removeFromBasket('pmma');assert.deepEqual(bridge.getBasket(),['ultem-1000']);
  shelf.push('p213');listener();assert.deepEqual(bridge.getBasket(),['ultem-1000','p213']);disconnect();assert.equal(bridge.connected,false);assert.deepEqual(bridge.getBasket(),shelf);
  await assert.rejects(bridge.addToBasket('invalid'));
});
