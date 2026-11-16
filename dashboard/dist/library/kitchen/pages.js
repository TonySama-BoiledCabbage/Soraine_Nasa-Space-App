// Three-dot navigation + per-page panels. No rendering here; main.js owns the camera.
export class Pages {
  constructor({ onPage, onScenario }) {
    this.page = null; this.onPage = onPage; this.onScenario = onScenario; this.scenario = null;
    this.dots = document.getElementById('dots');
    this.dots.querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.show(b.dataset.page)));
    this.els = { observe: document.getElementById('observe'), detail: document.getElementById('detail'), about: document.getElementById('about') };
    // Pages outside the three dots (the SORAINE shelf): shown by show(name), skipped by the arrow keys.
    const shop = document.getElementById('shop'); if (shop) this.els.shop = shop;
    this.readout = document.getElementById('readout'); this.card = document.getElementById('detailCard'); this.bar = document.getElementById('scenarios');
    addEventListener('keydown', (e) => { const order = ['observe', 'detail', 'about']; const i = order.indexOf(this.page); if (e.key === 'ArrowRight' && i >= 0) this.show(order[(i + 1) % 3]); if (e.key === 'ArrowLeft' && i >= 0) this.show(order[(i + 2) % 3]); });
  }
  show(p) {
    if (p === this.page) return; this.page = p;
    for (const k in this.els) this.els[k].hidden = k !== p;
    this.dots.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.page === p));
    this.onPage(p);
  }
  setScenarios(list) {
    this.bar.innerHTML = list.map(s => `<button data-slug="${s.slug}">${s.label}<small>${s.g.toFixed(2)} m/s²</small></button>`).join('');
    this.bar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.onScenario(b.dataset.slug)));
  }
  setScenario(s) {
    this.scenario = s;
    this.bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.slug === s.slug));
    this.readout.innerHTML = `<span>${s.label} · gravity</span><b>${s.g.toFixed(2)} m/s²</b>`;
    const tag = (src) => src === 'unverified' ? `<span class="tag unv">unverified</span>` : src === 'schematic' ? `<span class="tag">schematic</span>` : `<span class="tag">${src}</span>`;
    this.card.innerHTML = `<h2>${s.label}</h2><p class="muted">What the flame is doing under ${s.g === 0 ? 'microgravity' : s.g.toFixed(2) + ' m/s²'}.</p>
      <dl>${s.facts.map(f => `<dt>${f.k}${tag(f.src)}</dt><dd>${f.v}</dd>`).join('')}</dl>
      <p class="muted"><a href="/?gravity=${s.slug==='iss'?'Microgravity':s.label}" target="_top" style="color:inherit;text-underline-offset:4px">Explore the research and material comparisons ↗</a></p>`;
  }
}
