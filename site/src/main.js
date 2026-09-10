import { INPUT_TYPES, electorateFromCounts } from './data/inputs.js';
import { cityShares, setCityShare, setDistrictShare, cloneShares } from './model/electorate.js';
import { runAll } from './model/systems.js';
import { groupColors } from './viz/palette.js';
import { allViz } from './viz/registry.js';
import { renderTypeChips, mountCityControls, mountDistrictControls } from './ui/controls.js';
import { renderDetails, renderSources } from './viz/details.js';
// Visualizations register themselves on import. Add new ones here.
import './viz/headline.js';
import './viz/mirror.js';
import './viz/sensitivity.js';
import './viz/seats.js';
import './viz/map.js';

const $ = s => document.querySelector(s);
const DEFAULT_TYPE = 'party';
const state = { typeId: DEFAULT_TYPE, shares: null, weights: null, groups: null, focusGroup: null, compareSystem: null, overrides: [] };

function loadType(typeId) {
  const t = INPUT_TYPES.find(t => t.id === typeId) || INPUT_TYPES[0];
  const e = electorateFromCounts(t.counts);
  state.typeId = t.id; state.groups = e.groups; state.shares = e.shares; state.weights = e.weights; state.base = cloneShares(e.shares);
  state.focusGroup = null; state.overrides = [];
  return t;
}

/* URL state: #type=race&city=Black:45&d7=Hispanic:60&focus=Asian  (overrides applied in order) */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  loadType(p.get('type') || DEFAULT_TYPE);
  for (const [k, v] of p.entries()) {
    if (k === 'city' || /^d\d+$/.test(k)) {
      const [g, val] = v.split(':'); if (!state.groups.includes(g)) continue;
      applyOverride({ kind: k === 'city' ? 'city' : 'district', district: k.slice(1), group: g, value: +val / 100 });
    }
  }
  if (p.get('focus')) state.focusGroup = p.get('focus');
  if (p.get('compare')) state.compareSystem = p.get('compare');
  if (p.get('theme')) document.documentElement.dataset.theme = p.get('theme');
  if (p.get('open')) state.openAll = true;
}
function writeHash() {
  const p = new URLSearchParams(); p.set('type', state.typeId);
  for (const o of state.overrides) p.append(o.kind === 'city' ? 'city' : `d${o.district}`, `${o.group}:${(100 * o.value).toFixed(1)}`);
  if (state.focusGroup) p.set('focus', state.focusGroup);
  if (state.compareSystem) p.set('compare', state.compareSystem);
  history.replaceState(null, '', '#' + p.toString());
}
function applyOverride(o) {
  if (o.kind === 'city') state.shares = setCityShare(state.shares, state.weights, state.groups, o.group, o.value);
  else state.shares = setDistrictShare(state.shares, state.groups, o.district, o.group, o.value);
  // keep only the latest override per (kind, district, group) to keep URLs short
  state.overrides = state.overrides.filter(x => !(x.kind === o.kind && x.district === o.district && x.group === o.group)).concat(o);
}

function context() {
  const inputType = INPUT_TYPES.find(t => t.id === state.typeId);
  const city = cityShares(state.shares, state.weights, state.groups);
  const results = runAll(state.shares, state.weights, state.groups);
  const colors = groupColors(inputType, state.groups);
  return { state, inputType, groups: state.groups, shares: state.shares, weights: state.weights, city, results, colors, setState };
}

let rafId = 0, cityCtl = null, districtCtl = null;
function setState(patch) { Object.assign(state, patch); render({ controls: false }); }

const handlers = {
  onCityChange: (g, v) => { applyOverride({ kind: 'city', group: g, value: v }); scheduleRender(); },
  onDistrictChange: (d, g, v) => { applyOverride({ kind: 'district', district: d, group: g, value: v }); scheduleRender(); },
  onReset: () => { loadType(state.typeId); render(); },
};

function render({ controls = true } = {}) {
  const ctx = context();
  writeHash();
  if (controls) {
    renderTypeChips($('#type-chips'), state, id => { loadType(id); render(); });
    cityCtl = mountCityControls($('#city-controls'), ctx, handlers);
    districtCtl = mountDistrictControls($('#district-controls'), ctx, handlers);
  } else {
    cityCtl?.update(ctx); districtCtl?.update(ctx);
  }
  const root = $('#viz-root'); root.innerHTML = '';
  for (const v of allViz()) {
    const sec = document.createElement('div'); sec.className = 'viz'; sec.id = `viz-${v.id}`;
    sec.innerHTML = `<div class="viz-head"><h3>${v.title}</h3><p>${v.lede}</p></div>`;
    const body = document.createElement('div'); body.className = 'viz-body'; sec.appendChild(body);
    root.appendChild(sec);
    try { v.render(body, ctx); } catch (err) { body.textContent = `Could not render: ${err.message}`; console.error(v.id, err); }
  }
  renderDetails($('#details-root'), ctx);
  if (state.openAll) document.querySelectorAll('details').forEach(d => { d.open = true; });
}
/* While a slider drags, charts re-render on the next animation frame; the controls update in place so the drag is never interrupted. */
function scheduleRender() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => render({ controls: false }));
}

readHash();
renderSources($('#sources-root'));
render();
window.addEventListener('hashchange', () => { readHash(); render(); });
window.addEventListener('resize', () => scheduleRender());
window.__sim = { state, context };
