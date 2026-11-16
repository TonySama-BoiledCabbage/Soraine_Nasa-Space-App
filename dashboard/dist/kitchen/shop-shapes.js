// Placeholder forms for the SORAINE shelf: light, recognisable geometry for the nine everyday objects. Each builder
// returns a Group whose origin is the collider centre, with the object resting on the collider's bottom face.
// Built once per product; instances are clones that share geometry and materials. Replace via catalog `model`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const TEX = {};
const tex = (k) => TEX[k] || (TEX[k] = ({
  weave: () => canvasTex(64, (g, s) => { for (let i = 0; i < s; i += 4) { g.fillStyle = (i / 4) % 2 ? '#d8d8d8' : '#c4c4c4'; g.fillRect(i, 0, 2, s); g.fillStyle = '#cfcfcf'; g.fillRect(0, i, s, 1.5); } }, 3),
  coarse: () => canvasTex(64, (g, s) => { for (let i = 0; i < s; i += 6) { g.fillStyle = '#c9c4b8'; g.fillRect(i, 0, 3, s); g.fillStyle = '#d6d1c5'; g.fillRect(0, i, s, 3); } }, 3),
  knit: () => canvasTex(64, (g, s) => { for (let i = 0; i < s; i += 4) { g.fillStyle = '#e2e2e2'; g.fillRect(i, 0, 2, s); } for (let j = 0; j < s; j += 4) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(0, j, s, 1); } }, 4),
  hooks: () => canvasTex(64, (g, s) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, s, s); g.fillStyle = '#d0d0d0'; for (let y = 2; y < s; y += 6) for (let x = (y % 12) ? 2 : 5; x < s; x += 6) g.fillRect(x, y, 2, 2); }, 2),
  glasscloth: () => canvasTex(64, (g, s) => { g.strokeStyle = '#dcdcdc'; g.lineWidth = 1; for (let i = 0; i < s; i += 5) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); } }, 2),
})[k]());

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const clear = (color, opacity, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, ...o });

