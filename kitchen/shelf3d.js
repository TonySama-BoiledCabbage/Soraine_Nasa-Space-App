// SORAINE store shelf: the user's L01 shelf (Shelf node of soraine-lab-models/lab.glb, extracted unchanged to
// models/shop/shelf.glb) scaled to fit the small material objects. 3 columns x 3 boards, one product per bay, a
// tilted shelf-edge tag under each (Name + About, per the sketch). Display copies are visual only; buying one drops
// a physics sample into the basket. Also owns the camera rigs and the basket's held position for the shop.
import * as THREE from 'three';

export const SHELF = { url: 'models/shop/shelf.glb', x: 3.15, z: -0.1, yaw: 0, scale: 0.62 };
const NATIVE = { cols: [-1.033, 0, 1.033], top: 2.2, front: 0.25, back: -0.095 };   // lab.glb shelf frame (metres)
const PER_PAGE = 9;

function tagTexture(p, about) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 220;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 1024, 220);
  g.fillStyle = '#ffd814'; g.fillRect(0, 0, 18, 220);
  g.fillStyle = '#131921'; g.font = '700 84px Arial, sans-serif'; g.fillText(p.label || p.name, 48, 98);
  g.fillStyle = '#2f343b'; g.font = '600 58px Arial, sans-serif'; g.fillText(about, 48, 184);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export class Shelf {
  constructor(scene, loader) {
    this.group = new THREE.Group(); this.group.name = 'SORAINE shelf';
    this.group.position.set(SHELF.x, 0, SHELF.z); this.group.rotation.y = SHELF.yaw; this.group.scale.setScalar(SHELF.scale);
    scene.add(this.group);
    this.items = new Map(); this.slots = []; this.page = 0; this.products = [];
    this.ready = loader.loadAsync(SHELF.url).then(({ scene: m }) => {
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(m); this.model = m; this.findSlots(); return this;
    });
  }
  // Board surfaces measured on the model: cast down through each bay and keep the three highest upward faces.
  findSlots() {
    this.group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), slots = [];
    const levels = NATIVE.cols.map(x => {
      const o = this.group.localToWorld(new THREE.Vector3(x + 0.2, NATIVE.top, 0.12));
      ray.set(o, down);
      const ys = [];
      for (const h of ray.intersectObject(this.model, true)) {
        const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        if (n.y > 0.7 && !ys.some(y => Math.abs(y - h.point.y) < 0.03)) ys.push(h.point.y);
      }
      return ys.sort((a, b) => b - a).slice(0, 3);   // top, middle, lower board (world y)
    });
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) slots.push({ row, col, x: NATIVE.cols[col], y: (levels[col][row] ?? [1.08, 0.67, 0.27][row]) });
    this.slots = slots;
  }
  get pages() { return Math.max(1, Math.ceil(this.products.length / PER_PAGE)); }
  // One display copy per product in catalog order: rows top to bottom, three bays each.
  async populate(products, template, rowsFor, eye) {
    await this.ready;
    Object.assign(this, { products, template, rowsFor, eye });
    for (const it of this.items.values()) { it.root.removeFromParent(); it.tag.removeFromParent(); }
    this.items.clear();
    const list = products.slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE);
    const k = 1 / SHELF.scale;   // product models keep their real size; the shelf group is scaled
    for (const [i, p] of list.entries()) {
      const s = this.slots[i], tpl = await template(p);
      const root = new THREE.Group(); root.name = 'display:' + p.id; root.userData.product = p.id; root.scale.setScalar(k);
      const show = tpl.clone(true);
      const [dx, dy, dz] = p.collider.dims;
      // flat objects stand leaning back so their large face looks at the shopper
      if (dy < 0.5 * Math.min(dx, dz)) show.rotation.x = THREE.MathUtils.degToRad(68);
      root.add(show); this.group.add(root);
      root.position.set(s.x, 0, 0); root.updateMatrixWorld(true);
      // sit it on the measured board, against the back of the bay
      const box = new THREE.Box3().setFromObject(show);
      const boardY = this.group.worldToLocal(new THREE.Vector3(0, s.y, 0)).y;
      const minY = this.group.worldToLocal(new THREE.Vector3(0, box.min.y, 0)).y;
      const zMin = this.group.worldToLocal(new THREE.Vector3(0, 0, box.min.z)).z, zMax = this.group.worldToLocal(new THREE.Vector3(0, 0, box.max.z)).z;
      root.position.y += boardY - minY + 0.004 / SHELF.scale;
      root.position.z += Math.max(NATIVE.back + 0.02, NATIVE.front - 0.06 - (zMax - zMin)) - zMin;
      // shelf-edge tag, hinged on the rail and turned toward the shopper's eye
      const n = rowsFor(p), about = `${p.materials.join(' · ')}${n ? ` · ${n} records` : ''}`;
      const geo = new THREE.PlaneGeometry(0.62, 0.133); geo.translate(0, -0.066, 0);   // hinge on the top edge
      const tag = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tagTexture(p, about), toneMapped: false }));
      tag.position.set(s.x, boardY - 0.035, NATIVE.front + 0.035);
      this.group.add(tag); tag.updateMatrixWorld(true);
      const tw = tag.getWorldPosition(new THREE.Vector3()), up = Math.atan2(eye.y - tw.y, eye.z - tw.z);
      tag.rotation.x = -THREE.MathUtils.clamp(up + 0.12, 0.17, 0.75);   // 10 to 43 deg, like a shelf label holder
      this.items.set(p.id, { root, spin: show, tag, product: p, slot: s });
    }
    return this;
  }
  setPage(n) { this.page = (n + this.pages) % this.pages; return this.populate(this.products, this.template, this.rowsFor, this.eye); }
  worldOf(id, out = new THREE.Vector3()) { const box = this.boxOf(id); return box ? box.getCenter(out) : null; }
  boxOf(id) { const it = this.items.get(id); return it ? new THREE.Box3().setFromObject(it.spin) : null; }
  tagBox(id) { const it = this.items.get(id); return it ? new THREE.Box3().setFromObject(it.tag) : null; }
  front() { return new THREE.Vector3(Math.sin(SHELF.yaw), 0, Math.cos(SHELF.yaw)); }
  bounds() { this.group.updateMatrixWorld(true); return new THREE.Box3().setFromObject(this.model || this.group); }

  // ---- camera rigs ----
  // Straight-on view of the whole shelf in the upper part of the window; the bottom strip shows the held basket.
  shelfRig(aspect = 1.5, strip = 0.22) {
    const b = this.bounds(), size = b.getSize(new THREE.Vector3());
    if (!this.model) size.set(2.2, 1.45, 0.3);
    const cy = this.model ? b.min.y + size.y / 2 : 0.72;
    // tall phone screens: widen the lens rather than backing out into the grass
    const need = (fov) => { const t = Math.tan(THREE.MathUtils.degToRad(fov / 2)); return Math.max((size.y / 2 + 0.14) / (t * (1 - strip)), (size.x / 2 + 0.16) / (t * aspect)) + 0.3; };
    let fov = 46; while (need(fov) > 3.6 && fov < 76) fov += 2;
    const t = Math.tan(THREE.MathUtils.degToRad(fov / 2)), d = Math.min(3.6, need(fov));
    const lookY = cy - t * d * strip;   // shelf centred in the top (1 - strip) of the frame
    return { pos: new THREE.Vector3(SHELF.x, cy + 0.04, SHELF.z + d), look: new THREE.Vector3(SHELF.x, lookY, SHELF.z), fov };
  }
  productRig(id, aspect = 1.5) {
    const box = this.boxOf(id); if (!box) return null;
    const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2, fov = 34;
    const d = Math.max(0.62, r / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.min(1, aspect) * 0.5));
    return { pos: c.clone().addScaledVector(this.front(), d).add(new THREE.Vector3(0, d * 0.1, 0)), look: c, fov };
  }
  // Where the shopper holds the basket: 0.62 m ahead of the shelf camera, low enough that only the rim and upper
  // body show at the bottom of the frame.
  basketAnchor(rig, aspect) {
    const cam = new THREE.PerspectiveCamera(rig.fov, aspect, 0.05, 50);
    cam.position.copy(rig.pos); cam.lookAt(rig.look); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    // ~60% of the frame width on any screen shape
    const reach = Math.max(0.62, 0.42 / (1.2 * Math.tan(THREE.MathUtils.degToRad(rig.fov / 2)) * aspect));
    const f = rig.look.clone().sub(rig.pos).setY(0).normalize(), base = rig.pos.clone().addScaledVector(f, reach);
    let lo = -1.6, hi = 0;
    for (let i = 0; i < 30; i++) {   // rim front edge lands at NDC y = -0.7 (bottom ~15% of the frame)
      const mid = (lo + hi) / 2, rim = base.clone().add(new THREE.Vector3(0, mid + 0.24, 0)).addScaledVector(f, -0.147).project(cam);
      if (rim.y < -0.7) lo = mid; else hi = mid;
    }
    return { x: base.x, y: rig.pos.y + lo, z: base.z, yaw: 0, tilt: 0 };
  }
  basketRig(anchor) {
    const c = new THREE.Vector3(anchor.x, anchor.y + 0.1, anchor.z);   // basket sits low in the frame, summary above it
    return { pos: c.clone().add(new THREE.Vector3(0, 0.78, 0.42)), look: c.clone().add(new THREE.Vector3(0, 0.06, -0.16)), fov: 50 };
  }
  update(dt, focusId) {
    for (const [id, it] of this.items) {
      const want = id === focusId ? Math.sin(performance.now() / 1400) * 0.35 : 0;
      it.root.rotation.y += (want - it.root.rotation.y) * Math.min(1, dt * 3);
    }
  }
}
