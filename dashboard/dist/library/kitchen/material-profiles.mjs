// Reaction capabilities for the nine shelf products. These are NOT research values and NOT predictions.
//
// What the research collection supports, and what it does not:
//   - The records describe laboratory SPECIMENS of a material (films, fabric strips, rods, sheets) or values a model
//     derived from such tests. None of them tested the everyday object on the shelf (a comb, a glove, a ruler).
//   - So nothing here says that an object ignites, when, or how it burns. A capability only decides whether the
//     shelf may play a schematic animation for a sample of that material.
//
// A capability is one of:
//   'illustrative'  an explicit choice to allow a schematic animation, with the reason given in `basis`
//   'unsupported'   the collection has nothing to hang it on, so it stays off
//
// `support` says how strong the link to the collection is, strongest first:
//   'flame-spread records'        flame speed over a specimen was reported or fitted from tests
//   'oxygen-limit records'        oxygen limits for a burning specimen were reported from tests
//   'model-derived values only'   the collection holds only values a model derived for this material
//
// Choices made here:
//   flaming     'illustrative' for all nine. Every material appears in the collection in a combustion context at
//               one of the three support levels above. For the model-only materials this is the weakest link and
//               the animation is a mechanism illustration, nothing more.
//   smoldering  'illustrative' for Beefy-T only: it is the only material with records labelled smolder. Those
//               records are model-derived, and their own limitation notes that smolder lies outside the model's
//               assumptions, so this too is illustration only.
//   melting, charring  'unsupported' for all nine: no record describes them.
// No number from the research records is copied into this file. To change a capability, edit it here and state
// what supports it in `basis`.

export const NOT_TESTED = 'The everyday object was not tested. Records describe laboratory specimens of the material or model-derived values. The animation is schematic and is not a prediction of fire behaviour.';

const OFF = 'unsupported', SHOW = 'illustrative';
const profile = (productId, material, specimen, support, basis, smoldering = OFF) => Object.freeze({
  productId, material, specimen, support, basis, notTested: NOT_TESTED,
  capabilities: Object.freeze({melting: OFF, charring: OFF, flaming: SHOW, smoldering})
});
const LIMITS = 'Oxygen-limit results for a burning specimen are reported, so a schematic flame is allowed.';
const SPREAD = 'Flame speed over a specimen is reported, so a schematic flame is allowed.';
const MODEL = 'Only model-derived flammability values are held for this material. A schematic flame is allowed as an explicit illustrative choice, on the weakest support level.';

export const PROFILES = Object.freeze({
  'mylar-g': profile('mylar-g', 'Mylar G', 'thin PET film', 'oxygen-limit records', LIMITS),
  'ultem-1000': profile('ultem-1000', 'Ultem 1000', 'thin PEI film', 'oxygen-limit records', LIMITS),
  'nomex-ht90': profile('nomex-ht90', 'Nomex HT90-40', 'aromatic nylon fabric', 'oxygen-limit records', LIMITS),
  'sibal': profile('sibal', 'SIBAL', 'fabric strips', 'flame-spread records', SPREAD),
  'pmma': profile('pmma', 'PMMA', 'rods', 'flame-spread records', SPREAD),
  'polycarbonate': profile('polycarbonate', 'Polycarbonate', 'not stated in these records', 'model-derived values only', MODEL),
  'nomex-velcro': profile('nomex-velcro', 'Nomex Velcro', 'not stated in these records', 'model-derived values only', MODEL),
  'p213': profile('p213', 'P 213', 'not stated in these records', 'model-derived values only', MODEL),
  'beefy-t': profile('beefy-t', 'Beefy-T', 'not stated in these records', 'model-derived values only',
    MODEL + ' Its records are labelled flaming and smolder, so schematic smoldering is also allowed; the source notes smolder lies outside its model assumptions.', SHOW)
});
export const PRODUCT_IDS = Object.freeze(Object.keys(PROFILES));
