import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';

test('public assets support conditional reads and HEAD without exposing server files',async t=>{
 const priorPort=process.env.PORT;process.env.PORT='0';
 const {server}=await import('../server/index.mjs');
 if(priorPort===undefined)delete process.env.PORT;else process.env.PORT=priorPort;
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}));
 if(!server.listening)await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 const first=await fetch(base+'/observatory.css');
 assert.equal(first.status,200);assert.match(first.headers.get('cache-control'),/must-revalidate/);
 const content=await first.text();assert.ok(content.includes('.mission-grid'));
 const unchanged=await fetch(base+'/observatory.css',{headers:{'If-None-Match':first.headers.get('etag')}});
 assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
 const head=await fetch(base+'/assets/moon-lroc-mobile.webp',{method:'HEAD'});
 assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'image/webp');
 assert.match(head.headers.get('cache-control'),/max-age=3600/);
 assert.ok(Number(head.headers.get('content-length'))>0);assert.equal(await head.text(),'');
 const privateFile=await fetch(base+'/server/index.mjs');assert.equal(privateFile.status,404);
 const mutation=await fetch(base+'/api/research',{method:'POST'});assert.equal(mutation.status,405);
 assert.equal(mutation.headers.get('allow'),'GET, HEAD');
});
