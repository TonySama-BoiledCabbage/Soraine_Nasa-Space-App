// SORAINE store, following Tony's flow sketch (2026-11-15):
//   shelf    straight-on L01 shelf, 3 x 3, tilted tags (Name + About). ↩ leaves the store. The held basket's rim
//            shows along the bottom; the camera only looks down into it on the Basket button (click again / Esc to return),
//            never because the pointer reached the bottom edge.
//   product  click an item: the camera zooms onto it; text on the left, [− n +] on the right sets how many are in
//            the basket, ◁ ▷ step through the items, ↩ back to the shelf.
//   basket   look-down preview with an "item × n" summary along the top.
//   checkout the labelled "Place on worktop" action stays visible after selection in all three shopping views.
//            The basket is carried to the worktop and tipped out; ↩ only navigates back.
// This module owns DOM and view state. Samples: basket.js. Records: research-source.js. Shelf + rigs: shelf3d.js.
import * as THREE from 'three';
import { PRODUCTS, CATEGORIES } from './catalog.js?v=basket-1';
import { readValue } from './research-source.js?v=basket-1';
import { MAX_ITEMS } from './basket.js?v=feet-1';

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' ? esc(x.href) : '#'; } catch { return '#'; } };
const catLabel = Object.fromEntries(CATEGORIES);
const METRIC = {
  'ULOI*': 'Upward limiting O₂ (low-g criterion)', 'MOC*': 'Minimum O₂ concentration (low-g criterion)', ULOI: 'Upward limiting O₂ index', MOC: 'Minimum O₂ concentration',
  reported_delta_O2_vs_1g: 'O₂ change vs 1 g', flame_base_speed_fit: 'Flame base · fitted speed', flame_tip_speed_fit: 'Flame tip · fitted speed',
  flame_base_speed_reported: 'Flame base · reported speed', lunar_compensation_delta_at_assumed_35_cm_s: 'Lunar O₂ compensation',
  O2_vs_flow_best_fit_slope: 'O₂ / flow · best-fit slope', O2_vs_flow_95pct_conservative_slope: 'O₂ / flow · conservative slope'
};
const gap = '<span class="sh-gap">Not reported</span>';
const fmt = (v) => { const r = readValue(v); return r.num != null ? r.num.toLocaleString('en-US', { maximumFractionDigits: 6 }) : r.text ? esc(r.text) : gap; };
const EDGE_OUTLINE = false;   // silhouette outline on hover: on hold (Tony 2026-11-18); hover now floats the item instead
const ICON = {
  back: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M16 4 6 12l10 8Z"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m8 4 10 8-10 8Z"/></svg>'
};

export class Shop {
  constructor({ basket, research, shelf, rigs, getScenario, isWorldBusy, onView, onExit }) {
    Object.assign(this, { basket, research, shelf, rigs, getScenario, isWorldBusy, onView, onExit });
    this.view = 'shelf'; this.focus = null; this.before = 'shelf'; this.thumbs = new Map(); this.busyAdd = false;
    this.root = document.getElementById('shop');
    this.root.innerHTML = `
      <button class="sh-back" id="sh-back" type="button" aria-label="Leave the store">${ICON.back}</button>
      <button class="sh-arrow sh-prev" id="sh-prev" type="button" aria-label="Previous item" hidden>${ICON.prev}</button>
      <button class="sh-arrow sh-next" id="sh-next" type="button" aria-label="Next item" hidden>${ICON.next}</button>
      <canvas class="sh-edge" id="sh-edge" aria-hidden="true"></canvas>
      <div class="sh-hots" id="sh-hots" role="group" aria-label="Materials on the shelf"></div>
      <section class="sh-info" id="sh-info" aria-labelledby="sh-p-title" hidden></section>
      <div class="sh-qty" id="sh-qty" role="group" aria-label="Quantity in the basket" hidden>
        <button type="button" data-q="-1" aria-label="One fewer">−</button><output id="sh-n" aria-live="polite">0</output><button type="button" data-q="1" aria-label="One more">+</button>
        <small id="sh-cap"></small>
      </div>
      <div class="sh-basketzone" id="sh-basketzone">
        <ul class="sh-summary" id="sh-summary" aria-label="In the basket" hidden></ul>
      </div>
      <div class="sh-footer" id="sh-footer" role="group" aria-label="Basket actions">
        <button type="button" class="sh-bz" id="sh-bz" aria-label="Look inside the basket"></button>
        <button type="button" class="sh-place" id="sh-place" hidden>Place on worktop</button>
      </div>
      <button class="sh-clear" id="sh-clear" type="button" hidden></button>
      <p class="sh-status" id="sh-status" role="status" aria-live="polite"></p>`;
    this.$ = (id) => this.root.querySelector('#' + id);
    this.wire();
    basket.onChange(() => this.renderBasket());
    this.renderHotspots(); this.renderBasket();
  }
  get active() { return !!this.open; }   // own flag: pages.js hides the root before it calls onPage
  get paused() { return false; }
  setScenario() {}

