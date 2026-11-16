// Reaction capabilities for the nine shelf products. These are NOT research values.
//
// A capability is one of:
//   'illustrative'  the shelf may show it as a schematic animation
//   'unsupported'   nothing in the research collection describes it for this material, so it stays off
//
// Basis for the choices below:
//   flaming     every one of the nine materials appears in the collection as a specimen in flame-spread or
//               flammability-limit work, so a schematic flame is allowed. It is not a prediction that the
//               everyday object burns, or of when.
//   smoldering  only Beefy-T has records labelled as smolder, so only it may show smoldering.
//   melting, charring  no record in the collection describes them for any of the nine, so they are off.
// No number from the 59 records is copied here, and no temperature, ignition point or oxygen percentage exists
// in this file. To enable a capability later, change it here and say what supports it in `basis`.

const flamingOnly = Object.freeze({melting: 'unsupported', charring: 'unsupported', flaming: 'illustrative', smoldering: 'unsupported'});
const FLAME_BASIS = 'Appears as a test specimen in flame-spread or flammability-limit records; schematic only.';

export const PRODUCT_IDS = Object.freeze(['mylar-g', 'ultem-1000', 'nomex-ht90', 'sibal', 'pmma', 'polycarbonate', 'nomex-velcro', 'p213', 'beefy-t']);

export const PROFILES = Object.freeze(Object.fromEntries(PRODUCT_IDS.map(productId => [productId, Object.freeze(
  productId === 'beefy-t'
    ? {productId, capabilities: Object.freeze({...flamingOnly, smoldering: 'illustrative'}),
        basis: FLAME_BASIS + ' Its records are labelled flaming and smolder, so smoldering may also be shown.'}
    : {productId, capabilities: flamingOnly, basis: FLAME_BASIS})])));
