import * as THREE from 'three';
import { MaterialReactions } from './material-reactions.js';
import { MATERIAL_PROFILES } from './material-profiles.js';

// Scene adapter: heat exposure + per-instance appearance. No extra models, particles, lights or shaders.
export class ReactionSystem {
  constructor({ basket, origin, props }) {
    Object.assign(this, { basket, origin, props });
    this.reactions = new MaterialReactions(MATERIAL_PROFILES);
    this.visuals = new Map(); this.elapsed = 0;
    this.local = new THREE.Vector3(); this.inverse = new THREE.Quaternion();
    this.heatCenter = origin.clone().add(new THREE.Vector3(0, 0.065, 0));
    this.charColor = new THREE.Color(0x282018); this.warmColor = new THREE.Color(0xff5b0b);
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
    for (const [instanceId, { rec }] of this.visuals) {
      // Closest point on the rotated collider, so a wide cloth's near edge receives heat.
      // ponytail: box approximation has no occlusion/heat conduction; replace only with a validated thermal model.
      this.inverse.copy(rec.mesh.quaternion).invert();
      this.local.copy(this.heatCenter).sub(rec.mesh.position).applyQuaternion(this.inverse);
      const [x, y, z] = rec.product.collider.dims;
      const dx = Math.max(0, Math.abs(this.local.x) - x / 2), dy = Math.max(0, Math.abs(this.local.y) - y / 2), dz = Math.max(0, Math.abs(this.local.z) - z / 2);
      const intensity = rec.state === 'released' ? THREE.MathUtils.clamp(1 - Math.hypot(dx, dy, dz) / 0.18, 0, 1) * Math.min(1, burn) : 0;
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
      v.materials.push({ mesh, original });
    });
    v.copies = copies;
  }
  apply(v, s) {
    const damaged = s.damage.charred + s.damage.melted + s.damage.consumed;
    if (s.heatLevel < 0.02 && !damaged) { if (v.materials) this.release(v); return; }
    if (!v.materials) this.prepare(v); // copy-on-write: templates and other purchased samples stay unchanged
    for (const { material: m, original: base } of v.copies.values()) {
      if (m.color) m.color.copy(base.color).lerp(this.charColor, Math.min(0.92, s.damage.charred * 1.4 + s.damage.consumed * 0.25));
      if (m.roughness != null) m.roughness = THREE.MathUtils.lerp(base.roughness, 0.2, s.damage.melted * 0.7);
      if (m.emissive) {
        m.emissive.copy(base.emissive).lerp(this.warmColor, s.heatLevel * 0.03 + (s.combustionState === 'flaming' ? 0.12 : s.combustionState === 'smoldering' ? 0.08 : 0));
        m.emissiveIntensity = 1;
      }
      // Opaque glasses need a visible heat/damage cue too; no real mesh deformation or mass loss is implied.
      if (m.color && base.transparent) m.color.lerp(this.warmColor, Math.max(s.damage.melted * 0.25, s.heatLevel * 0.08));
    }
  }
  release(v) {
    if (!v.materials) return;
    for (const { mesh, original } of v.materials) mesh.material = original;
    for (const { material } of v.copies.values()) material.dispose();
    v.materials = null; v.copies = null;
  }
  dispose() {
    this.unsubscribe(); for (const v of this.visuals.values()) this.release(v);
    this.visuals.clear(); this.reactions.dispose();
  }
}
