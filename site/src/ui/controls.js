import { INPUT_TYPES } from '../data/inputs.js';
import { pct } from '../viz/registry.js';

/** Type chips */
export function renderTypeChips(el, state, onSelect) {
  el.innerHTML = '';
  for (const t of INPUT_TYPES) {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.role = 'tab'; b.textContent = t.name;
    b.setAttribute('aria-selected', String(t.id === state.typeId));
    b.addEventListener('click', () => onSelect(t.id));
    el.appendChild(b);
  }
}

export function compBar(groups, shares, colors, showLabels = true) {
  const bar = document.createElement('div'); bar.className = 'comp-bar';
  for (const g of groups) {
    const seg = document.createElement('div'); seg.className = 'seg'; seg.dataset.group = g; seg.style.background = colors[g];
    bar.appendChild(seg);
  }
  updateCompBar(bar, groups, shares, showLabels);
  return bar;
}
function updateCompBar(bar, groups, shares, showLabels) {
  for (const seg of bar.children) {
    const g = seg.dataset.group, v = Math.max(shares[g], 0);
    seg.style.flex = `${v} 0 0`; seg.title = `${g}: ${pct(v, 1)}`;
    if (!showLabels) continue;
    seg.innerHTML = `<span class="nm">${g}</span><small>${pct(v)}</small>`; // visibility is decided by segment width in CSS
  }
}

function sliderRows(groups, shares, colors, onChange) {
  const grid = document.createElement('div'); grid.className = 'slider-grid';
  for (const g of groups) {
    const row = document.createElement('div'); row.className = 'slider-row'; row.dataset.group = g;
    const sw = document.createElement('i'); sw.className = 'swatch'; sw.style.background = colors[g];
    const label = document.createElement('label');
    const span = document.createElement('span'); span.textContent = g;
    const input = document.createElement('input');
    input.type = 'range'; input.min = 0; input.max = 100; input.step = 0.5; input.value = (100 * shares[g]).toFixed(1);
    input.setAttribute('aria-label', `${g} share`);
    const out = document.createElement('output'); out.textContent = pct(shares[g]);
    input.addEventListener('input', () => { out.textContent = input.value + '%'; onChange(g, +input.value / 100); });
    label.append(span, input);
    row.append(sw, label, out);
    grid.appendChild(row);
  }
  return grid;
}
/* Update slider positions in place; the slider being dragged is left alone. */
function updateSliderRows(grid, shares) {
  for (const row of grid.children) {
    const g = row.dataset.group, input = row.querySelector('input'), out = row.querySelector('output');
    if (document.activeElement !== input) input.value = (100 * shares[g]).toFixed(1);
    out.textContent = pct(shares[g]);
  }
}

/** City-wide composition bar + one slider per group + reset. Returns { update(ctx) }. */
export function mountCityControls(el, ctx, { onCityChange, onReset }) {
  const { groups, city, colors, inputType } = ctx;
  el.innerHTML = '';
  const q = document.createElement('p'); q.className = 'hint'; q.style.margin = '0';
  q.textContent = `${inputType.question} City-wide, counted in ${inputType.unit}.`;
  const bar = compBar(groups, city, colors);
  const grid = sliderRows(groups, city, colors, onCityChange);
  const foot = document.createElement('div'); foot.className = 'controls-foot';
  const reset = document.createElement('button'); reset.className = 'btn'; reset.type = 'button'; reset.textContent = 'Reset to real data';
  reset.addEventListener('click', onReset);
  foot.append(reset);
  el.append(q, bar, grid, foot);
  return { update(ctx) { updateCompBar(bar, ctx.groups, ctx.city, true); updateSliderRows(grid, ctx.city); } };
}

/** Per-district sliders. Returns { update(ctx) }. */
export function mountDistrictControls(el, ctx, { onDistrictChange }) {
  const { groups, colors, inputType } = ctx;
  const { shares, weights } = ctx.districts;
  el.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'district-grid';
  const parts = {};
  for (const d of Object.keys(shares).sort((a, b) => +a - +b)) {
    const card = document.createElement('div'); card.className = 'district-card';
    const h = document.createElement('h4');
    h.innerHTML = `District ${d} <span>${Math.round(weights[d]).toLocaleString()} ${inputType.unit}</span>`;
    const bar = compBar(groups, shares[d], colors, false);
    const rows = sliderRows(groups, shares[d], colors, (g, v) => onDistrictChange(d, g, v));
    card.append(h, bar, rows);
    grid.appendChild(card);
    parts[d] = { bar, rows };
  }
  el.appendChild(grid);
  return { update(ctx) { for (const d of Object.keys(parts)) { updateCompBar(parts[d].bar, ctx.groups, ctx.districts.shares[d], false); updateSliderRows(parts[d].rows, ctx.districts.shares[d]); } } };
}
