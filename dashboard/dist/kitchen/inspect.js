import * as THREE from 'three';
import { OBJECT_INFO } from './object-info.js?v=object-inspect-1';
import { THERMAL_REFERENCES } from './material-profiles.js';

const STATE_NAMES = { ambient: 'Ambient', heating: 'Heating', cooling: 'Cooling', none: '', flaming: 'Flaming', smoldering: 'Smoldering', extinguished: 'Extinguished' };
const stateText = s => [STATE_NAMES[s.combustionState], STATE_NAMES[s.thermalState]].filter(Boolean).join(' · ');
const damageText = s => [['Softening / melt', s.damage.melted], ['Charring', s.damage.charred], ['Consumption', s.damage.consumed]]
  .filter(([, v]) => v >= 0.01).map(([name, v]) => `${name} ${Math.round(v * 100)}%`).join(' · ') || 'No lasting change';

export class ObjectInspector {
  constructor({ props, canvas, camera, getRig, moveCamera, getScenario, canOpen, isObserve, reactions, research }) {
    Object.assign(this, { props, canvas, camera, getRig, moveCamera, getScenario, canOpen, isObserve, reactions, research });
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
          <section id="sample-reaction" hidden aria-label="This sample's reaction state">
            <h3>Current sample state · schematic</h3><p id="reaction-status"></p>
            <dl class="object-facts"><div><dt>Heat load</dt><dd id="reaction-heat"></dd></div>
              <div><dt>Temperature</dt><dd>Not modelled</dd></div>
              <div><dt id="reaction-thermal-label">Thermal reference</dt><dd><span id="reaction-thermal"></span> <a id="reaction-thermal-source" target="_blank" rel="noopener noreferrer" hidden>Source ↗</a></dd></div>
              <div><dt>Changes</dt><dd id="reaction-damage"></dd></div></dl>
          </section>
          <dl class="object-facts"><div><dt>Surface shown</dt><dd id="object-surface"></dd></div><div><dt>Scene role</dt><dd id="object-role"></dd></div></dl>
          <h3>What to try</h3><p id="object-action"></p><h3>What to watch</h3><p id="object-observe"></p>
          <p id="object-note"></p><a id="object-research" href="dashboard/">Explore the research <span aria-hidden="true">↗</span></a>
        </div>
        <nav class="object-nav" aria-label="Object details"><button id="object-prev" type="button" aria-label="Previous object">← <span>Previous</span></button><span id="object-counter" aria-live="polite"></span><button id="object-next" type="button" aria-label="Next object"><span>Next</span> →</button></nav>
      </aside>`;
    this.hint = document.createElement('div');
    this.hint.id = 'object-hover';
    this.hint.setAttribute('role', 'tooltip');
    this.hint.hidden = true;
    this.hint.innerHTML = `<strong></strong><dl>
      <div><dt>State</dt><dd data-field="state"></dd></div>
      <div><dt data-label="heat">Heat load</dt><dd data-field="heat"></dd></div>
      <div><dt>Temperature</dt><dd data-field="temperature"></dd></div>
      <div><dt data-label="thermal">Thermal reference</dt><dd data-field="thermal"></dd></div>
      <div><dt data-label="change">Changes</dt><dd data-field="change"></dd></div>
      </dl><small></small>`;
    this.hintFields = Object.fromEntries([...this.hint.querySelectorAll('[data-field]')].map(el => [el.dataset.field, el]));
    document.body.append(this.tools, this.panel, this.hint);
    this.toggle = this.tools.querySelector('#objects-toggle');
    this.menu = this.tools.querySelector('#object-menu');
    this.closeButton = this.panel.querySelector('#object-close');
    this.toggle.addEventListener('click', () => this.setMenu(this.menu.hidden));
    this.menu.addEventListener('click', e => { const button = e.target.closest('[data-object]'); if (button) this.open(this.allObjects().find(body => (body.instanceId || body.name) === button.dataset.object)); });
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
    addEventListener('resize', () => { this.hintSignature = null; if (this.active) this.frameObject(.25); });
  }

  setMenu(open) {
    if (open) this.renderMenu();
    this.menu.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }

  allObjects() { return [...this.objects, ...this.props.bodies.filter(b => b.sample && b.state === 'released')]; }
  infoFor(body) {
    if (!body.sample) return OBJECT_INFO[body.name];
    const p = body.product, s = this.reactions?.getState(body.instanceId);
    return { title: p.label || p.name, kind: p.materials.join(' · '), intro: p.form, surface: p.phys.surface,
      role: `Individual worktop sample · ${body.instanceId}`,
      action: 'Return to the scene and drag this sample near the burner. Move it away to observe cooling.',
      observe: 'Heat tint, surface darkening and gloss represent the configured reaction. Damage remains after cooling.',
      note: `SCHEMATIC · ${s?.note || 'Reaction profile unavailable.'} Heat load and damage are demonstration progress, not temperature or mass. Geometry and collisions remain rigid.` };
  }
  renderMenu() {
    this.menu.replaceChildren();
    for (const [i, body] of this.allObjects().entries()) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.object = body.instanceId || body.name;
      button.innerHTML = '<span class="object-menu-index"></span><span></span><span aria-hidden="true">↗</span>';
      button.children[0].textContent = String(i + 1).padStart(2, '0');
      button.children[1].textContent = this.infoFor(body).title + (body.sample ? ` · ${body.instanceId}` : '');
      this.menu.append(button);
    }
    this.toggle.querySelector('span').textContent = String(this.allObjects().length).padStart(2, '0');
  }

  clearHover() {
    this.pointer = null;
    this.hint.hidden = true;
    if (!this.props.held) this.canvas.style.cursor = '';
  }

  open(body) {
    if (!body || !this.infoFor(body) || (body.sample && body.state !== 'released') || (!this.active && !this.canOpen())) return false;
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
    const objects = this.allObjects(), info = this.infoFor(body), index = objects.indexOf(body), scenario = this.getScenario();
    const text = (id, value) => { this.panel.querySelector(id).textContent = value; };
    text('#object-number', body.sample ? body.instanceId : `OBJECT ${String(index + 1).padStart(2, '0')}`);
    text('#object-context', scenario ? `${scenario.label} · ${scenario.g.toFixed(2)} m/s²` : 'Scene observation');
    for (const key of ['title', 'kind', 'intro', 'surface', 'role', 'action', 'observe', 'note']) text(`#object-${key}`, info[key]);
    text('#object-counter', `${String(index + 1).padStart(2, '0')} / ${String(objects.length).padStart(2, '0')}`);
    const s = body.sample && this.reactions?.getState(body.instanceId);
    this.panel.querySelector('#sample-reaction').hidden = !s;
    if (s) {
      text('#reaction-status', stateText(s));
      text('#reaction-heat', `${Math.round(s.heatLevel * 100)}% · demonstration scale`);
      text('#reaction-damage', damageText(s));
      const ref = THERMAL_REFERENCES[body.product.id];
      text('#reaction-thermal-label', ref?.label || 'Thermal reference');
      text('#reaction-thermal', ref?.value || 'Not verified');
      const source = this.panel.querySelector('#reaction-thermal-source');
      source.hidden = !ref?.source;
      if (ref?.source) { source.href = ref.source; source.title = ref.note || `${ref.sourceLabel} material reference`; }
    }
    const researchLink = new URL('dashboard/', location.href);
    researchLink.searchParams.set('gravity', scenario?.slug === 'iss' ? 'Microgravity' : scenario?.label || 'Earth');
    if (body.sample) {
      researchLink.searchParams.set('material', body.product.materials[0]);
      const rows = this.research?.byIds(body.product.measurementIds) || [];
      researchLink.searchParams.set('view', rows.some(r => /^(ULOI|MOC)/.test(r.metric)) ? 'limits' :
        rows.some(r => r.metric.startsWith('flame_')) ? 'spread' : rows.length ? 'model' : 'sources');
    }
    this.panel.querySelector('#object-research').href = researchLink.href;
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
    const flat = this.active.sample || ['pan', 'friedEgg', 'board'].includes(this.active.name);
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
    const objects = this.allObjects(), index = objects.indexOf(this.active);
    this.open(objects[(index + direction + objects.length) % objects.length]);
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

  updateHint(body) {
    const s = body.sample && this.reactions?.getState(body.instanceId);
    const ref = THERMAL_REFERENCES[body.product?.id];
    const speed = body.body.velocity.length();
    const fields = { state: s ? stateText(s) : speed < .02 ? 'At rest' : 'Moving',
      heat: s ? `${Math.round(s.heatLevel * 100)}% · demo` : `${speed.toFixed(2)} m/s · simulated`,
      temperature: 'Not modelled', thermal: ref?.value || 'Not verified for this object',
      change: s ? damageText(s) : `${Math.round(body.body.mass * 1000)} g · demo` };
    const signature = [body.instanceId || body.name, ...Object.values(fields)].join('|');
    if (signature === this.hintSignature) return;
    this.hintSignature = signature;
    this.hint.dataset.instance = body.instanceId || body.name;
    this.hint.querySelector('strong').textContent = this.infoFor(body).title;
    for (const [key, value] of Object.entries(fields)) this.hintFields[key].textContent = value;
    this.hint.querySelector('[data-label="heat"]').textContent = s ? 'Heat load' : 'Speed';
    this.hint.querySelector('[data-label="thermal"]').textContent = ref?.label || 'Thermal reference';
    this.hint.querySelector('[data-label="change"]').textContent = s ? 'Changes' : 'Mass';
    this.hint.querySelector('small').textContent = ref?.sourceLabel ? `${ref.sourceLabel} reference · ${ref.note || 'Not an ignition threshold.'}` : 'Mechanism demo · temperature is not calculated';
    this.hintSize = this.hint.getBoundingClientRect();
  }

  update() {
    if (this.active && !this.props.bodies.includes(this.active)) this.close();
    this.tools.hidden = !this.isObserve() || !!this.active;
    this.toggle.disabled = !this.canOpen();
    if (this.active || !this.canOpen() || this.props.held || this.props.pending || !this.pointer) {
      this.hint.hidden = true;
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((this.pointer.x - rect.left) / rect.width * 2 - 1, 1 - (this.pointer.y - rect.top) / rect.height * 2), this.camera);
    const objects = this.allObjects(), hit = this.ray.intersectObjects(objects.map(body => body.mesh), true)[0];
    const body = hit && objects.find(body => body.mesh === hit.object || body.mesh.getObjectById(hit.object.id));
    this.hint.hidden = !body;
    this.canvas.style.cursor = body ? 'pointer' : '';
    if (body) {
      const now = performance.now();
      if (body !== this.hoverBody || now - this.hintAt >= 100) { this.updateHint(body); this.hoverBody = body; this.hintAt = now; }
      const { width, height } = this.hintSize;
      const x = this.pointer.x + 18 + width > innerWidth - 12 ? this.pointer.x - width - 18 : this.pointer.x + 18;
      const y = this.pointer.y + 18 + height > innerHeight - 12 ? this.pointer.y - height - 18 : this.pointer.y + 18;
      this.hint.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, x))}px`;
      this.hint.style.top = `${Math.max(12, Math.min(innerHeight - height - 12, y))}px`;
    }
  }
}
