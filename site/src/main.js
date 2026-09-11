import { INPUT_TYPES, electorateFromCounts } from './data/inputs.js';
import { cityShares, setCityShare, setDistrictShare, cloneShares } from './model/electorate.js';
import { runAll, SYSTEMS } from './model/systems.js';
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
const DEFAULT_SYSTEMS = ['current', 'stv-5x3'];
const DEFAULT_CHARTS = ['headline'];
const state = { typeId: DEFAULT_TYPE, shares: null, weights: null, groups: null, focusGroup: null, compareSystem: null, overrides: [],
  systems: DEFAULT_SYSTEMS.slice(), charts: DEFAULT_CHARTS.slice(), advanced: false, math: false };

function loadType(typeId) {
  const t = INPUT_TYPES.find(t => t.id === typeId) || INPUT_TYPES[0];
  const e = electorateFromCounts(t.counts);
  state.typeId = t.id; state.groups = e.groups; state.shares = e.shares; state.weights = e.weights; state.base = cloneShares(e.shares);
  state.focusGroup = null; state.overrides = [];
  return t;
}

/* URL state: #type=race&systems=current,stv-5x3&charts=headline,map&city=Black:45&d7=Hispanic:60&focus=Asian&compare=stv-10x3&advanced=1 */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  loadType(p.get('type') || DEFAULT_TYPE);
  const sys = (p.get('systems') || '').split(',').filter(id => SYSTEMS.some(s => s.id === id));
  state.systems = sys.length ? sys : DEFAULT_SYSTEMS.slice();
  const ch = p.get('charts');
  const chartIds = allViz().map(v => v.id);
  state.charts = ch === 'all' ? chartIds : ch ? ch.split(',').filter(id => chartIds.includes(id)) : DEFAULT_CHARTS.slice();
  for (const [k, v] of p.entries()) {
    if (k === 'city' || /^d\d+$/.test(k)) {
      const [g, val] = v.split(':'); if (!state.groups.includes(g)) continue;
      applyOverride({ kind: k === 'city' ? 'city' : 'district', district: k.slice(1), group: g, value: +val / 100 });
    }
  }
  state.advanced = p.get('advanced') === '1' || state.overrides.length > 0;
  if (p.get('focus')) state.focusGroup = p.get('focus');
  if (p.get('compare')) state.compareSystem = p.get('compare');
  if (p.get('theme')) document.documentElement.dataset.theme = p.get('theme');
  if (p.get('open')) state.openAll = true;
  state.math = p.get('math') === '1' || !!state.openAll;
}
function writeHash() {
  const p = new URLSearchParams(); p.set('type', state.typeId);
  if (state.systems.join(',') !== DEFAULT_SYSTEMS.join(',')) p.set('systems', state.systems.join(','));
  if (state.charts.join(',') !== DEFAULT_CHARTS.join(',')) p.set('charts', state.charts.join(','));
  for (const o of state.overrides) p.append(o.kind === 'city' ? 'city' : `d${o.district}`, `${o.group}:${(100 * o.value).toFixed(1)}`);
  if (state.advanced && !state.overrides.length) p.set('advanced', '1');
  if (state.math) p.set('math', '1');
  if (state.focusGroup) p.set('focus', state.focusGroup);
  if (state.compareSystem) p.set('compare', state.compareSystem);
  if (document.documentElement.dataset.theme) p.set('theme', document.documentElement.dataset.theme);
  history.replaceState(null, '', '#' + p.toString());
}
function applyOverride(o) {
  if (o.kind === 'city') state.shares = setCityShare(state.shares, state.weights, state.groups, o.group, o.value);
  else state.shares = setDistrictShare(state.shares, state.groups, o.district, o.group, o.value);
  state.overrides = state.overrides.filter(x => !(x.kind === o.kind && x.district === o.district && x.group === o.group)).concat(o);
}

function context() {
  const inputType = INPUT_TYPES.find(t => t.id === state.typeId);
  const city = cityShares(state.shares, state.weights, state.groups);
  const allResults = runAll(state.shares, state.weights, state.groups);
  const results = allResults.filter(r => state.systems.includes(r.system.id));
  const colors = groupColors(inputType, state.groups);
  return { state, inputType, groups: state.groups, shares: state.shares, weights: state.weights, city, results, allResults, colors, setState };
}