function finish(group, h) {
  // put the lowest point of the visual on the collider's bottom face
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const lift = -h / 2 - box.min.y;
  group.children.forEach(c => { c.position.y += lift; });
  group.traverse(o => { if (o.isMesh) { o.castShadow = !o.material.transparent || o.material.opacity > 0.3; o.receiveShadow = true; } });
  return group;
}
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
function roundedRect(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
// extruded outline drawn in (x, z) lying flat, thickness along y
function flat(shape, depth, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(Math.PI / 2); g.translate(0, depth / 2, 0); return g;
}

export const SHAPES = {
  sleeve([w, h, d]) {
    const film = clear(0xe6f3f8, 0.32), edge = new THREE.LineBasicMaterial({ color: 0x9fb8c4, transparent: true, opacity: 0.8 });
    const sheet = new THREE.BoxGeometry(w, 0.003, d);
    const g = new THREE.Group();
    g.add(mesh(sheet, film));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(sheet), edge));
    const seam = mesh(new THREE.BoxGeometry(w, 0.0035, 0.004), std(0xcfe2ea, { roughness: 0.3 }), 0, 0, d / 2 - 0.002); g.add(seam);
    const curl = new THREE.CylinderGeometry(0.011, 0.011, 0.06, 14, 1, true, 0, Math.PI * 1.25);
    const c = mesh(curl, film, w / 2 - 0.018, 0.009, -d / 2 + 0.018); c.rotation.set(Math.PI / 2, 0, Math.PI / 4); c.rotation.order = 'YXZ'; c.rotation.y = -Math.PI / 4; g.add(c);
    return finish(g, h);
  },
  comb([w, h, d]) {
    const amber = new THREE.MeshStandardMaterial({ color: 0xc9802a, roughness: 0.28, transparent: true, opacity: 0.86 });
    const parts = [new THREE.BoxGeometry(w, 0.006, 0.016).translate(0, 0, -d / 2 + 0.008)];
    const n = 26;
    for (let i = 0; i < n; i++) parts.push(new THREE.BoxGeometry(0.0026, 0.005, i % 2 ? 0.03 : 0.032).translate(-w / 2 + 0.006 + i * (w - 0.012) / (n - 1), 0, -d / 2 + 0.016 + 0.015));
    return finish(new THREE.Group().add(mesh(mergeGeometries(parts), amber)), h);
  },
  glove([w, h, d]) {
    const s = new THREE.Shape();
    // mitten-style outer shell: cuff at +z, rounded fingertips at -z, thumb lobe on +x
    s.moveTo(-0.042, 0.1); s.lineTo(0.042, 0.1); s.lineTo(0.044, 0.04);
    s.quadraticCurveTo(0.075, 0.03, 0.06, -0.01); s.quadraticCurveTo(0.05, -0.03, 0.043, -0.02);
    s.lineTo(0.044, -0.06); s.quadraticCurveTo(0.044, -0.105, 0, -0.105); s.quadraticCurveTo(-0.046, -0.105, -0.046, -0.06);
    s.lineTo(-0.042, 0.1);
    const fabric = std(0xd8c49b, { roughness: 0.95, map: tex('weave') });
    const g = new THREE.Group();
    g.add(mesh(flat(s, 0.016, 0.004), fabric));
    g.add(mesh(new THREE.BoxGeometry(0.094, 0.026, 0.03), std(0xc4ad80, { roughness: 0.95, map: tex('weave') }), 0, 0.0, 0.09));
    g.add(mesh(new THREE.BoxGeometry(0.002, 0.021, 0.07), std(0xb39b6e), -0.012, 0.0, -0.05));   // seam hint
    return finish(g, h);
  },
  cloth([w, h, d]) {
    const fabric = std(0xece5d5, { roughness: 1, map: tex('coarse'), side: THREE.DoubleSide });
    const base = new THREE.PlaneGeometry(w, d, 12, 12); base.rotateX(-Math.PI / 2);
    const p = base.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, 0.003 * Math.sin(p.getX(i) * 70) * Math.cos(p.getZ(i) * 45));
    base.computeVertexNormals();
    const fold = new THREE.Shape(); fold.moveTo(-w / 2, -d / 2); fold.lineTo(w / 2, -d / 2); fold.lineTo(-w / 2, d / 2); fold.lineTo(-w / 2, -d / 2);
    const g = new THREE.Group();
    g.add(mesh(base, fabric));
    g.add(mesh(flat(fold, 0.004, 0.0015), fabric, 0, 0.007, 0));
    const lip = mesh(new THREE.CylinderGeometry(0.004, 0.004, Math.hypot(w, d), 8), fabric, 0, 0.005, 0); lip.rotation.set(Math.PI / 2, 0, Math.atan2(d, w) - Math.PI / 2); lip.rotation.order = 'YXZ'; lip.rotation.y = Math.atan2(d, w); g.add(lip);
    const corner = mesh(flat(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.035, 0), new THREE.Vector2(0, 0.035)]), 0.003), fabric, w / 2 - 0.035, 0.012, d / 2 - 0.035);
    corner.rotation.z = 0.35; g.add(corner);
    return finish(g, h);
  },
  ruler([w, h, d]) {
    const acrylic = clear(0xe3f2f6, 0.42, { roughness: 0.05 });
    const ticks = [];
    for (let i = 0; i <= 18; i++) ticks.push(new THREE.BoxGeometry(0.0007, 0.0006, i % 5 ? 0.005 : 0.009).translate(-w / 2 + 0.01 + i * 0.01, 0.0023, -d / 2 + (i % 5 ? 0.0025 : 0.0045)));
    const g = new THREE.Group();
    const body = new THREE.BoxGeometry(w, 0.004, d);
    g.add(mesh(body, acrylic));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(body), new THREE.LineBasicMaterial({ color: 0x8fb4c0 })));
    g.add(mesh(mergeGeometries(ticks), std(0x3a3f44, { roughness: 0.6 })));
    return finish(g, h);
  },
  lens([w, h, d]) {
    const R = 0.11, hw = w / 2 - 0.002, hd = d / 2 - 0.002, s = new THREE.Shape();
    s.moveTo(-hw, -hd * 0.3); s.quadraticCurveTo(-hw, hd, -hw * 0.55, hd); s.lineTo(hw * 0.55, hd); s.quadraticCurveTo(hw, hd, hw, -hd * 0.3);
    s.quadraticCurveTo(hw, -hd, hw * 0.45, -hd); s.lineTo(0.016, -hd); s.quadraticCurveTo(0, -hd * 0.2, -0.016, -hd);   // nose notch
    s.lineTo(-hw * 0.45, -hd); s.quadraticCurveTo(-hw, -hd, -hw, -hd * 0.3);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.0025, bevelEnabled: false, curveSegments: 12 });
    geo.translate(0, 0, -0.00125);
    // bend the flat outline around a vertical cylinder, then lay it down concave-up
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = x / R; p.setXYZ(i, (R - z) * Math.sin(a), p.getY(i), R - (R - z) * Math.cos(a)); }
    geo.rotateX(-Math.PI / 2); geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(mesh(geo, clear(0xbcd6df, 0.45, { roughness: 0.05 })));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x7f9ea8 })));
    return finish(g, h);
  },
  strap([w, h, d]) {
    const hook = std(0x3d4248, { roughness: 0.9, map: tex('hooks') }), loop = std(0x5b6168, { roughness: 1 });
    const g = new THREE.Group();
    const main = w * 0.66;
    g.add(mesh(new THREE.BoxGeometry(main, 0.0025, 0.022), loop, -w / 2 + main / 2 + 0.012, 0, 0));
    g.add(mesh(new THREE.BoxGeometry(main * 0.9, 0.0012, 0.02), hook, -w / 2 + main / 2 + 0.014, 0.0018, 0));
    const tail = mesh(new THREE.BoxGeometry(w - main - 0.012, 0.0025, 0.022), hook, 0, 0, 0);
    tail.geometry.translate((w - main - 0.012) / 2, 0, 0); tail.position.set(-w / 2 + main + 0.012, 0.001, 0); tail.rotation.z = 0.5; g.add(tail);
    const ring = mesh(new THREE.TorusGeometry(0.009, 0.0018, 6, 18), std(0x8c9096, { roughness: 0.4, metalness: 0.6 }), -w / 2 + 0.008, 0.002, 0);
    ring.rotation.x = Math.PI / 2; ring.scale.set(0.8, 1.3, 1); g.add(ring);
    return finish(g, h);
  },
  tape([r, h]) {
    const lathe = (r0, r1) => new THREE.LatheGeometry([new THREE.Vector2(r0, -h / 2), new THREE.Vector2(r1, -h / 2), new THREE.Vector2(r1, h / 2), new THREE.Vector2(r0, h / 2), new THREE.Vector2(r0, -h / 2)], 36);
    const cloth = std(0xf2f0ea, { roughness: 0.9, map: tex('glasscloth') }), core = std(0xb08a5c, { roughness: 1 });
    const g = new THREE.Group();
    g.add(mesh(lathe(0.037, r), cloth));
    g.add(mesh(lathe(0.031, 0.037), core));
    const tail = new THREE.CylinderGeometry(r + 0.012, r + 0.012, h * 0.98, 16, 1, true, Math.PI * 0.5, 0.75);
    g.add(mesh(tail, std(0xeae7df, { roughness: 0.8, side: THREE.DoubleSide, map: tex('glasscloth') }), -0.012, 0, 0));
    return finish(g, h);
  },
  tshirt([w, h, d]) {
    const knit = std(0xf4f2ee, { roughness: 0.95, map: tex('knit') });
    const g = new THREE.Group();
    g.add(mesh(flat(roundedRect(w - 0.012, d - 0.012, 0.03), h - 0.014, 0.006), knit));
    const collar = mesh(new THREE.TorusGeometry(0.036, 0.0055, 8, 22, Math.PI), std(0xe6e3dc, { roughness: 0.95, map: tex('knit') }), 0, h / 2, -d / 2 + 0.03);
    collar.rotation.x = -Math.PI / 2; g.add(collar);
    const sleeve = new THREE.Shape(); sleeve.moveTo(0, 0); sleeve.lineTo(0.09, -0.02); sleeve.lineTo(0.1, 0.06); sleeve.lineTo(0.01, 0.075); sleeve.lineTo(0, 0);
    const sl = mesh(flat(sleeve, 0.006, 0.002), knit, w / 2 - 0.115, h / 2 + 0.001, -0.01); sl.rotation.y = 0.12; g.add(sl);
    for (const z of [0.025, 0.06]) g.add(mesh(new THREE.BoxGeometry(w * 0.55, 0.0015, 0.0015), std(0xd9d6cf), -0.02, h / 2 + 0.003, z));   // creases
    return finish(g, h);
  },
};

export function buildShape(product) {
  const { build } = product.model, dims = product.collider.dims;
  const f = SHAPES[build];
  if (!f) throw new Error('No placeholder shape: ' + build);
  const g = f(dims); g.name = product.id; return g;
}
export const colliderHeight = (c) => c.shape === 'cyl' ? c.dims[1] : c.dims[1];
