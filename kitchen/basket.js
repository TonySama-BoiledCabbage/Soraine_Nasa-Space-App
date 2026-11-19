// SORAINE hand basket: the user's basket GLB (models/shop/shopping-basket.glb) on a kinematic rigid body. The
// shopper "holds" it in front of the shelf view; samples drop in as ordinary props.js bodies. At checkout it is
// carried over the worktop and tipped out. Motion = velocity set every physics step toward a scripted pose, so
// contacts see real motion (no teleporting through the floor of the basket).
//
// Basket frame = the GLB's own frame (metres, Y up, base centre at the origin). Measured from the mesh: body
// x +/-0.211, z +/-0.147, wall top y 0.240; handles reach y 0.432 (not part of the collider).
// Sample states: loading (dropped in, settling) -> carried -> released (on the worktop, draggable).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildShape } from './shop-shapes.js?v=basket-1';

export const BASKET_URL = 'models/shop/shopping-basket.glb';
export const MAX_ITEMS = 12;
const RIM = 0.24;
const PIVOT = new THREE.Vector3(0, RIM, -0.147);                     // back rim edge: the pour hinge
const INSIDE = { x: 0.23, z: 0.17, y0: -0.03, y1: 0.62 };           // basket + drop-in space above the rim
const BASKET = { x: 0.215, z: 0.152, y0: -0.03, y1: RIM };          // strictly below the rim (pour result)
export const PARK = { x: 3.2, y: -4, z: 3.0, yaw: 0, tilt: 0 };     // out of sight while not shopping
// Over the right half of the worktop (x 0.61-1.54, z +/-0.46); the opening tips toward the back of the bench.
// The hinge (back rim) ends just inside the front edge (z 0.33), so samples spill back across the free front half.
export const BENCH = { x: 1.1, y: 1.0, z: 0.48, yaw: 0, tilt: 0 };
const POUR_TILT = THREE.MathUtils.degToRad(125);
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const rand = (a, b) => a + Math.random() * (b - a);

function poseMatrix(p, m = new THREE.Matrix4()) {
  const t = new THREE.Matrix4();
  m.makeTranslation(p.x, p.y, p.z);
  m.multiply(t.makeRotationY(p.yaw));
  m.multiply(t.makeTranslation(PIVOT.x, PIVOT.y, PIVOT.z));
  m.multiply(t.makeRotationX(-p.tilt));
  m.multiply(t.makeTranslation(-PIVOT.x, -PIVOT.y, -PIVOT.z));
  return m;
}

