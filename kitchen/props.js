// Loose props on a real rigid-body sim (cannon-es): collisions between props and with the counters,
// Coulomb friction (so sliding resistance scales with g), stacking, tumbling.
//
// Gravity is per body: world.gravity is zero and each body gets m·g from whichever scenario has swept it.
// The scan front gives every prop the SAME small kick (a disturbance, like the camera jolt). What gravity does
// with that kick is the feedback: a rattle on Earth, a hop on the Moon, a slow drift away in microgravity.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const TOP_HOB = 0.94, TOP_WOOD = 0.96;
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
const MAT = {
  white: mat(0xf2efe8), steel: mat(0xb8bcc0, { roughness: 0.35, metalness: 0.8 }), dark: mat(0x2e2d2c, { roughness: 0.5 }),
  wood: mat(0xb98a5a), woodDark: mat(0x8e6540), egg: mat(0xf3e6d0, { roughness: 0.6 }), tomato: mat(0xd2432c, { roughness: 0.45 }),
  glass: mat(0x9d672f, { roughness: 0.22 }),
  mug: mat(0x5b7fa3, { roughness: 0.5 }), black: mat(0x1d1c1b, { roughness: 0.4 }),
  steel: mat(0xc9ccd0, { roughness: 0.28, metalness: 0.9 })
};

// Every spot below projects inside the cook camera's frame and clear of the UI (checked with the camera rig).
// [name, shape, dims, material, x, z, surfaceY, yawDeg, mass kg]
// [name, shape, dims, look, x, z, surfaceY, yawDeg, mass kg, physical material]
// Masses are everyday estimates (not weighed): board = oak 34x24x2 cm at ~700 kg/m^3; egg = a "large" egg ~57 g.
const SPEC = [
  ['oil',       'cyl', [0.035, 0.22],         'glass',   0.45, -0.30, TOP_HOB,  0, 0.50,  'glass'],
  ['board',     'box', [0.34, 0.02, 0.24],    'woodDark', 0.95, -0.05, TOP_WOOD, 8, 1.14,  'wood'],
  ['egg1',      'sph', [0.027],               'egg',     0.90, -0.08, TOP_WOOD + 0.02, 0, 0.057, 'eggshell'],
  ['egg2',      'sph', [0.027],               'egg',     0.99, -0.01, TOP_WOOD + 0.02, 0, 0.057, 'eggshell'],
  ['mug',       'cyl', [0.045, 0.095],        'mug',     0.80, -0.32, TOP_WOOD, 0, 0.32,  'ceramic'],
  ['tomato',    'sph', [0.034],               'tomato',  1.15, -0.28, TOP_WOOD, 0, 0.12,  'tomato'],
];

// Per-material surface factors. cannon-es combines two bodies' materials by MULTIPLYING friction and restitution,
// so each factor is ~sqrt of a typical dry pair coefficient: wood-on-wood ~0.5, steel-on-enamel ~0.35,
// egg-on-wood ~0.4, tomato skin grippy ~0.6. Textbook-range approximations, not measured values.
const PHYS = {
  wood:     { friction: 0.72, restitution: 0.45 },
  steel:    { friction: 0.60, restitution: 0.60 },
  glass:    { friction: 0.58, restitution: 0.55 },
  ceramic:  { friction: 0.62, restitution: 0.50 },
  eggshell: { friction: 0.60, restitution: 0.25 },
  tomato:   { friction: 0.85, restitution: 0.12 },
  enamel:   { friction: 0.60, restitution: 0.60 },   // hob top
  counter:  { friction: 0.72, restitution: 0.45 },   // wooden worktops
  castIron: { friction: 0.65, restitution: 0.50 },   // pan + trivet
  ground:   { friction: 0.90, restitution: 0.20 },
  // SORAINE shelf samples (demo estimates, same sqrt-of-pair convention): PET film on wood ~0.3, hard plastic ~0.35,
  // fabric ~0.6, cloth tape ~0.5; the cart's wire basket behaves like steel.
  film:     { friction: 0.55, restitution: 0.20 },
  plastic:  { friction: 0.60, restitution: 0.35 },
  fabric:   { friction: 0.80, restitution: 0.05 },
  tape:     { friction: 0.72, restitution: 0.15 },
};
const MATS = Object.fromEntries(Object.entries(PHYS).map(([k, v]) => [k, Object.assign(new CANNON.Material(k), v)]));

