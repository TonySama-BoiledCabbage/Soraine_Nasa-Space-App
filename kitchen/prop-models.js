import * as THREE from 'three';

const ROOT_NAMES = {
  pan: ['pan'], mug: ['mug', 'cup'], egg: ['egg', 'friedegg'], bottle: ['oilbottle', 'bottle', 'oil']
};
const normalizedName = name => name.toLowerCase().replace(/\.\d+$/, '').replace(/[ _-]/g, '');

// Accept either an isolated prop export or its named group inside a full scene.
// Mesh names may change when Blender joins the cup body and handle.
export function fitPropModel(asset, name, part, width, bottom, fallbackHeight) {
  asset.updateWorldMatrix(true, true);
  let root;
  asset.traverse(object => {
    if (!root && ROOT_NAMES[name]?.includes(normalizedName(object.name))) root = object;
  });
  if (!root) {
    const reference = asset.getObjectByName(part);
    if (reference) root = reference.parent === asset ? asset : reference.parent;
  }
  if (!root) {
    let otherProp = false;
    asset.traverse(object => {
      if (Object.entries(ROOT_NAMES).some(([other, names]) => other !== name && names.includes(normalizedName(object.name)))) otherProp = true;
    });
    if (otherProp) throw new Error(`Cannot identify ${name} inside a multi-prop scene. Name its group ${ROOT_NAMES[name][0]}.`);
    root = asset;
  }

  const model = new THREE.Group();
  // attach preserves transforms inherited from the original scene hierarchy.
  model.attach(root);
  model.updateWorldMatrix(true, true);
  const reference = model.getObjectByName(part);
  const axis = !reference && fallbackHeight ? 'y' : 'x';
  const targetSize = axis === 'y' ? fallbackHeight : width;
  const box = new THREE.Box3().setFromObject(reference || model);
  const size = box.getSize(new THREE.Vector3());
  if (box.isEmpty() || !Number.isFinite(size[axis]) || size[axis] <= 1e-6) {
    throw new Error(`${name} has empty or invalid mesh bounds`);
  }
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  const wrapper = new THREE.Group();
  wrapper.name = `${name} visual`;
  wrapper.scale.setScalar(targetSize / size[axis]);
  wrapper.position.y = bottom;
  wrapper.add(model);
  wrapper.userData.modelFit = { root: root.name, reference: reference?.name || null, axis, targetSize };
  model.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  return wrapper;
}
