import * as THREE from 'three';

// Instance-owned overlays. Never alter cached GLB geometry, textures or template materials.
export class ReactionVisuals {
  constructor(scene) {
    this.scene = scene; this.items = new Map();
    this.heatColour = new THREE.Color(0xe36327);
    this.geometry = new THREE.SphereGeometry(1, 8, 6);
  }
  register(rec) { this.items.set(rec.instanceId, { rec, materials: null, marker: null, state: null }); }
  apply(instanceId, state) {
    const item = this.items.get(instanceId); if (!item) return;
    item.state = state;
    if (!item.materials && state.heatLevel > .02) {
      item.materials = [];
      item.rec.mesh.traverse(mesh => {
        if (!mesh.isMesh) return;
        const original = mesh.material;
        const clones = (Array.isArray(original) ? original : [original]).map(base => {
          const material = base.clone();
          return { material, colour: base.color?.clone(), emissive: base.emissive?.clone(), intensity: base.emissiveIntensity };
        });
        mesh.material = Array.isArray(original) ? clones.map(c => c.material) : clones[0].material;
        item.materials.push({ mesh, original, clones });
      });
    }
    for (const { clones } of item.materials || []) for (const { material, colour, emissive, intensity } of clones) {
      if (colour) material.color.copy(colour).lerp(this.heatColour, state.heatLevel * .24);
      if (emissive) {
        material.emissive.copy(emissive).lerp(this.heatColour, state.heatLevel * .15);
        material.emissiveIntensity = Math.max(intensity || 0, state.heatLevel * .2);
      }
    }
    const burning = ['flaming', 'smoldering'].includes(state.combustionState);
    if (burning && !item.marker) {
      item.marker = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: 0xffa34c, transparent: true, opacity: .55, depthWrite: false }));
      item.marker.name = 'Schematic sample reaction cue';
      this.scene.add(item.marker);
    }
    if (item.marker) item.marker.visible = burning;
  }
  update(time) {
    for (const { rec, marker, state } of this.items.values()) {
      if (!marker?.visible) continue;
      // Position follows the actual body; one small cue per sample, no particles or extra lights.
      marker.position.copy(rec.body.position);
      marker.position.y += rec.product.collider.dims[1] / 2 + .045;
      const smolder = state.combustionState === 'smoldering';
      marker.scale.set(.02, smolder ? .014 : .05 + .006 * Math.sin(time * 7), .02);
      marker.material.color.setHex(smolder ? 0xd05728 : 0xffa34c);
    }
  }
  remove(instanceId) {
    const item = this.items.get(instanceId); if (!item) return;
    for (const { mesh, original, clones } of item.materials || []) {
      mesh.material = original;
      for (const { material } of clones) material.dispose();
    }
    if (item.marker) { item.marker.removeFromParent(); item.marker.material.dispose(); }
    this.items.delete(instanceId);
  }
  dispose() { for (const id of [...this.items.keys()]) this.remove(id); this.geometry.dispose(); }
}
