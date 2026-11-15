import * as THREE from './vendor/three.module.js';
import {makePlanet} from './planet-materials.mjs';
export function createGlobe(host,world){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let renderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return {paused:true,zoom(){},reset(){},dispose(){}}}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;host.replaceChildren(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(0,.12,5.8);const group=new THREE.Group();group.rotation.z=.15;scene.add(group);
 const loader=new THREE.TextureLoader(),textures=[];let disposed=false;
 const load=(name,colorSpace=THREE.SRGBColorSpace)=>{const texture=loader.load(new URL('./assets/'+name,import.meta.url).href,()=>{if(!disposed)draw()});texture.colorSpace=colorSpace;texture.wrapS=THREE.RepeatWrapping;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);textures.push(texture);return texture};
 const {material,atmosphere}=makePlanet({world,load});
 const sphere=new THREE.Mesh(new THREE.SphereGeometry(1.6,96,64),material);group.add(sphere);sphere.rotation.y=world==='Moon'?-1.45:world==='Mars'?-.55:1.8;
 if(atmosphere)group.add(atmosphere);
 scene.add(new THREE.AmbientLight(0xffffff,world==='Moon'?.065:.10));const sun=new THREE.DirectionalLight(0xfff8f0,3.1);sun.position.set(-3,1.8,2.7);scene.add(sun);const fill=new THREE.DirectionalLight(world==='Mars'?0xd49670:0xabc4e0,.08);fill.position.set(4,-1,3);scene.add(fill);
 const grid=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.66,2)),new THREE.LineBasicMaterial({color:0x94cbd5,transparent:true,opacity:.025}));group.add(grid);
 const rings=new THREE.Group();rings.rotation.z=-.38;rings.rotation.x=.72;scene.add(rings);const nodes=[];
 for(let i=0;i<4;i++){const points=[];const radius=1.98+i*.18;for(let j=0;j<=150;j++){const a=j/150*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*radius,Math.sin(a)*radius,0))}const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:i===0?0xa7d6d8:0x638792,transparent:true,opacity:i===0?.34:.14}));line.rotation.y=i*.2;line.rotation.x=i*.12;rings.add(line);for(let n=0;n<3;n++){const node=new THREE.Mesh(new THREE.SphereGeometry(.018,7,7),new THREE.MeshBasicMaterial({color:i===1?0xe0b57b:0xc5f5df}));rings.add(node);nodes.push({node,radius,phase:n*2.1+i*.7,tilt:i*.12})}}
 let seed=789;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);const positions=[];for(let i=0;i<380;i++){positions.push((rand()-.5)*18,(rand()-.5)*14,-4-rand()*7)}const starsGeo=new THREE.BufferGeometry();starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));scene.add(new THREE.Points(starsGeo,new THREE.PointsMaterial({color:0xc8e0e4,size:.018,transparent:true,opacity:.65})));
 let paused=reduced.matches,rotation=0,frame,previous=0,drag=false,lastX=0,lastY=0;
 function resize(){if(disposed)return;const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,Math.max(h,1),false);draw()}
 function draw(){if(disposed)return;for(const {node,radius,phase,tilt} of nodes){const a=phase+rotation*.55;node.position.set(Math.cos(a)*radius,Math.sin(a)*radius,Math.sin(a)*tilt)}renderer.render(scene,camera)}
 function animate(t){if(disposed)return;frame=requestAnimationFrame(animate);if(document.hidden)return;if(t-previous<33)return;const dt=Math.min((t-previous)/1000,.05);previous=t;if(!paused&&!drag){sphere.rotation.y+=dt*.025;grid.rotation.y+=dt*.025;rotation+=dt*.08;draw()}}
 const observer=new ResizeObserver(resize);observer.observe(host);
 const down=e=>{if(e.pointerType==='touch')return;drag=true;lastX=e.clientX;lastY=e.clientY;host.setPointerCapture(e.pointerId)};
 const move=e=>{if(!drag)return;group.rotation.y+=(e.clientX-lastX)*.007;group.rotation.x=THREE.MathUtils.clamp(group.rotation.x+(e.clientY-lastY)*.004,-.7,.7);lastX=e.clientX;lastY=e.clientY;draw()};
 const up=()=>drag=false;host.addEventListener('pointerdown',down);host.addEventListener('pointermove',move);host.addEventListener('pointerup',up);host.addEventListener('pointercancel',up);
 const onMotion=()=>{paused=reduced.matches;draw()};reduced.addEventListener('change',onMotion);resize();frame=requestAnimationFrame(animate);
 return {get paused(){return paused},set paused(value){paused=value;draw()},zoom(amount){camera.position.z=THREE.MathUtils.clamp(camera.position.z+amount,4.3,7.8);draw()},reset(){group.rotation.set(0,0,.15);camera.position.z=5.8;draw()},dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();reduced.removeEventListener('change',onMotion);host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',up);host.removeEventListener('pointercancel',up);scene.traverse(obj=>{obj.geometry?.dispose();if(obj.material)obj.material.dispose()});textures.forEach(t=>t.dispose());renderer.dispose();renderer.forceContextLoss()}};
}
