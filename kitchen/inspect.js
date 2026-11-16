import * as THREE from 'three';
import { OBJECT_INFO } from './object-info.js?v=object-inspect-1';

export class ObjectInspector {
  constructor({ props, canvas, camera, getRig, moveCamera, getScenario, canOpen, isObserve }) {
    Object.assign(this, { props, canvas, camera, getRig, moveCamera, getScenario, canOpen, isObserve });
    this.active = null;
    this.focus = new THREE.Vector3();
    this.focusRange = .03;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.objects = props.bodies.filter(body => OBJECT_INFO[body.name]);
    this.tools = document.createElement('div');
    this.tools.id = 'object-tools';
    this.tools.hidden = true;
    this.tools.innerHTML = `<button id="objects-toggle" type="button" aria-expanded="false" aria-controls="object-menu">Objects <span>${String(this.objects.length).padStart(2, '0')}</span><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button>
      <div id="object-menu" hidden><p>Choose an object to inspect</p>${this.objects.map((body, i) => `<button type="button" data-object="${body.name}"><span class="object-menu-index">${String(i + 1).padStart(2, '0')}</span><span>${OBJECT_INFO[body.name].title}</span><span aria-hidden="true">↗</span></button>`).join('')}</div>`;
    this.panel = document.createElement('section');
    this.panel.id = 'object-inspector';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'object-title');
    this.panel.innerHTML = `<div class="object-scrim" aria-hidden="true"></div>
      <button type="button" id="object-close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m14 5-7 7 7 7M7 12h14"/></svg>Back to scene<span class="object-escape">Esc</span></button>
      <div class="object-pause"><i></i>Observation paused</div>
      <aside class="object-copy">
        <div class="object-copy-scroll"><div class="object-overline"><span id="object-number"></span><span id="object-context"></span></div>
          <h2 id="object-title"></h2><p id="object-kind"></p><p id="object-intro"></p>
          <dl class="object-facts"><div><dt>Surface shown</dt><dd id="object-surface"></dd></div><div><dt>Scene role</dt><dd id="object-role"></dd></div></dl>
          <h3>What to try</h3><p id="object-action"></p><h3>What to watch</h3><p id="object-observe"></p>
          <p id="object-note"></p><a id="object-research" href="dashboard/">Explore the research <span aria-hidden="true">↗</span></a>
        </div>
        <nav class="object-nav" aria-label="Object details"><button id="object-prev" type="button" aria-label="Previous object">← <span>Previous</span></button><span id="object-counter" aria-live="polite"></span><button id="object-next" type="button" aria-label="Next object"><span>Next</span> →</button></nav>
      </aside>`;
    this.hint = document.createElement('div');
    this.hint.id = 'object-hover';
    this.hint.hidden = true;
    this.hint.innerHTML = '<strong></strong><span>Click to inspect · drag to move</span>';
    document.body.append(this.tools, this.panel, this.hint);
    this.toggle = this.tools.querySelector('#objects-toggle');
    this.menu = this.tools.querySelector('#object-menu');
    this.closeButton = this.panel.querySelector('#object-close');
    this.toggle.addEventListener('click', () => this.setMenu(this.menu.hidden));
    this.menu.querySelectorAll('[data-object]').forEach(button => button.addEventListener('click', () => this.open(this.objects.find(body => body.name === button.dataset.object))));
    this.closeButton.addEventListener('click', () => this.close());
    this.panel.querySelector('#object-prev').addEventListener('click', () => this.step(-1));
    this.panel.querySelector('#object-next').addEventListener('click', () => this.step(1));
    this.props.onInspect = body => this.open(body);
    this.ray = new THREE.Raycaster();
    canvas.addEventListener('pointermove', event => { this.pointer = event.pointerType === 'touch' ? null : { x: event.clientX, y: event.clientY }; });
    canvas.addEventListener('pointerleave', () => this.clearHover());
    canvas.addEventListener('pointerdown', event => {
      this.setMenu(false);
      if (!this.active) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.close();
    }, true);
    document.addEventListener('pointerdown', event => { if (!this.tools.contains(event.target)) this.setMenu(false); });
    window.addEventListener('keydown', event => this.keydown(event), true);
    addEventListener('resize', () => { if (this.active) this.frameObject(.25); });
  }

  setMenu(open) {
    this.menu.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }

  clearHover() {
    this.pointer = null;
    this.hint.hidden = true;
    if (!this.props.held) this.canvas.style.cursor = '';
  }

  open(body) {
    if (!body || !OBJECT_INFO[body.name] || (!this.active && !this.canOpen())) return false;
    if (!this.active) {
      this.savedRig = this.getRig();
      this.savedNear = this.camera.near;
      this.returnFocus = this.tools.contains(document.activeElement) ? this.toggle : document.activeElement;
      this.camera.near = .02;
    }
    this.props.up();
    this.active = body;
    this.clearHover();
    this.setMenu(false);
    this.panel.hidden = false;
    document.body.classList.add('inspecting-object');
    for (const id of ['observe', 'dots']) document.getElementById(id).inert = true;
    const info = OBJECT_INFO[body.name], index = this.objects.indexOf(body), scenario = this.getScenario();
    const text = (id, value) => { this.panel.querySelector(id).textContent = value; };
    text('#object-number', `OBJECT ${String(index + 1).padStart(2, '0')}`);
    text('#object-context', scenario ? `${scenario.label} · ${scenario.g.toFixed(2)} m/s²` : 'Scene observation');
    for (const key of ['title', 'kind', 'intro', 'surface', 'role', 'action', 'observe', 'note']) text(`#object-${key}`, info[key]);
    text('#object-counter', `${String(index + 1).padStart(2, '0')} / ${String(this.objects.length).padStart(2, '0')}`);
    this.panel.querySelector('#object-research').href = `dashboard/?gravity=${encodeURIComponent(scenario?.slug === 'iss' ? 'Microgravity' : scenario?.label || 'Earth')}`;
    this.panel.querySelector('.object-copy-scroll').scrollTop = 0;
    this.frameObject(this.motion.matches ? .08 : .9);
    this.closeButton.focus({ preventScroll: true });
    return true;
  }

  frameObject(duration) {
    if (!this.active) return;
    this.active.mesh.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(this.active.mesh);
    if (bounds.isEmpty()) return;
    bounds.getCenter(this.focus);
    const mobile = innerWidth <= 700;
    const flat = ['pan', 'friedEgg', 'board'].includes(this.active.name);
    const direction = this.savedRig.pos.clone().sub(this.savedRig.look);
    direction.y = 0;
    if (direction.lengthSq() < .001) direction.set(.2, 0, 1);
    direction.normalize().add(new THREE.Vector3(0, flat ? .9 : .45, 0)).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    let halfWidth = 0, halfHeight = 0, halfDepth = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const corner = new THREE.Vector3(x, y, z).sub(this.focus);
      halfWidth = Math.max(halfWidth, Math.abs(corner.dot(right)));
      halfHeight = Math.max(halfHeight, Math.abs(corner.dot(up)));
      halfDepth = Math.max(halfDepth, Math.abs(corner.dot(direction)));
    }
    const fov = 35, tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2)), tanH = tanV * innerWidth / innerHeight;
    const distance = Math.max(.22, halfDepth + Math.max(halfHeight / (tanV * (mobile ? .34 : .7)), halfWidth / (tanH * (mobile ? .78 : .48))));
    const look = this.focus.clone();
    if (mobile) look.addScaledVector(up, -distance * tanV * .48);
    else look.addScaledVector(right, distance * tanH * .38);
    // Shift the camera and target together to keep the focal plane perpendicular
    // to the same viewing direction while placing the object beside the text.
    const offset = look.clone().sub(this.focus);
    const pos = this.focus.clone().addScaledVector(direction, distance).add(offset);
    this.focusRange = Math.max(.018, halfDepth * 1.05);
    this.targetRig = { pos, look, fov };
    this.moveCamera(this.targetRig, duration);
  }

  close({ restore = true } = {}) {
    if (!this.active) return;
    this.active = null;
    this.panel.hidden = true;
    document.body.classList.remove('inspecting-object');
    for (const id of ['observe', 'dots']) document.getElementById(id).inert = false;
    this.camera.near = this.savedNear;
    if (restore && this.savedRig) this.moveCamera(this.savedRig, this.motion.matches ? .08 : .7);
    this.tools.hidden = !this.isObserve();
    const focus = this.returnFocus?.isConnected && this.returnFocus !== document.body && !this.returnFocus.inert ? this.returnFocus : this.toggle;
    if (this.isObserve()) focus.focus({ preventScroll: true });
  }

  step(direction) {
    if (!this.active) return;
    const index = this.objects.indexOf(this.active);
    this.open(this.objects[(index + direction + this.objects.length) % this.objects.length]);
  }

  keydown(event) {
    if (!this.active) {
      if (event.key === 'Escape' && !this.menu.hidden) { this.setMenu(false); this.toggle.focus(); event.stopImmediatePropagation(); }
      return;
    }
    if (['Escape', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') this.close();
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') this.step(event.key === 'ArrowLeft' ? -1 : 1);
      else {
        const controls = [...this.panel.querySelectorAll('button, a[href]')].filter(element => element.getClientRects().length);
        const index = controls.indexOf(document.activeElement);
        controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
      }
    }
  }

  update() {
    this.tools.hidden = !this.isObserve() || !!this.active;
    this.toggle.disabled = !this.canOpen();
    if (this.active || !this.canOpen() || this.props.held || this.props.pending || !this.pointer) {
      this.hint.hidden = true;
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((this.pointer.x - rect.left) / rect.width * 2 - 1, 1 - (this.pointer.y - rect.top) / rect.height * 2), this.camera);
    const hit = this.ray.intersectObjects(this.objects.map(body => body.mesh), true)[0];
    const body = hit && this.objects.find(body => body.mesh === hit.object || body.mesh.getObjectById(hit.object.id));
    this.hint.hidden = !body;
    this.canvas.style.cursor = body ? 'pointer' : '';
    if (body) {
      this.hint.querySelector('strong').textContent = OBJECT_INFO[body.name].title;
      this.hint.style.left = `${Math.min(innerWidth - 245, Math.max(12, this.pointer.x + 18))}px`;
      this.hint.style.top = `${Math.min(innerHeight - 72, this.pointer.y + 18)}px`;
    }
  }
}
