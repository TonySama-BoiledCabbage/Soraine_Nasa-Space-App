import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const root=path.resolve('Flame_in_Freefall_2026/10_webapp');
const vendor=name=>pathToFileURL(path.join(root,'vendor',name)).href;
const THREE=await import(vendor('three.module.js'));
async function moduleFromWeb(name) {
  const code=readFileSync(path.join(root,'kitchen',name),'utf8')
    .replace("from 'three'",'from '+JSON.stringify(vendor('three.module.js')))
    .replace("from 'cannon-es'",'from '+JSON.stringify(vendor('cannon-es.js')));
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const {Props}=await moduleFromWeb('props.js');
const {WORLD,buildKitchen}=await moduleFromWeb('scene.js');
globalThis.addEventListener=()=>{};
const scene=new THREE.Scene();
const props=new Props(scene,new THREE.PerspectiveCamera(),{addEventListener(){},style:{}},WORLD.flame,buildKitchen(scene));
const pan=props.bodies.find(b=>b.name==='pan');
const egg=props.bodies.find(b=>b.name==='egg1');
for (const prop of props.bodies) if(prop!==pan && prop!==egg) props.world.removeBody(prop.body);
props.bodies=[pan,egg];
function place(prop,x,y,z) {
  prop.body.position.set(x,y,z);
  prop.body.quaternion.set(0,0,0,1);
  prop.body.aabbNeedsUpdate=true;
  prop.body.velocity.setZero(); prop.body.angularVelocity.setZero(); prop.body.wakeUp();
}
function advance(seconds) {
  for(let i=0;i<Math.ceil(seconds*120);i++) props.update(1/120);
}
place(pan,-.52,1.15,0);
// An egg dropped directly on each visible spoke must contact the metal before the burner.
for(let i=0;i<8;i++) {
  const a=i*Math.PI/4;
  place(egg,WORLD.flame.x+.092*Math.cos(a),1.12,WORLD.flame.z+.092*Math.sin(a));
  let height=0;
  for(let j=0;j<50 && !height;j++) {
    advance(1/120);
    if(props.world.contacts.some(c=>c.bi===egg.body || c.bj===egg.body)) height=egg.body.position.y;
  }
  assert(height>1.045,'Missed grate spoke '+i+' (first contact at '+height+')');
}
place(egg,.9,1.03,0);
place(pan,WORLD.flame.x,1.45,WORLD.flame.z);
pan.body.velocity.y=-1.6;
advance(1);
assert(Math.abs(pan.body.position.y-1.033)<.002,'Pan resting height '+pan.body.position.y);
props.held=pan; props.grab.set(0,0,0);
props.target=WORLD.flame.clone(); props.target.y=.2;
advance(.6);
assert(pan.body.position.y>1.027,'Dragged pan crossed grate: '+pan.body.position.y);
console.log('PASS eight grate spokes, falling pan, sustained downward drag');
