// SORAINE shelf catalog. One entry per everyday object; research numbers are NOT copied here, only measurement_id
// references resolved at runtime through research-source.js. The object forms are a design proposal: they suggest
// each material's character; the tested specimens were mostly films, fabrics or rods (shown in the detail view).
//
// Models: the user's selection (SHELF_PLAN "已确认的模型选择", source code M01-M04 / C01-C05), copied to models/shop/.
//   model: { kind: 'glb', url, source, fallback }   GLB used at its own scale (metres) with its own materials and
//                                                    textures; `fallback` names a shop-shapes.js placeholder used only
//                                                    if the GLB fails to load.
//   model: { kind: 'procedural', build }            placeholder only
// collider: 'box' [x, y, z] = the GLB's measured bounding box. Thin items (comb, ruler) keep a 14 mm box because
// cannon-es is unstable on thinner box contacts; the visual sits on the collider's bottom face.
// phys: mass in kg and surface factor key in props.js PHYS. All physical numbers are demo estimates (demo: true).

export const CATEGORIES = [
  ['films', 'Films'], ['rigid', 'Rigid plastics'], ['textiles', 'Textiles'], ['fasteners', 'Fasteners'], ['tapes', 'Tapes']
];

// measurementIds are literal lists on purpose: backend/contracts.py reads them to prove E001-E059 are each used once.

