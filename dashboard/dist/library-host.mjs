import {registerMaterialLibrary} from './material-library-bridge.mjs';
import {materialById} from './material-catalog.mjs';
const channel='soraine-shelf-v1',listeners=new Set(),pending=new Map();
let frame,ready,resolveReady,rejectReady,ids=[],counter=0,connected=false,opening;
const dialog=document.createElement('dialog');dialog.className='shelf-dialog';dialog.setAttribute('aria-label','Interactive material shelf');
dialog.innerHTML='<header><div><strong>SORAINE / MATERIAL SHELF</strong><span>Research objects · illustrative physics</span></div><button type="button" aria-label="Return to dashboard">Back to research ×</button></header><p role="status" class="shelf-loading">Loading the material shelf…</p><div class="shelf-frame"></div>';
document.body.append(dialog);
const status=dialog.querySelector('[role=status]');
const notify=()=>listeners.forEach(fn=>fn());
function applyState(data){if(!Array.isArray(data.ids)||data.ids.some(id=>!materialById(id)))throw Error('Invalid shelf state.');ids=[...new Set(data.ids)];notify();}
function send(body){frame?.contentWindow?.postMessage({channel,...body},location.origin);}
function command(action,materialId){return new Promise((resolve,reject)=>{const requestId=String(++counter);const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('The shelf did not finish. Please reopen it and try again.'));},45000);pending.set(requestId,{resolve,reject,timer});send({type:'request',requestId,action,materialId});});}
function show(){document.querySelector('#material-search-dialog[open]')?.close();if(!dialog.open)dialog.showModal();send({type:'visibility',active:true});}
function load(){
  if(ready)return ready;
  ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  frame=document.createElement('iframe');frame.title='Soraine interactive material shelf';frame.src='./library/?data=api&shop&embedded';frame.allow='';
  dialog.querySelector('.shelf-frame').append(frame);
  const timer=setTimeout(()=>rejectReady(Error('The shelf is taking longer to load. Close and reopen to check again.')),90000);
  ready.catch(()=>{if(!connected){frame.remove();frame=null;ready=null;}}).finally(()=>clearTimeout(timer)).catch(()=>{});
  return ready;
}
addEventListener('message',event=>{
  if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.channel!==channel)return;
  const data=event.data;
  try{
    if(data.type==='ready'){applyState(data);resolveReady();}
    else if(data.type==='failed'){rejectReady(Error(data.error||'The shelf could not load.'));}
    else if(data.type==='state'){applyState(data);}
    else if(data.type==='response'){
      const job=pending.get(data.requestId);if(!job)return;clearTimeout(job.timer);pending.delete(data.requestId);
      if(data.error)job.reject(Error(data.error));else{try{applyState(data);job.resolve();}catch(error){job.reject(error);}}
    }
  }catch(error){status.textContent=error.message;}
});
async function open(){
  show();if(opening)return opening;
  opening=(async()=>{try{
    status.hidden=false;status.textContent='Loading models and preparing the shelf…';await load();if(!dialog.open)return;
    await command('open');
    if(!connected){await registerMaterialLibrary({getBasket:()=>ids,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
      addToBasket:async id=>{show();await command('add',id);},removeFromBasket:async id=>{show();await command('remove',id);},selectMaterial:async id=>{show();await command('select',id);}});connected=true;}
    status.hidden=true;
  }catch(error){status.hidden=false;status.textContent=error.message;}finally{opening=null;}})();return opening;
}
dialog.querySelector('button').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{send({type:'visibility',active:false});launch.focus();});
const launch=document.createElement('button');launch.type='button';launch.className='ms-basket-launch';launch.textContent='Material shelf';launch.addEventListener('click',open);
document.querySelector('.header-actions').append(launch);
document.addEventListener('click',event=>{if(event.target.closest('[data-open-shelf]'))open();});
