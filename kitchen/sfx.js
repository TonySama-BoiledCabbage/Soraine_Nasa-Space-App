// Sound effects. One Web Audio context, buffers decoded once and fetched only when first needed.
// Browsers (iOS Safari in particular) keep audio locked until a user gesture, so the context is resumed on the
// first pointer or key press; a sound requested before that is dropped rather than played late.
// Add a sound: put the trimmed MP3 in sounds/ and add a line to SOUNDS (gain is a linear trim per file).
const SOUNDS = {
  'planet-switch': { url: 'sounds/planet-switch.mp3', gain: 1.6 },   // whoosh hit (swell cut off), peak 0.13 s; played with a 0.15 s delay
  'pan-sizzle': { url: 'sounds/pan-sizzle.mp3', gain: 0.3 },         // 6 s seamless loop (crossfaded at the seam), level follows the burner
  'oil-drop-1': { url: 'sounds/oil-drop-1.mp3', gain: 0.22 },        // single drops; played sped up with a random spread
  'oil-drop-2': { url: 'sounds/oil-drop-2.mp3', gain: 0.22 },
  'arm-deploy-1': { url: 'sounds/arm-deploy-1.mp3', gain: 0.5 },     // servo whirr + lock clunk at ~0.55 s (aim settles); three takes
  'arm-deploy-2': { url: 'sounds/arm-deploy-2.mp3', gain: 0.5 },
  'arm-deploy-3': { url: 'sounds/arm-deploy-3.mp3', gain: 0.5 },
  'arm-stow': { url: 'sounds/arm-stow.mp3', gain: 0.45 },            // whirr only, 0.75 s = stow motion
  'oxygen-hiss': { url: 'sounds/oxygen-hiss.mp3', gain: 0.7 },       // 0.93 s steam burst = the 1 s injection pulse
  'ambience-grass': { url: 'sounds/ambience-grass.mp3', gain: 0.25 }, // 16 s seamless loops (1 s crossfaded seam)
  'ambience-wind': { url: 'sounds/ambience-wind.mp3', gain: 0.18 },
  'ambience-cabin': { url: 'sounds/cabin-hum.mp3', gain: 0.3 },     // orbital cabin: ceiling-fan hum, 16 s loop from 11-28 s
  'o2-button': { url: 'sounds/o2-button.mp3', gain: 0.6 },            // press click, release click 0.24 s later
  'fire-loop': { url: 'sounds/fire-loop.mp3', gain: 0.4 }             // 16 s crackling loop: burner flame and burning samples
};
// Impacts by material class, several takes each (picked at random): wood, hard (glass/ceramic/plastic), metal, fabric.
export const HIT_TAKES = { wood: 3, hard: 4, metal: 4, fabric: 4 };
const HIT_GAIN = { wood: 0.5, hard: 0.4, metal: 0.32, fabric: 0.5 };
for (const [k, n] of Object.entries(HIT_TAKES)) for (let i = 1; i <= n; i++) SOUNDS[`hit-${k}-${i}`] = { url: `sounds/hit-${k}-${i}.mp3`, gain: HIT_GAIN[k] };

class Sfx {
  constructor() {
    this.ctx = null; this.master = null; this.buffers = new Map(); this.loading = new Map();
    this.muted = false; this.worldLevel = 1;
    try { this.muted = localStorage.getItem('sfx-muted') === '1'; } catch {}
    // First gesture (the Start button): unlock audio and fetch every sound so the first trigger already has it.
    const unlock = () => { const c = this.context(); c?.resume?.().catch(() => {}); this.preload(...Object.keys(SOUNDS)); };
    for (const type of ['pointerdown', 'keydown', 'touchend']) addEventListener(type, unlock, { capture: true, passive: true });
  }
  context() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 1;
    // Limiter on the mix: a loud one-shot (gain > 1) over the sizzle bed must not clip.
    const lim = this.ctx.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.25;
    // World bus: everything the scene makes passes through it (0 on the Moon: no air, no sound). Mute stays on master.
    this.world = this.ctx.createGain(); this.world.gain.value = this.worldLevel;
    this.master.connect(this.world).connect(lim).connect(this.ctx.destination);
    return this.ctx;
  }
  load(name) {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.loading.has(name)) return this.loading.get(name);
    const def = SOUNDS[name], ctx = this.context(); if (!def || !ctx) return Promise.resolve(null);
    const job = fetch(def.url).then(r => { if (!r.ok) throw new Error(def.url + ' HTTP ' + r.status); return r.arrayBuffer(); })
      .then(data => new Promise((res, rej) => ctx.decodeAudioData(data, res, rej)))   // callback form for older Safari
      .then(buf => { this.buffers.set(name, buf); return buf; })
      .catch(e => { console.warn('Sound unavailable:', name, e); return null; })
      .finally(() => this.loading.delete(name));
    this.loading.set(name, job); return job;
  }
  preload(...names) { for (const n of names) this.load(n); }
  play(name, { volume = 1, rate = 1, delay = 0 } = {}) {
    const ctx = this.context(), buf = this.buffers.get(name);
    if (!ctx || ctx.state !== 'running' || this.muted) { if (!buf) this.load(name); return; }
    if (!buf) { this.load(name); return; }   // first request warms the cache; sound starts from the next trigger
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = (SOUNDS[name].gain ?? 1) * volume;
    src.connect(g).connect(this.master); src.start(ctx.currentTime + delay);
    return src;
  }
  // Looping bed. MP3 encoders pad both ends with digital silence and browsers differ on trimming it, so the loop
  // runs between the first and last non-silent samples. Returns a handle; volume changes are smoothed.
  loop(name, { volume = 0, rate = 1, lowpass = 0 } = {}) {
    const handle = { src: null, gain: null, target: volume, set: (v, tc = 0.15) => {
      handle.target = v; if (handle.gain) handle.gain.gain.setTargetAtTime(v * (SOUNDS[name].gain ?? 1), this.ctx.currentTime, tc); } };
    const start = () => {
      const ctx = this.ctx, buf = this.buffers.get(name);   // ctx exists only after the first gesture unlocked audio
      if (handle.src || !ctx || !buf || ctx.state !== 'running') return false;
      const d = buf.getChannelData(0); let a = 0, b = d.length - 1;
      while (a < b && Math.abs(d[a]) < 1e-4) a++; while (b > a && Math.abs(d[b]) < 1e-4) b--;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.loop = true; src.loopStart = a / buf.sampleRate; src.loopEnd = (b + 1) / buf.sampleRate;
      src.playbackRate.value = rate; g.gain.value = 0;
      if (lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; src.connect(f).connect(g); } else src.connect(g);
      g.connect(this.master); src.start(0, src.loopStart);
      handle.src = src; handle.gain = g; handle.set(handle.target, 0.4);
      return true;
    };
    handle.tick = () => handle.src || start();   // call each frame until audio is unlocked and the buffer has arrived
    handle.stop = () => { handle.src?.stop(); handle.src = null; handle.gain = null; };
    return handle;   // the buffer is fetched by the first-gesture preload
  }
  // 0..1 for the current world; called every frame with an already smooth value.
  setWorld(v) {
    this.worldLevel = v;
    if (this.world && Math.abs(this.world.gain.value - v) > 1e-3) this.world.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  // One of several takes, chosen at random.
  pick(...names) { return names[Math.floor(Math.random() * names.length)]; }
  setMuted(m) {
    this.muted = !!m; try { localStorage.setItem('sfx-muted', this.muted ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }
}

export const sfx = new Sfx();