export const PRODUCTS = [
  { id: 'mylar-g', name: 'Clear document sleeve', label:'PET sleeve', category: 'films',
    materials: ['Mylar G'], measurementIds: ['E001', 'E004', 'E007', 'E010', 'E013', 'E016', 'E019', 'E022', 'E025', 'E028', 'E031'],
    form: 'Thin edge, open side, one curled corner, clear film.',
    specimen: 'Tested as thin PET film strips (see each record’s conditions).',
    model: { kind: 'glb', url: 'models/shop/mylar-sleeve.glb', source: 'C01', fallback: 'sleeve' }, collider: { shape: 'box', dims: [0.220, 0.048, 0.290] },
    phys: { mass: 0.02, surface: 'film' }, demo: true },
  { id: 'ultem-1000', name: 'Amber comb', label:'Amber comb', category: 'rigid',
    materials: ['Ultem 1000'], measurementIds: ['E002', 'E005', 'E008', 'E011', 'E014', 'E017', 'E020', 'E023', 'E026', 'E029', 'E032'],
    form: 'Tea-amber translucent, rigid spine, distinct teeth.',
    specimen: 'Tested as thin film, not a moulded part. The comb only carries the material’s natural amber look.',
    model: { kind: 'glb', url: 'models/shop/ultem-comb.glb', source: 'C02', fallback: 'comb' }, collider: { shape: 'box', dims: [0.190, 0.014, 0.089] },
    phys: { mass: 0.02, surface: 'plastic' }, demo: true },
  { id: 'nomex-ht90', name: 'Protective glove shell', label:'Nomex glove', category: 'textiles',
    materials: ['Nomex HT90-40'], measurementIds: ['E003', 'E006', 'E009', 'E012', 'E015', 'E018', 'E021', 'E024', 'E027', 'E030', 'E033'],
    form: 'Beige matte weave, thumb and cuff outline.',
    specimen: 'Tested as flat fabric samples.',
    model: { kind: 'glb', url: 'models/shop/nomex-glove.glb', source: 'M01', fallback: 'glove' }, collider: { shape: 'box', dims: [0.148, 0.040, 0.262] },
    phys: { mass: 0.05, surface: 'fabric' }, demo: true },
  { id: 'sibal', name: 'Lab wipe cloth', label:'SIBAL cloth', category: 'textiles',
    materials: ['SIBAL'], measurementIds: ['E034', 'E035', 'E036', 'E037', 'E040', 'E041'],
    form: 'Off-white coarse weave, folded corner, thin layered sheet.',
    specimen: 'Cotton / fibreglass fabric strips, e.g. 5 cm × 30 cm (see conditions).',
    model: { kind: 'glb', url: 'models/shop/sibal-cloth.glb', source: 'C03', fallback: 'cloth' }, collider: { shape: 'box', dims: [0.252, 0.080, 0.242] },
    phys: { mass: 0.03, surface: 'fabric' }, demo: true },
  { id: 'pmma', name: 'Clear ruler', label:'Acrylic ruler', category: 'rigid',
    materials: ['PMMA'], measurementIds: ['E038', 'E039', 'E042', 'E043', 'E044'],
    form: 'Straight hard edge, visible clear thickness, a few ticks.',
    specimen: 'Tested as rods and sheets, depending on the study.',
    model: { kind: 'glb', url: 'models/shop/pmma-ruler.glb', source: 'C04', fallback: 'ruler' }, collider: { shape: 'box', dims: [0.260, 0.014, 0.038] },
    phys: { mass: 0.03, surface: 'plastic' }, demo: true },
  { id: 'polycarbonate', name: 'Clear safety goggles', label:'PC goggles', category: 'rigid',
    materials: ['Polycarbonate'], measurementIds: ['E045', 'E046', 'E047'],
    form: 'Curved one-piece lens, nose notch, clear side wings.',
    specimen: 'Tested as flat samples; values come from a model built on experiments.',
    model: { kind: 'glb', url: 'models/shop/polycarbonate-goggles.glb', source: 'M02', fallback: 'lens' }, collider: { shape: 'box', dims: [0.172, 0.056, 0.087] },
    phys: { mass: 0.03, surface: 'plastic' }, demo: true },
  { id: 'nomex-velcro', name: 'Cable tie strap', label:'Cable strap', category: 'fasteners',
    materials: ['Nomex Velcro'], measurementIds: ['E048', 'E049', 'E050'],
    form: 'Hook face, loop face, a lifted tail.',
    specimen: 'Tested as hook-and-loop fastener strips.',
    model: { kind: 'glb', url: 'models/shop/nomex-velcro-strap.glb', source: 'M03', fallback: 'strap' }, collider: { shape: 'box', dims: [0.198, 0.072, 0.030] },
    phys: { mass: 0.02, surface: 'fabric' }, demo: true },
  { id: 'p213', name: 'White cloth tape', label:'Cloth tape', category: 'tapes',
    materials: ['P 213'], measurementIds: ['E051', 'E052', 'E053'],
    form: 'Hollow core, glass-cloth texture, a pulled-out adhesive tail.',
    specimen: 'Tested as tape strips.',
    model: { kind: 'glb', url: 'models/shop/p213-tape.glb', source: 'C05', fallback: 'tape' }, collider: { shape: 'box', dims: [0.194, 0.114, 0.040] },
    phys: { mass: 0.06, surface: 'tape' }, demo: true },
  { id: 'beefy-t', name: 'Folded cotton T-shirt', label:'Cotton T-shirt', category: 'textiles',
    materials: ['Beefy-T (flaming)', 'Beefy-T (smolder)'], measurementIds: ['E054', 'E055', 'E056', 'E057', 'E058', 'E059'],
    form: 'Collar, one folded sleeve, knit texture, soft creases.',
    specimen: 'One cotton fabric, two burning modes: flaming and smoldering are listed separately.',
    model: { kind: 'glb', url: 'models/shop/beefy-t-shirt.glb', source: 'M04', fallback: 'tshirt' }, collider: { shape: 'box', dims: [0.276, 0.046, 0.212] },
    phys: { mass: 0.16, surface: 'fabric' }, demo: true },
];

const listeners = new Set();
export const onCatalogChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
// Later objects or materials can be added at runtime with the same entry shape.
export function registerProduct(entry) {
  if (!entry?.id || PRODUCTS.some(p => p.id === entry.id)) throw new Error('Product id missing or already used: ' + entry?.id);
  if (!entry.model || !entry.collider || !entry.phys || !Array.isArray(entry.measurementIds)) throw new Error('Product entry incomplete: ' + entry.id);
  PRODUCTS.push({ demo: true, materials: [], ...entry });
  listeners.forEach(fn => fn(entry));
  return entry;
}
export const productById = (id) => PRODUCTS.find(p => p.id === id);
