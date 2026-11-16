const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Yuntao Lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const base=path.resolve('Flame_in_Freefall_2026/10_webapp');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:860},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   let file=path.resolve(base,'.'+decodeURIComponent(url.pathname));
   if(file===base)file=path.join(base,'index.html');
   if(url.hostname!=='fixture.test'||!file.startsWith(base+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   await route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  await page.goto('http://fixture.test/?lite');
  await page.waitForFunction(()=>__kitchen.shelf.items.size===9);
  await page.click('#start');await page.waitForSelector('#shop-open:visible');
  const entry=await page.locator('#shop-open').boundingBox();
  assert(entry.x>1180&&entry.y>750&&entry.width>=44&&entry.height>=44,'Entry must be bottom right');
  await page.screenshot({path:'outputs/local-review/shop-entry.png'});
  await page.click('#shop-open');
  await page.waitForFunction(()=>__kitchen.shop.active&&__kitchen.camera.position.distanceTo(__kitchen.shop.rig().pos)<.02);
  await page.waitForTimeout(450);
  await page.screenshot({path:'outputs/local-review/shop-ux-desktop.png'});
  for(const q of ['comb','Ultem','P 213','Nomex']) {
   await page.fill('#sh-q',q);
   const matches=await page.evaluate(()=>__kitchen.shop.matches().map(p=>p.id));
   const visible=await page.evaluate(()=>[...__kitchen.shelf.items].filter(([,item])=>item.root.visible).map(([id])=>id));
   assert.deepEqual(visible,matches,'Search must change visible stock');
   assert(matches.length>0);
  }
  await page.fill('#sh-q','comb');await page.press('#sh-q','Enter');
  await page.waitForFunction(()=>__kitchen.shop.view==='product');
  assert.equal(await page.evaluate(()=>__kitchen.shop.focus.id),'ultem-1000');
  assert.equal(await page.locator('.sh-details').getAttribute('open'),null);
  await page.click('.sh-details > summary');
  assert(await page.locator('#sh-d-rows .sh-records').isVisible());
  await page.keyboard.press('Escape');
  await page.fill('#sh-q','zz-no-product');
  assert.equal(await page.evaluate(()=>[...__kitchen.shelf.items.values()].filter(it=>it.root.visible).length),0);
  assert((await page.locator('#sh-hint').textContent()).includes('No items'));
  await page.fill('#sh-q','glove');
  await page.tap('#sh-suggest [role=option]');
  await page.waitForFunction(()=>__kitchen.shop.focus?.id==='nomex-ht90'&&__kitchen.shop.view==='product');
  await page.keyboard.press('Escape');await page.fill('#sh-q','');await page.locator('#sh-q').blur();
  for(const [width,height] of [[375,812],[812,375],[768,1024]]) {
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.setViewportSize({width,height});
   await page.waitForFunction(()=>__kitchen.camera.position.distanceTo(__kitchen.shop.rig().pos)<.02);
   await page.waitForTimeout(450);
   const labels=await page.locator('.sh-hot-tip').evaluateAll(els=>els.map(el=>{
    const b=el.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom};
   }));
   await page.screenshot({path:'outputs/local-review/shop-ux-'+width+'.png'});
   for(const b of labels) assert(b.x>=0&&b.right<=width&&b.y>80&&b.bottom<height-65,'Label outside readable viewport '+JSON.stringify({width,height,b}));
   await page.screenshot({path:'outputs/local-review/shop-ux-'+width+'.png'});
   await page.click('.sh-hot[data-id="mylar-g"] .sh-hot-tip');
   await page.waitForFunction(()=>__kitchen.shop.view==='product'&&__kitchen.camera.position.distanceTo(__kitchen.shop.rig().pos)<.02);
   await page.waitForTimeout(450);
   await page.screenshot({path:'outputs/local-review/shop-product-'+width+'.png'});
   assert(await page.locator('#sh-cartfab').isVisible());
   await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS single bottom-right entry, visible search filtering, tap/keyboard search, persistent labels, progressive details, phone/landscape/tablet and reduced motion');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