// cannon-es 0.20 quirks, calibrated in Node against the textbook slide distance v^2 / (2*mu*g):
//  - the solver clamps friction as a per-STEP impulse, so frictionGravity must carry the step size (x STEP);
//  - every contact point gets the full cap: a flat box rests on 4 points (/4 below);
//  - a cylinder makes ~2x a box's contacts (x0.5), a sphere just 1 (x4). Result: boxes and spheres within ~10%
//    of theory, cylinders within ~35% (tall ones rock while sliding).
const STEP = 1 / 120, FRICTION_SCALE = STEP / 4;
const SHAPE_CORR = { box: 1, rod: 1, rod2: 0.5, cyl: 0.5, sph: 4 };   // rod2 = 2 rows of 4 spheres = 8 contacts
const bodyMaterial = (phys, shapeKind) => {
  const m = new CANNON.Material(phys + ':' + shapeKind);
  m.friction = PHYS[phys].friction * SHAPE_CORR[shapeKind]; m.restitution = PHYS[phys].restitution; return m;
};

const KICK_UP = 0.28, KICK_OUT = 0.06;
// One air drag for every scenario (visual choice, higher than real air): it is what keeps a kicked prop in
// microgravity drifting ~0.8 m and slowing, instead of the old spring that pulled props back to their spot.
const LIN_DAMP = 0.3, ANG_DAMP = 0.3;
const VMAX = 1.6, WMAX = 12;          // solver safety: thin boxes can otherwise get launched out of a contact   // m/s, same for every scenario (visual disturbance, not a measured value)

