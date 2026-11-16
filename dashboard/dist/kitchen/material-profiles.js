// Qualitative demonstrations, never ignition temperatures, oxygen limits or hazard rankings.
// true = illustrated; false = excluded; null = not modelled / evidence gap. All rates below are schematic.
const nomex = 'https://www.dupont.com/content/dam/dupont/amer/us/en/personal-protection/public/documents/en/Nomex%28R%29%20Fiber%20Technical%20Guide.pdf';
const sibal = 'https://www.nasa.gov/humans-in-space/the-flame-of-discovery-grows-as-saffire-sets-new-fires-in-space/';
const profile = (melt, char, flame, smolder, note, sources = []) => Object.freeze({
  melt, char, flame, smolder, note, sources: Object.freeze(sources), evidenceMode: 'schematic'
});

// Reference metadata only; never used as the dimensionless reaction engine's thresholds.
export const THERMAL_REFERENCES = Object.freeze({
  'mylar-g': { label: 'Melting point', value: 'Grade-specific value not verified' },
  'ultem-1000': { label: 'Glass transition (Tg)', value: '217 °C · reference', sourceLabel: 'SABIC',
    source: 'https://materialfinder.sabic-specialties.com/material/ultem-resin-1000', note: 'Tg is not a melting or ignition temperature.' },
  'nomex-ht90': { label: 'Melt behaviour', value: 'Does not melt; chars', sourceLabel: 'DuPont', source: nomex },
  'nomex-velcro': { label: 'Fibre melt behaviour', value: 'Nomex chars; assembly unverified', sourceLabel: 'DuPont', source: nomex },
  sibal: { label: 'Thermal reference', value: 'Blend-specific value not verified' },
  pmma: { label: 'Softening reference', value: 'Grade-specific value not verified' },
  polycarbonate: { label: 'Softening reference', value: 'Grade-specific value not verified' },
  p213: { label: 'Thermal reference', value: 'Backing / adhesive data needed' },
  'beefy-t': { label: 'Thermal reference', value: 'No calibrated temperature data' }
});
export const MATERIAL_PROFILES = Object.freeze({
  'mylar-g': profile(true, null, true, null, 'Film softening and flaming are illustrative. No object-specific ignition or spread prediction.'),
  'ultem-1000': profile(true, true, null, null, 'Softening and surface damage are illustrative; autonomous ignition of this comb is not modelled.'),
  'nomex-ht90': profile(false, true, null, null, 'Nomex chars rather than melts. Ignition under a particular atmosphere is not predicted.', [nomex]),
  sibal: profile(false, true, true, null, 'Cotton/fibreglass fabric: the illustration leaves a residue. Blend ratio and consumed mass are not calculated.', [sibal]),
  pmma: profile(true, null, true, null, 'Softening and flaming are illustrative; ruler geometry is not the research specimen.'),
  polycarbonate: profile(true, null, null, null, 'Softening is illustrative. Ignition, charring and smoldering for these goggles are not modelled.'),
  'nomex-velcro': profile(false, true, null, null, 'Nomex-fibre charring is illustrated; this fastener assembly has no calibrated ignition model.', [nomex]),
  p213: profile(null, null, null, null, 'Data gap: the tape backing/adhesive response is not configured. Only heating and cooling are shown.'),
  'beefy-t': profile(false, true, true, true, 'Cotton flaming, charring and smoldering are schematic. Times and oxygen-resource transitions are not experimental thresholds.')
});