export class Basket {
  constructor({ scene, props, loader, getGravity, canAct }) {
    Object.assign(this, { scene, props, loader, getGravity, canAct: canAct || (() => true) });
    this.pose = { ...PARK };
    this.mode = 'parked';          // parked | held | moving | pouring
    this.anchor = null;            // held pose in front of the shelf camera (set by the shop)
    this.items = [];
    this.templates = new Map();
    this.anim = null; this.listeners = new Set();
    this.group = new THREE.Group(); this.group.name = 'SORAINE basket'; scene.add(this.group);
    this.model = null; this.modelStatus = 'loading';

    // allowSleep off: a sleeping kinematic body ignores the velocity set in step() and never leaves its spot
    const body = this.body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, material: props.surface('plastic', 'box'), allowSleep: false });
    const box = (hx, hy, hz, x, y, z) => body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), new CANNON.Vec3(x, y, z));
    box(0.205, 0.012, 0.141, 0, 0.004, 0);          // floor, top face at 0.016
    box(0.012, 0.13, 0.147, 0.199, 0.12, 0);        // end walls
    box(0.012, 0.13, 0.147, -0.199, 0.12, 0);
    box(0.211, 0.13, 0.012, 0, 0.12, 0.135);        // side walls
    box(0.211, 0.13, 0.012, 0, 0.12, -0.135);
    this.net = new CANNON.Box(new CANNON.Vec3(0.22, 0.01, 0.155)); this.netOn = false;   // cargo net, microgravity only
    this.applyPose(this.pose); props.world.addBody(body);
    this.netMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.31, 10, 8).rotateX(-Math.PI / 2).translate(0, RIM + 0.012, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, wireframe: true, transparent: true, opacity: 0.6 }));
    this.netMesh.visible = false; this.group.add(this.netMesh);
    props.onStep = (h) => this.step(h);
    this.ready = this.loadModel();
  }

  async loadModel() {
    try {
      const { scene: model } = await this.loader.loadAsync(BASKET_URL);
      model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      // the model's own handle pivots: folded down outside the walls while held (they would block the shelf),
      // raised while the basket is carried to the bench
      this.handles = [['HandleBackPivot', 2.6], ['HandleFrontPivot', -2.6]].map(([n, fold]) => ({ node: model.getObjectByName(n), fold })).filter(h => h.node);
      this.model = model; this.modelStatus = 'glb';
    } catch (e) {
      console.warn('Basket GLB unavailable, using placeholder', e);
      const g = new THREE.Group(), geo = new THREE.BoxGeometry(0.42, RIM, 0.29); geo.translate(0, RIM / 2, 0);
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1f6fd0 })));
      this.model = g; this.modelStatus = 'placeholder';
    }
    this.group.add(this.model); this.sync();
    return this.modelStatus;
  }
  sync(dt = 0) {
    this.group.position.copy(this.body.position); this.group.quaternion.copy(this.body.quaternion); this.group.visible = this.mode !== 'parked';
    const up = this.mode === 'moving' || this.mode === 'pouring';
    for (const h of this.handles || []) { const want = up ? 0 : h.fold; h.node.rotation.x = dt ? h.node.rotation.x + (want - h.node.rotation.x) * Math.min(1, dt * 5) : want; }
  }

  // ---------- kinematics ----------
  applyPose(p) {
    this.pose = { ...p };
    const m = poseMatrix(p), pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(pos, q, s);
    this.body.position.set(pos.x, pos.y, pos.z); this.body.quaternion.set(q.x, q.y, q.z, q.w);
    this.body.velocity.setZero(); this.body.angularVelocity.setZero();
  }
  step(h) {
    const a = this.anim;
    if (!a) { this.body.velocity.setZero(); this.body.angularVelocity.setZero(); return; }
    this.body.wakeUp();
    a.t = Math.min(a.dur, a.t + h);
    const k = a.ease(a.t / a.dur), p = {};
    for (const key of ['x', 'y', 'z', 'yaw', 'tilt']) p[key] = a.from[key] + (a.to[key] - a.from[key]) * (key === 'y' && a.curveY ? a.curveY(k) : k) + (key === 'y' ? (a.arc || 0) * Math.sin(Math.PI * k) : 0);
    this.pose = p;
    const m = poseMatrix(p), pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(pos, q, s);
    const b = this.body;
    b.velocity.set((pos.x - b.position.x) / h, (pos.y - b.position.y) / h, (pos.z - b.position.z) / h);
    const cur = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const d = q.clone().multiply(cur.invert());
    if (d.w < 0) { d.x = -d.x; d.y = -d.y; d.z = -d.z; d.w = -d.w; }
    const ang = 2 * Math.acos(Math.min(1, d.w)), sn = Math.sqrt(Math.max(1e-12, 1 - d.w * d.w));
    if (ang < 1e-7) b.angularVelocity.setZero(); else b.angularVelocity.set(d.x / sn * ang / h, d.y / sn * ang / h, d.z / sn * ang / h);
    if (a.t >= a.dur) { this.anim = null; this.props.minSubsteps = 1; a.done(); }
  }
  tween(to, dur, opts = {}) {
    return new Promise(done => {
      this.props.minSubsteps = 2;
      this.anim = { from: { ...this.pose }, to: { ...this.pose, ...to }, dur, t: 0, ease: opts.ease || ease, arc: opts.arc, curveY: opts.curveY, done };
    });
  }
  run(name, fn) {
    if (this.busy) return Promise.reject(new Error('The basket is busy.'));
    this.busy = name;
    return (async () => { try { return await fn(); } finally { this.busy = null; this.emit(); } })();
  }

  // ---------- held in front of the shelf ----------
  // The shop computes the anchor from its shelf camera; an empty, parked basket appears there directly,
  // a basket with samples is carried there.
  hold(anchor) {
    this.anchor = { ...anchor, tilt: 0 };
    if (this.busy) return;
    if (this.mode === 'parked' || !this.items.some(r => r.state !== 'released')) { this.anim = null; this.applyPose(this.anchor); this.mode = 'held'; this.sync(); this.emit(); return; }
    if (Math.hypot(this.pose.x - anchor.x, this.pose.y - anchor.y, this.pose.z - anchor.z) > 0.002) this.run('moving', async () => { await this.tween(this.anchor, 0.35); this.mode = 'held'; });
  }
  park() {
    if (this.busy || this.inCart().length) return false;
    this.anim = null; this.applyPose(PARK); this.mode = 'parked'; this.sync(); this.emit(); return true;
  }

  // ---------- samples ----------
  template(product) {
    if (!this.templates.has(product.id)) {
      const job = product.model.kind === 'glb'
        ? this.loadGlb(product).catch(e => { console.warn('Model unavailable, using placeholder:', product.model.url, e); return this.placeholder(product); })
        : Promise.resolve().then(() => buildShape(product));
      this.templates.set(product.id, job);
    }
    return this.templates.get(product.id);
  }
  // GLB at its own scale with its own materials; centred on the collider box, resting on its bottom face.
  async loadGlb(product) {
    const { scene: model } = await this.loader.loadAsync(product.model.url);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const d = product.collider.dims;
    if (Math.abs(size.x - d[0]) > 0.006 || Math.abs(size.z - d[2]) > 0.006 || size.y - d[1] > 0.006) console.warn(`${product.id}: collider ${d} vs model ${size.toArray().map(v => v.toFixed(3))}`);
    model.position.set(-ctr.x, -box.min.y - d[1] / 2, -ctr.z);
    const g = new THREE.Group(); g.add(model); g.name = product.id; g.userData.source = product.model.source;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  placeholder(product) {
    try { if (product.model.fallback) return buildShape({ ...product, model: { kind: 'procedural', build: product.model.fallback } }); } catch {}
    const g = new THREE.Group(), [x, y, z] = product.collider.dims;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(x, y, z), new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.8 })));
    return g;
  }
  colliders(product) {
    const [x, y, z] = product.collider.dims;
    return { kind: 'box', list: [{ shape: new CANNON.Box(new CANNON.Vec3(x / 2, Math.max(0.014, y) / 2, z / 2)) }] };
  }
  inCart() { return this.items.filter(r => r.state !== 'released'); }
  released() { return this.items.filter(r => r.state === 'released'); }
  count(productId) { return this.inCart().filter(r => r.product.id === productId).length; }
  matrix() { return poseMatrix(this.pose); }
  toLocal(v) { return v.clone().applyMatrix4(this.matrix().invert()); }
  inside(rec, B = INSIDE) {
    const p = this.toLocal(new THREE.Vector3().copy(rec.body.position));
    return Math.abs(p.x) < B.x && Math.abs(p.z) < B.z && p.y > B.y0 && p.y < B.y1;
  }
  spawnPoint(k) { return new THREE.Vector3(rand(-0.08, 0.08), RIM + 0.09 + 0.06 * (k % 4), rand(-0.05, 0.05)).applyMatrix4(this.matrix()); }

  async add(product) {
    if (this.mode !== 'held' || this.busy === 'pouring') throw new Error('The basket is not here.');
    if (!this.canAct()) throw new Error('Wait for the gravity scan to finish.');
    if (this.inCart().length >= MAX_ITEMS) throw new Error(`The basket holds up to ${MAX_ITEMS} samples.`);
    const tpl = await this.template(product);
    if (this.mode !== 'held' || this.inCart().length >= MAX_ITEMS) throw new Error('The basket is full or away.');
    const loading = this.items.filter(r => r.state === 'loading').length;
    const { kind, list } = this.colliders(product), g = this.getGravity();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand(-0.5, 0.5) + (product.collider.dims[2] > 0.25 ? Math.PI / 2 : 0), 0));
    const rec = this.props.addBody({
      name: 'sample:' + product.id, mesh: tpl.clone(true), colliders: list, kind, mass: product.phys.mass, phys: product.phys.surface,
      position: this.spawnPoint(loading), quaternion: q, velocity: new CANNON.Vec3(0, g < 0.5 ? -0.45 : -0.15, 0),
      extra: { product, state: 'loading', born: performance.now(), outside: 0, locked: true, noRecover: true, sample: true }
    });
    rec.mesh.userData.sample = true;
    this.items.push(rec); this.emit();
    return rec;
  }
  remove(rec) {
    if (!rec || !this.items.includes(rec)) return false;
    this.props.removeBody(rec); this.items.splice(this.items.indexOf(rec), 1); this.emit(); return true;
  }
  removeOne(productId) {
    if (this.busy === 'pouring') throw new Error('The basket is being emptied.');
    const list = this.inCart().filter(r => r.product.id === productId);
    return this.remove(list[list.length - 1]);
  }
  clearCart() { for (const r of this.inCart()) this.remove(r); }
  clearReleased() { for (const r of this.released()) this.remove(r); }

  // ---------- checkout: carry to the worktop, tip out, come back ----------
  // Microgravity: the net opens at ~60 deg and each sample is pushed toward the worktop (nothing falls on its own).
  checkout() {
    return this.run('pouring', async () => {
      if (this.mode !== 'held') throw new Error('The basket is not here.');
      if (!this.inCart().length) throw new Error('The basket is empty.');
      if (!this.canAct()) throw new Error('Wait for the gravity scan to finish.');
      const before = this.inCart(), home = { ...this.pose };
      this.mode = 'moving'; this.emit();
      await this.tween(BENCH, 1.6, { arc: 0.35 });
      this.mode = 'pouring'; this.emit();
      const g = this.getGravity(), micro = g < 0.5;
      // low gravity: tip slower and wait longer, otherwise the swing throws samples past the back of the worktop
      const slow = micro ? 1 : THREE.MathUtils.clamp(Math.sqrt(9.81 / g), 1, 2.2);
      // past ~50 deg the body has swung clear of the worktop, so the hinge comes down to cut the drop to ~14 cm
      const tilt = this.tween({ tilt: POUR_TILT, y: BENCH.y - 0.14 }, 1.4 * slow, { ease: (k) => k * k * (3 - 2 * k), curveY: (k) => Math.max(0, (k - 0.4) / 0.6) });
      if (micro) {
        await this.waitFor(() => this.pose.tilt > THREE.MathUtils.degToRad(60));
        this.setNet(false);
        for (const r of before) {
          const p = r.body.position, aim = new THREE.Vector3(BENCH.x + rand(-0.2, 0.2), 1.0, rand(-0.25, 0.1));
          const v = aim.sub(new THREE.Vector3(p.x, p.y, p.z)).setLength(rand(0.3, 0.42));
          r.body.velocity.set(v.x, v.y, v.z); r.body.wakeUp();
        }
      }
      await tilt;
      await this.hold_(micro ? 1.5 : 1.1 * slow);
      await this.tween({ y: BENCH.y + 0.1 }, 0.4);   // lift clear first: samples lying under the opening are not "in" it
      let kept = 0;
      for (const r of before) {
        if (!this.items.includes(r)) continue;
        if (this.inside(r, BASKET)) { kept++; continue; }
        r.state = 'released'; r.locked = false; r.noRecover = false;
        r.home.copy(r.body.position); r.home.y = Math.max(r.home.y, 1.0); r.homeQ.copy(r.body.quaternion);
      }
      this.emit();
      await this.tween({ tilt: 0, y: BENCH.y + 0.12 }, 0.9);
      this.mode = 'moving'; this.emit();
      await this.tween(this.anchor || home, 1.4, { arc: 0.3 });
      this.mode = 'held';
      return { released: before.length - kept, kept };
    });
  }
  hold_(sec) { return this.waitFor(() => false, sec); }
  waitFor(cond, timeout = 10) {
    const t0 = this.props.simTime || 0;
    return new Promise(res => { const tick = () => (cond() || (this.props.simTime || 0) - t0 >= timeout) ? res() : requestAnimationFrame(tick); tick(); });
  }
  setNet(on) {
    if (on === this.netOn) return;
    if (on) this.body.addShape(this.net, new CANNON.Vec3(0, RIM + 0.012, 0)); else this.body.removeShape(this.net);
    this.netOn = on; this.netMesh.visible = on;
  }

  update(dt) {
    const g = this.getGravity();
    if (this.mode !== 'pouring') this.setNet(g < 0.5 && this.inCart().length > 0);
    const now = performance.now();
    for (const r of this.inCart()) {
      const inside = this.inside(r);
      if (r.state === 'loading' && inside && (now - r.born > 1200 || (now - r.born > 350 && r.body.velocity.length() < 0.08))) { r.state = 'carried'; this.emit(); }
      if (this.mode === 'pouring') continue;
      r.outside = inside ? 0 : r.outside + dt;
      if (r.outside > 0.5) {   // knocked out (scan kick, a jolt): put it back so the count always matches the basket
        const p = this.spawnPoint(0); r.body.position.set(p.x, p.y, p.z);
        r.body.velocity.set(0, g < 0.5 ? -0.3 : 0, 0); r.body.angularVelocity.setZero(); r.body.wakeUp();
        r.outside = 0; r.respawns = (r.respawns || 0) + 1;
      }
    }
    this.sync(dt);
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
  state() {
    return { mode: this.mode, busy: this.busy, model: this.modelStatus, inCart: this.inCart().length,
      loading: this.items.filter(r => r.state === 'loading').length, released: this.released().length };
  }
}
