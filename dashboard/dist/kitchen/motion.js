// Motion curves shared by the camera and the oxygen arm. Pure math, no scene state.
// u is normalised time 0..1; every curve returns 0 at u=0 and exactly 1 at u=1.

export const clamp01 = (u) => u < 0 ? 0 : u > 1 ? 1 : u;
export const smootherstep = (u) => { u = clamp01(u); return u * u * u * (u * (6 * u - 15) + 10); };   // zero speed and acceleration at both ends
export const easeInCubic = (u) => { u = clamp01(u); return u * u * u; };
export const easeOutCubic = (u) => { u = clamp01(u); return 1 - (1 - u) ** 3; };
export const easeInOutSine = (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(u));

// Damped-spring step response squeezed into 0..1. zeta sets the overshoot
// (0.5 ≈ 16 %, 0.56 ≈ 12 %, 0.72 ≈ 3 %, 0.78 ≈ 0.5 %); the spring is ~99 % settled at u=1 and the
// last percent is blended out so the curve lands exactly on 1 with no residual wobble.
export function spring(zeta = 0.55) {
  const w = 4.6 / zeta, wd = w * Math.sqrt(1 - zeta * zeta), k = zeta / Math.sqrt(1 - zeta * zeta);
  const raw = (u) => 1 - Math.exp(-zeta * w * u) * (Math.cos(wd * u) + k * Math.sin(wd * u));
  const end = raw(1);
  return (u) => { u = clamp01(u); return raw(u) + (1 - end) * smootherstep(u); };
}

// Small decaying shake for a recoil: starts at 0, kicks once, rings out in ~0.6 s.
export const kick = (t, freq = 22, decay = 7) => !(t > 0 && t < 2) ? 0 : Math.exp(-decay * t) * Math.sin(freq * t);

// One animated scalar. go() starts from wherever the value is now, so a new move
// can interrupt an old one without a jump. A delayed move holds the current value.
export class Channel {
  constructor(v = 0) { this.v = v; this.from = v; this.to = v; this.t = 0; this.dur = 0; this.curve = smootherstep; }
  go(to, { delay = 0, dur = 0.5, curve = smootherstep } = {}) {
    this.from = this.v; this.to = to; this.t = -delay; this.dur = Math.max(1e-3, dur); this.curve = curve;
  }
  update(dt) {
    this.t += dt;
    if (this.t > 0) this.v = this.from + (this.to - this.from) * this.curve(this.t / this.dur);
    return this.v;
  }
  get done() { return this.t >= this.dur; }
}

// Camera moves. Each rig is {pos, look, fov}. The eye travels on an arc around the
// look point (yaw, pitch, log-distance) instead of a straight line, so a top-down to
// side-on move cranes down rather than cutting through the scene. A retarget keeps the
// current velocity of every channel (cubic Hermite), so overlapping goTo() calls blend
// instead of stopping the camera and re-accelerating.
const N = 7;   // look xyz, yaw, pitch, log distance, fov
export class CameraMotion {
  constructor(THREE, rig) {
    this.THREE = THREE;
    this.pos = rig.pos.clone(); this.look = rig.look.clone(); this.fov = rig.fov;
    this.to = rig; this.t = 1; this.dur = 1;
    this.a = new Float64Array(N); this.b = new Float64Array(N); this.v0 = new Float64Array(N); this.vel = new Float64Array(N); this.x = new Float64Array(N);
    this.off = new THREE.Vector3();
    this.encode(rig.pos, rig.look, rig.fov, this.x);
  }
  get moving() { return this.t < 1; }
  encode(pos, look, fov, out) {
    const o = this.off.subVectors(pos, look), d = Math.max(1e-4, o.length());
    out[0] = look.x; out[1] = look.y; out[2] = look.z;
    out[3] = Math.atan2(o.x, o.z); out[4] = Math.asin(Math.max(-1, Math.min(1, o.y / d))); out[5] = Math.log(d); out[6] = fov;
    return out;
  }
  decode(x) {
    const cp = Math.cos(x[4]), d = Math.exp(x[5]);
    this.look.set(x[0], x[1], x[2]);
    this.pos.set(x[0] + Math.sin(x[3]) * cp * d, x[1] + Math.sin(x[4]) * d, x[2] + Math.cos(x[3]) * cp * d);
    this.fov = x[6];
  }
  snap(rig) {
    this.encode(rig.pos, rig.look, rig.fov, this.x); this.vel.fill(0); this.to = rig; this.t = 1; this.decode(this.x);
  }
  goTo(rig, dur = 1.6) {
    if (rig === this.to && this.moving) return;   // already flying there: keep the current curve
    this.a.set(this.x); this.encode(rig.pos, rig.look, rig.fov, this.b);
    let dy = this.b[3] - this.a[3]; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI; this.b[3] = this.a[3] + dy;   // shortest way round
    this.dur = Math.max(1e-3, dur);
    for (let i = 0; i < N; i++) this.v0[i] = this.vel[i] * this.dur;   // carried speed, in units per whole move
    this.to = rig; this.t = 0;
  }
  update(dt) {
    if (this.t >= 1) { this.vel.fill(0); return; }
    this.t = Math.min(1, this.t + dt / this.dur);
    const u = this.t, h = smootherstep(u), dh = 30 * u * u * (u - 1) * (u - 1);
    const g = u * (1 - u) * (1 - u), dg = (1 - u) * (1 - 3 * u);   // Hermite tangent basis: carries v0, fades to 0
    for (let i = 0; i < N; i++) {
      const D = this.b[i] - this.a[i];
      this.x[i] = this.a[i] + D * h + this.v0[i] * g;
      this.vel[i] = (D * dh + this.v0[i] * dg) / this.dur;
    }
    if (this.t >= 1) { this.x.set(this.b); this.vel.fill(0); }
    this.decode(this.x);
  }
}
