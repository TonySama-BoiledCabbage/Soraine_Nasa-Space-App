// A distance-based visual cue, not a heat-transfer or ignition model.
// Scene gravity and supplied oxygen are independent inputs. No NASA limit is used as a trigger.
export function sampleExposure({ instanceId, released, distance, burnerIntensity, oxygenSupplied, gravityMps2 }) {
  const strength = Number.isFinite(burnerIntensity) ? Math.max(0, Math.min(1, burnerIntensity)) : 0;
  const proximity = Number.isFinite(distance) ? Math.max(0, Math.min(1, 1 - distance / .28)) : 0;
  return { instanceId, intensity: released ? strength * proximity : 0,
    oxygenAvailability: oxygenSupplied ? 1 : 0,
    gravityMps2: Number.isFinite(gravityMps2) ? Math.max(0, gravityMps2) : 0 };
}

export function sampleDescription(rec, state) {
  const product = rec.product;
  const status = state ? `${state.thermalState} · ${state.combustionState === 'none' ? 'no combustion' : state.combustionState}` : 'ambient · no combustion';
  return {
    title: product.name,
    kind: `${product.materials.join(' · ')} · ${rec.instanceId}`,
    intro: 'This is the selected sample on your table. Observation pauses the scene and preserves its individual reaction history.',
    surface: product.form,
    role: status,
    action: 'Return to the scene and drag this sample near or away from the burner. Switch the sample oxygen supply off to explore extinction.',
    observe: 'Colour and flame cues show a schematic reaction. They do not predict ignition time, temperature or a safe oxygen limit.',
    note: product.specimen + ' Research applies to the tested specimen and conditions, not automatically to this everyday object.'
  };
}
