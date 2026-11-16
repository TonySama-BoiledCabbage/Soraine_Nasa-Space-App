const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Yuntao Lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const base=path.resolve('Flame_in_Freefall_2026/10_webapp');
const server=http.createServer((req,res)=>{let file=path.resolve(base,'.'+new URL(req.url,'http://localhost').pathname);if(file===base)file=path.join(base,'index.html');if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{
browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-timer-throttling']});
const page=await browser.newPage({viewport:{width:1100,height:650}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:'+server.address().port+'/?lite');
await page.waitForFunction(()=>window.__kitchen?.env().current==='earth');
const framing=await page.evaluate(()=>{
 const k=__kitchen,c=k.combustion,camera=k.camera;
 const saved={pos:camera.position.clone(),q:camera.quaternion.clone(),fov:camera.fov,aspect:camera.aspect};
 const cap=k.scene.getObjectByName('O2_press_cap'),pan=k.props.bodies.find(b=>b.name==='pan');
 const button=cap.getWorldPosition(camera.position.clone()).project(camera);
 const center=pan.mesh.position.clone().project(camera);
 if(button.x>=center.x || button.y>=center.y) throw Error('Button must be left and below the pan');
 let count=0;
 for(const aspect of [390/844,1100/650,2560/1080]) {
   for(const rig of Object.values(k.RIG)) {
     camera.position.copy(rig.pos);camera.lookAt(rig.look);camera.fov=rig.fov;camera.aspect=aspect;
     camera.updateProjectionMatrix();
     for(const reach of [.01,.25,.5,.75,1]) {
       c.reach=reach;c.arm.visible=true;c.frameArm();c.arm.updateWorldMatrix(true,true);
       const tail=c.arm.getObjectByName('Rear_plug');
       const vertices=tail.geometry.attributes.position,point=camera.position.clone();
       for(let i=0;i<vertices.count;i++) {
         point.fromBufferAttribute(vertices,i).applyMatrix4(tail.matrixWorld);
         if(c.frustum.containsPoint(point)) throw Error('Rear plug visible at aspect '+aspect);
       }
       count++;
     }
   }
 }
 camera.position.copy(saved.pos);camera.quaternion.copy(saved.q);camera.fov=saved.fov;camera.aspect=saved.aspect;
 camera.updateProjectionMatrix();c.reach=0;c.arm.visible=false;
 return count;
});
console.log('Rear plug hidden in',framing,'camera/aspect/deployment combinations');
await page.screenshot({path:'Flame_in_Freefall_2026/09_assets/landing_lab/landing.png'});
await page.click('#start');await page.waitForSelector('#observe:visible');
assert.equal(await page.locator('#oxygen').count(),0);
assert.equal(await page.evaluate(()=>__kitchen.combustion.arm.visible),false);
await page.keyboard.press('o');
assert.equal(await page.evaluate(()=>__kitchen.combustion.manualCount),1);
const tests=await page.evaluate(()=>{
 const k=__kitchen,c=k.combustion,p=k.props;
 if(c.swivel.parent!==c.drive || c.hinge.parent!==c.swivel || c.outlet.parent!==c.hinge)
   throw Error('Disconnected injector joint');
 const advance=seconds=>{for(let i=0;i<Math.ceil(seconds*120);i++)c.update(1/120)};
 c.inject();advance(.25);
 if(c.jet.visible || !c.arm.visible) throw Error('Injector must deploy before flowing');
 const swivelAngle=c.swivel.rotation.y, hingeAngle=c.hinge.rotation.z;
 advance(.65);
 if(c.swivel.rotation.y===swivelAngle || c.hinge.rotation.z===hingeAngle || !c.jet.visible)
   throw Error('Injector did not articulate into position');
 const target=c.origin.clone();target.y+=.045;
 if(c.jet.localToWorld(target.clone().set(0,-1,0)).distanceTo(target)>.001)
   throw Error('Jet misses the flame');
 advance(2);
 if(c.arm.visible || c.jet.visible) throw Error('Injector did not stow after manual pulse');
 const pan=p.bodies.find(b=>b.name==='pan'),egg=p.bodies.find(b=>b.name==='friedEgg');
 if(!k.kitchen.pan.getObjectByName('Mesh_42')) throw Error('Missing imported pan');
 if (k.RIG.landing.pos.y-k.RIG.landing.look.y<.9) throw Error('Overhead camera regression');
 const y0=[pan.body.position.y,egg.body.position.y];
 k.selectScenario('iss',true);
 advance(.9);
 if(!c.jet.visible) throw Error('Missing orbital injection');
 advance(2);
 if(c.arm.visible) throw Error('Arm stayed on screen between orbital pulses');
 const shell=k.scene.getObjectByName('Lab shell');
 shell.updateMatrixWorld(true);
 shell.traverse(o=>{
   if (!o.isMesh) return;
   const pos=o.geometry.attributes.position, v=k.camera.position.clone();
   for (let i=0;i<pos.count;i++) {
     if (v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).z < -2.841)
       throw Error('Lab geometry extends through the porthole wall');
   }
 });
 p.fire(9.81,0);p.R=1e5;
 for(let i=0;i<120;i++)p.update(1/120,i/120);
 const floated=[pan.body.position.y-y0[0],egg.body.position.y-y0[1]];
 const autoBefore=c.autoCount;
 for(let i=0;i<720;i++)c.update(1/120);
 const auto=c.autoCount>autoBefore;
 c.fuel=.2;
 const oil=p.bodies.find(b=>b.name==='oil');
 const d=c.origin.clone();d.y+=.04;
 const drop={mesh:new oil.mesh.constructor(c.dropGeo,c.dropMat),velocity:d.clone().set(0,0,0),age:0,g:0};
 drop.mesh.position.copy(d);k.scene.add(drop.mesh);c.drops.push(drop);c.update(1/120);
 const refuel=c.fuel>.3;
 c.fuel=0;const extinguished=c.update(1/120)===0;
 c.fuel=1;
 k.snap(k.RIG.orbital);k.pages.show('observe');
 return {floated,auto,refuel,extinguished,orbital:k.orbital.visible,children:k.orbital.children.length,finite:p.bodies.every(b=>b.body.position.toArray().every(Number.isFinite))};
});
console.log(tests);
assert(tests.floated.every(x=>x>.025));assert(tests.auto&&tests.refuel&&tests.extinguished&&tests.orbital&&tests.finite);
await page.waitForFunction(()=>__kitchen.camera.position.distanceTo(__kitchen.RIG.orbital.pos)<.04);
await page.waitForFunction(()=>!__kitchen.combustion.arm.visible);
await page.screenshot({path:'Flame_in_Freefall_2026/09_assets/landing_lab/orbital.png'});
await page.keyboard.press('o');
await page.waitForFunction(()=>__kitchen.combustion.jet.visible);
await page.screenshot({path:'Flame_in_Freefall_2026/09_assets/landing_lab/orbital-injection.png'});
await page.click('[data-slug="earth"]');
await page.waitForFunction(()=>!__kitchen.orbital.visible);
await page.waitForFunction(()=>__kitchen.camera.position.distanceTo(__kitchen.RIG.cook.pos)<.04);
const cap=await page.evaluate(()=>{
 const k=__kitchen, v=k.scene.getObjectByName('O2_press_cap').getWorldPosition(k.camera.position.clone()).project(k.camera);
 return {x:(v.x+1)*550,y:(1-v.y)*325,count:k.combustion.manualCount};
});
await page.mouse.click(cap.x,cap.y);
assert.equal(await page.evaluate(()=>__kitchen.combustion.manualCount),cap.count+1);
const droplets=await page.evaluate(()=>{
 const k=__kitchen,c=k.combustion,p=k.props,oil=p.bodies.find(b=>b.name==='oil');
 p.held=oil; p.target=oil.mesh.position.clone(); p.grab.set(0,0,0);
 c.releaseTimer=0;
 p.update(1/60,0);c.update(1/60);
 const manual=c.drops.length>0;
 p.up();c.spillTimer=1.8;c.space=false;c.fuel=.2;
 for(let i=0;i<360;i++){p.update(1/120,i/120);c.update(1/120);}
 return {manual,refilled:c.fuel>.3};
});
console.log('Oil tests',droplets);assert(droplets.manual&&droplets.refilled);
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'Flame_in_Freefall_2026/09_assets/landing_lab/mobile.png'});
assert.deepEqual(errors,[]);
console.log('PASS physical pan/egg, oxygen button, automatic oxygen, fuel consumption/refill, orbital enter/exit, no browser errors');
}finally{await browser?.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1});

