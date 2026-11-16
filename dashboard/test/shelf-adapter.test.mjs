import test from 'node:test';
import assert from 'node:assert/strict';
import {createShelfAdapter} from '../dist/library/kitchen/library-adapter.mjs';
import {PRODUCTS} from '../dist/library/kitchen/catalog.js';
import {MATERIAL_CATALOG} from '../dist/material-catalog.mjs';
import {provenanceLabel} from '../dist/library/kitchen/research-source.js';

test('shelf IDs match research IDs; removing one preserves other copies and released samples',async()=>{
  assert.deepEqual(PRODUCTS.map(p=>p.id).sort(),MATERIAL_CATALOG.map(p=>p.id).sort());
  const product=PRODUCTS.find(p=>p.id==='pmma');
  let records=[{product,state:'carried'},{product,state:'carried'},{product,state:'released'}],opens=0,selected;
  const listeners=new Set();
  const basket={inCart:()=>records.filter(r=>r.state!=='released'),count:id=>basket.inCart().filter(r=>r.product.id===id).length,
    add:async p=>{records.push({product:p,state:'carried'});listeners.forEach(fn=>fn());},
    removeOne:id=>{const index=records.findIndex(r=>r.product.id===id&&r.state!=='released');if(index>=0)records.splice(index,1);listeners.forEach(fn=>fn());},
    onChange:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  const adapter=createShelfAdapter({basket,shop:{openProduct:async p=>{selected=p.id;}},products:PRODUCTS,openShelf:async()=>{opens++;}});
  assert.deepEqual(adapter.getBasket(),['pmma']);await adapter.addToBasket('pmma');assert.equal(records.length,3);
  let updates=0;const off=adapter.subscribe(()=>updates++);
  await adapter.removeFromBasket('pmma');assert.equal(basket.count('pmma'),1);assert.equal(records.filter(r=>r.state==='released').length,1);
  await adapter.removeFromBasket('pmma');assert.deepEqual(adapter.getBasket(),[]);assert.equal(records.length,1);
  await adapter.addToBasket('ultem-1000');assert.deepEqual(adapter.getBasket(),['ultem-1000']);
  await adapter.selectMaterial('ultem-1000');assert.equal(selected,'ultem-1000');assert.ok(opens>=5);assert.equal(updates,3);off();
  await assert.rejects(adapter.addToBasket('unknown'),/Unknown material/);
});

test('shelf provenance never calls an API snapshot or stale cache live BigQuery',()=>{
  assert.equal(provenanceLabel({origin:'api',delivery:'bigquery'}),'BigQuery research records');
  assert.match(provenanceLabel({origin:'api',delivery:'cached-stale'}),/refresh unavailable/);
  assert.equal(provenanceLabel({origin:'api',delivery:'snapshot'}),'Saved research snapshot');
  assert.equal(provenanceLabel({origin:'snapshot',fallbackFrom:'api'}),'Saved research snapshot');
});