  wire() {
    const $ = this.$;
    $('sh-back').addEventListener('click', () => this.back());
    $('sh-place').addEventListener('click', () => this.checkout());
    $('sh-prev').addEventListener('click', () => this.view === 'product' ? this.step(-1) : this.shelf.setPage(this.shelf.page - 1).then(() => this.renderHotspots()));
    $('sh-next').addEventListener('click', () => this.view === 'product' ? this.step(1) : this.shelf.setPage(this.shelf.page + 1).then(() => this.renderHotspots()));
    // hovering / focusing a hotspot makes that item float and turn (shelf3d.js); no box is drawn around it
    const hots = $('sh-hots'), hotOf = (e) => e.target.closest?.('[data-id]')?.dataset.id || null;
    hots.addEventListener('pointerover', e => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') this.hotId = hotOf(e); });
    hots.addEventListener('pointerout', e => { if (!e.relatedTarget?.closest?.('[data-id]')) this.hotId = null; });
    hots.addEventListener('focusin', e => { this.hotId = hotOf(e); });
    hots.addEventListener('focusout', () => { this.hotId = null; });
    $('sh-hots').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) this.openProduct(PRODUCTS.find(p => p.id === b.dataset.id)); });
    $('sh-qty').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) this.setQty(+b.dataset.q); });
    $('sh-info').addEventListener('click', e => {
      const t = e.target.closest('[data-mat]'); if (t) return this.showMaterial(t.dataset.mat);
      const r = e.target.closest('#sh-rec-toggle');
      if (r) { const open = r.getAttribute('aria-expanded') !== 'true'; r.setAttribute('aria-expanded', open); this.$('sh-recs').hidden = !open; if (open) this.loadSearchSummary(); }
    });
    $('sh-summary').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) this.openProduct(PRODUCTS.find(p => p.id === b.dataset.id)); });
    $('sh-clear').addEventListener('click', () => { this.basket.clearReleased(); this.say('Worktop samples removed.'); });
    // The camera never tilts by itself: the pointer resting at (or moving to) the bottom edge does nothing. The zone only
    // exists to size the basket view's overlay; the footer Basket button toggles the look-in on every input type.
    const zone = $('sh-basketzone');
    addEventListener('pointermove', e => { this.pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
    $('sh-bz').addEventListener('click', () => this.lookIn(this.view !== 'basket'));
    zone.addEventListener('click', e => { if (e.target === zone && this.view === 'basket') this.lookIn(false); });
    addEventListener('keydown', e => {
      if (!this.active || e.target.closest?.('input')) return;
      if (e.key === 'Escape' && this.view !== 'shelf' && this.view !== 'checkout') { e.preventDefault(); e.stopPropagation(); this.view === 'basket' ? this.lookIn(false) : this.toShelf(); }
      if (this.view === 'product' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.stopPropagation(); this.step(e.key === 'ArrowLeft' ? -1 : 1); }
    }, true);
    addEventListener('resize', () => { if (!this.active) return; this.placeBasket(); this.onView(this.rig(), 0.3); });
  }
  say(msg, err = false) {
    const s = this.$('sh-status'); s.textContent = msg; s.classList.toggle('err', err); s.classList.add('on');
    clearTimeout(this.sayT); this.sayT = setTimeout(() => s.classList.remove('on'), err ? 3600 : 2200);
  }

  // ---------- views ----------
  enter() {
    this.open = true; this.root.hidden = false;
    this.research.load().then(() => this.renderHotspots()).catch(() => {});
    this.placeBasket();
    this.setView(this.basket.busy === 'pouring' ? 'checkout' : 'shelf');
    this.renderThumbs();
  }
  exit() {
    this.open = false; this.root.hidden = true; this.view = 'shelf'; this.focus = null; this.hotId = null;
    if (!this.basket.busy) this.basket.park();
  }
  shelfRig() { return this.shelf.shelfRig(innerWidth / innerHeight); }
  placeBasket() { this.anchor = this.shelf.basketAnchor(this.shelfRig(), innerWidth / innerHeight); this.basket.hold(this.anchor); }
  rig(v = this.view) {
    if (v === 'product' && this.focus) return this.shelf.productRig(this.focus.id, innerWidth / innerHeight);
    if (v === 'basket') return this.shelf.basketRig(this.anchor);
    if (v === 'checkout') return this.rigs.bench;
    return this.shelfRig();
  }
  setView(v, dur) {
    clearTimeout(this.backT); this.watching = false;
    this.view = v; this.root.dataset.view = v; this.viewAt = performance.now(); this.pointerAtView = this.pointer && { ...this.pointer };
    const $ = this.$, multi = this.shelf.pages > 1;
    $('sh-info').hidden = $('sh-qty').hidden = v !== 'product';
    $('sh-prev').hidden = $('sh-next').hidden = !(v === 'product' || (v === 'shelf' && multi));
    $('sh-summary').hidden = v !== 'basket';
    $('sh-basketzone').hidden = v === 'checkout';
    $('sh-back').hidden = v === 'checkout' || v === 'basket';
    $('sh-back').setAttribute('aria-label', v === 'product' ? 'Back to the shelf' : 'Leave the store');
    $('sh-prev').setAttribute('aria-label', v === 'product' ? 'Previous item' : 'Previous shelf');
    $('sh-next').setAttribute('aria-label', v === 'product' ? 'Next item' : 'Next shelf');
    this.renderBasket();
    this.onView(this.rig(v), dur ?? (v === 'basket' || this.before === 'basket' ? 0.55 : 1.1));
  }
  toShelf() {
    const back = this.focus; this.focus = null; this.setView('shelf');
    if (back) requestAnimationFrame(() => this.root.querySelector(`.sh-hot[data-id="${back.id}"]`)?.focus({ preventScroll: true }));
  }
  back() {
    if (this.view === 'product') return this.toShelf();
    this.onExit();
  }
  lookIn(on) {
    if (this.view === 'checkout') return;
    if (on && this.view !== 'basket') { this.before = this.view; this.setView('basket'); }
    else if (!on && this.view === 'basket') { const to = this.before; this.before = 'basket'; this.setView(to === 'product' && this.focus ? 'product' : 'shelf'); this.before = 'shelf'; }
  }

  // ---------- shelf ----------
  rowsFor(p) { return this.research.byId ? this.research.byIds(p.measurementIds) : []; }
  renderHotspots() {
    const shown = [...this.shelf.items.keys()];
    this.$('sh-hots').innerHTML = shown.map(id => {
      const p = PRODUCTS.find(x => x.id === id), n = this.rowsFor(p).length;
      return `<button type="button" class="sh-hot" data-id="${p.id}" aria-label="${esc(p.label || p.name)}, ${esc(p.materials.join(' and '))}${n ? `, ${n} research records` : ''}"></button>`;
    }).join('');
  }
  // Each hotspot covers its item and tag on screen. Called every frame from main.
  update(dt, camera) {
    this.shelf.update(dt, this.view === 'product' ? this.focus?.id : null, this.active && this.view === 'shelf' ? this.hotId : null);
    if (!this.active) return;
    // the hover strip spans the basket as drawn on screen (shelf view), not the whole bottom edge
    const zone = this.$('sh-basketzone');
    if (this.view === 'shelf' && this.basket.model) {
      const r = new THREE.Box3().setFromObject(this.basket.model), v = new THREE.Vector3();
      let x0 = 1e9, x1 = -1e9;
      for (let i = 0; i < 8; i++) { v.set(i & 1 ? r.max.x : r.min.x, i & 2 ? r.max.y : r.min.y, i & 4 ? r.max.z : r.min.z).project(camera); const sx = (v.x + 1) / 2 * innerWidth; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); }
      const w = THREE.MathUtils.clamp(x1 - x0, 220, innerWidth * 0.6), l = THREE.MathUtils.clamp((x0 + x1) / 2 - w / 2, 0, innerWidth - w);
      zone.style.left = l.toFixed(0) + 'px'; zone.style.width = w.toFixed(0) + 'px';
    } else if (this.view === 'basket') { zone.style.left = '0px'; zone.style.width = '100%'; }
    else { zone.style.left = '30%'; zone.style.width = '40%'; }
    this.drawEdge(camera);
    if (this.view !== 'shelf') return;
    if (this.$('sh-hots').children.length !== this.shelf.items.size) this.renderHotspots();
    const v = new THREE.Vector3();
    for (const el of this.$('sh-hots').children) {
      const box = this.shelf.hotBox(el.dataset.id), tag = this.shelf.tagBox(el.dataset.id); if (!box) { el.hidden = true; continue; }
      box.union(tag);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
        const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      const w = Math.max(44, x1 - x0 + 12), h = Math.max(44, y1 - y0 + 12);
      el.hidden = false; el.style.transform = `translate(${((x0 + x1 - w) / 2).toFixed(1)}px, ${((y0 + y1 - h) / 2).toFixed(1)}px)`; el.style.width = w.toFixed(0) + 'px'; el.style.height = h.toFixed(0) + 'px';
    }
  }

  // Silhouette outline of the hovered item: every triangle of its display copy is projected to the screen, filled as one
  // mask, and a 3 px band is kept just outside it (stroke all edges, then cut the filled mask away). Cached until the
  // camera, the window or the item's turn changes, so a resting pointer costs nothing.
  drawEdge(camera) {
    const cv = this.$('sh-edge'), id = EDGE_OUTLINE && this.view === 'shelf' && this.active ? this.hotId : null, it = id && this.shelf.items.get(id);
    if (!it) { if (this.edgeKey) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); this.edgeKey = ''; } return; }
    const dpr = Math.min(devicePixelRatio || 1, 2), W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    camera.updateMatrixWorld();
    const key = [id, W, H, this.shelf.page, it.root.rotation.y.toFixed(3), camera.matrixWorld.elements.join(), camera.projectionMatrix.elements.join()].join('|');
    if (key === this.edgeKey) return;
    this.edgeKey = key;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d'), v = new THREE.Vector3(), m = new THREE.Matrix4();
    g.clearRect(0, 0, W, H);
    g.beginPath();
    it.spin.updateWorldMatrix(true, true);
    it.spin.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const pos = o.geometry.attributes.position, idx = o.geometry.index; if (!pos) return;
      m.multiplyMatrices(camera.matrixWorldInverse, o.matrixWorld);
      const sx = new Float32Array(pos.count), sy = new Float32Array(pos.count), ok = new Uint8Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        if (v.z >= -camera.near) continue;                               // behind the lens
        v.applyMatrix4(camera.projectionMatrix);
        sx[i] = (v.x + 1) / 2 * W; sy[i] = (1 - v.y) / 2 * H; ok[i] = 1;
      }
      const n = idx ? idx.count : pos.count;
      for (let t = 0; t + 2 < n; t += 3) {
        let a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
        if (!(ok[a] && ok[b] && ok[c])) continue;
        // one winding for every triangle so overlapping front and back faces never cancel in the nonzero fill
        if ((sx[b] - sx[a]) * (sy[c] - sy[a]) - (sy[b] - sy[a]) * (sx[c] - sx[a]) < 0) { const k = b; b = c; c = k; }
        g.moveTo(sx[a], sy[a]); g.lineTo(sx[b], sy[b]); g.lineTo(sx[c], sy[c]); g.closePath();
      }
    });
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,216,20,.28)'; g.lineWidth = 2 * 6.5 * dpr; g.stroke();   // soft halo
    g.strokeStyle = '#ffd814'; g.lineWidth = 2 * 2.5 * dpr; g.stroke();                // crisp edge
    g.globalCompositeOperation = 'destination-out'; g.fill(); g.globalCompositeOperation = 'source-over';   // keep only the outside
  }

  // ---------- product ----------
  async openProduct(p) {
    if (!p) return;
    this.hotId = null;
    if (!this.shelf.items.has(p.id)) { await this.shelf.setPage(Math.floor(PRODUCTS.indexOf(p) / 9)); this.renderHotspots(); }
    this.focus = p; this.renderProduct(); this.setView('product');
  }
  step(d) { const i = PRODUCTS.indexOf(this.focus); this.openProduct(PRODUCTS[(i + d + PRODUCTS.length) % PRODUCTS.length]); }
  renderProduct() {
    const p = this.focus; if (!p) return;
    const rows = this.rowsFor(p), mats = p.materials, srcs = new Set(rows.map(r => r.source_id)).size;
    this.$('sh-info').innerHTML = `
      <p class="sh-kicker">${esc(p.model.source || '')} · ${catLabel[p.category]}</p>
      <h2 id="sh-p-title">${esc(p.name)}</h2>
      <p class="sh-mat">${mats.map(esc).join(' · ')}</p>
      <p class="sh-about">${esc(p.form)}</p>
      <p class="sh-spec"><b>Tested as</b> ${esc(p.specimen.replace(/^Tested as /, ''))}</p>
      ${rows.length ? `<button type="button" id="sh-rec-toggle" class="sh-rec-toggle" aria-expanded="false" aria-controls="sh-recs">${rows.length} research records · ${srcs} NASA source${srcs === 1 ? '' : 's'}</button>` : `<p class="sh-fine">${this.research.error ? 'Research unavailable.' : 'Loading research…'}</p>`}
      <div id="sh-recs" class="sh-recs" hidden>
        <p id="sh-search-summary" class="sh-fine" role="status" aria-live="polite"></p>
        ${mats.length > 1 ? `<div class="sh-mtabs" role="tablist" aria-label="Burning mode">${mats.map((m, k) => `<button type="button" role="tab" data-mat="${esc(m)}" aria-selected="${k === 0}">${esc(m.replace(/^.*\((.*)\)$/, '$1'))}</button>`).join('')}</div>` : ''}
        <ol id="sh-d-rows"></ol>
        <p class="sh-fine">${this.research.meta ? `Local research snapshot ${esc(this.research.meta.date || '')}.` : ''} Each value keeps its own test conditions; the flame in the scene is a mechanism demonstration.</p>
      </div>
      <p class="sh-fine">Demo physics: ${Math.round(p.phys.mass * 1000)} g, “${esc(p.phys.surface)}” surface (estimates for the animation).</p>`;
    this.showMaterial(mats[0]); this.renderQty();
  }
  async loadSearchSummary() {
    const p = this.focus, el = this.$('sh-search-summary');
    if (!p || !el || el.dataset.loaded) return;
    el.textContent = 'Looking up research…';
    try {
      const d = await this.research.search('all materials', { filters: { materialId: p.id }, limit: 1 });
      if (!el.isConnected || this.focus !== p) return;
      const result = d.results.find(r => r.materialId === p.id);
      el.textContent = `${d.mode === 'ai' ? 'AI-assisted' : 'Keyword'} search · ${d.dataSource === 'bigquery' ? 'BigQuery' : 'Server snapshot'} · ${result?.summary || d.summary}`;
      el.dataset.loaded = 'true';
    } catch (e) {
      if (!el.isConnected || this.focus !== p) return;
      el.textContent = e.status === 429 ? 'Search limit reached. Local records remain available; try again in a minute.' : 'Search unavailable. Showing local research records below.';
    }
  }
  showMaterial(m) {
    const p = this.focus; if (!p || !this.$('sh-d-rows')) return;
    this.root.querySelectorAll('.sh-mtabs [data-mat]').forEach(b => b.setAttribute('aria-selected', b.dataset.mat === m));
    const cond = (r) => [r.pressure_reported || (r.pressure_kpa != null ? `${fmt(r.pressure_kpa)} kPa` : null), r.oxygen_pct != null ? `${fmt(r.oxygen_pct)}% O₂` : null,
      r.flow_speed_cm_s != null ? `${fmt(r.flow_speed_cm_s)} cm/s flow` : r.flow_mode].filter(Boolean).map(esc).join(' · ') || gap;
    this.$('sh-d-rows').innerHTML = this.rowsFor(p).filter(r => r.material === m).map(r => {
      const s = this.research.source(r.source_id);
      return `<li><span class="sh-rec-id">${esc(r.measurement_id)}</span> ${esc(r.gravity_label)} · ${esc(METRIC[r.metric] || r.metric)}: <b>${fmt(r.value)}</b> ${esc(r.unit || '')}
        <small>${esc(r.platform || 'Model / derived')} · ${cond(r)} · <a href="${safeUrl(s?.url)}" target="_blank" rel="noopener noreferrer">PDF p. ${esc(r.pdf_page ?? '–')} ↗</a></small>
        <details><summary>Conditions &amp; limits</summary><p>${esc(r.conditions || '')}</p><p>${esc(r.limitation || '')}</p></details></li>`;
    }).join('');
  }
  renderQty() {
    const p = this.focus; if (!p) return;
    const n = this.basket.count(p.id), total = this.basket.inCart().length, here = this.basket.mode === 'held' && !this.basket.busy;
    this.$('sh-n').textContent = n;
    const [minus, plus] = this.$('sh-qty').querySelectorAll('button');
    minus.disabled = !n || !here; plus.disabled = !here || total >= MAX_ITEMS || this.busyAdd;
    minus.setAttribute('aria-label', `One fewer ${p.label || p.name}`); plus.setAttribute('aria-label', `One more ${p.label || p.name}`);
    this.$('sh-cap').textContent = total >= MAX_ITEMS ? `Basket full (${MAX_ITEMS})` : `in basket`;
    this.renderCheckout();
  }
  async setQty(d) {
    const p = this.focus; if (!p) return;
    try {
      if (d < 0) this.basket.removeOne(p.id);
      else {
        if (this.isWorldBusy()) throw new Error('Wait for the gravity scan to finish.');
        this.busyAdd = true; this.renderQty();
        // From the product close-up the camera pulls back to the shelf view (basket rim along the bottom) so the
        // sample is seen dropping in, then returns. Quick repeat presses stay pulled back until the last one lands.
        const watch = this.view === 'product';
        if (watch) {
          clearTimeout(this.backT);
          if (!this.watching) { this.watching = true; this.onView(this.shelfRig(), 0.5); await wait(420); }
        }
        const rec = await this.basket.add(p);
        if (watch) {
          this.busyAdd = false; this.renderQty();
          const t0 = performance.now();
          while (rec.state === 'loading' && performance.now() - t0 < 1100) await wait(50);
          clearTimeout(this.backT);
          this.backT = setTimeout(() => { this.watching = false; if (this.view === 'product') this.onView(this.rig(), 0.6); }, 300);
        }
      }
    } catch (e) { this.say(e.message, true); if (this.watching) { this.watching = false; if (this.view === 'product') this.onView(this.rig(), 0.6); } }
    finally { this.busyAdd = false; this.renderQty(); }
  }

  // ---------- basket ----------
  renderBasket() {
    const items = this.basket.inCart(), n = items.length, rel = this.basket.released().length;
    const counts = PRODUCTS.map(p => [p, items.filter(r => r.product.id === p.id).length]).filter(([, c]) => c);
    this.$('sh-bz').innerHTML = n ? `Basket · <b>${n}</b>` : 'Basket';
    this.$('sh-bz').setAttribute('aria-label', `Basket, ${n} sample${n === 1 ? '' : 's'}. ${this.view === 'basket' ? 'Press to go back.' : 'Hover or press to look inside.'}`);
    this.$('sh-bz').setAttribute('aria-expanded', this.view === 'basket');
    this.$('sh-summary').innerHTML = counts.length ? counts.map(([p, c]) => `<li><button type="button" data-id="${p.id}" aria-label="${esc(p.label || p.name)}, ${c} in the basket">${this.thumbs.get(p.id) ? `<img src="${this.thumbs.get(p.id)}" alt="">` : ''}<span>${esc(p.label || p.name)}</span><b>×${c}</b></button></li>`).join('') : '<li class="sh-empty">The basket is empty.</li>';
    this.$('sh-clear').hidden = !(rel && this.view === 'shelf' && !this.basket.busy);
    this.$('sh-clear').textContent = `Clear worktop samples (${rel})`;
    this.root.classList.toggle('has-items', n > 0);
    if (this.view === 'product') this.renderQty();
    else this.renderCheckout();
  }
  renderCheckout() {
    const n = this.basket.inCart().length, placing = this.view === 'checkout', button = this.$('sh-place');
    button.hidden = !n && !placing;
    button.disabled = placing || !n || this.busyAdd || !!this.basket.busy || this.basket.mode !== 'held';
    button.textContent = placing ? 'Placing on worktop…' : `Place on worktop · ${n}`;
    this.$('sh-bz').hidden = placing;
    this.$('sh-footer').setAttribute('aria-busy', String(placing));
  }
  async checkout() {
    if (this.view === 'checkout' || this.busyAdd || this.basket.busy || !this.basket.inCart().length || this.basket.mode !== 'held') return;
    if (this.isWorldBusy()) { this.say('Wait for the gravity scan to finish.', true); return; }
    this.setView('checkout', 1.0);
    this.say('Taking the basket to the lab bench…');
    try {
      // the lab view comes back as soon as the samples are on the worktop; the basket untips and leaves meanwhile
      await this.basket.checkout({ onReleased: (r) => {
        const note = r.kept ? `${r.released} on the worktop, ${r.kept} stayed in the basket.` : `${r.released} sample${r.released === 1 ? '' : 's'} on the worktop. Drag them toward the flame.`;
        this.say(note);
        setTimeout(() => { if (this.open && this.view === 'checkout') this.onExit(note); }, 250);
      } });
    } catch (e) { this.say(e.message, true); if (this.open) this.setView('shelf'); return; }
    if (!this.open) this.basket.park();
    else if (this.view === 'checkout') { this.placeBasket(); this.setView('shelf'); }
    else this.renderBasket();
  }

  // ---------- thumbnails for the basket summary (one throwaway renderer) ----------
  async renderThumbs() {
    if (this.thumbing || PRODUCTS.every(p => this.thumbs.has(p.id))) return;
    this.thumbing = true;
    const canvas = document.createElement('canvas'), r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(120, 90, false); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(0.4, 1, 0.6); scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 4 / 3, 0.01, 10);
    try {
      for (const p of PRODUCTS) {
        if (this.thumbs.has(p.id)) continue;
        const obj = (await this.basket.template(p)).clone(true); scene.add(obj);
        const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), rad = box.getSize(new THREE.Vector3()).length() / 2;
        cam.position.copy(c).add(new THREE.Vector3(0.45, 0.8, 0.6).normalize().multiplyScalar(rad / Math.sin(THREE.MathUtils.degToRad(13)))); cam.lookAt(c);
        r.render(scene, cam); this.thumbs.set(p.id, canvas.toDataURL('image/png')); scene.remove(obj);
      }
    } catch (e) { console.warn('Thumbnail render failed', e); }
    r.dispose(); r.forceContextLoss(); this.thumbing = false;
    this.renderBasket();
  }
  // nothing to avoid on wide screens; on phones the text panel covers the lower part of the product view
  insets() {
    if (!this.active || this.view !== 'product' || innerWidth > 700) return { left: 0, right: 0, top: 0, bottom: 0 };
    return { left: 0, right: 0, top: 0, bottom: innerHeight - this.$('sh-info').getBoundingClientRect().top };
  }
}
