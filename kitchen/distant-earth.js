// Distant Earth seen from the orbital cabin (the "Distant Earth" mesh in models/landing/orbital-cabin.glb, ~2.1 m
// radius, ~122 m from the flame).
//
// Scanned by the global scan at its own speed: the front is the main wave's sphere of radius R around the flame, and
// the scan lines use the main pass's spacing and trail, drawn on the globe's 3D surface. When entering space the globe
// exists only where the front has passed (distance to the flame < R); when leaving, only where it has not yet arrived.
//
// Differences from the rest of the orbital cabin (main.js clipBySweep):
//   - hard cut exactly at the front (eD = R), so the reveal edge sits under the scan's front line;
//   - scan lines at full strength: the main pass fades its lines out from ~121 m on, which is right where the Earth is;
//   - no fog: leaving space, the next world's sky and fog (fogFar 110 m) arrive before the front reaches 122 m and used
//     to wash the globe out early; now it stays until the front itself takes it;
//   - shaded as a sphere (sun terminator + atmosphere rim, from the true sphere normal); the unlit vertex colours read as
//     a flat disc.
import * as THREE from 'three';

export class DistantEarth {
  constructor(scene, flame) {
    this.scene = scene; this.mesh = null;
    this.U = {
      uR: { value: 1e5 }, uRole: { value: 3 }, uTrail: { value: 1 }, uSpacing: { value: 1 },
      uO: { value: flame.clone() }, uC: { value: new THREE.Vector3() },
      uSun: { value: new THREE.Vector3(0.62, 0.38, 0.69).normalize() },
      uLine: { value: new THREE.Color(0.45, 0.82, 1.0) }, uFront: { value: new THREE.Color(1, 1, 1) },
      uAir: { value: new THREE.Color(0.35, 0.62, 1.0) }
    };
  }

  // Takes over the GLB mesh: own material, moved out of the orbital group so the group's soft sweep clip no longer
  // applies (visibility is set from the group in update). Returns the mesh.
  adopt(mesh) {
    const U = this.U, m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    m.userData.sweepClip = true;                    // main.js clipBySweep() skips materials marked like this
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vEW;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n vEW = (modelMatrix * vec4(transformed, 1.)).xyz;');
      sh.fragmentShader = `varying vec3 vEW;
        uniform float uR, uRole, uTrail, uSpacing; uniform vec3 uO, uC, uSun, uLine, uFront, uAir;\n` +
        sh.fragmentShader
          .replace('void main() {', `void main() {
            float eB = uR - distance(vEW, uO);           // metres behind the front (> 0: the scan has passed)
            // uRole as in main.js: 1 = old state (only ahead of the front), 2 = new state (only behind it), 3 = steady
            if (uRole < 1.5 && eB > 0.) discard;
            if (uRole > 1.5 && uRole < 2.5 && eB < 0.) discard;`)
          .replace('#include <opaque_fragment>', `
            vec3 eN = normalize(vEW - uC);                                    // true sphere normal
            float eRim = pow(1. - max(dot(eN, normalize(cameraPosition - vEW)), 0.), 2.6);
            float eSun = max(dot(eN, uSun), 0.);
            outgoingLight *= .16 + .95 * smoothstep(-.08, .45, eSun);         // day side and a soft terminator
            outgoingLight += uAir * eRim * (.18 + .5 * smoothstep(-.2, .5, eSun));   // atmosphere glow on the limb
            if (uR < 1e4) {                                                   // same masks as the scan pass (wave.js)
              float fw = max(fwidth(eB), 1e-4);
              float trail = step(0., eB) * (1. - smoothstep(0., uTrail, eB));
              float front = 1. - smoothstep(0., max(fw * 1.5, .02), abs(eB));
              float g = fract(eB / uSpacing);
              float lines = (1. - smoothstep(0., max(fw * .9, uSpacing * .035), min(g, 1. - g) * uSpacing)) * trail;
              float glow = step(0., eB) * exp(-max(eB, 0.) / max(uTrail * .12, .05));
              outgoingLight *= 1. - .38 * trail;
              outgoingLight += uLine * (lines * 1.4 + glow * .6 + eRim * trail * .8) + uFront * front * 1.8;
            }
            #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'distant-earth-scan-6';
    mesh.material = m;
    this.scene.attach(mesh);                        // keep its world transform
    mesh.updateMatrixWorld(true);
    mesh.geometry.computeBoundingSphere();
    U.uC.value.copy(mesh.geometry.boundingSphere.center).applyMatrix4(mesh.matrixWorld);
    mesh.visible = false;
    this.mesh = mesh;
    return mesh;
  }

  // Every frame, from the global scan: R = front radius (1e5 when no scan), trail / spacing = the scan pass's values,
  // role = the orbital cabin's role, visible = whether the cabin is drawn at all.
  update({ R, trail, spacing, role, visible }) {
    const U = this.U;
    U.uR.value = R; U.uTrail.value = trail; U.uSpacing.value = spacing; U.uRole.value = role;
    if (this.mesh) this.mesh.visible = visible;
  }
}
