import * as THREE from 'three';

// ponytail: illustrative resource budgets and ballistic droplets, replace with validated
// transport/combustion data before interpreting sizes or times as measurements.
export class Combustion {
  constructor(scene, camera, canvas, origin, props) {
    this.origin = origin;
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
    this.reach=0;
    this.pending=false;
    this.buttonTravel=0;
    props.onSpill = () => { this.spillTimer = 1.8; };
    this.status = document.getElementById('combustion-status');
    document.addEventListener('keydown',e=>{
      if (!e.repeat && e.key.toLowerCase()==='o' && !e.ctrlKey && !e.metaKey && !e.altKey
          && !e.target.closest('input, textarea, select, [contenteditable="true"]')) this.inject();
    });
    const ray = new THREE.Raycaster();
    canvas.addEventListener('pointerdown',e=>{
      const rect=canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
      if (this.control && ray.intersectObject(this.control,true).length) this.inject();
    });
  }
  mountArm(model) {
    this.arm=model;
    this.arm.visible=false;
    this.shoulder=model.getObjectByName('Shoulder');
    this.elbow=model.getObjectByName('Elbow');
    this.wrist=model.getObjectByName('Wrist');
    this.outlet=model.getObjectByName('Outlet');
    const cone=new THREE.ConeGeometry(.039,1,12,1,true).translate(0,-.5,0);
    this.jet=new THREE.Mesh(cone,new THREE.MeshBasicMaterial({
      color:0x9ad3e2,transparent:true,opacity:.22,depthWrite:false
    }));
    this.jet.visible=false;
    this.outlet.add(this.jet);
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
  updateArm(dt) {
    if (!this.arm) return;
    this.buttonTravel=Math.max(0,this.buttonTravel-dt);
    this.pulse=Math.max(0,this.pulse-dt);
    const previous=this.reach;
    this.reach=THREE.MathUtils.clamp(previous+(this.pending || this.pulse>0 ? dt : -dt)/.85,0,1);
    this.arm.visible=this.reach>0;
    if (previous!==this.reach) {
      const t=THREE.MathUtils.smoothstep(this.reach,0,1);
      this.arm.position.x=(1-t)*1.7;
      this.shoulder.rotation.z=THREE.MathUtils.degToRad(-82+57*t);
      this.elbow.rotation.z=THREE.MathUtils.degToRad(162-112*t);
      this.wrist.rotation.z=THREE.MathUtils.degToRad(-90+95*t);
    }
    if (this.pending && this.reach===1 && this.pulse===0) {
      this.pending=false;
      this.oxygen=Math.min(1.6,this.oxygen+.75);
      this.pulse=1;
      const target=this.origin.clone();
      target.y+=.045;
      this.outlet.worldToLocal(target);
      this.jet.scale.y=target.length();
      this.jet.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),target.normalize());
      this.status.textContent='Oxygen injected';
    }
    this.jet.visible=this.pulse>0;
  }
  release(oil, g, scripted) {
    if (this.drops.length>=48) return;
    const mesh = new THREE.Mesh(this.dropGeo,this.dropMat);
    mesh.position.copy(oil.mesh.localToWorld(new THREE.Vector3(0,.12,0)));
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
