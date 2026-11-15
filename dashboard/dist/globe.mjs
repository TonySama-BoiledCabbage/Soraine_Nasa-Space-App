import * as THREE from './vendor/three.module.js';
import {makePlanet} from './planet-materials.mjs';
import {makeMicrogravityScene} from './microgravity-scene.mjs';
export function createGlobe(host,world){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const status=document.createElement('div');status.dataset.globeStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 Object.assign(status.style,{position:'absolute',top:'40%',left:'50%',transform:'translateX(-50%)',width:'min(260px, 76%)',textAlign:'center',fontFamily:'inherit',fontSize:'12px',lineHeight:'1.6',color:'#c8cbd2',zIndex:'1',cursor:'default'});
 function showStatus(message,state='loading',retry){
  host.dataset.globeState=state;host.setAttribute('aria-busy',String(state==='loading'));status.replaceChildren();
  const text=document.createElement('span');text.textContent=message;status.append(text);
  if(retry){const button=document.createElement('button');button.type='button';button.textContent='Retry surface';Object.assign(button.style,{display:'block',margin:'12px auto 0',padding:'8px 12px',border:'1px solid #168bff80',color:'#80ceff',background:'#05070d'});button.addEventListener('pointerdown',e=>e.stopPropagation());button.addEventListener('click',e=>{e.stopPropagation();retry()});status.append(button)}
  if(status.parentNode!==host)host.append(status);
 }
 let renderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch(error){host.replaceChildren();showStatus('The 3D view is unavailable in this browser. Research data is still available.','error');throw error}
 const touchDevice=matchMedia('(pointer: coarse)').matches;
 const compact=touchDevice||matchMedia('(max-width: 760px)').matches;
 renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1.25:1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;host.replaceChildren(renderer.domElement);
 let surfaceReady=world==='Microgravity',initialized=false;renderer.domElement.style.visibility=surfaceReady?'visible':'hidden';
 if(!surfaceReady)showStatus(`Loading ${world} surface…`);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(0,.12,5.8);const group=new THREE.Group();group.rotation.z=world==='Microgravity'?0:.15;scene.add(group);
 const loader=new THREE.ImageLoader(),textures=[];let disposed=false;
 const primary=world==='Moon'?'moon-lroc.jpg':world==='Mars'?'mars-viking.jpg':'earth.png';
 const load=(name,colorSpace=THREE.SRGBColorSpace)=>{
  // A defined black night map avoids invented lights if that optional image fails.
  const placeholder=document.createElement('canvas');placeholder.width=placeholder.height=1;
  const context=placeholder.getContext('2d');context.fillStyle=name==='moon-normal.png'?'#8080ff':'#000';context.fillRect(0,0,1,1);
  const texture=new THREE.Texture(placeholder);texture.needsUpdate=true;texture.colorSpace=colorSpace;texture.wrapS=THREE.RepeatWrapping;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),compact?4:8);textures.push(texture);
  const small=name.replace(/\.(png|jpg)$/, '-mobile.webp');
  const preview=name==='earth.png'||name==='earth-night.png';
  const first=compact||preview?small:name;
  let loaded=false,generation=0;
  function request(asset,canFallback,upgrade=false){
   const attempt=++generation;
   loader.load(new URL('./assets/'+asset,import.meta.url).href,image=>{
    if(disposed||attempt!==generation)return;
    // WebGL2 texture storage is immutable: reallocate when leaving the 1px
    // fallback or upgrading the preview, while retaining material references.
    if(texture.image.width!==image.width||texture.image.height!==image.height)texture.dispose();
    texture.image=image;texture.needsUpdate=true;loaded=true;
    if(name===primary&&!surfaceReady){surfaceReady=true;host.dataset.globeState='ready';host.setAttribute('aria-busy','false');status.remove();renderer.domElement.style.visibility='visible'}
    draw();schedule();
    // Reuse the same texture and keep the preview visible during the quality upgrade.
    if(!compact&&preview&&asset===small)request(name,false,true);
   },undefined,()=>{
    if(disposed||attempt!==generation)return;
    if(canFallback){request(asset===small?name:small,false);return}
    if(loaded||upgrade)return;
    if(name===primary&&world!=='Microgravity')showStatus(`${world} imagery could not load. The research data is still available.`,'error',()=>{showStatus(`Loading ${world} surface…`);request(first,true)});
    else if(name==='earth-night.png')host.dataset.globeNight='unavailable';
   });
  }
  request(first,true);return texture;
 };
 const lab=world==='Microgravity'?makeMicrogravityScene({THREE,load}):null;
 let sphere;
 if(lab){group.add(lab.group);}else{
  const {material,atmosphere}=makePlanet({world,load});
  sphere=new THREE.Mesh(new THREE.SphereGeometry(1.6,compact?64:96,compact?40:64),material);group.add(sphere);sphere.rotation.y=world==='Moon'?-1.45:world==='Mars'?-.55:1.8;
  if(atmosphere)group.add(atmosphere);
 }
 // Decorative orbit guide. Thin geometry supplies the light falloff without a bloom pass.
 const orbit=new THREE.Group();orbit.visible=!lab;orbit.rotation.set(1.08,-.12,-.45);group.add(orbit);
 const orbitRadius=2.10,orbitSegments=compact?128:192;
 function orbitBand(radius,width,opacity,arc=Math.PI*2){
  const geometry=new THREE.TorusGeometry(radius,width,4,orbitSegments,arc);
  const vertices=geometry.getAttribute('position'),colors=new Float32Array(vertices.count*3);
  const dark=new THREE.Color(0x09264a),blue=new THREE.Color(0x168bff),cyan=new THREE.Color(0x00c7ff),color=new THREE.Color();
  for(let i=0;i<vertices.count;i++){
   const angle=Math.atan2(vertices.getY(i),vertices.getX(i));
   const glow=Math.pow((Math.cos(angle-1.1)+1)/2,2.5);
   color.copy(dark).lerp(blue,glow).lerp(cyan,Math.pow(glow,3)*.9);
   color.toArray(colors,i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const band=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
  band.renderOrder=2;orbit.add(band);return band;
 }
 orbitBand(orbitRadius,.025,.035);orbitBand(orbitRadius,.012,.10);orbitBand(orbitRadius,.0035,.88);
 // A quiet parallel arc makes the guide feel intentional without another full ring.
 const companion=orbitBand(orbitRadius+.075,.002,.24,Math.PI*.72);companion.rotation.z=.25;
 const orbitMarker=new THREE.Group();orbit.add(orbitMarker);
 const markerCore=new THREE.Mesh(new THREE.SphereGeometry(.017,12,8),new THREE.MeshBasicMaterial({color:0xa6eaff,toneMapped:false}));
 const markerGlow=new THREE.Mesh(new THREE.SphereGeometry(.037,12,8),new THREE.MeshBasicMaterial({color:0x168bff,transparent:true,opacity:.12,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
 markerGlow.renderOrder=3;orbitMarker.add(markerCore,markerGlow);
 let orbitPhase=1.05;const placeMarker=()=>orbitMarker.position.set(Math.cos(orbitPhase)*orbitRadius,Math.sin(orbitPhase)*orbitRadius,0);placeMarker();
 scene.add(new THREE.AmbientLight(0xffffff,world==='Moon'?.065:.10));const sun=new THREE.DirectionalLight(0xfff8f0,3.1);sun.position.set(-3,1.8,2.7);scene.add(sun);const fill=new THREE.DirectionalLight(world==='Mars'?0xd49670:0xabc4e0,.08);fill.position.set(4,-1,3);scene.add(fill);
 let seed=789;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);const positions=[];for(let i=0;i<380;i++){positions.push((rand()-.5)*18,(rand()-.5)*14,-4-rand()*7)}const starsGeo=new THREE.BufferGeometry();starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));scene.add(new THREE.Points(starsGeo,new THREE.PointsMaterial({color:0xcddfff,size:.018,transparent:true,opacity:.65})));
 let paused=reduced.matches,frame=null,previous=0,drag=false,lastX=0,lastY=0,visible=true,pointer=null,zoomDistance=5.8,targetDistance=5.8,resumeAt=0;
 function fitCamera(){camera.position.z=zoomDistance*Math.max(1,1/camera.aspect)}
 function resize(){if(disposed)return;const w=host.clientWidth,h=host.clientHeight;if(w<1||h<1)return;camera.aspect=w/h;fitCamera();camera.updateProjectionMatrix();renderer.setSize(w,h,false);draw()}
 function draw(){if(disposed||!initialized||!surfaceReady)return;renderer.render(scene,camera)}
 const isZooming=()=>Math.abs(targetDistance-zoomDistance)>.001;
 function schedule(){if(initialized&&surfaceReady&&!disposed&&visible&&!document.hidden&&(!paused||isZooming())&&frame===null)frame=requestAnimationFrame(animate)}
 function animate(t){
  frame=null;if(disposed||!visible||document.hidden)return;
  if(!previous)previous=t;
  // Zoom gets up to 60 fps; quiet background rotation stays capped near 30.
  const zooming=isZooming(),interval=zooming?1000/60:(touchDevice?42:33);
  if(t-previous>=interval){
   const dt=Math.min((t-previous)/1000,.05);previous=t;
   if(zooming){zoomDistance+=(targetDistance-zoomDistance)*(1-Math.exp(-10*dt));if(!isZooming())zoomDistance=targetDistance;fitCamera()}
   if(!paused&&!drag&&pointer===null&&t>=resumeAt){if(lab)lab.tick(dt);else{sphere.rotation.y+=dt*.06;orbitPhase=(orbitPhase+dt*.075)%(Math.PI*2);placeMarker()}}
   draw();
  }
  schedule();
 }
 function stop(){if(frame!==null)cancelAnimationFrame(frame);frame=null;previous=0}
 const visibility=()=>{if(document.hidden)stop();else schedule()};
 document.addEventListener('visibilitychange',visibility);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();else stop()});intersection.observe(host);
 const observer=new ResizeObserver(resize);observer.observe(host);
 // Horizontal touch drags rotate; vertical gestures remain native page scrolling.
 const down=e=>{if(!e.isPrimary||e.button!==0)return;pointer=e.pointerId;drag=e.pointerType!=='touch';lastX=e.clientX;lastY=e.clientY;if(drag)host.setPointerCapture(e.pointerId)};
 const move=e=>{if(e.pointerId!==pointer)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(!drag){if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;if(Math.abs(dy)>=Math.abs(dx)){pointer=null;return}drag=true;host.setPointerCapture(e.pointerId)}group.rotation.y+=dx*.007;if(e.pointerType!=='touch')group.rotation.x=THREE.MathUtils.clamp(group.rotation.x+dy*.004,-.7,.7);lastX=e.clientX;lastY=e.clientY;draw()};
 const up=e=>{if(e.pointerId!==pointer)return;if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId);pointer=null;drag=false;resumeAt=performance.now()+1400};
 host.addEventListener('pointerdown',down);host.addEventListener('pointermove',move);host.addEventListener('pointerup',up);host.addEventListener('pointercancel',up);host.addEventListener('lostpointercapture',up);
 function moveCamera(){if(reduced.matches){zoomDistance=targetDistance;fitCamera();draw()}else schedule()}
 const onMotion=()=>{paused=reduced.matches;stop();moveCamera();draw();host.dispatchEvent(new CustomEvent('rotationchange',{detail:paused}))};reduced.addEventListener('change',onMotion);initialized=true;if(surfaceReady){host.dataset.globeState='ready';host.setAttribute('aria-busy','false')}resize();schedule();
 return {get paused(){return paused},set paused(value){paused=!!value;stop();schedule();draw()},zoom(amount){if(!Number.isFinite(amount))return;targetDistance=THREE.MathUtils.clamp(targetDistance+amount,4.3,7.8);moveCamera()},reset(){group.rotation.set(0,0,lab?0:.15);lab?.reset();targetDistance=5.8;moveCamera();draw()},dispose(){disposed=true;stop();observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',onMotion);host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',up);host.removeEventListener('pointercancel',up);host.removeEventListener('lostpointercapture',up);scene.traverse(obj=>{obj.geometry?.dispose();if(obj.material)obj.material.dispose()});textures.forEach(t=>t.dispose());renderer.dispose();renderer.forceContextLoss()}};
}
