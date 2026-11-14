import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createResearchCache, readPublicBundle} from './research.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const snapshot = JSON.parse((await readFile(resolve(root,'data/research.json'),'utf8')).replace(/^\uFEFF/,''));
const project = process.env.BQ_PROJECT || 'project-89aca125-c9a5-4fdd-bb0';
const dataset = process.env.BQ_DATASET || 'flame_in_freefall_2026';
let credential, credentialExpires=0;
async function accessToken(){
  if(!process.env.K_SERVICE) throw Error('Local snapshot mode');
  if(credential && Date.now()<credentialExpires) return credential;
  const response=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(3000)});
  if(!response.ok) throw Error('Runtime identity unavailable');
  const token=await response.json(); credential=token.access_token;credentialExpires=Date.now()+Math.max(0,token.expires_in-60)*1000;
  return credential;
}
async function request(url){
  const response=await fetch(url,{headers:{Authorization:`Bearer ${await accessToken()}`},signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw Error(`Research read failed: ${response.status}`);
  return response.json();
}
const research = createResearchCache({snapshot,refresh:()=>readPublicBundle({request,project,dataset,snapshot}).catch(error=>{console.warn('Research refresh:',error.message);throw error})});
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'}).end(req.method==='HEAD'?undefined:'{"status":"ok"}');return;}
    if(pathname==='/api/research'){
      const data=await research();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=30'});res.end(req.method==='HEAD'?undefined:JSON.stringify(data));return;
    }
    // Restrict serving to public assets, never repository, cloud config or source.
    let file=resolve(root,'.'+pathname);
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    if((await stat(file)).isDirectory()) file=resolve(file,'index.html');
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'public, max-age=0, must-revalidate'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');}
});
server.listen(Number(process.env.PORT||4335),'0.0.0.0',()=>console.log('Soraine dashboard ready'));
process.on('SIGTERM',()=>server.close());