export { STEP };
export class Props {
  constructor(scene, camera, canvas, flamePos, kitchen) {
    this.cam = camera; this.canvas = canvas; this.center = flamePos.clone(); this.scene = scene;
    this.gOld = 9.81; this.gNew = 9.81; this.R = 1e5;
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0), allowSleep: true });
    w.broadphase = new CANNON.SAPBroadphase(w);
    // cannon-es caps friction at mu * |frictionGravity| (falls back to world.gravity, which is zero here because
    // gravity is applied per body). Without this, every contact had zero friction. Updated each step in step().
    w.frictionGravity = new CANNON.Vec3(0, 9.81 * FRICTION_SCALE, 0);
    w.defaultContactMaterial.contactEquationStiffness = 1e7; w.defaultContactMaterial.contactEquationRelaxation = 3;
    w.solver.iterations = 12;

    // static colliders: the three counters, the pan + trivet stack, the ground
    const stat = (shape, x, y, z, m) => { const b = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: MATS[m] }); b.addShape(shape); b.position.set(x, y, z); w.addBody(b); };
    // Work surfaces, solid cabinet and recessed plinth match the Blender model.
    const fixedBox = (x,y,z,w,h,d,m) => stat(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2)),x,y,z,m);
    fixedBox(-.125,.92,0,1.47,.04,.92,'enamel');
    fixedBox(1.075,.94,0,.93,.04,.92,'counter');
    fixedBox(.335,.49,.009,2.37,.82,.908,'counter');
    fixedBox(.335,.04,0,2.28,.08,.80,'counter');
    // Use the visible grate transforms, including its rotated spokes and feet.
    kitchen?.trivet.updateWorldMatrix(true,true);
    for (const mesh of kitchen?.trivet.children || []) {
      const geo=mesh.geometry.parameters;
      const shape=new CANNON.Cylinder(geo.radiusTop,geo.radiusBottom,geo.height,8);
      const body=new CANNON.Body({mass:0,material:MATS.castIron});
      body.addShape(shape);
      body.position.copy(mesh.getWorldPosition(new THREE.Vector3()));
      body.quaternion.copy(mesh.getWorldQuaternion(new THREE.Quaternion()));
      w.addBody(body);
    }
    const ground = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: MATS.ground });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); w.addBody(ground);

    this.bodies = SPEC.map(([name, shape, dims, m, x, z, y0, yaw, mass, phys]) => {
      let geo, cs, half;
      if (shape === 'cyl') { const [r, h] = dims; geo = new THREE.CylinderGeometry(r, r, h, 20); cs = new CANNON.Cylinder(r, r, h, 12); half = h / 2; }
      else if (shape === 'box' && (name === 'knife' || name === 'chopstick')) {
        // thin box-vs-box contact is unstable in cannon-es; collide as a row of spheres instead, draw as a box
        const [sx, sy, sz] = dims; geo = new THREE.BoxGeometry(sx, sy, sz); half = sy / 2; cs = null;
        var rod = { n: 4, r: sy / 2, len: sx, rows: name === 'knife' ? 2 : 1, wide: sz };   // knife: 2 rows so the flat blade can't roll; chopstick: 1 row, it really rolls
      }
      else if (shape === 'box') { const [sx, sy, sz] = dims; geo = new THREE.BoxGeometry(sx, sy, sz); cs = new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)); half = sy / 2; }
      else { const [r] = dims; geo = new THREE.SphereGeometry(r, 20, 14); cs = new CANNON.Sphere(r); half = r; }
      const mesh = new THREE.Mesh(geo, MAT[m]); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = name;
      if (name === 'oil') {
        const spout=new THREE.Mesh(new THREE.CylinderGeometry(.009,.013,.045,10),MAT.steel);
        spout.position.y=.125; mesh.add(spout);
      }
      if (name.startsWith('egg')) mesh.scale.set(1, 1.25, 1);   // look like an egg, collide like a ball
      scene.add(mesh);
      const kind = cs ? shape : (rod.rows > 1 ? 'rod2' : 'rod');
      const body = new CANNON.Body({ mass, material: bodyMaterial(phys, kind), linearDamping: LIN_DAMP, angularDamping: ANG_DAMP, sleepSpeedLimit: 0.02, sleepTimeLimit: 0.6 });
      if (cs) body.addShape(cs);
      else for (let row = 0; row < rod.rows; row++) for (let i = 0; i < rod.n; i++) {
        const zr = rod.rows > 1 ? (row ? 1 : -1) * (rod.wide / 2 - rod.r) : 0;
        body.addShape(new CANNON.Sphere(rod.r), new CANNON.Vec3(-rod.len / 2 + rod.r + i * (rod.len - 2 * rod.r) / (rod.n - 1), 0, zr));
      }
      rod = undefined;
      body.position.set(x, y0 + half + 0.002, z);
      body.quaternion.setFromEuler(0, THREE.MathUtils.degToRad(yaw), 0);
      w.addBody(body);
      const rec = { name, mesh, body, phys, home: new THREE.Vector3(x, y0 + half, z), homeQ: body.quaternion.clone(), swept: true };
      body.addEventListener('collide', () => {});   // keeps contact events cheap but available for sound later
      return rec;
    });

    if (kitchen) {
      // Separate bodies let the egg leave the pan. A compound rim retains it at rest.
      const egg = new THREE.Group();
      kitchen.pan.add(egg);
      egg.add(kitchen.white, kitchen.yolk);
      scene.attach(egg);
      for (const [name,mesh,mass] of [['pan',kitchen.pan,.6],['friedEgg',egg,.06]]) {
        scene.attach(mesh);
        const body = new CANNON.Body({mass,material:bodyMaterial('castIron','cyl'),linearDamping:LIN_DAMP,angularDamping:ANG_DAMP});
        if (name === 'pan') {
          body.addShape(new CANNON.Cylinder(.14,.14,.008,20),new CANNON.Vec3(0,.004,0));
          for (let i=0;i<12;i++) {
            const a=i*Math.PI/6, q=new CANNON.Quaternion();
            q.setFromEuler(0,-a,0);
            body.addShape(new CANNON.Box(new CANNON.Vec3(.014,.018,.045)),new CANNON.Vec3(Math.cos(a)*.155,.022,Math.sin(a)*.155),q);
          }
          body.addShape(new CANNON.Box(new CANNON.Vec3(.14,.014,.014)),new CANNON.Vec3(.30,.045,0));
        } else body.addShape(new CANNON.Cylinder(.085,.085,.012,16),new CANNON.Vec3(0,.018,0));
        body.position.copy(mesh.position); w.addBody(body);
        this.bodies.push({name,mesh,body,home:mesh.position.clone(),homeQ:body.quaternion.clone(),swept:true});
      }
    }
    // pointer drag: a velocity spring toward the pointer, so the held prop still collides with everything
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this.plane = new THREE.Plane(); this.hit = new THREE.Vector3();
    this.held = null; this.grab = new THREE.Vector3();
    this.pending = null;
    this.canInteract = () => true;
    canvas.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', e => this.up(e)); addEventListener('pointercancel', () => this.up());
    addEventListener('blur', () => this.up());
    this.warm(1.0);   // settle into resting contact before the first frame
  }

  warm(seconds) { for (let i = 0; i < seconds / STEP; i++) { this.applyGravity(); this.world.step(STEP); } }

  setGravity(gOld, gNew, R) { this.gOld = gOld; this.gNew = gNew; this.R = R < 0 ? 1e5 : R; for (const b of this.bodies) { b.swept = true; b.body.wakeUp(); } }
  fire(gOld, gNew) { this.recoverLost(); this.gOld = gOld; this.gNew = gNew; this.R = 0; for (const b of this.bodies) b.swept = false; }

  gOf(b) { return b.swept ? this.gNew : this.gOld; }
  surface(phys, kind) { return bodyMaterial(phys, kind); }

  // Runtime bodies (SORAINE samples). colliders: [{ shape: CANNON.Shape, offset?, quaternion? }], kind keys SHAPE_CORR.
  // The record joins every existing loop (gravity, scan kick, drag, velocity clamp, mesh sync).
  addBody({ name, mesh, colliders, mass, phys, kind = 'box', position, quaternion, velocity, extra = {} }) {
    const body = new CANNON.Body({ mass, material: bodyMaterial(phys, kind), linearDamping: LIN_DAMP, angularDamping: ANG_DAMP, sleepSpeedLimit: 0.02, sleepTimeLimit: 0.6 });
    for (const c of colliders) body.addShape(c.shape, c.offset, c.quaternion);
    body.position.copy(position); if (quaternion) body.quaternion.copy(quaternion); if (velocity) body.velocity.copy(velocity);
    this.world.addBody(body);
    mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion);
    if (!mesh.parent) this.scene.add(mesh);
    const rec = { name, mesh, body, phys, home: new THREE.Vector3(position.x, position.y, position.z), homeQ: body.quaternion.clone(), swept: true, ...extra };
    this.bodies.push(rec);
    return rec;
  }
  removeBody(rec) {
    const i = this.bodies.indexOf(rec); if (i < 0) return false;
    if (this.held === rec || this.pending?.body === rec) { this.pending = null; this.held = null; this.canvas.style.cursor = ''; }
    this.bodies.splice(i, 1); this.world.removeBody(rec.body); rec.mesh.removeFromParent();
    return true;
  }
  applyGravity(step=STEP) {
    for (const b of this.bodies) {
      if (b === this.held) continue;
      b.body.force.y -= b.body.mass * this.gOf(b);
    }
    // friction scales with the gravity the props are under (weight presses them onto the surface);
    // during a sweep the larger of the two is used for the ~1 s both states coexist
    const anyOld = this.bodies.some(b => !b.swept);
    this.world.frictionGravity.set(0, (anyOld ? Math.max(this.gOld, this.gNew) : this.gNew) * FRICTION_SCALE * step/STEP, 0);
  }

  // Props that left the scene (fell to the ground, drifted > 3 m away) go back to their spot at the next switch.
  // Everything still on screen keeps its position: no snapping.
  recoverLost() {
    for (const b of this.bodies) {
      const p = b.body.position;
      const lost = p.y < b.home.y - 0.3 || Math.hypot(p.x - b.home.x, p.y - b.home.y, p.z - b.home.z) > 3;
      if (!lost || b === this.held || b.noRecover) continue;
      p.set(b.home.x, b.home.y + 0.002, b.home.z); b.body.quaternion.copy(b.homeQ);
      b.body.velocity.setZero(); b.body.angularVelocity.setZero(); b.body.wakeUp();
    }
  }

  cast(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
  }
  down(e) {
    if (!this.canInteract() || this.pending || this.held || e.button !== 0 || e.isPrimary === false) return;
    this.cast(e);
    const hit = this.ray.intersectObjects(this.bodies.map(b => b.mesh), true)[0];
    if (!hit) return;
    const b = this.bodies.find(x => x.mesh === hit.object || x.mesh.getObjectById(hit.object.id));
    if (!b || b.locked) return;
    // A press is only a candidate. Do not move the object or pour oil until
    // the pointer crosses the drag threshold.
    this.pending = { body: b, point: hit.point.clone(), x: e.clientX, y: e.clientY, id: e.pointerId };
    this.canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
  startDrag() {
    const { body: b, point } = this.pending;
    this.held = b; b.body.wakeUp();
    this.plane.setFromNormalAndCoplanarPoint(this.cam.getWorldDirection(new THREE.Vector3()).negate(), point);
    this.grab.copy(point).sub(b.mesh.position);
    this.target = point.clone();
    this.canvas.style.cursor = 'grabbing';
  }
  move(e) {
    if (this.pending && e.pointerId !== this.pending.id) return;
    if (this.pending && !this.held && Math.hypot(e.clientX - this.pending.x, e.clientY - this.pending.y) >= (e.pointerType === 'touch' ? 9 : 6)) this.startDrag();
    if (!this.held) return;
    this.cast(e);
    if (this.ray.ray.intersectPlane(this.plane, this.hit)) this.target = this.hit.clone();
  }
  up(e) {
    if (this.pending && e && e.pointerId !== this.pending.id) return;
    const inspect = this.pending && !this.held && e?.type === 'pointerup' && this.canInteract() ? this.pending.body : null;
    const pointerId = this.pending?.id;
    this.pending = null; this.held = null; this.canvas.style.cursor = '';
    if (pointerId !== undefined && this.canvas.hasPointerCapture?.(pointerId)) this.canvas.releasePointerCapture(pointerId);
    if (inspect) this.onInspect?.(inspect);
  }

  update(dt, time) {
    // scan front reaches a prop: same kick for everyone, gravity decides the outcome
    for (const b of this.bodies) {
      if (b.swept) continue;
      const p = b.body.position;
      const d = Math.hypot(p.x - this.center.x, p.y - this.center.y, p.z - this.center.z);
      if (d > this.R) continue;
      b.swept = true;
      if (b.name === 'oil' && this.gNew > 0) {
        b.body.quaternion.setFromEuler(0,0,Math.PI/2);
        b.body.velocity.set((this.center.x-p.x)*1.3,.10,(this.center.z-p.z)*1.3);
        this.onSpill?.(b);
      }
      const out = new THREE.Vector3(p.x - this.center.x, 0, p.z - this.center.z).normalize();
      const fall = 1 / (1 + d * 1.5);
      const j = new CANNON.Vec3(out.x * KICK_OUT * fall, KICK_UP * fall, out.z * KICK_OUT * fall).scale(b.body.mass);
      b.body.wakeUp();
      // Deliberate (kept by request): applyImpulse's point is RELATIVE to the centre of mass, so adding the world
      // position puts the lever arm ~1 m away -> the prop gets flicked into a spin and pops off the counter.
      b.body.applyImpulse(j, new CANNON.Vec3((Math.random() - 0.5) * 0.01, 0.004, (Math.random() - 0.5) * 0.01).vadd(b.body.position));
    }
    // dragged prop: drive velocity toward the pointer
    if (this.held) {
      const body = this.held.body, want = this.target.clone().sub(this.grab);
      if (this.held.name === 'oil') {
        const direction=this.center.clone().add(new THREE.Vector3(0,.04,0)).sub(this.held.mesh.position).normalize();
        const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
        body.quaternion.copy(q);
      }
      const v = want.sub(new THREE.Vector3(body.position.x, body.position.y, body.position.z)).multiplyScalar(14);
      if (v.length() > 5) v.setLength(5);
      body.velocity.set(v.x, v.y, v.z); body.angularVelocity.scale(0.9, body.angularVelocity);
    }
    // fixed-step integration, gravity reapplied every substep
    this.acc = (this.acc || 0) + Math.min(dt, 0.05);
    let n = 0;
    while (this.acc >= STEP && n < 8) {
      // Dragging can cover 4 cm per normal step, crossing the thin pan and grate.
      let substeps=this.held ? Math.min(16,Math.max(1,Math.ceil(this.held.body.velocity.length()*STEP/.003))) : 1;
      substeps=Math.max(substeps,this.minSubsteps||1);   // the moving cart asks for finer steps
      for(let i=0;i<substeps;i++) {
        this.onStep?.(STEP/substeps);                     // kinematic bodies (cart) set their velocity for this step
        this.applyGravity(STEP/substeps);
        this.world.step(STEP/substeps);
      }
      this.acc -= STEP; n++; this.simTime = (this.simTime || 0) + STEP;
      for (const b of this.bodies) {
        const v = b.body.velocity, w = b.body.angularVelocity, vm = b === this.held ? 5 : VMAX;
        if (v.length() > vm) v.scale(vm / v.length(), v);
        if (w.length() > WMAX) w.scale(WMAX / w.length(), w);
      }
    }
    for (const b of this.bodies) { b.mesh.position.copy(b.body.position); b.mesh.quaternion.copy(b.body.quaternion); }
  }
}
