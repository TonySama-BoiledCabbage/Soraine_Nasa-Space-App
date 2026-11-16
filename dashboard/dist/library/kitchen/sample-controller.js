import * as THREE from 'three';
import { MaterialReactions } from './material-reactions.mjs';
import { ReactionVisuals } from './reaction-visuals.js';
import { sampleExposure } from './sample-exposure.mjs';

export class SampleController {
  constructor({ basket, props, scene, origin }) {
    Object.assign(this, { basket, props, origin });
    this.reactions = new MaterialReactions();
    this.visuals = new ReactionVisuals(scene);
    this.samples = new Map(); this.box = new THREE.Box3(); this.near = new THREE.Vector3();
    this.oxygenSupplied = true; this.time = 0; this.elapsed = 0;
    this.unsubscribeState = this.reactions.onChange(({ instanceId, state }) => { if (state) this.visuals.apply(instanceId, state); });
    this.unsubscribeBasket = basket.onChange(() => this.sync());
    this.sync();
  }
  sync() {
    const present = new Set(this.basket.items.map(rec => rec.instanceId));
    for (const id of this.samples.keys()) if (!present.has(id)) {
      this.reactions.remove(id); this.visuals.remove(id); this.samples.delete(id);
    }
    for (const rec of this.basket.items) if (!this.samples.has(rec.instanceId)) {
      this.samples.set(rec.instanceId, rec); this.visuals.register(rec);
      this.reactions.register({ instanceId: rec.instanceId, productId: rec.product.id });
    }
  }
  getState(rec) { return rec?.instanceId ? this.reactions.getState(rec.instanceId) : null; }
  reset(rec) { if (this.samples.has(rec?.instanceId)) return this.reactions.reset(rec.instanceId); }
  update(dt, { paused, burnerIntensity }) {
    if (paused) return;
    this.time += dt; this.elapsed += dt;
    // Spatial bounds and reaction inputs need only 20 Hz; camera and cues remain frame-smooth.
    if (this.elapsed < .05) { this.visuals.update(this.time); return; }
    const exposures = [];
    for (const rec of this.samples.values()) {
      rec.mesh.updateWorldMatrix(true, true);
      this.box.setFromObject(rec.mesh);
      this.box.clampPoint(this.origin, this.near);
      exposures.push(sampleExposure({ instanceId: rec.instanceId, released: rec.state === 'released',
        distance: this.box.isEmpty() ? Infinity : this.near.distanceTo(this.origin),
        burnerIntensity, oxygenSupplied: this.oxygenSupplied, gravityMps2: this.props.gOf(rec) }));
    }
    this.reactions.update(this.elapsed, { exposures });
    this.elapsed = 0; this.visuals.update(this.time);
  }
  dispose() { this.unsubscribeBasket(); this.unsubscribeState(); this.visuals.dispose(); this.reactions.dispose(); this.samples.clear(); }
}
