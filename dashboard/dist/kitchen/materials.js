import * as THREE from 'three';

// User-supplied surface scans. Color data and roughness data use different color spaces.
const WOOD_URL = 'textures/tonyyuntaolu_Seamless_smooth_sanded_hard_maple_wood_texture_s_136f4285-c1df-455c-9877-22387a9b45bd_1.png';
const METAL_URL = 'textures/tonyyuntaolu_Seamless_grayscale_roughness_texture_for_lightly_95cdd381-e47f-41ed-ba2e-66c1f99aaab0_3.png';

function configureTexture(texture, renderer, colorSpace) {
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function metalRoughness(source, renderer) {
  // This is a roughness approximation, not measured surface data. Bound the
  // generated image's strong contrast to 0.30–0.44 so it cannot create mirror patches.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source.image, 0, 0, 512, 512);
  const pixels = context.getImageData(0, 0, 512, 512);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / (3 * 255);
    const value = Math.round(255 * (0.30 + 0.14 * gray));
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = configureTexture(new THREE.CanvasTexture(canvas), renderer, THREE.NoColorSpace);
  texture.name = 'Brushed metal roughness 0.30–0.44';
  source.dispose();
  return texture;
}

function ensurePanUV(geometry) {
  if (geometry.getAttribute('uv')) return;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (Math.abs(normal.getY(i)) > 0.65) {
      uv[i * 2] = (x - bounds.min.x) / Math.max(size.x, 1e-6);
      uv[i * 2 + 1] = (z - bounds.min.z) / Math.max(size.z, 1e-6);
    } else {
      uv[i * 2] = Math.atan2(z - center.z, x - center.x) / (2 * Math.PI) + 0.5;
      uv[i * 2 + 1] = (y - bounds.min.y) / Math.max(size.y, 1e-6);
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function metalReflections(renderer) {
  // A small, static reflection rig is used only by the exposed metal. The
  // rendered sky is a separate shader and does not supply PBR reflections.
  const rig = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vDirection; void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vDirection; void main(){float h=smoothstep(-0.5,0.8,normalize(vDirection).y);gl_FragColor=vec4(mix(vec3(0.045,0.05,0.06),vec3(0.75,0.82,0.95),h),1.0);}'
    }));
  rig.add(dome);
  const panels = [
    { size: [5, 3], position: [0, 4, 0], color: 0xfff5e5, strength: 2.5 },
    { size: [3, 4], position: [-4, 1, 2], color: 0xd9e7ff, strength: 2 },
    { size: [1, 4], position: [4, 0, -2], color: 0xffffff, strength: 3 }
  ];
  for (const { size, position, color, strength } of panels) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(...size),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), side: THREE.DoubleSide }));
    panel.position.set(...position);
    panel.lookAt(0, 0, 0);
    rig.add(panel);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const reflections = generator.fromScene(rig, 0.025, 0.1, 12);
  reflections.texture.name = 'Kitchen metal reflection rig';
  generator.dispose();
  rig.traverse(object => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
  return reflections.texture;
}

export async function applySurfaceMaterials(props, renderer) {
  const loader = new THREE.TextureLoader();
  const loaded = await Promise.allSettled([loader.loadAsync(WOOD_URL), loader.loadAsync(METAL_URL)]);
  const status = { wood: false, metalMeshes: 0 };
  if (loaded[0].status === 'fulfilled') {
    const board = props.bodies.find(b => b.name === 'board')?.mesh;
    if (board) {
      const texture = configureTexture(loaded[0].value, renderer, THREE.SRGBColorSpace);
      texture.name = 'Sanded maple albedo';
      // White tint preserves the scan's pale maple color instead of multiplying
      // it by the old dark brown placeholder material.
      board.material = new THREE.MeshStandardMaterial({
        name: 'Sanded maple', map: texture, color: 0xffffff, metalness: 0, roughness: 0.68
      });
      status.wood = true;
    } else loaded[0].value.dispose();
  } else console.warn('Maple texture unavailable; retaining the existing board material.', loaded[0].reason);

  if (loaded[1].status === 'fulfilled') {
    const texture = metalRoughness(loaded[1].value, renderer);
    const reflections = metalReflections(renderer);
    for (const name of ['pan', 'oil']) {
      const root = props.bodies.find(b => b.name === name)?.mesh;
      root?.traverse(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const targets = materials.filter(material => ['Material_42', 'Material_62'].includes(material.name));
        if (!targets.length) return;
        ensurePanUV(object.geometry);
        for (const material of targets) {
          material.color.set(0xb8bdc4);
          material.metalness = 1;
          material.roughnessMap = texture;
          material.roughness = 0.85;
          material.envMap = reflections;
          material.envMapIntensity = 1.15;
          material.userData.finish = 'brushed-stainless-steel';
          material.needsUpdate = true;
        }
        status.metalMeshes++;
      });
    }
    if (!status.metalMeshes) { texture.dispose(); reflections.dispose(); }
  } else console.warn('Metal texture unavailable; retaining the existing metal materials.', loaded[1].reason);
  return status;
}
