// Per-sample reaction state for the material shelf. Plain JavaScript in and out: no DOM, Three, Cannon or data access.
//
// Everything here is schematic. heatLevel, intensity, oxygenAvailability and the damage values are unitless numbers
// from 0 to 1 that drive an illustration. They are not temperatures, oxygen percentages or measured burn behaviour,
// and the constants below are display tuning, not material properties. Every snapshot says evidenceMode: 'schematic'.
//
// Time: update(dt) adds dt (seconds) to an accumulator and advances in fixed steps of STEP_SECONDS, so the result
// does not depend on how a duration is split into frames. A single dt above MAX_FRAME_SECONDS is cut to that value
// (a long stall does not fast-forward the scene). dt must be a finite number >= 0, otherwise update throws.
//
// Exposures: [{instanceId, intensity, oxygenAvailability, gravityMps2}] for the samples a source reaches this frame.
// A sample with no exposure gets zero external heating and keeps cooling. intensity and oxygenAvailability are
// clamped to 0..1. oxygenAvailability is remembered per sample; until one is reported, combustion cannot start.
// gravityMps2 is checked and reported back but does not change any rate: the research does not give a product-level
// gravity law, so this module does not invent one. If one sample is listed twice, the later entry is used.
// Exposures for samples that are not registered are ignored (a sample may have been removed in the same frame).

import {PROFILES} from './material-profiles.mjs';

export const SCHEMATIC = Object.freeze({
  STEP_SECONDS: 1 / 60,
  MAX_FRAME_SECONDS: 0.25,
  HEAT_RATE: 0.9,          // approach to full heat per second at intensity 1
  COOL_RATE: 0.25,         // fraction of heat lost per second, always applied
  FLAME_HEAT_RATE: 0.35,   // heat a flaming sample feeds itself per second
  AMBIENT_BELOW: 0.02,     // heatLevel under this reads as ambient
  FLAME_START: 0.7,        // heatLevel at which an allowed flame starts
  FLAME_HOLD: 0.35,        // a flame goes out below this heatLevel
  FLAME_OXYGEN: 0.5,       // a flame needs at least this oxygenAvailability
  SMOLDER_START: 0.45,     // heatLevel at which allowed smoldering starts
  SMOLDER_HOLD: 0.25,      // smoldering stops below this heatLevel
  SMOLDER_OXYGEN: 0.15,    // smoldering needs at least this oxygenAvailability
  CONSUME_FLAMING: 0.08,   // consumed per second while flaming at oxygenAvailability 1
  CONSUME_SMOLDERING: 0.02,
  CHAR_RATE: 0.05,         // used only if a profile turns charring on
  MELT_RATE: 0.06,         // used only if a profile turns melting on
  MELT_ABOVE: 0.5,
  NOTIFY_STEP: 0.01        // listeners hear about value changes of at least this size
});

