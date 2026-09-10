// Visualization registry. A viz is { id, title, lede, order, render(el, ctx) }.
// ctx = { state, results, colors, groups, inputType, city, helpers }.
// To add a chart: create a module that calls registerViz(...) and import it from main.js.
const REGISTRY = [];
export function registerViz(v) { REGISTRY.push(v); REGISTRY.sort((a, b) => a.order - b.order); }
export function allViz() { return REGISTRY.slice(); }

let tipEl;
export function tooltip() {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
  return {
    show(html, ev) { tipEl.innerHTML = html; tipEl.classList.add('show'); this.move(ev); },
    move(ev) { const x = ev.clientX + 12, y = ev.clientY + 12; tipEl.style.left = Math.min(x, window.innerWidth - tipEl.offsetWidth - 8) + 'px'; tipEl.style.top = Math.min(y, window.innerHeight - tipEl.offsetHeight - 8) + 'px'; },
    hide() { tipEl.classList.remove('show'); },
  };
}
export const pct = (x, d = 0) => (100 * x).toFixed(d) + '%';
export function legend(el, items) {
  const div = document.createElement('div'); div.className = 'legend';
  for (const it of items) {
    const k = document.createElement('span'); k.className = 'key';
    const i = document.createElement('i'); if (it.kind) i.className = it.kind; if (it.color) i.style.background = it.color;
    k.appendChild(i); k.appendChild(document.createTextNode(it.label)); div.appendChild(k);
  }
  el.appendChild(div);
}
