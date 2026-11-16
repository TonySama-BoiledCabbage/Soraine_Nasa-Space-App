import test from 'node:test';
import assert from 'node:assert/strict';
import {connectHost} from '../dist/library/kitchen/host-connection.mjs';

test('only the parent controls visibility; a queued open cannot resume a closed shelf',async()=>{
  const names=['parent','window','location','addEventListener'];
  const previous=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const messages=[];let receive,active=false,opens=0;
  const host={postMessage:data=>messages.push(data)};
  Object.assign(globalThis,{parent:host,window:{},location:{origin:'https://soraine.example'},addEventListener:(_,fn)=>{receive=fn;}});
  try {
    const basket={inCart:()=>[],count:()=>0,onChange:()=>{}};
    connectHost({ready:Promise.resolve(),basket,shop:{},products:[],setActive:value=>{active=value;},openShelf:async()=>{opens++;}});
    const event=(data,source=host,origin=location.origin)=>receive({source,origin,data:{channel:'soraine-shelf-v1',...data}});
    event({type:'visibility',active:true});assert.equal(active,true);
    event({type:'request',action:'open',requestId:'1'});
    event({type:'visibility',active:false});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(opens,1);assert.equal(active,false);assert.ok(messages.some(m=>m.requestId==='1'));
    event({type:'visibility',active:true},{},location.origin);
    event({type:'visibility',active:true},host,'https://unrelated.example');
    assert.equal(active,false);
  }finally{
    for(const name of names){if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name];}
  }
});
