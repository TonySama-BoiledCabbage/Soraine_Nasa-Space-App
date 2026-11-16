// Ported from dashboard/dist/material-library-bridge.mjs (7bf592e). Only the import path changed.
import {materialById} from './catalog.js';

// One basket authority: either this small in-memory store or Johnson's registered adapter.
export function createLibraryBridge() {
  let adapter=null,localIds=[],busy=false;
  const listeners=new Set(),notify=()=>listeners.forEach(fn=>fn());
  function check(id) {if(!materialById(id)) throw Error('Unknown library material.');}
  function ids() {
    const values=adapter?adapter.getBasket():localIds;
    if(!Array.isArray(values)||values.some(id=>!materialById(id))) throw Error('The shelf returned an invalid basket.');
    return [...new Set(values)];
  }
  return {
    get connected(){return !!adapter;},get busy(){return busy;},getBasket:ids,
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    async register(next) {
      if(adapter) throw Error('A material library is already connected.');
      for(const method of ['getBasket','addToBasket','removeFromBasket','selectMaterial','subscribe']) if(typeof next?.[method]!=='function') throw Error(`Library adapter requires ${method}.`);
      if(busy) throw Error('Wait for the current basket action.');
      busy=true;notify();
      try {
        for(const id of localIds) if(!next.getBasket().includes(id)) await next.addToBasket(id);
        const nextIds=next.getBasket();if(!Array.isArray(nextIds)||nextIds.some(id=>!materialById(id))) throw Error('The shelf returned an invalid basket.');
        const unsubscribe=next.subscribe(notify);adapter=next;localIds=[];notify();
        return ()=>{localIds=ids();adapter=null;if(typeof unsubscribe==='function')unsubscribe();notify();};
      } finally {busy=false;notify();}
    },
    async selectMaterial(id){check(id);if(!adapter)return false;await adapter.selectMaterial(id);return true;},
    async addToBasket(id){check(id);if(busy)throw Error('Wait for the current basket action.');busy=true;notify();try{if(!ids().includes(id)){if(adapter)await adapter.addToBasket(id);else localIds.push(id);}}finally{busy=false;notify();}},
    async removeFromBasket(id){check(id);if(busy)throw Error('Wait for the current basket action.');busy=true;notify();try{if(adapter)await adapter.removeFromBasket(id);else localIds=localIds.filter(x=>x!==id);}finally{busy=false;notify();}}
  };
}
export const materialLibrary = createLibraryBridge();
export const registerMaterialLibrary = adapter => materialLibrary.register(adapter);
