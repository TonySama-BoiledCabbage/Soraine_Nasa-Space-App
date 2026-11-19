import * as THREE from 'three';
import { Channel, spring, easeInCubic, easeInOutSine, kick } from './motion.js?v=motion-1';

// ponytail: illustrative resource budgets and ballistic droplets, replace with validated
// transport/combustion data before interpreting sizes or times as measurements.
export class Combustion {
  constructor(scene, camera, canvas, origin, props) {
    this.origin = origin;
    this.camera = camera;
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.sleeveAnchor = new THREE.Vector3();
    this.props = props;
    this.fuel = 1;
    this.oxygen = 1;
    this.space = false;
    this.pulse = 0;
    this.autoTimer = 0;
    this.manualCount = 0;
    this.autoCount = 0;
    this.drops = [];
    this.spillTimer = 0;
    this.releaseTimer = 0;
    this.autoInterval = 5;
    this.scene = scene;
    this.dropGeo = new THREE.SphereGeometry(.012,8,6);
    this.dropMat = new THREE.MeshStandardMaterial({color:0xc68820,roughness:.25});
    this.reach=0;          // slide-in progress (eased; briefly > 1 during the settle overshoot)
    this.pending=false;
    // Arm choreography: slide in, unfold the swivel, then aim the gun, each overlapping the last
    // and settling with a small overshoot. Stowing runs the other way round.
    this.slide=new Channel(0); this.unfold=new Channel(0); this.aim=new Channel(0);
    this.deploying=false; this.kickT=Infinity;
    this.buttonTravel=0;
    props.onSpill = () => { this.spillTimer = 1.8; };
    this.status = document.getElementById('combustion-status');
    document.addEventListener('keydown',e=>{
      if (this.canInteract?.() === false) return;
      if (!e.repeat && e.key.toLowerCase()==='o' && !e.ctrlKey && !e.metaKey && !e.altKey
          && !e.target.closest('input, textarea, select, [contenteditable="true"]')) this.inject();
    });
    const ray = new THREE.Raycaster();
    canvas.addEventListener('pointerdown',e=>{
      if (this.canInteract?.() === false) return;
      const rect=canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
      if (this.control && ray.intersectObject(this.control,true).length) this.inject();
    });
  }
  mountArm(model) {
    this.arm=model;
    this.arm.visible=false;
    this.drive=model.getObjectByName('Horizontal_drive');
    this.sleeve=model.getObjectByName('Rear_sleeve');
    this.swivel=model.getObjectByName('Vertical_swivel');
    this.hinge=model.getObjectByName('Gun_hinge');
    this.outlet=model.getObjectByName('Outlet');
    const cone=new THREE.ConeGeometry(.039,1,12,1,true).translate(0,-.5,0);
    this.jet=new THREE.Mesh(cone,new THREE.MeshBasicMaterial({
      color:0x9ad3e2,transparent:true,opacity:.22,depthWrite:false
    }));
    this.jet.visible=false;
    this.outlet.add(this.jet);
  }
  frameArm() {
    if (!this.arm?.visible) return;
    this.camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    // The sleeve travels along world +X. Find where that rail exits the current lens,
    // allowing for the thickness of the casing and for the folded head during travel.
    const anchor=this.sleeveAnchor.copy(this.drive.position).add(this.sleeve.position);
    let exit=Infinity;
    for (const plane of this.frustum.planes) {
      if (plane.normal.x<0) exit=Math.min(exit,(plane.distanceToPoint(anchor)+.17)/-plane.normal.x);
    }
    this.arm.position.x=(1-this.reach)*(Math.max(0,exit)+1.6)+this.recoilX();
    // Keep even the front edge of the rear plug beyond the lens boundary.
    this.sleeve.scale.x=Math.max(1,(exit-this.arm.position.x)/.28);
  }
  setSpace(space) {
    if (space === this.space) return;
    this.space = space;
    this.autoTimer = 0;
    if (space) this.inject(true);
  }
  inject(auto=false) {
    if (!this.arm) return;
    this.pending=true;
    if (!auto) this.buttonTravel=.18;
    if (auto) this.autoCount++; else this.manualCount++;
    this.status.textContent = auto ? 'Automatic oxygen supply' : 'Oxygen requested';
  }
  // Timings (s): deploy is done by ~0.85 so a press or an orbital pulse flows within 0.9;
  // stowing takes ~0.75 after the 1 s pulse. Overshoot: slide ~3 % (a few cm), swivel ~12 %, gun ~16 %.
  planArm(deploy) {
    const {slide,unfold,aim}=this;
    if (deploy) {
      slide.go(1,{dur:.5,curve:spring(.72)});
      unfold.go(1,{delay:.2*(1-Math.min(1,slide.v)),dur:.5,curve:spring(.56)});
      aim.go(1,{delay:.2*(1-Math.min(1,slide.v))+.15*(1-Math.min(1,unfold.v)),dur:.5,curve:spring(.5)});
    } else {
      aim.go(0,{dur:.3,curve:easeInOutSine});
      unfold.go(0,{delay:.1*Math.min(1,aim.v),dur:.35,curve:easeInOutSine});
      slide.go(0,{delay:.25*Math.min(1,Math.max(aim.v,unfold.v)),dur:.5,curve:easeInCubic});
    }
  }
  recoilX() { return .014*kick(this.kickT,18,9); }
  updateArm(dt) {
    if (!this.arm) return;
    this.buttonTravel=Math.max(0,this.buttonTravel-dt);
    this.pulse=Math.max(0,this.pulse-dt);
    this.kickT+=dt;
    const want=this.pending || this.pulse>0;
    if (want!==this.deploying) { this.deploying=want; this.planArm(want); }
    this.reach=this.slide.update(dt);
    const unfold=this.unfold.update(dt), aim=this.aim.update(dt);
    this.arm.visible=want || this.reach>1e-3;
    this.swivel.rotation.y=THREE.MathUtils.degToRad(-77*(1-unfold));
    this.hinge.rotation.z=THREE.MathUtils.degToRad(-48+63.5*aim-5*kick(this.kickT));
    this.frameArm();
    const deployed=this.slide.done && this.unfold.done && this.aim.done;
    if (this.pending && deployed && this.pulse===0) {
      this.pending=false;
      this.oxygen=Math.min(1.6,this.oxygen+.75);
      this.pulse=1;
      this.kickT=0;
      this.status.textContent='Oxygen injected';
    }
    this.jet.visible=this.pulse>0;
    // The gun recoils while it fires, so re-aim the jet at the flame every frame.
    if (this.jet.visible) {
      const target=this.origin.clone();
      target.y+=.045;
      this.outlet.worldToLocal(target);
      this.jet.scale.y=target.length();
      this.jet.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),target.normalize());
    }
  }
  release(oil, g, scripted) {
    if (this.drops.length>=48) return;
    const mesh = new THREE.Mesh(this.dropGeo,this.dropMat);
    const nozzle = oil.mesh.getObjectByName('oilNozzle');
    if (nozzle) nozzle.getWorldPosition(mesh.position);
    else mesh.position.copy(oil.mesh.localToWorld(new THREE.Vector3(0,.12,0)));
    const aim = this.origin.clone().add(new THREE.Vector3(0,.04,0));
    // Scripted tipping is a narrated disturbance. Handheld releases follow the nozzle direction.
    let velocity = new THREE.Vector3(0,.45,0).applyQuaternion(oil.mesh.quaternion);
    if (scripted) {
      const flight=.35;
      velocity=aim.sub(mesh.position).divideScalar(flight);
      velocity.y+=g*flight/2;
    }
    this.scene.add(mesh);
    this.drops.push({mesh,velocity,age:0,g});
  }
  update(dt) {
    const oil=this.props.bodies.find(b=>b.name==='oil');
    this.autoTimer+=dt;
    if (this.space && this.autoTimer>=this.autoInterval) {
      this.autoTimer=0; this.inject(true);
    }
    this.updateArm(dt);
    this.spillTimer=Math.max(0,this.spillTimer-dt);
    this.releaseTimer-=dt;
    if (oil && this.releaseTimer<=0 && (this.props.held===oil || this.spillTimer>0)) {
      this.release(oil,this.space?0:this.props.gOf(oil),this.spillTimer>0);
      this.releaseTimer=.20;
    }
    for (let i=this.drops.length-1;i>=0;i--) {
      const d=this.drops[i];
      d.age+=dt; d.velocity.y-=d.g*dt;
      d.mesh.position.addScaledVector(d.velocity,dt);
      const received=d.mesh.position.distanceTo(this.origin.clone().add(new THREE.Vector3(0,.04,0)))<.13;
      if (received) this.fuel=Math.min(2,this.fuel+.12);
      if (received || d.age>5 || d.mesh.position.y<.02) {
        this.scene.remove(d.mesh); this.drops.splice(i,1);
      }
    }
    // Default burner reservoir lasts several minutes. Incoming droplets refill it.
    this.fuel=Math.max(0,this.fuel-dt*.0035);
    this.oxygen=Math.max(0,this.oxygen-dt*(this.space?.075:.015));
    if (!this.space) this.oxygen=Math.max(.8,this.oxygen);
    return Math.min(1,this.fuel*3,this.oxygen*3)*(1+Math.max(0,this.fuel-1)*.65+this.pulse*.18);
  }
}
