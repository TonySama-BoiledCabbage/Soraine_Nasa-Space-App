import * as THREE from './vendor/three.module.js';
import {makePlanet} from './planet-materials.mjs';
import {makeMicrogravityScene} from './microgravity-scene.mjs';
export function createGlobe(host,world){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let renderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return {paused:true,zoom(){},reset(){},dispose(){}}}
 const touchDevice=matchMedia('(pointer: coarse)').matches;
 const compact=touchDevice||matchMedia('(max-width: 760px)').matches;
 renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1.25:1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;host.replaceChildren(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(0,.12,5.8);const group=new THREE.Group();group.rotation.z=world==='Microgravity'?0:.15;scene.add(group);
 const loader=new THREE.TextureLoader(),textures=[];let disposed=false;
 const load=(name,colorSpace=THREE.SRGBColorSpace)=>{const asset=compact?name.replace(/\.(png|jpg)$/, '-mobile.webp'):name;const texture=loader.load(new URL('./assets/'+asset,import.meta.url).href,()=>{if(!disposed)draw()});texture.colorSpace=colorSpace;texture.wrapS=THREE.RepeatWrapping;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),compact?4:8);textures.push(texture);return texture};
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
 let paused=reduced.matches,frame=null,previous=0,drag=false,lastX=0,lastY=0,visible=true,pointer=null,zoomDistance=5.8;
 function fitCamera(){camera.position.z=zoomDistance*Math.max(1,1/camera.aspect)}
 function resize(){if(disposed)return;const w=host.clientWidth,h=host.clientHeight;if(w<1||h<1)return;camera.aspect=w/h;fitCamera();camera.updateProjectionMatrix();renderer.setSize(w,h,false);draw()}
 function draw(){if(disposed)return;renderer.render(scene,camera)}
 function schedule(){if(!disposed&&visible&&!document.hidden&&!paused&&frame===null)frame=requestAnimationFrame(animate)}
 function animate(t){frame=null;if(disposed||!visible||document.hidden||paused)return;if(t-previous>=(touchDevice?42:33)){const dt=Math.min((t-previous)/1000,.05);previous=t;if(!drag){if(lab)lab.tick(dt);else{sphere.rotation.y+=dt*.025;orbitPhase=(orbitPhase+dt*.075)%(Math.PI*2);placeMarker();}draw()}}schedule()}
 function stop(){if(frame!==null)cancelAnimationFrame(frame);frame=null;previous=0}
 const visibility=()=>{if(document.hidden)stop();else schedule()};
 document.addEventListener('visibilitychange',visibility);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();else stop()});intersection.observe(host);
 const observer=new ResizeObserver(resize);observer.observe(host);
 // Horizontal touch drags rotate; vertical gestures remain native page scrolling.
 const down=e=>{if(!e.isPrimary||e.button!==0)return;pointer=e.pointerId;drag=e.pointerType!=='touch';lastX=e.clientX;lastY=e.clientY;if(drag)host.setPointerCapture(e.pointerId)};
 const move=e=>{if(e.pointerId!==pointer)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(!drag){if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;if(Math.abs(dy)>=Math.abs(dx)){pointer=null;return}drag=true;host.setPointerCapture(e.pointerId)}group.rotation.y+=dx*.007;if(e.pointerType!=='touch')group.rotation.x=THREE.MathUtils.clamp(group.rotation.x+dy*.004,-.7,.7);lastX=e.clientX;lastY=e.clientY;draw()};
 const up=e=>{if(e.pointerId!==pointer)return;if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId);pointer=null;drag=false};
 host.addEventListener('pointerdown',down);host.addEventListener('pointermove',move);host.addEventListener('pointerup',up);host.addEventListener('pointercancel',up);host.addEventListener('lostpointercapture',up);
 const onMotion=()=>{paused=reduced.matches;if(paused)stop();else schedule();draw();host.dispatchEvent(new CustomEvent('rotationchange',{detail:paused}))};reduced.addEventListener('change',onMotion);resize();schedule();
 return {get paused(){return paused},set paused(value){paused=value;if(paused)stop();else schedule();draw()},zoom(amount){zoomDistance=THREE.MathUtils.clamp(zoomDistance+amount,4.3,7.8);fitCamera();draw()},reset(){group.rotation.set(0,0,lab?0:.15);lab?.reset();zoomDistance=5.8;fitCamera();draw()},dispose(){disposed=true;stop();observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',onMotion);host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',up);host.removeEventListener('pointercancel',up);host.removeEventListener('lostpointercapture',up);scene.traverse(obj=>{obj.geometry?.dispose();if(obj.material)obj.material.dispose()});textures.forEach(t=>t.dispose());renderer.dispose();renderer.forceContextLoss()}};
}