const clamp01 = value => Math.min(1, Math.max(0, value));
const finite = (value, name) => { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be a finite number.`); return value; };

export class MaterialReactions {
  #profiles; #samples = new Map(); #listeners = new Set(); #accumulator = 0; #disposed = false;

  constructor(profiles = PROFILES) {
    if (!profiles || typeof profiles !== 'object') throw new TypeError('Profiles are required.');
    this.#profiles = profiles;
  }

  #alive() { if (this.#disposed) throw new Error('This reaction store was disposed.'); }
  #fresh(instanceId, productId) {
    return {instanceId, productId, heatLevel: 0, thermalState: 'ambient', combustionState: 'none',
      damage: {melted: 0, charred: 0, consumed: 0}, oxygenAvailability: null, gravityMps2: null, shown: null};
  }
  #snapshot(sample) {
    return {instanceId: sample.instanceId, productId: sample.productId, thermalState: sample.thermalState,
      combustionState: sample.combustionState, heatLevel: sample.heatLevel, damage: {...sample.damage},
      gravityMps2: sample.gravityMps2, capabilities: {...this.#profiles[sample.productId].capabilities},
      support: this.#profiles[sample.productId].support ?? null, evidenceMode: 'schematic'};
  }
  #emit(type, sample) {
    const event = {type, instanceId: sample.instanceId, state: type === 'removed' ? null : this.#snapshot(sample)};
    for (const listener of [...this.#listeners]) listener(event);
  }
  // Listeners hear about a change the display would show: a state label, or a value moving by NOTIFY_STEP.
  #changed(sample) {
    const now = [sample.thermalState, sample.combustionState, sample.heatLevel, sample.damage.melted, sample.damage.charred, sample.damage.consumed];
    const before = sample.shown;
    if (before && before[0] === now[0] && before[1] === now[1] &&
        [2, 3, 4, 5].every(i => Math.abs(now[i] - before[i]) < SCHEMATIC.NOTIFY_STEP && (now[i] === 1) === (before[i] === 1) && (now[i] === 0) === (before[i] === 0))) return false;
    sample.shown = now; return true;
  }

  register({instanceId, productId} = {}) {
    this.#alive();
    if (typeof instanceId !== 'string' || !instanceId) throw new TypeError('instanceId must be a non-empty string.');
    if (!Object.hasOwn(this.#profiles, productId)) throw new RangeError('Unknown productId.');
    if (this.#samples.has(instanceId)) throw new Error(`Sample ${instanceId} is already registered.`);
    const sample = this.#fresh(instanceId, productId);
    this.#samples.set(instanceId, sample); this.#changed(sample); this.#emit('registered', sample);
    return this.#snapshot(sample);
  }

  getState(instanceId) { this.#alive(); const sample = this.#samples.get(instanceId); return sample ? this.#snapshot(sample) : null; }
  getStates() { this.#alive(); return [...this.#samples.values()].map(sample => this.#snapshot(sample)); }

  onChange(callback) {
    this.#alive();
    if (typeof callback !== 'function') throw new TypeError('onChange needs a function.');
    this.#listeners.add(callback);
    return () => { this.#listeners.delete(callback); };
  }

  // Only this sample returns to its starting state. Its ids stay registered.
  reset(instanceId) {
    this.#alive();
    const old = this.#samples.get(instanceId);
    if (!old) throw new RangeError('Unknown instanceId.');
    const sample = this.#fresh(old.instanceId, old.productId);
    this.#samples.set(instanceId, sample); this.#changed(sample); this.#emit('reset', sample);
    return this.#snapshot(sample);
  }

  // Safe to call again for a sample that is already gone.
  remove(instanceId) {
    this.#alive();
    const sample = this.#samples.get(instanceId);
    if (!sample) return false;
    this.#samples.delete(instanceId); this.#emit('removed', sample);
    return true;
  }

  dispose() { this.#samples.clear(); this.#listeners.clear(); this.#accumulator = 0; this.#disposed = true; }

  update(dt, {paused = false, exposures = []} = {}) {
    this.#alive();
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be a finite number of seconds, zero or more.');
    if (!Array.isArray(exposures)) throw new TypeError('exposures must be an array.');
    const inputs = new Map();
    for (const exposure of exposures) {
      if (!exposure || typeof exposure.instanceId !== 'string') throw new TypeError('Each exposure needs an instanceId.');
      const entry = {intensity: clamp01(finite(exposure.intensity, 'intensity')),
        oxygenAvailability: clamp01(finite(exposure.oxygenAvailability, 'oxygenAvailability')),
        gravityMps2: finite(exposure.gravityMps2, 'gravityMps2')};
      if (entry.gravityMps2 < 0) throw new RangeError('gravityMps2 cannot be negative.');
      if (this.#samples.has(exposure.instanceId)) inputs.set(exposure.instanceId, entry);
    }
    if (paused) return 0;   // simulated time and every state stay exactly as they were
    for (const [instanceId, entry] of inputs) {
      const sample = this.#samples.get(instanceId);
      sample.oxygenAvailability = entry.oxygenAvailability; sample.gravityMps2 = entry.gravityMps2;
    }
    this.#accumulator += Math.min(dt, SCHEMATIC.MAX_FRAME_SECONDS);
    // The small allowance keeps ten 0.01 s frames and one 0.1 s frame on the same step count.
    const steps = Math.floor(this.#accumulator / SCHEMATIC.STEP_SECONDS + 1e-9);
    this.#accumulator = Math.max(0, this.#accumulator - steps * SCHEMATIC.STEP_SECONDS);
    for (let step = 0; step < steps; step++) for (const sample of this.#samples.values()) this.#step(sample, inputs.get(sample.instanceId)?.intensity ?? 0);
    for (const sample of this.#samples.values()) if (this.#changed(sample)) this.#emit('changed', sample);
    return steps;
  }

  #step(sample, intensity) {
    const S = SCHEMATIC, h = S.STEP_SECONDS, can = this.#profiles[sample.productId].capabilities, damage = sample.damage;
    const allowed = name => can[name] === 'illustrative';
    const oxygen = sample.oxygenAvailability ?? 0, left = damage.consumed < 1;
    const flaming = sample.combustionState === 'flaming', smoldering = sample.combustionState === 'smoldering';

    const before = sample.heatLevel;
    const gain = (S.HEAT_RATE * intensity + (flaming ? S.FLAME_HEAT_RATE : 0)) * (1 - before);
    sample.heatLevel = clamp01(before + (gain - S.COOL_RATE * before) * h);
    sample.thermalState = sample.heatLevel < S.AMBIENT_BELOW ? 'ambient' : sample.heatLevel > before ? 'heating' : 'cooling';

    // Combustion labels. A fully consumed sample cannot burn again; damage is never undone here.
    const flameOk = allowed('flaming') && left && oxygen >= S.FLAME_OXYGEN;
    const smolderOk = allowed('smoldering') && left && oxygen >= S.SMOLDER_OXYGEN;
    let next = sample.combustionState;
    if (flaming) next = flameOk && sample.heatLevel >= S.FLAME_HOLD ? 'flaming' : smolderOk && sample.heatLevel >= S.SMOLDER_HOLD ? 'smoldering' : 'extinguished';
    else if (flameOk && sample.heatLevel >= S.FLAME_START) next = 'flaming';
    else if (smoldering) next = smolderOk && sample.heatLevel >= S.SMOLDER_HOLD ? 'smoldering' : 'extinguished';
    else if (smolderOk && sample.heatLevel >= S.SMOLDER_START) next = 'smoldering';
    sample.combustionState = next;

    if (next === 'flaming') damage.consumed = clamp01(damage.consumed + S.CONSUME_FLAMING * oxygen * h);
    else if (next === 'smoldering') damage.consumed = clamp01(damage.consumed + S.CONSUME_SMOLDERING * oxygen * h);
    if (allowed('charring') && next !== 'none' && next !== 'extinguished') damage.charred = clamp01(damage.charred + S.CHAR_RATE * h);
    if (allowed('melting') && sample.heatLevel >= S.MELT_ABOVE) damage.melted = clamp01(damage.melted + S.MELT_RATE * (sample.heatLevel - S.MELT_ABOVE) * h);
  }
}
