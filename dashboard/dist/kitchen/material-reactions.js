// Pure JS; no DOM, renderer, database or physics dependency. Progress is dimensionless [0,1].
const STEP = 0.1; // simulated seconds; 10 Hz, shared with the scene adapter
const UNKNOWN = { note: 'Data gap: no material reaction profile. Only heating and cooling are shown.' };
const clamp = v => Math.max(0, Math.min(1, v));
const copy = s => ({ ...s, damage: { ...s.damage } });
const stamp = s => [s.thermalState, s.combustionState, Math.floor(s.heatLevel * 20),
  ...Object.values(s.damage).map(v => Math.floor(v * 20))].join(':');

export class MaterialReactions {
  constructor(profiles) { this.profiles = profiles; this.states = new Map(); this.listeners = new Set(); this.accumulator = 0; }
  register({ instanceId, productId }) {
    if (typeof instanceId !== 'string' || !instanceId || this.states.has(instanceId)) throw new Error('Missing or duplicate sample instanceId');
    if (typeof productId !== 'string' || !productId) throw new Error('Missing material productId');
    const state = { instanceId, productId, thermalState: 'ambient', combustionState: 'none', heatLevel: 0,
      damage: { melted: 0, charred: 0, consumed: 0 }, evidenceMode: 'schematic', gravityMps2: null,
      note: (Object.hasOwn(this.profiles, productId) ? this.profiles[productId] : UNKNOWN).note };
    this.states.set(instanceId, state); return copy(state);
  }
  getState(id) { const s = this.states.get(id); return s && copy(s); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  reset(id) {
    const s = this.states.get(id); if (!s) return;
    this.states.delete(id); const initial = this.register(s);
    for (const fn of this.listeners) fn(initial);
    return initial;
  }
  remove(id) { return this.states.delete(id); }
  dispose() { this.states.clear(); this.listeners.clear(); this.accumulator = 0; }
  update(dt, { paused = false, exposures = [] } = {}) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Reaction dt must be finite, non-negative simulated seconds');
    if (paused || dt === 0) return;
    const inputs = new Map();
    for (const e of exposures) {
      if (!Number.isFinite(e.intensity) || !Number.isFinite(e.oxygenAvailability) ||
          (e.gravityMps2 != null && (!Number.isFinite(e.gravityMps2) || e.gravityMps2 < 0))) throw new Error('Invalid reaction exposure');
      inputs.set(e.instanceId, { ...e, intensity: clamp(e.intensity), oxygenAvailability: clamp(e.oxygenAvailability) });
    }
    this.accumulator += dt;
    // Preserve time through long frames; the app supplies capped dt. No per-object timers.
    while (this.accumulator + 1e-9 >= STEP) {
      this.accumulator = Math.max(0, this.accumulator - STEP);
      for (const s of this.states.values()) {
        const before = stamp(s), p = Object.hasOwn(this.profiles, s.productId) ? this.profiles[s.productId] : UNKNOWN, e = inputs.get(s.instanceId);
        const intensity = e?.intensity ?? 0, oxygen = e?.oxygenAvailability ?? 0, previous = s.combustionState;
        if (e?.gravityMps2 != null) s.gravityMps2 = e.gravityMps2;
        const fuel = s.damage.consumed < 1;
        const sustaining = fuel && ((previous === 'flaming' && oxygen > 0.25) || (previous === 'smoldering' && oxygen > 0.06));
        const target = Math.max(intensity, sustaining ? (previous === 'flaming' ? 0.85 : 0.5) : 0);
        const oldHeat = s.heatLevel;
        s.heatLevel = clamp(oldHeat + (target - oldHeat) * (1 - Math.exp(-STEP * (target > oldHeat ? 0.7 : 0.3))));
        s.thermalState = target > 0.02 && target >= oldHeat ? 'heating' : s.heatLevel > 0.02 ? 'cooling' : 'ambient';
        const flaming = fuel && p.flame === true && oxygen > 0.25 && s.heatLevel > 0.62;
        const smoldering = fuel && !flaming && p.smolder === true && oxygen > 0.06 && s.heatLevel > 0.34 && s.damage.charred > 0.08;
        s.combustionState = flaming ? 'flaming' : smoldering ? 'smoldering' :
          (previous !== 'none' || s.damage.consumed > 0) ? 'extinguished' : 'none';
        if (p.melt === true && s.heatLevel > 0.35) s.damage.melted = clamp(s.damage.melted + STEP * (s.heatLevel - 0.35) * 0.12);
        if (p.char === true && s.heatLevel > 0.45) s.damage.charred = clamp(s.damage.charred + STEP * (s.heatLevel - 0.45) * 0.1);
        if (flaming || smoldering) s.damage.consumed = clamp(s.damage.consumed + STEP * (flaming ? 0.035 : 0.012));
        if (s.damage.consumed === 1) s.combustionState = 'extinguished';
        if (stamp(s) !== before) for (const fn of this.listeners) fn(copy(s));
      }
    }
  }
}
