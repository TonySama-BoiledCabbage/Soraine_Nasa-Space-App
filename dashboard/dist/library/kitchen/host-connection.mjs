import {createShelfAdapter} from './library-adapter.mjs';
const channel='soraine-shelf-v1';
export function connectHost({ready,basket,shop,products,openShelf,setActive}) {
  if(parent===window)return;
  const send=body=>parent.postMessage({channel,...body},location.origin);
  const adapter=createShelfAdapter({basket,shop,products,openShelf});
  const state=()=>({ids:adapter.getBasket(),counts:Object.fromEntries(adapter.getBasket().map(id=>[id,basket.count(id)]))});
  let queue=Promise.resolve();
  const handle=async data=>{
    try {
      await ready;
      switch(data.action){
        case 'getBasket':break;
        case 'open':setActive(true);await openShelf();break;
        case 'add':await adapter.addToBasket(data.materialId);break;
        case 'remove':await adapter.removeFromBasket(data.materialId);break;
        case 'select':await adapter.selectMaterial(data.materialId);break;
        default:throw Error('Unknown shelf action.');
      }
      send({type:'response',requestId:data.requestId,...state()});
    } catch(error){send({type:'response',requestId:data.requestId,error:error.message});}
  };
  addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.channel!==channel)return;
    const data=event.data;
    if(data.type==='visibility'){setActive(data.active===true);return;}
    if(data.type!=='request'||typeof data.requestId!=='string'||data.requestId.length>80)return;
    queue=queue.then(()=>handle(data));
  });
  basket.onChange(()=>send({type:'state',...state()}));
  ready.then(()=>send({type:'ready',...state()}),error=>send({type:'failed',error:error.message}));
}