/* Step 1: big multi-select cards for voting methods (title + explanation), chips for charts */
function methodCards(el, selected, onChange) {
  el.innerHTML = '';
  for (const sys of SYSTEMS) {
    const contests = sys.build();
    const districtSeats = contests.filter(c => c.districts.length < 10).reduce((n, c) => n + c.seats, 0);
    const atLarge = contests.filter(c => c.districts.length === 10).reduce((n, c) => n + c.seats, 0);
    const b = document.createElement('button'); b.className = 'method-card'; b.type = 'button';
    const on = selected.includes(sys.id); b.setAttribute('aria-pressed', String(on));
    const seatsText = atLarge ? `${districtSeats} district seats + ${atLarge} at-large = ${districtSeats + atLarge} members` : `${districtSeats} members, all from districts`;
    const bars = contests.map(c => `<i class="${c.method === 'stv' ? 'stv' : ''}" style="flex:${c.seats}" title="${c.name}: ${c.seats} seat${c.seats > 1 ? 's' : ''} (${c.method === 'stv' ? 'ranked choice' : c.method === 'limited' ? 'vote for 5, top 7 win' : 'winner takes all'})"></i>`).join('');
    b.innerHTML = `<span class="name">${sys.short}${sys.stv ? '<span class="stv-tag">STV</span>' : ''}</span><span class="desc">${sys.detail}</span><span class="seats">${seatsText}</span><span class="seatbar">${bars}</span>`;
    b.addEventListener('click', () => {
      const next = on ? selected.filter(x => x !== sys.id) : SYSTEMS.map(s => s.id).filter(id => id === sys.id || selected.includes(id));
      if (!next.length) return;
      onChange(next);
    });
    el.appendChild(b);
  }
}

function toggleChips(el, items, selected, onChange, { minOne = true } = {}) {
  el.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = it.label; b.title = it.title || '';
    const on = selected.includes(it.id); b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => {
      let next = on ? selected.filter(x => x !== it.id) : items.map(i => i.id).filter(id => id === it.id || selected.includes(id));
      if (minOne && !next.length) return;
      onChange(next);
    });
    el.appendChild(b);
  }
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
  methodCards($('#system-chips'), state.systems, next => { state.systems = next; render({ controls: false }); });
  toggleChips($('#chart-chips'), allViz().map(v => ({ id: v.id, label: v.title })), state.charts, next => { state.charts = next; render({ controls: false }); });
  if (controls) {
    renderTypeChips($('#type-chips'), state, id => { loadType(id); render(); });
    $('#type-note').textContent = ctx.inputType.note || '';
    cityCtl = mountCityControls($('#city-controls'), ctx, handlers);
    districtCtl = mountDistrictControls($('#district-controls'), ctx, handlers);
  } else {
    cityCtl?.update(ctx); districtCtl?.update(ctx);
  }
  $('#advanced').hidden = !state.advanced;
  $('#advanced-toggle').setAttribute('aria-expanded', String(state.advanced));
  $('#advanced-toggle').textContent = state.advanced ? 'Hide the sliders' : 'Advanced: simulate a different breakdown of voters';
  const root = $('#viz-root'); root.innerHTML = '';
  for (const v of allViz()) {
    if (!state.charts.includes(v.id)) continue;
    const sec = document.createElement('div'); sec.className = 'viz'; sec.id = `viz-${v.id}`;
    sec.innerHTML = `<div class="viz-head"><h3>${v.title}</h3><p>${v.lede}</p></div>`;
    const body = document.createElement('div'); body.className = 'viz-body'; sec.appendChild(body);
    root.appendChild(sec);
    try { v.render(body, ctx); } catch (err) { body.textContent = `Could not render: ${err.message}`; console.error(v.id, err); }
  }
  $('#math').hidden = !state.math;
  $('#math-toggle').setAttribute('aria-expanded', String(state.math));
  $('#math-toggle').textContent = state.math ? 'Hide the math' : 'Show the math (advanced)';
  if (state.math) renderDetails($('#details-root'), ctx);
  if (state.openAll) document.querySelectorAll('details').forEach(d => { d.open = true; });
}
/* While a slider drags, charts re-render on the next animation frame; the controls update in place so the drag is never interrupted. */
function scheduleRender() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => render({ controls: false }));
}

readHash();
renderSources($('#sources-root'));
$('#advanced-toggle').addEventListener('click', () => { state.advanced = !state.advanced; render({ controls: false }); });
$('#math-toggle').addEventListener('click', () => { state.math = !state.math; render({ controls: false }); });
render();
window.addEventListener('hashchange', () => { readHash(); render(); });
window.addEventListener('resize', () => scheduleRender());
window.__sim = { state, context };
