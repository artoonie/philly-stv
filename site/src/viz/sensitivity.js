import { registerViz, tooltip, pct, legend } from './registry.js';
import { systemColor, ink, muted, grid, ink2 } from './palette.js';
import { setCityShare } from '../model/electorate.js';
import { runAll, SYSTEMS } from '../model/systems.js';

registerViz({
  id: 'sensitivity', order: 30,
  title: 'Do more votes mean more seats?',
  lede: 'Pick a group and imagine it growing or shrinking. The dashed diagonal is perfectly fair: 30% of the votes, 30% of the seats. The shaded gap between a line and the diagonal is unfairness, so less shading is better. The strip underneath shows which system is closer to fair at each size.',
  render(el, ctx) {
    const d3 = window.d3;
    const { groups, city, results, state } = ctx;
    const focus = state.focusGroup && groups.includes(state.focusGroup) ? state.focusGroup : [...groups].sort((a, b) => city[b] - city[a])[1] || groups[0];
    const selected = results.map(r => r.system);
    const hasToday = selected.some(s => s.id === 'current');
    const stvSystems = selected.filter(s => s.stv);
    const bestStv = stvSystems.length ? results.filter(r => r.system.stv).sort((a, b) => b.metrics.match - a.metrics.match)[0].system.id : null;
    const compare = state.compareSystem && stvSystems.some(s => s.id === state.compareSystem) ? state.compareSystem : bestStv;
    const lineSystems = [hasToday ? SYSTEMS[0] : null, stvSystems.find(s => s.id === compare) || null].filter(Boolean);

    // controls: group select + which STV layout to compare with today
    const head = document.createElement('div'); head.className = 'controls-foot'; head.style.marginBottom = '8px';
    const lab = document.createElement('label'); lab.textContent = 'Group: ';
    const sel = document.createElement('select'); sel.className = 'sel';
    for (const g of groups) { const o = document.createElement('option'); o.value = g; o.textContent = g; o.selected = g === focus; sel.appendChild(o); }
    sel.addEventListener('change', () => ctx.setState({ focusGroup: sel.value }));
    lab.appendChild(sel); head.appendChild(lab);
    if (stvSystems.length > 1) {
      const cmp = document.createElement('span'); cmp.textContent = hasToday ? 'Compare today with: ' : 'STV layout: ';
      const chips = document.createElement('span'); chips.className = 'chips'; chips.style.margin = '0'; chips.style.display = 'inline-flex';
      for (const s of stvSystems) {
        const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = s.short; b.setAttribute('aria-selected', String(s.id === compare));
        b.addEventListener('click', () => ctx.setState({ compareSystem: s.id })); chips.appendChild(b);
      }
      cmp.appendChild(chips); head.appendChild(cmp);
    }
    el.appendChild(head);

    // sweep the focus group from 0% to 100%
    const steps = d3.range(0, 1.0001, 0.01);
    const series = lineSystems.map(s => ({ id: s.id, short: s.short, pts: [] }));
    for (const v of steps) {
      const sh = setCityShare(state.shares, state.weights, groups, focus, v);
      const res = runAll(sh, state.weights, groups);
      for (const s of series) { const r = res.find(r => r.system.id === s.id); s.pts.push({ v, s: r.seats[focus] / r.totalSeats, n: r.seats[focus], total: r.totalSeats }); }
    }
    const W = Math.min(el.clientWidth || 900, 1100), H = Math.max(280, Math.min(400, W * 0.42));
    const m = { top: 22, right: 120, bottom: 84, left: 52 };
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img');
    const x = d3.scaleLinear().domain([0, 1]).range([m.left, W - m.right]);
    const y = d3.scaleLinear().domain([0, 1]).range([H - m.bottom, m.top]);
    const ticks = [0, .5, 1];
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.left).attr('x2', W - m.right).attr('y1', d => y(d)).attr('y2', d => y(d)).attr('stroke', grid());
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.left - 8).attr('y', d => y(d)).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 11).attr('fill', muted()).text(d => d === 0 ? 'no seats' : d === 1 ? 'all seats' : 'half');
    svg.append('g').selectAll('text').data([0, .25, .5, .75, 1]).join('text').attr('x', d => x(d)).attr('y', H - m.bottom + 18).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', muted()).text(d => pct(d));
    svg.append('text').attr('x', (m.left + W - m.right) / 2).attr('y', H - 2).attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', ink2()).text(`If ${focus} were this share of voters…`);
    svg.append('text').attr('transform', `translate(14,${(m.top + H - m.bottom) / 2}) rotate(-90)`).attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', ink2()).text('…they would hold this share of seats');
    svg.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(1)).attr('y2', y(1)).attr('stroke', muted()).attr('stroke-dasharray', '4 4');
    const ang = Math.atan2(y(1) - y(0), x(1) - x(0)) * 180 / Math.PI;
    svg.append('text').attr('x', x(0.17)).attr('y', y(0.17) - 7).attr('font-size', 11).attr('fill', muted()).attr('text-anchor', 'middle').attr('transform', `rotate(${ang}, ${x(0.8)}, ${y(0.8)})`).text('perfectly fair');

    // shaded gap between each line and the diagonal = unfairness (area, not just a line)
    const stepPts = pts => pts.flatMap((p, i) => i < pts.length - 1 ? [{ v: p.v, s: p.s }, { v: pts[i + 1].v, s: p.s }] : [{ v: p.v, s: p.s }]);
    const area = d3.area().x(d => x(d.v)).y0(d => y(d.v)).y1(d => y(d.s));
    for (const s of series) {
      svg.append('path').datum(stepPts(s.pts)).attr('d', area).attr('fill', systemColor(s.id)).attr('opacity', s.id === 'current' ? 0.22 : 0.28);
    }
    // words on the two sides of the diagonal
    svg.append('text').attr('x', x(0.03)).attr('y', y(0.70)).attr('font-size', 11).attr('fill', ink2()).text('above the line: more seats than votes');
    svg.append('text').attr('x', x(0.97)).attr('y', y(0.06)).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', ink2()).text('below the line: fewer seats than votes');
    const line = d3.line().x(d => x(d.v)).y(d => y(d.s)).curve(d3.curveStepAfter);
    for (const s of series) {
      svg.append('path').datum(s.pts).attr('d', line).attr('fill', 'none').attr('stroke', systemColor(s.id)).attr('stroke-width', s.id === 'current' ? 3.5 : 3).attr('stroke-linejoin', 'round');
    }
    // ribbon: which system is closer to fair at each vote share
    const rY = H - m.bottom + 28, rH = 10;
    const gap = (s, i) => Math.abs(s.pts[i].s - s.pts[i].v);
    if (series.length === 2) for (let i = 0; i < steps.length - 1; i++) {
      const g0 = gap(series[0], i), g1 = gap(series[1], i);
      const col = Math.abs(g0 - g1) < 1e-9 ? grid() : g0 < g1 ? systemColor(series[0].id) : systemColor(series[1].id);
      svg.append('rect').attr('x', x(steps[i])).attr('y', rY).attr('width', x(steps[i + 1]) - x(steps[i]) + 0.5).attr('height', rH).attr('fill', col);
    }
    const avg = series.map(s => d3.mean(s.pts, p => Math.abs(p.s - p.v)));
    if (series.length === 2) {
      svg.append('text').attr('x', m.left).attr('y', rY + rH + 13).attr('font-size', 11).attr('fill', ink2()).text('Closer to fair at this size:');
      const closerShare = d3.sum(d3.range(steps.length - 1), i => gap(series[1], i) < gap(series[0], i) - 1e-9 ? 1 : 0) / (steps.length - 1);
      svg.append('text').attr('x', W - m.right).attr('y', rY + rH + 13).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', ink2())
        .text(`${series[1].short} is closer for ${pct(closerShare)} of sizes · average gap from fair: ${series[0].short} ${pct(avg[0], 1)}, ${series[1].short} ${pct(avg[1], 1)}`);
    } else {
      svg.append('text').attr('x', m.left).attr('y', rY + rH + 13).attr('font-size', 11).attr('fill', ink2()).text(`Average gap from fair: ${pct(avg[0], 1)}. Select a second voting method in step 1 to compare.`);
    }
    // labels at the line ends, pushed apart
    const labels = series.map(s => ({ s, y: y(s.pts[s.pts.length - 1].s) })).sort((a, b) => a.y - b.y);
    if (labels.length > 1 && labels[1].y - labels[0].y < 16) labels[1].y = labels[0].y + 16;
    for (const l of labels) svg.append('text').attr('x', x(1) + 8).attr('y', l.y).attr('dy', '0.35em').attr('font-size', 12).attr('font-weight', 700).attr('fill', systemColor(l.s.id)).text(l.s.short);

    // "now" callout: what each system gives at the current share
    const i0 = d3.bisector(d => d.v).center(series[0].pts, city[focus]);
    svg.append('line').attr('x1', x(city[focus])).attr('x2', x(city[focus])).attr('y1', y(0)).attr('y2', y(1)).attr('stroke', ink()).attr('opacity', .45);
    const box = svg.append('g').attr('transform', `translate(${x(city[focus]) + (city[focus] > 0.6 ? -190 : 8)},${m.top + 2})`);
    const lines = [`${focus} today: ${pct(city[focus])} of voters`, ...series.map(s => `${s.short}: ${s.pts[i0].n} of ${s.pts[i0].total} seats`)];
    box.append('rect').attr('width', 182).attr('height', 14 * lines.length + 10).attr('rx', 6).attr('fill', 'var(--surface)').attr('stroke', grid());
    box.selectAll('text').data(lines).join('text').attr('x', 8).attr('y', (d, i) => 15 + i * 14).attr('font-size', 11).attr('font-weight', (d, i) => i === 0 ? 700 : 500)
      .attr('fill', (d, i) => i === 0 ? ink() : systemColor(series[i - 1].id)).text(d => d);

    // hover
    const tip = tooltip();
    const bisect = d3.bisector(d => d.v).center;
    svg.append('rect').attr('x', m.left).attr('y', m.top).attr('width', W - m.left - m.right).attr('height', H - m.top - m.bottom).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev); const i = bisect(series[0].pts, x.invert(mx));
        let closer = '';
        if (series.length === 2) { const g0 = gap(series[0], i), g1 = gap(series[1], i); closer = `<br>Closer to fair: ${Math.abs(g0 - g1) < 1e-9 ? 'tie' : g0 < g1 ? series[0].short : series[1].short}`; }
        tip.show(`<b>If ${focus} were ${pct(series[0].pts[i].v)} of voters</b><br>` + series.map(s => `${s.short}: ${s.pts[i].n} of ${s.pts[i].total} seats (${pct(s.pts[i].s)})`).join('<br>') + closer, ev);
      }).on('mouseleave', () => tip.hide());
    legend(el, [...series.map(s => ({ kind: 'line', color: systemColor(s.id), label: s.short + (s.id === 'current' ? '' : ' (STV)') })), { kind: 'line', color: muted(), label: 'Perfectly fair (dashed)' }, { color: 'color-mix(in oklab, ' + systemColor('current') + ' 25%, transparent)', label: 'Shaded = gap from fair (less is better)' }]);
  },
});
