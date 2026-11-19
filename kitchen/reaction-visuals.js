import * as THREE from 'three';
import { MaterialReactions } from './material-reactions.js';
import { MATERIAL_PROFILES } from './material-profiles.js';

// Scene adapter: exposure + persistent local damage. No extra draw calls, textures, particles or lights.
const clamp = v => Math.max(0, Math.min(1, v));
const refreshBody = body => { body.updateBoundingRadius(); body.updateMassProperties(); body.aabbNeedsUpdate = true; body.wakeUp(); };
export class ReactionSystem {
  constructor({ basket, origin, props }) {
    Object.assign(this, { basket, origin, props });
    this.reactions = new MaterialReactions(MATERIAL_PROFILES);
    this.visuals = new Map(); this.elapsed = 0;
    this.local = new THREE.Vector3(); this.inverse = new THREE.Quaternion();
    this.heatCenter = origin.clone().add(new THREE.Vector3(0, 0.065, 0));
    this.charColor = new THREE.Color(0x282018); this.warmColor = new THREE.Color(0xff5b0b);
    this.vertex = new THREE.Vector3(); this.damageMin = new THREE.Vector3(); this.damageMax = new THREE.Vector3();
    this.unsubscribe = basket.onChange(() => this.sync());
  }
  sync() {
    const live = new Set(this.basket.items);
    for (const [id, v] of this.visuals) if (!live.has(v.rec)) {
      this.release(v); this.visuals.delete(id); this.reactions.remove(id);
    }
    for (const rec of live) {
      rec.instanceId ||= 'sample-' + rec.body.id;
      if (!this.visuals.has(rec.instanceId)) {
        this.reactions.register({ instanceId: rec.instanceId, productId: rec.product.id });
        this.visuals.set(rec.instanceId, { rec, materials: null });
      }
    }
  }
  update(dt, { paused = false, burn = 0, oxygenAvailability = 0 } = {}) {
    if (paused) return;
    this.elapsed += dt; if (this.elapsed + 1e-9 < 0.1) return;
    const elapsed = Math.floor((this.elapsed + 1e-9) / 0.1) * 0.1; this.elapsed = Math.max(0, this.elapsed - elapsed);
    const exposures = [];
    for (const [instanceId, visual] of this.visuals) {
      const { rec } = visual;
      // Closest point on the rotated collider, so a wide cloth's near edge receives heat.
      // ponytail: box approximation has no occlusion/heat conduction; replace only with a validated thermal model.
      this.inverse.copy(rec.mesh.quaternion).invert();
      this.local.copy(this.heatCenter).sub(rec.mesh.position).applyQuaternion(this.inverse);
      const [x, y, z] = rec.product.collider.dims;
      const half = rec.body.shapes[0]?.halfExtents, offset = rec.body.shapeOffsets[0];
      const dx = Math.max(0, Math.abs(this.local.x - (offset?.x || 0)) - (half?.x ?? x / 2));
      const dy = Math.max(0, Math.abs(this.local.y - (offset?.y || 0)) - (half?.y ?? y / 2));
      const dz = Math.max(0, Math.abs(this.local.z - (offset?.z || 0)) - (half?.z ?? z / 2));
      const intensity = rec.state === 'released' ? THREE.MathUtils.clamp(1 - Math.hypot(dx, dy, dz) / 0.18, 0, 1) * Math.min(1, burn) : 0;
      if (intensity > .03 && !visual.hotspot) visual.hotspot = new THREE.Vector2(
        THREE.MathUtils.clamp(this.local.x / (x / 2), -1, 1), THREE.MathUtils.clamp(this.local.z / (z / 2), -1, 1));
      exposures.push({ instanceId, intensity, oxygenAvailability, gravityMps2: this.props.gOf(rec) });
    }
    this.reactions.update(elapsed, { exposures });
    for (const [id, v] of this.visuals) this.apply(v, this.reactions.getState(id));
  }
  prepare(v) {
    const copies = new Map(); v.materials = [];
    v.rec.mesh.traverse(mesh => {
      if (!mesh.isMesh) return;
      const original = mesh.material;
      const clone = m => {
        if (!copies.has(m)) copies.set(m, { material: m.clone(), original: m });
        return copies.get(m).material;
      };
      mesh.material = Array.isArray(original) ? original.map(clone) : clone(original);
      v.materials.push({ mesh, original, originalGeometry: mesh.geometry });
    });
    v.copies = copies;
  }
  prepareDamage(v) {
    const rootInverse = v.rec.mesh.matrixWorld.clone().invert();
    const [width, , depth] = v.rec.product.collider.dims;
    for (const part of v.materials) {
      const { mesh } = part, geometry = mesh.geometry.clone(), position = geometry.getAttribute('position');
      const toRoot = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
      const roots = new Float32Array(position.count * 3);
      const pattern = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        this.vertex.fromBufferAttribute(position, i).applyMatrix4(toRoot).toArray(roots, i * 3);
        const x = this.vertex.x / (width / 2), z = this.vertex.z / (depth / 2);
        pattern[i * 3] = x; pattern[i * 3 + 1] = z;
        pattern[i * 3 + 2] = Math.sin(x * 9 + z * 6) * Math.sin(z * 11 - x * 4);
      }
      const originalIndex = geometry.index ? geometry.index.array.slice() : Uint32Array.from({ length: position.count }, (_, i) => i);
      const faces = new Float32Array(originalIndex.length);
      for (let i = 0; i < originalIndex.length; i += 3) {
        const a = originalIndex[i] * 3, b = originalIndex[i + 1] * 3, c = originalIndex[i + 2] * 3;
        const x = (roots[a] + roots[b] + roots[c]) / (1.5 * width), z = (roots[a + 2] + roots[b + 2] + roots[c + 2]) / (1.5 * depth);
        const n = Math.sin(Math.floor(x * 8) * 12.9898 + Math.floor(z * 8) * 78.233) * 43758.5453;
        faces[i] = x; faces[i + 1] = z; faces[i + 2] = n - Math.floor(n);
      }
      geometry.setIndex(new THREE.BufferAttribute(originalIndex.slice(), 1));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(position.count * 3).fill(1), 3));
      geometry.boundingBox = new THREE.Box3(); geometry.boundingSphere = new THREE.Sphere();
      part.damage = { geometry, roots, pattern, faces, originalIndex, fromRoot: toRoot.clone().invert() };
      mesh.geometry = geometry;
    }
    for (const { material } of v.copies.values()) { material.vertexColors = true; material.needsUpdate = true; }
    const body = v.rec.body, shape = body.shapes[0];
    if (body.shapes.length === 1 && shape.halfExtents) v.originalCollider = {
      half: shape.halfExtents.clone(), offset: body.shapeOffsets[0].clone()
    };
  }
  deform(v, s) {
    const key = Object.values(s.damage).map(x => Math.floor(x * 40)).join(':');
    if (v.damageKey === key) return;
    v.rec.mesh.updateWorldMatrix(true, true);
    if (!v.materials[0].damage) this.prepareDamage(v);
    v.damageKey = key;
    const [, height, depth] = v.rec.product.collider.dims, hy = height / 2, hz = depth / 2;
    const ax = v.hotspot?.x || 0, az = v.hotspot?.y || 0;
    const { melted, charred, consumed } = s.damage, melt = Math.sqrt(melted), char = Math.sqrt(charred);
    const radius = .65 + 2.5 * Math.max(charred, consumed);
    this.damageMin.set(Infinity, Infinity, Infinity); this.damageMax.set(-Infinity, -Infinity, -Infinity);
    for (const { damage, originalGeometry } of v.materials) {
      const { geometry, roots, pattern, faces, originalIndex, fromRoot } = damage;
      const position = geometry.getAttribute('position'), color = geometry.getAttribute('color'), originalColor = originalGeometry.getAttribute('color');
      geometry.boundingBox.makeEmpty();
      for (let i = 0; i < position.count; i++) {
        const x = roots[i * 3], y = roots[i * 3 + 1], z = roots[i * 3 + 2];
        const nx = pattern[i * 3], nz = pattern[i * 3 + 1], reach = clamp(1 - Math.hypot(nx - ax, nz - az) / radius);
        const crease = pattern[i * 3 + 2];
        const soft = melt * (.35 + .65 * reach), shrink = .1 * char * reach;
        // Schematic plastic slump / curl and textile crumpling, kept within the original envelope.
        const px = x * (1 - .2 * soft - shrink), pz = z * (1 - .24 * soft - shrink) + hz * .1 * soft * Math.sin(nx * 3);
        const py = THREE.MathUtils.clamp(-hy + (y + hy) * (1 - .6 * soft - .22 * char * reach)
          + hy * (.55 * soft * nx * nx + .35 * char * reach * crease), -hy, hy);
        this.vertex.set(px, py, pz); this.damageMin.min(this.vertex); this.damageMax.max(this.vertex);
        this.vertex.applyMatrix4(fromRoot); position.setXYZ(i, this.vertex.x, this.vertex.y, this.vertex.z);
        geometry.boundingBox.expandByPoint(this.vertex);
        const shade = Math.max(.025, 1 - char * reach * (1.55 + .25 * crease));
        color.setXYZ(i, (originalColor?.getX(i) ?? 1) * shade,
          (originalColor?.getY(i) ?? 1) * shade * (.8 + .2 * shade),
          (originalColor?.getZ(i) ?? 1) * shade * (.6 + .4 * shade));
      }
      const index = geometry.index.array; index.set(originalIndex);
      let holes = 0;
      for (let i = 0; i < index.length; i += 3) {
        const x = faces[i], z = faces[i + 1];
        const reach = clamp(1 - Math.hypot(x - ax, z - az) / radius);
        // Shared X/Z cells cut both sides of thin cloth. SIBAL keeps a symbolic glass-fibre residue.
        const cut = Math.max(0, consumed - .07) * reach * (v.rec.product.id === 'sibal' ? .45 : 1.25);
        if (cut > 0 && faces[i + 2] < cut) { index[i + 1] = index[i + 2] = index[i]; holes++; }
      }
      geometry.userData.burnedTriangles = holes;
      position.needsUpdate = color.needsUpdate = geometry.index.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.boundingBox.getCenter(geometry.boundingSphere.center);
      geometry.boundingSphere.radius = geometry.boundingBox.min.distanceTo(geometry.boundingBox.max) / 2;
    }
    // Keep picking, depth masks and shadows on the actual damaged geometry; physics remains a conservative box.
    if (v.originalCollider) {
      const body = v.rec.body, shape = body.shapes[0], lo = this.damageMin, hi = this.damageMax;
      shape.halfExtents.set(Math.max(.007, (hi.x - lo.x) / 2), Math.max(.007, (hi.y - lo.y) / 2), Math.max(.007, (hi.z - lo.z) / 2));
      body.shapeOffsets[0].set((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2);
      shape.updateConvexPolyhedronRepresentation(); refreshBody(body);
    }
  }
  apply(v, s) {
    const damaged = s.damage.charred + s.damage.melted + s.damage.consumed;
    if (s.heatLevel < 0.02 && !damaged) { if (v.materials) this.release(v); v.hotspot = null; return; }
    if (!v.materials) this.prepare(v); // copy-on-write: templates and other purchased samples stay unchanged
    if (damaged >= .015) this.deform(v, s);
    for (const { material: m, original: base } of v.copies.values()) {
      if (m.color) m.color.copy(base.color).lerp(this.charColor, s.damage.consumed * .1);
      if (m.roughness != null) m.roughness = THREE.MathUtils.lerp(base.roughness, 0.2, s.damage.melted * 0.7);
      if (m.emissive) {
        m.emissive.copy(base.emissive).lerp(this.warmColor, s.heatLevel * .015 + (s.combustionState === 'flaming' ? .04 : s.combustionState === 'smoldering' ? .025 : 0));
        m.emissiveIntensity = 1;
      }
      if (base.transparent) {
        m.opacity = THREE.MathUtils.lerp(base.opacity, Math.max(base.opacity, .72), s.damage.melted);
        if (m.color) m.color.lerp(this.warmColor, s.heatLevel * .04);
      }
    }
  }
  release(v) {
    if (!v.materials) return;
    for (const { mesh, original, originalGeometry, damage } of v.materials) {
      mesh.material = original; mesh.geometry = originalGeometry;
      damage?.geometry.dispose();
    }
    if (v.originalCollider) {
      const body = v.rec.body, shape = body.shapes[0];
      shape.halfExtents.copy(v.originalCollider.half); body.shapeOffsets[0].copy(v.originalCollider.offset);
      shape.updateConvexPolyhedronRepresentation(); refreshBody(body);
    }
    for (const { material } of v.copies.values()) material.dispose();
    v.materials = null; v.copies = null;
    v.originalCollider = null; v.damageKey = null; v.hotspot = null;
  }
  dispose() {
    this.unsubscribe(); for (const v of this.visuals.values()) this.release(v);
    this.visuals.clear(); this.reactions.dispose();
  }
}
