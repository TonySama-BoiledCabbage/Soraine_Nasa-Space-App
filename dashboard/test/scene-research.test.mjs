import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/library/vendor/three.module.js';
import {CameraMotion} from '../dist/library/kitchen/motion.js';
import {deliveryLabel, validateResearch, validateOriginal, joinedMeasurement, toCsv} from '../dist/library/kitchen/research-db/data.js';

test('scene provenance distinguishes fresh, stale and snapshot HTTP responses',()=>{
  const result=mode=>({via:'live',data:{delivery:{mode}}});
  assert.equal(deliveryLabel(result('bigquery')),'from BigQuery (server-cached)');
  assert.match(deliveryLabel(result('cached-stale')),/latest refresh failed/);
  assert.equal(deliveryLabel(result('snapshot')),'from the server snapshot');
  assert.equal(deliveryLabel({via:'saved',data:{delivery:{mode:'bigquery'}}}),'from the saved export');
});

test('scene fallback resolves the deployed dashboard snapshots and retains all original rows',async()=>{
  const originalFetch=globalThis.fetch,urls=[];
  globalThis.fetch=async url=>{
    urls.push(String(url));
    if(String(url).startsWith('/api/'))throw Error('offline');
    return new Response(await readFile(new URL(url)),{headers:{'Content-Type':'application/json'}});
  };
  try{
    const mod=await import('../dist/library/kitchen/research-db/data.js?fallback-test');
    const r=await mod.loadResearch(),o=await mod.loadOriginal();
    assert.equal(r.via,'saved');assert.equal(o.via,'saved');
    assert.equal(r.data.measurements.length,59);
    assert.equal(o.data.datasets.reduce((n,d)=>n+d.rows.length,0),381);
    assert.ok(urls.some(url=>url.endsWith('/dashboard/dist/data/research.json')));
    assert.ok(urls.some(url=>url.endsWith('/dashboard/dist/data/original-data.json')));
    const m=r.data.measurements.find(m=>m.measurement_id==='M002')||r.data.measurements[0];
    const joined=joinedMeasurement(r.db,m);
    assert.equal(joined.value,m.value);
    assert.equal(joined.locator,m.locator);
    assert.equal(joined.source_url,r.db.sources.get(m.source_id).url);
    assert.ok(joined.experiment_gravity_label);
  }finally{globalThis.fetch=originalFetch;}
});

test('research records reject missing joins and CSV exports preserve numeric strings safely',async()=>{
  const r=JSON.parse(await readFile(new URL('../dist/data/research.json',import.meta.url),'utf8'));
  assert.equal(validateResearch(r),r);
  const broken=structuredClone(r);broken.measurements[0].source_id='missing';
  assert.throws(()=>validateResearch(broken),/incomplete/);
  assert.throws(()=>validateOriginal({datasets:[]}),/missing/);
  const csv=toCsv([{value:'21.0',note:'=1+1',zero:0,missing:null}]);
  assert.ok(csv.includes('"21.0"'));assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"0"'));
});

const rig=(x,y,z)=>({pos:new THREE.Vector3(x,y,z),look:new THREE.Vector3(0,.9,0),fov:42});
test('camera retargets without a position jump and finishes exactly at the target',()=>{
  const start=rig(0,2.3,.05),end=rig(.5,1.4,2.3),next=rig(1.5,1.8,2.2);
  const motion=new CameraMotion(THREE,start);motion.goTo(end,1.5);
  for(let i=0;i<30;i++)motion.update(1/60);
  const position=motion.pos.clone(),velocity=[...motion.vel];
  motion.goTo(next,1);
  assert.equal(motion.pos.distanceTo(position),0);
  assert.deepEqual([...motion.vel],velocity);
  for(let i=0;i<70;i++){motion.update(1/60);assert.ok(motion.pos.toArray().every(Number.isFinite));}
  assert.ok(motion.pos.distanceTo(next.pos)<1e-9);assert.equal(motion.moving,false);
  motion.snap(start);assert.ok(motion.pos.distanceTo(start.pos)<1e-9);
});

test('scene search uses the same tested client and basket bridge as the dashboard',async()=>{
  const sceneClient=await import('../dist/library/kitchen/material-search/client.js');
  const rootClient=await import('../dist/material-search-client.mjs');
  assert.equal(sceneClient.createSearchClient,rootClient.createSearchClient);
  const sceneBridge=await import('../dist/library/kitchen/material-search/bridge.js');
  const rootBridge=await import('../dist/material-library-bridge.mjs');
  assert.equal(sceneBridge.materialLibrary,rootBridge.materialLibrary);
});
