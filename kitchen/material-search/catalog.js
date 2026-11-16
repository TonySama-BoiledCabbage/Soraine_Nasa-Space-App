// Ported unchanged from goodenough7000/Soraine_Nasa-Space-App codex/mission-control-cloud dashboard/dist/material-catalog.mjs (7bf592e).
// Stable shelf IDs. Object aliases help discovery; they do not identify a product's composition.
export const MATERIAL_CATALOG = [
  {id:'mylar-g',title:'Mylar G',object:'Document sleeve',names:['Mylar G'],aliases:['mylar','pet','polyester film','document sleeve','文件套','文件袋','聚酯薄膜']},
  {id:'ultem-1000',title:'Ultem 1000',object:'Amber comb',names:['Ultem 1000'],aliases:['ultem','pei','comb','梳子','聚醚酰亚胺']},
  {id:'nomex-ht90',title:'Nomex HT90-40',object:'Glove fabric',names:['Nomex HT90-40'],aliases:['nomex','aramid','glove','手套','芳纶','nomex 布']},
  {id:'sibal',title:'SIBAL',object:'Experimental cloth',names:['SIBAL'],aliases:['sibal','cotton/glass','棉玻纤','实验布','织物片']},
  {id:'pmma',title:'PMMA',object:'Clear ruler',names:['PMMA'],aliases:['pmma','acrylic','ruler','亚克力','直尺','聚甲基丙烯酸甲酯']},
  {id:'polycarbonate',title:'Polycarbonate',object:'Goggle lens',names:['Polycarbonate'],aliases:['polycarbonate','pc','goggle','goggles','聚碳酸酯','护目镜','镜片']},
  {id:'nomex-velcro',title:'Nomex Velcro',object:'Cable strap',names:['Nomex Velcro'],aliases:['nomex','velcro','hook and loop','cable strap','魔术贴','理线带','扣带']},
  {id:'p213',title:'P 213',object:'Fabric-backed tape',names:['P 213'],aliases:['p213','p-213','p 213','tape','胶带','玻璃布胶带']},
  {id:'beefy-t',title:'Beefy-T',object:'Cotton T-shirt',names:['Beefy-T (flaming)','Beefy-T (smolder)'],aliases:['beefy-t','beefy t','cotton','t-shirt','t shirt','棉布','棉 t 恤','棉t恤']}
];
export const materialById = id => MATERIAL_CATALOG.find(material=>material.id===id);
export const GRAVITIES = {earth:'Earth',moon:'Moon',mars:'Mars',iss:'Microgravity'};
export function hasPhrase(text, phrase) {
  const escaped=phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(/[\u3400-\u9fff]/.test(phrase)?escaped:`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`,'i').test(text);
}
export function parseLocalQuery(query) {
  const text=query.toLowerCase();
  let materials=MATERIAL_CATALOG.filter(m=>[...m.names,...m.aliases].some(alias=>hasPhrase(text,alias.toLowerCase())));
  if (/transparent|透明/.test(text)&&!materials.length) materials=MATERIAL_CATALOG.filter(m=>['mylar-g','pmma','polycarbonate'].includes(m.id));
  const exact=materials.filter(m=>m.names.some(name=>hasPhrase(text,name.toLowerCase())));
  if(exact.length) materials=exact;
  const worlds=Object.entries({earth:['earth','地球'],moon:['moon','lunar','月球'],mars:['mars','martian','火星'],iss:['iss','microgravity','微重力','国际空间站']}).filter(([,aliases])=>aliases.some(alias=>hasPhrase(text,alias))).map(([id])=>id);
  const modes=[];
  if(/smolder|smoulder|阴燃/.test(text)) modes.push('smolder');
  if(/flaming|明火/.test(text)) modes.push('flaming');
  const fabrics=/fabric|textile|织物/.test(text);
  if(!materials.length&&fabrics) materials=MATERIAL_CATALOG.filter(m=>['nomex-ht90','nomex-velcro','sibal','beefy-t'].includes(m.id));
  return {materials,worlds,modes,issOnly:hasPhrase(text,'iss')||/国际空间站/.test(text),all:/all materials|所有材料/.test(text)};
}
